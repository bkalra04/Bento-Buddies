// Messages Page - Real-time Messaging with Firestore
import { auth, storage, ref, uploadBytes, getDownloadURL } from '../../firebase-config.js';
import {
    getUserConversations,
    onConversationsChange,
    getMessages,
    onMessagesChange,
    sendMessage,
    markConversationAsRead,
    getOrCreateConversation
} from '../services/message.service.js';
import { requireAuth } from '../services/auth.service.js';
import { searchUsers, getUserProfile } from '../services/user.service.js';
import { showError, showSuccess } from '../utils/error-handler.js';
import { getRelativeTime } from '../utils/date-helpers.js';

let currentUser = null;
let currentConversationId = null;
let currentConversation = null; // Store full conversation object
let selectedContactId = null;
let conversations = [];
let unsubscribeMessages = null;
let unsubscribeConversations = null;
let selectedPhoto = null;

// DOM elements
const contactList = document.getElementById('contactList');
const messagesArea = document.getElementById('messagesArea');
const searchInput = document.getElementById('searchInput');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');

// Initialize
async function init() {
    // Show loading state immediately
    messagesArea.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #666;">
            <p>Loading messages...</p>
        </div>
    `;

    try {
        currentUser = await requireAuth();
        // Load conversations immediately without waiting
        loadConversations();
    } catch (error) {
        console.error('Auth error:', error);
        window.location.href = '../index/index.html';
    }
}

// Load conversations with real-time updates
function loadConversations() {
    // Show loading in contact list immediately
    contactList.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #666;">
            <p>Loading conversations...</p>
        </div>
    `;

    // Unsubscribe from previous listener
    if (unsubscribeConversations) {
        unsubscribeConversations();
    }

    console.log('Loading conversations for user:', currentUser.uid);

    // Real-time listener for conversations - fires immediately with current data
    unsubscribeConversations = onConversationsChange(currentUser.uid, (updatedConversations) => {
        console.log('Conversations updated:', updatedConversations.length, 'conversations found');
        conversations = updatedConversations;
        renderContacts();

        // If a conversation was selected, keep it selected
        if (currentConversationId) {
            loadMessages(currentConversationId);
        } else if (conversations.length > 0) {
            // Auto-select first conversation
            selectConversation(conversations[0]);
        } else {
            // No conversations yet
            showEmptyState();
        }
    });
}

// Load messages for a conversation with real-time updates
function loadMessages(conversationId) {
    // Show loading briefly (will be replaced by real-time update almost instantly)
    messagesArea.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #666;">
            <p>Loading messages...</p>
        </div>
    `;

    // Unsubscribe from previous message listener
    if (unsubscribeMessages) {
        unsubscribeMessages();
    }

    // Real-time listener for messages - fires immediately with current data
    unsubscribeMessages = onMessagesChange(conversationId, (messages) => {
        renderMessages(messages);

        // Mark conversation as read
        markConversationAsRead(conversationId, currentUser.uid);
    });
}

// Render contacts list
function renderContacts() {
    contactList.innerHTML = '';

    if (conversations.length === 0) {
        contactList.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #666;">
                <p>No conversations yet</p>
                <p style="font-size: 14px; margin-top: 10px;">Start a conversation by creating or joining a meetup!</p>
            </div>
        `;
        return;
    }

    conversations.forEach(conversation => {
        const otherUserId = conversation.participants.find(id => id !== currentUser.uid);
        const otherUser = conversation.participantDetails[otherUserId];

        if (!otherUser) return; // Skip if no user details

        const contactDiv = document.createElement('div');
        contactDiv.className = `contact-item ${conversation.id === currentConversationId ? 'active' : ''}`;
        contactDiv.onclick = () => selectConversation(conversation);

        const initials = getInitials(otherUser.name);
        const gradient = getGradientForName(otherUser.name);
        const unreadCount = conversation.unreadCount?.[currentUser.uid] || 0;
        const hasUnread = unreadCount > 0;

        // Format last message time
        const timeAgo = conversation.lastMessageTime
            ? getRelativeTime(conversation.lastMessageTime)
            : '';

        let statusHTML = '';
        if (hasUnread) {
            statusHTML = '<div class="unread-dot"></div>';
        } else {
            statusHTML = '<div class="read-check">✓✓</div>';
        }

        contactDiv.innerHTML = `
            <div class="contact-avatar" style="background: ${gradient};">
                <span style="color: white; font-weight: 600; font-size: 16px;">${initials}</span>
            </div>
            <div class="contact-info">
                <div class="contact-header">
                    <span class="contact-name">${otherUser.name}</span>
                </div>
                <p class="contact-message">${conversation.lastMessage || 'No messages yet'}</p>
            </div>
            <div class="contact-status">
                ${timeAgo ? `<span class="contact-time">${timeAgo}</span>` : ''}
                ${statusHTML}
            </div>
        `;

        contactList.appendChild(contactDiv);
    });
}

// Render messages
function renderMessages(messages) {
    messagesArea.innerHTML = '';

    if (messages.length === 0) {
        messagesArea.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #666;">
                <p>No messages yet. Start the conversation!</p>
            </div>
        `;
        return;
    }

    // Get other user's details from current conversation
    let otherUserDetails = null;
    if (currentConversation) {
        const otherUserId = currentConversation.participants.find(id => id !== currentUser.uid);
        otherUserDetails = currentConversation.participantDetails[otherUserId];
    }

    messages.forEach(msg => {
        const isCurrentUser = msg.senderId === currentUser.uid;
        const messageWrapper = document.createElement('div');
        messageWrapper.className = `message-wrapper ${isCurrentUser ? 'sent' : 'received'}`;

        // Voice note support (for future)
        let voiceHTML = '';
        if (msg.type === 'voice' && msg.voiceNoteUrl) {
            voiceHTML = `
                <div class="voice-note">
                    <div class="voice-waveform">
                        ${generateWaveform()}
                    </div>
                </div>
            `;
        }

        const timestamp = msg.timestamp ? getRelativeTime(msg.timestamp) : 'Just now';

        // Add profile picture for received messages
        let avatarHTML = '';
        if (!isCurrentUser && otherUserDetails) {
            const initials = getInitials(otherUserDetails.name);
            const gradient = getGradientForName(otherUserDetails.name);

            if (otherUserDetails.picture) {
                avatarHTML = `
                    <img src="${otherUserDetails.picture}"
                         class="message-avatar"
                         data-user-id="${msg.senderId}"
                         style="width: 32px; height: 32px; border-radius: 50%; cursor: pointer; margin-right: 8px; object-fit: cover;"
                         title="View ${otherUserDetails.name}'s profile">
                `;
            } else {
                avatarHTML = `
                    <div class="message-avatar"
                         data-user-id="${msg.senderId}"
                         style="width: 32px; height: 32px; border-radius: 50%; background: ${gradient}; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: 600; cursor: pointer; margin-right: 8px;"
                         title="View ${otherUserDetails.name}'s profile">
                        ${initials}
                    </div>
                `;
            }
        }

        // Photo HTML
        let photoHTML = '';
        if (msg.photoURL) {
            photoHTML = `<img src="${msg.photoURL}" class="message-photo" alt="Shared photo" data-photo-url="${msg.photoURL}">`;
        }

        messageWrapper.innerHTML = `
            <div style="display: flex; align-items: flex-end; ${isCurrentUser ? 'flex-direction: row-reverse;' : ''}">
                ${avatarHTML}
                <div>
                    ${voiceHTML}
                    ${photoHTML}
                    ${msg.text ? `<div class="message-bubble ${isCurrentUser ? 'sent' : 'received'}">
                        <p>${escapeHtml(msg.text)}</p>
                    </div>` : ''}
                    <span class="message-time">${timestamp}</span>
                </div>
            </div>
        `;

        messagesArea.appendChild(messageWrapper);
    });

    // Add click listeners to avatars
    document.querySelectorAll('.message-avatar').forEach(avatar => {
        avatar.addEventListener('click', () => {
            const userId = avatar.dataset.userId;
            showUserProfile(userId);
        });
    });

    // Add click listeners to photos
    document.querySelectorAll('.message-photo').forEach(photo => {
        photo.addEventListener('click', () => {
            const photoURL = photo.dataset.photoUrl;
            showPhotoViewer(photoURL);
        });
    });

    // Scroll to bottom
    messagesArea.scrollTop = messagesArea.scrollHeight;
}

// Select conversation
function selectConversation(conversation) {
    currentConversationId = conversation.id;
    currentConversation = conversation; // Store full conversation
    selectedContactId = conversation.id;

    renderContacts();
    loadMessages(conversation.id);
}

// Send message
async function handleSendMessage() {
    const text = messageInput.value.trim();
    const hasPhoto = selectedPhoto !== null;

    if (!text && !hasPhoto) return;
    if (!currentConversationId) return;

    // Clear input immediately for instant feedback
    const originalText = text;
    const originalPhoto = selectedPhoto;
    messageInput.value = '';
    selectedPhoto = null;
    photoPreview.style.display = 'none';
    photoInput.value = '';

    try {
        let photoURL = null;

        // Upload photo if selected
        if (hasPhoto) {
            const fileName = `messages/${currentConversationId}/${Date.now()}_${originalPhoto.name}`;
            const storageRef = ref(storage, fileName);

            await uploadBytes(storageRef, originalPhoto);
            photoURL = await getDownloadURL(storageRef);
        }

        const result = await sendMessage(
            currentConversationId,
            currentUser.uid,
            currentUser.displayName || 'You',
            text || '📷 Photo',
            'text',
            photoURL
        );

        if (!result.success) {
            showError(result.error || 'Failed to send message');
            // Restore message if send failed
            messageInput.value = originalText;
            selectedPhoto = originalPhoto;
            if (originalPhoto) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    previewImage.src = e.target.result;
                    photoPreview.style.display = 'block';
                };
                reader.readAsDataURL(originalPhoto);
            }
        }
    } catch (error) {
        console.error('Error sending message:', error);
        showError('Failed to send message');
        // Restore message if send failed
        messageInput.value = originalText;
        selectedPhoto = originalPhoto;
    }
}

// Search contacts
searchInput.addEventListener('input', (e) => {
    const searchQuery = e.target.value.toLowerCase();

    // Filter conversations by name
    const filtered = conversations.filter(conv => {
        const otherUserId = conv.participants.find(id => id !== currentUser.uid);
        const otherUser = conv.participantDetails[otherUserId];
        return otherUser?.name.toLowerCase().includes(searchQuery);
    });

    // Render filtered contacts
    contactList.innerHTML = '';
    filtered.forEach(conversation => {
        const otherUserId = conversation.participants.find(id => id !== currentUser.uid);
        const otherUser = conversation.participantDetails[otherUserId];

        const contactDiv = document.createElement('div');
        contactDiv.className = `contact-item ${conversation.id === currentConversationId ? 'active' : ''}`;
        contactDiv.onclick = () => selectConversation(conversation);

        const initials = getInitials(otherUser.name);
        const gradient = getGradientForName(otherUser.name);
        const unreadCount = conversation.unreadCount?.[currentUser.uid] || 0;
        const hasUnread = unreadCount > 0;
        const timeAgo = conversation.lastMessageTime
            ? getRelativeTime(conversation.lastMessageTime)
            : '';

        contactDiv.innerHTML = `
            <div class="contact-avatar" style="background: ${gradient};">
                <span style="color: white; font-weight: 600; font-size: 16px;">${initials}</span>
            </div>
            <div class="contact-info">
                <div class="contact-header">
                    <span class="contact-name">${otherUser.name}</span>
                </div>
                <p class="contact-message">${conversation.lastMessage || 'No messages yet'}</p>
            </div>
            <div class="contact-status">
                ${timeAgo ? `<span class="contact-time">${timeAgo}</span>` : ''}
                ${hasUnread ? '<div class="unread-dot"></div>' : '<div class="read-check">✓✓</div>'}
            </div>
        `;

        contactList.appendChild(contactDiv);
    });
});

// Send button click
sendBtn.addEventListener('click', handleSendMessage);

// Enter key to send
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
    }
});

// Photo upload handlers
const photoBtn = document.getElementById('photoBtn');
const photoInput = document.getElementById('photoInput');
const photoPreview = document.getElementById('photoPreview');
const previewImage = document.getElementById('previewImage');
const removePhotoBtn = document.getElementById('removePhotoBtn');

if (photoBtn) {
    photoBtn.addEventListener('click', () => {
        photoInput.click();
    });
}

if (photoInput) {
    photoInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            showError('Please select an image file');
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            showError('Image must be less than 5MB');
            return;
        }

        try {
            // Compress and preview image
            const compressedFile = await compressImage(file);
            selectedPhoto = compressedFile;

            // Show preview
            const reader = new FileReader();
            reader.onload = (e) => {
                previewImage.src = e.target.result;
                photoPreview.style.display = 'block';
            };
            reader.readAsDataURL(compressedFile);
        } catch (error) {
            console.error('Error processing image:', error);
            showError('Failed to process image');
        }
    });
}

if (removePhotoBtn) {
    removePhotoBtn.addEventListener('click', () => {
        selectedPhoto = null;
        photoInput.value = '';
        photoPreview.style.display = 'none';
        previewImage.src = '';
    });
}

// Compress image before upload
async function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Max dimensions
                const maxWidth = 1200;
                const maxHeight = 1200;

                if (width > height) {
                    if (width > maxWidth) {
                        height = height * (maxWidth / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = width * (maxHeight / height);
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        }));
                    } else {
                        reject(new Error('Canvas to Blob conversion failed'));
                    }
                }, 'image/jpeg', 0.8);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Helper functions
function getInitials(name) {
    if (!name) return '??';
    const nameParts = name.split(' ');
    if (nameParts.length >= 2) {
        return nameParts[0][0] + nameParts[1][0];
    }
    return name.substring(0, 2);
}

function getGradientForName(name) {
    const gradients = [
        'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
        'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
        'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
        'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
        'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
        'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
        'linear-gradient(135deg, #ff6e7f 0%, #bfe9ff 100%)'
    ];

    const index = name.charCodeAt(0) % gradients.length;
    return gradients[index];
}

function generateWaveform() {
    let html = '';
    for (let i = 0; i < 30; i++) {
        const height = Math.floor(Math.random() * 20) + 10;
        html += `<div class="wave-bar" style="height: ${height}px;"></div>`;
    }
    return html;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showEmptyState() {
    messagesArea.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #666; padding: 40px; text-align: center;">
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1" style="margin-bottom: 20px;">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <h3 style="margin-bottom: 10px; color: #333;">No Messages Yet</h3>
            <p style="max-width: 300px;">When you join meetups or connect with other students, your conversations will appear here.</p>
        </div>
    `;
}

// Show photo viewer modal
function showPhotoViewer(photoURL) {
    // Create modal dynamically if it doesn't exist
    let photoModal = document.getElementById('photoViewerModal');

    if (!photoModal) {
        photoModal = document.createElement('div');
        photoModal.id = 'photoViewerModal';
        photoModal.style.cssText = `
            display: none;
            position: fixed;
            z-index: 2000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.95);
            backdrop-filter: blur(5px);
        `;

        photoModal.innerHTML = `
            <span id="closePhotoViewer" style="position: absolute; top: 20px; right: 30px; color: white; font-size: 40px; font-weight: bold; cursor: pointer; z-index: 2001;">&times;</span>
            <img id="photoViewerImage" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); max-width: 90%; max-height: 90%; border-radius: 8px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);">
        `;

        document.body.appendChild(photoModal);

        // Add close handler
        const closeBtn = photoModal.querySelector('#closePhotoViewer');
        closeBtn.addEventListener('click', () => {
            photoModal.style.display = 'none';
        });

        // Close on click outside
        photoModal.addEventListener('click', (e) => {
            if (e.target === photoModal) {
                photoModal.style.display = 'none';
            }
        });
    }

    // Update photo and show modal
    const photoImg = photoModal.querySelector('#photoViewerImage');
    photoImg.src = photoURL;
    photoModal.style.display = 'block';
}

// Show user profile modal
async function showUserProfile(userId) {
    const modal = document.getElementById('userProfileModal');
    const content = document.getElementById('profileModalContent');

    if (!modal || !content) return;

    // Show loading state
    content.innerHTML = '<p style="text-align: center; padding: 20px;">Loading profile...</p>';
    modal.style.display = 'block';

    try {
        const result = await getUserProfile(userId);

        if (!result.success) {
            content.innerHTML = '<p style="text-align: center; padding: 20px; color: #e53935;">Failed to load profile</p>';
            return;
        }

        const user = result.data;
        const initials = getInitials(user.name);
        const gradient = getGradientForName(user.name);

        // Build profile HTML
        let profileHTML = `
            <div style="text-align: center; margin-bottom: 20px;">
                ${user.picture
                    ? `<img src="${user.picture}" style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover; margin-bottom: 15px;">`
                    : `<div style="width: 100px; height: 100px; border-radius: 50%; background: ${gradient}; display: inline-flex; align-items: center; justify-content: center; color: white; font-size: 36px; font-weight: 700; margin-bottom: 15px;">${initials}</div>`
                }
                <h2 style="margin: 0 0 5px 0;">${user.name}</h2>
                ${user.username ? `<p style="color: #666; margin: 0;">@${user.username}</p>` : ''}
            </div>
        `;

        // Add user details
        if (user.major || user.year) {
            profileHTML += '<div style="margin-bottom: 20px;">';
            if (user.major) profileHTML += `<p style="margin: 5px 0;"><strong>Major:</strong> ${user.major}</p>`;
            if (user.year) profileHTML += `<p style="margin: 5px 0;"><strong>Year:</strong> ${user.year}</p>`;
            profileHTML += '</div>';
        }

        if (user.bio) {
            profileHTML += `<div style="margin-bottom: 20px;"><p style="color: #666; font-style: italic;">"${user.bio}"</p></div>`;
        }

        if (user.personality && user.personality.length > 0) {
            profileHTML += `
                <div style="margin-bottom: 20px;">
                    <h4 style="margin-bottom: 10px;">Personality</h4>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        ${user.personality.map(tag => `<span style="background: #f0f0f0; padding: 6px 12px; border-radius: 20px; font-size: 14px;">${tag}</span>`).join('')}
                    </div>
                </div>
            `;
        }

        if (user.favoriteFoods && user.favoriteFoods.length > 0) {
            profileHTML += `
                <div style="margin-bottom: 20px;">
                    <h4 style="margin-bottom: 10px;">Favorite Foods</h4>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        ${user.favoriteFoods.map(food => `<span style="background: linear-gradient(135deg, #FFB3C6, #FF93A9); color: white; padding: 6px 12px; border-radius: 20px; font-size: 14px;">${food}</span>`).join('')}
                    </div>
                </div>
            `;
        }

        if (user.funFact) {
            profileHTML += `<div style="margin-bottom: 20px;"><h4 style="margin-bottom: 10px;">Fun Fact</h4><p style="color: #666;">${user.funFact}</p></div>`;
        }

        if (user.lastMeal) {
            profileHTML += `<div style="margin-bottom: 20px;"><h4 style="margin-bottom: 10px;">Last Meal</h4><p style="color: #666;">${user.lastMeal}</p></div>`;
        }

        content.innerHTML = profileHTML;

    } catch (error) {
        console.error('Error loading profile:', error);
        content.innerHTML = '<p style="text-align: center; padding: 20px; color: #e53935;">Failed to load profile</p>';
    }
}

// User Profile Modal handlers
const userProfileModal = document.getElementById('userProfileModal');
const closeProfileModal = document.getElementById('closeProfileModal');

if (closeProfileModal) {
    closeProfileModal.addEventListener('click', () => {
        userProfileModal.style.display = 'none';
    });
}

if (userProfileModal) {
    userProfileModal.addEventListener('click', (e) => {
        if (e.target === userProfileModal) {
            userProfileModal.style.display = 'none';
        }
    });
}

// User Search Modal handlers
const searchUsersBtn = document.getElementById('searchUsersBtn');
const userSearchModal = document.getElementById('userSearchModal');
const closeSearchModal = document.getElementById('closeSearchModal');
const userSearchInput = document.getElementById('userSearchInput');
const searchResults = document.getElementById('searchResults');

if (searchUsersBtn) {
    searchUsersBtn.addEventListener('click', () => {
        userSearchModal.style.display = 'block';
        userSearchInput.value = '';
        searchResults.innerHTML = '<p style="text-align: center; padding: 20px; color: #666;">Search for users by name...</p>';
    });
}

if (closeSearchModal) {
    closeSearchModal.addEventListener('click', () => {
        userSearchModal.style.display = 'none';
    });
}

if (userSearchModal) {
    userSearchModal.addEventListener('click', (e) => {
        if (e.target === userSearchModal) {
            userSearchModal.style.display = 'none';
        }
    });
}

// User search functionality
if (userSearchInput) {
    userSearchInput.addEventListener('input', async (e) => {
        const query = e.target.value.trim();

        if (query.length < 2) {
            searchResults.innerHTML = '<p style="text-align: center; padding: 20px; color: #666;">Type at least 2 characters to search...</p>';
            return;
        }

        try {
            const result = await searchUsers(query);

            if (!result.success) {
                searchResults.innerHTML = '<p style="text-align: center; padding: 20px; color: #e53935;">Search failed. Please try again.</p>';
                return;
            }

            const users = result.data.filter(user => user.id !== currentUser.uid);

            if (users.length === 0) {
                searchResults.innerHTML = '<p style="text-align: center; padding: 20px; color: #666;">No users found</p>';
                return;
            }

            // Render search results
            searchResults.innerHTML = users.map(user => {
                const initials = getInitials(user.name);
                const gradient = getGradientForName(user.name);

                return `
                    <div style="display: flex; align-items: center; padding: 15px; border-bottom: 1px solid #eee; cursor: pointer;" class="search-result-item" data-user-id="${user.id}">
                        ${user.picture
                            ? `<img src="${user.picture}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; margin-right: 15px;">`
                            : `<div style="width: 50px; height: 50px; border-radius: 50%; background: ${gradient}; display: flex; align-items: center; justify-content: center; color: white; font-size: 18px; font-weight: 600; margin-right: 15px;">${initials}</div>`
                        }
                        <div style="flex: 1;">
                            <h4 style="margin: 0 0 5px 0;">${user.name}</h4>
                            <p style="margin: 0; color: #666; font-size: 14px;">${user.major || 'UBC Student'} ${user.year ? `• Year ${user.year}` : ''}</p>
                        </div>
                        <button class="message-user-btn" data-user-id="${user.id}" data-user-name="${user.name}" style="background: linear-gradient(135deg, #FF93A9, #FF8375); color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: 600;">Message</button>
                    </div>
                `;
            }).join('');

            // Add click handlers for message buttons
            document.querySelectorAll('.message-user-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const userId = btn.dataset.userId;
                    const userName = btn.dataset.userName;

                    try {
                        // Create or get conversation
                        const conversationResult = await getOrCreateConversation(currentUser.uid, userId);

                        if (conversationResult.success) {
                            // Close search modal
                            userSearchModal.style.display = 'none';

                            // Find and select the conversation
                            const conversation = conversations.find(c => c.id === conversationResult.id);
                            if (conversation) {
                                selectConversation(conversation);
                            } else {
                                // Conversation might be new, wait for real-time update
                                showSuccess('Conversation started!');
                            }
                        } else {
                            showError('Failed to start conversation');
                        }
                    } catch (error) {
                        console.error('Error starting conversation:', error);
                        showError('Failed to start conversation');
                    }
                });
            });

            // Add click handlers for profile viewing
            document.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    if (!e.target.classList.contains('message-user-btn')) {
                        const userId = item.dataset.userId;
                        userSearchModal.style.display = 'none';
                        showUserProfile(userId);
                    }
                });
            });

        } catch (error) {
            console.error('Search error:', error);
            searchResults.innerHTML = '<p style="text-align: center; padding: 20px; color: #e53935;">Search failed. Please try again.</p>';
        }
    });
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (unsubscribeMessages) unsubscribeMessages();
    if (unsubscribeConversations) unsubscribeConversations();
});

// Initialize the page
init();
