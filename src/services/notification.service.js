// Notification Service
import { db, doc, updateDoc, getDoc } from '../../firebase-config.js';
import { handleError } from '../utils/error-handler.js';

let messagingInstance = null;

/**
 * Initialize Firebase Cloud Messaging
 */
export async function initializeMessaging() {
    try {
        // Check if messaging is supported
        if (!('Notification' in window)) {
            console.log('This browser does not support notifications');
            return { success: false, error: 'Notifications not supported' };
        }

        // Dynamically import Firebase Messaging
        const { getMessaging, getToken, onMessage } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js');
        const { app } = await import('../../firebase-config.js');

        messagingInstance = getMessaging(app);

        // Listen for foreground messages
        onMessage(messagingInstance, (payload) => {
            console.log('Foreground message received:', payload);

            // Show browser notification
            if (Notification.permission === 'granted') {
                const notificationTitle = payload.notification?.title || 'Bento Buddies';
                const notificationOptions = {
                    body: payload.notification?.body || 'You have a new notification',
                    icon: '/Images/logo.png',
                    badge: '/Images/logo.png',
                    tag: payload.data?.type || 'general'
                };

                new Notification(notificationTitle, notificationOptions);
            }
        });

        return { success: true };
    } catch (error) {
        console.error('Error initializing messaging:', error);
        return handleError(error, 'Failed to initialize messaging');
    }
}

/**
 * Request notification permission and get FCM token
 */
export async function requestNotificationPermission(userId) {
    try {
        // Check if already granted
        if (Notification.permission === 'granted') {
            return await getFCMToken(userId);
        }

        // Request permission
        const permission = await Notification.requestPermission();

        if (permission === 'granted') {
            console.log('Notification permission granted');
            return await getFCMToken(userId);
        } else {
            console.log('Notification permission denied');
            return { success: false, error: 'Permission denied' };
        }
    } catch (error) {
        return handleError(error, 'Failed to request notification permission');
    }
}

/**
 * Get FCM token and save to user profile
 */
async function getFCMToken(userId) {
    try {
        if (!messagingInstance) {
            const initResult = await initializeMessaging();
            if (!initResult.success) {
                return initResult;
            }
        }

        const { getToken } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js');

        const token = await getToken(messagingInstance, {
            vapidKey: 'BKx9vN8kZ1J2wX3hL4mP5qR6sT7uV8wY9zA0bC1dE2fG3hI4jK5lM6nO7pQ8rS9t' // You'll need to generate this in Firebase Console
        });

        if (token) {
            console.log('FCM Token:', token);

            // Save token to user profile
            await updateDoc(doc(db, 'users', userId), {
                fcmToken: token,
                fcmTokenUpdated: new Date()
            });

            return { success: true, token };
        } else {
            return { success: false, error: 'No token received' };
        }
    } catch (error) {
        return handleError(error, 'Failed to get FCM token');
    }
}

/**
 * Send a browser notification (client-side fallback)
 */
export function showBrowserNotification(title, options = {}) {
    if (Notification.permission === 'granted') {
        const notification = new Notification(title, {
            icon: '/Images/logo.png',
            badge: '/Images/logo.png',
            ...options
        });

        // Auto-close after 5 seconds
        setTimeout(() => notification.close(), 5000);

        return notification;
    }
}

/**
 * Get user's FCM token from Firestore
 */
export async function getUserFCMToken(userId) {
    try {
        const userDoc = await getDoc(doc(db, 'users', userId));

        if (userDoc.exists()) {
            const userData = userDoc.data();
            return { success: true, token: userData.fcmToken || null };
        }

        return { success: false, error: 'User not found' };
    } catch (error) {
        return handleError(error, 'Failed to get user FCM token');
    }
}

/**
 * Trigger notification for new message (client-side)
 */
export function notifyNewMessage(senderName, messagePreview) {
    if (Notification.permission === 'granted') {
        showBrowserNotification(`New message from ${senderName}`, {
            body: messagePreview,
            tag: 'message',
            data: { type: 'message' }
        });
    }
}

/**
 * Trigger notification for meetup join (client-side)
 */
export function notifyMeetupJoin(userName, meetupName) {
    if (Notification.permission === 'granted') {
        showBrowserNotification(`${userName} joined your meetup!`, {
            body: `${userName} has joined your meetup at ${meetupName}`,
            tag: 'meetup_join',
            data: { type: 'meetup_join' }
        });
    }
}
