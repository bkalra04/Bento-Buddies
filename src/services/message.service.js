// Message Service
import { db, collection, doc, addDoc, getDoc, updateDoc, query, where, orderBy, getDocs, onSnapshot } from '../../firebase-config.js';
import { handleError } from '../utils/error-handler.js';
import { getUserProfile } from './user.service.js';

/**
 * Get or create a conversation between two users
 */
export async function getOrCreateConversation(userId1, userId2) {
    try {
        // Find existing conversation
        const q = query(
            collection(db, 'conversations'),
            where('participants', 'array-contains', userId1)
        );

        const snapshot = await getDocs(q);
        let conversationId = null;

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (data.participants.includes(userId2)) {
                conversationId = docSnap.id;
            }
        });

        // If conversation exists, return it
        if (conversationId) {
            return { success: true, id: conversationId };
        }

        // Create new conversation
        const user1Result = await getUserProfile(userId1);
        const user2Result = await getUserProfile(userId2);

        if (!user1Result.success || !user2Result.success) {
            return { success: false, error: 'Failed to fetch user profiles' };
        }

        const user1Data = user1Result.data;
        const user2Data = user2Result.data;

        const conversationData = {
            participants: [userId1, userId2],
            participantDetails: {
                [userId1]: {
                    name: user1Data.name,
                    picture: user1Data.profilePicture || ''
                },
                [userId2]: {
                    name: user2Data.name,
                    picture: user2Data.profilePicture || ''
                }
            },
            lastMessage: '',
            lastMessageTime: new Date(),
            unreadCount: {
                [userId1]: 0,
                [userId2]: 0
            },
            createdAt: new Date()
        };

        const docRef = await addDoc(collection(db, 'conversations'), conversationData);
        return { success: true, id: docRef.id };
    } catch (error) {
        return handleError(error, 'Failed to get or create conversation');
    }
}

/**
 * Get all conversations for a user
 */
export async function getUserConversations(userId) {
    try {
        // Get all conversations and filter in JS to avoid index requirements
        const snapshot = await getDocs(collection(db, 'conversations'));

        let conversations = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (data.participants && data.participants.includes(userId)) {
                conversations.push({ id: docSnap.id, ...data });
            }
        });

        // Sort by lastMessageTime in JavaScript
        conversations.sort((a, b) => {
            const timeA = a.lastMessageTime?.toMillis?.() || 0;
            const timeB = b.lastMessageTime?.toMillis?.() || 0;
            return timeB - timeA; // desc order
        });

        return { success: true, data: conversations };
    } catch (error) {
        return handleError(error, 'Failed to get conversations');
    }
}

/**
 * Listen to conversations in real-time
 */
export function onConversationsChange(userId, callback) {
    try {
        // Listen to all conversations and filter in JS to avoid index requirements
        return onSnapshot(collection(db, 'conversations'), (snapshot) => {
            let conversations = [];
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                if (data.participants && data.participants.includes(userId)) {
                    conversations.push({ id: docSnap.id, ...data });
                }
            });

            // Sort by lastMessageTime in JavaScript
            conversations.sort((a, b) => {
                const timeA = a.lastMessageTime?.toMillis?.() || 0;
                const timeB = b.lastMessageTime?.toMillis?.() || 0;
                return timeB - timeA; // desc order
            });

            callback(conversations);
        });
    } catch (error) {
        console.error('Error listening to conversations:', error);
        return () => {};
    }
}

/**
 * Send a message
 */
export async function sendMessage(conversationId, senderId, senderName, text, type = 'text', photoURL = null) {
    try {
        const messageData = {
            senderId,
            senderName,
            text: text.trim(),
            type, // text, voice, image
            timestamp: new Date(),
            read: false
        };

        // Add photo URL if provided
        if (photoURL) {
            messageData.photoURL = photoURL;
        }

        await addDoc(collection(db, 'conversations', conversationId, 'messages'), messageData);

        // Update conversation's last message
        const conversationDoc = await getDoc(doc(db, 'conversations', conversationId));
        const conversationData = conversationDoc.data();

        // Increment unread count for other user
        const otherUserId = conversationData.participants.find(id => id !== senderId);
        const unreadCount = conversationData.unreadCount || {};

        await updateDoc(doc(db, 'conversations', conversationId), {
            lastMessage: text.trim(),
            lastMessageTime: new Date(),
            [`unreadCount.${otherUserId}`]: (unreadCount[otherUserId] || 0) + 1
        });

        return { success: true };
    } catch (error) {
        return handleError(error, 'Failed to send message');
    }
}

/**
 * Get messages for a conversation
 */
export async function getMessages(conversationId) {
    try {
        const snapshot = await getDocs(
            collection(db, 'conversations', conversationId, 'messages')
        );

        const messages = [];
        snapshot.forEach(docSnap => {
            messages.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Sort by timestamp in JavaScript
        messages.sort((a, b) => {
            const timeA = a.timestamp?.toMillis?.() || 0;
            const timeB = b.timestamp?.toMillis?.() || 0;
            return timeA - timeB; // asc order
        });

        return { success: true, data: messages };
    } catch (error) {
        return handleError(error, 'Failed to get messages');
    }
}

/**
 * Listen to messages in real-time
 */
export function onMessagesChange(conversationId, callback) {
    try {
        return onSnapshot(
            collection(db, 'conversations', conversationId, 'messages'),
            (snapshot) => {
                const messages = [];
                snapshot.forEach(docSnap => {
                    messages.push({ id: docSnap.id, ...docSnap.data() });
                });

                // Sort by timestamp in JavaScript
                messages.sort((a, b) => {
                    const timeA = a.timestamp?.toMillis?.() || 0;
                    const timeB = b.timestamp?.toMillis?.() || 0;
                    return timeA - timeB; // asc order
                });

                callback(messages);
            }
        );
    } catch (error) {
        console.error('Error listening to messages:', error);
        return () => {};
    }
}

/**
 * Mark conversation as read
 */
export async function markConversationAsRead(conversationId, userId) {
    try {
        await updateDoc(doc(db, 'conversations', conversationId), {
            [`unreadCount.${userId}`]: 0
        });

        return { success: true };
    } catch (error) {
        return handleError(error, 'Failed to mark as read');
    }
}

/**
 * Search conversations by participant name
 */
export async function searchConversations(userId, searchTerm) {
    try {
        const result = await getUserConversations(userId);
        if (!result.success) {
            return result;
        }

        const searchLower = searchTerm.toLowerCase();
        const filtered = result.data.filter(conv => {
            const otherUserId = conv.participants.find(id => id !== userId);
            const otherUser = conv.participantDetails[otherUserId];
            return otherUser?.name.toLowerCase().includes(searchLower);
        });

        return { success: true, data: filtered };
    } catch (error) {
        return handleError(error, 'Failed to search conversations');
    }
}

/**
 * Send a group chat message
 */
export async function sendGroupMessage(meetupId, senderId, senderName, senderPicture, text, photoURL = null) {
    try {
        const messageData = {
            senderId,
            senderName,
            senderPicture: senderPicture || '',
            text: text.trim(),
            timestamp: new Date(),
            photoURL: photoURL || null
        };

        await addDoc(collection(db, 'meetups', meetupId, 'groupChat'), messageData);

        return { success: true };
    } catch (error) {
        return handleError(error, 'Failed to send group message');
    }
}

/**
 * Get group chat messages for a meetup
 */
export async function getGroupMessages(meetupId) {
    try {
        const snapshot = await getDocs(
            collection(db, 'meetups', meetupId, 'groupChat')
        );

        const messages = [];
        snapshot.forEach(docSnap => {
            messages.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Sort by timestamp
        messages.sort((a, b) => {
            const timeA = a.timestamp?.toMillis?.() || 0;
            const timeB = b.timestamp?.toMillis?.() || 0;
            return timeA - timeB; // asc order
        });

        return { success: true, data: messages };
    } catch (error) {
        return handleError(error, 'Failed to get group messages');
    }
}

/**
 * Listen to group chat messages in real-time
 */
export function onGroupMessagesChange(meetupId, callback) {
    try {
        return onSnapshot(
            collection(db, 'meetups', meetupId, 'groupChat'),
            (snapshot) => {
                const messages = [];
                snapshot.forEach(docSnap => {
                    messages.push({ id: docSnap.id, ...docSnap.data() });
                });

                // Sort by timestamp
                messages.sort((a, b) => {
                    const timeA = a.timestamp?.toMillis?.() || 0;
                    const timeB = b.timestamp?.toMillis?.() || 0;
                    return timeA - timeB; // asc order
                });

                callback(messages);
            }
        );
    } catch (error) {
        console.error('Error listening to group messages:', error);
        return () => {};
    }
}
