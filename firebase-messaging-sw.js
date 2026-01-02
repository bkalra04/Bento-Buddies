// Firebase Cloud Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Initialize Firebase in the service worker
firebase.initializeApp({
    apiKey: "AIzaSyASLlmDWOQN24MBb5R0TBnKKSLUV6hYQdg",
    authDomain: "bento-buddies.firebaseapp.com",
    projectId: "bento-buddies",
    storageBucket: "bento-buddies.firebasestorage.app",
    messagingSenderId: "1097933862997",
    appId: "1:1097933862997:web:df8f12e94e5a5e21c28f97"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
    console.log('Received background message:', payload);

    const notificationTitle = payload.notification?.title || 'Bento Buddies';
    const notificationOptions = {
        body: payload.notification?.body || 'You have a new notification',
        icon: '/Images/logo.png',
        badge: '/Images/logo.png',
        tag: payload.data?.type || 'general',
        data: payload.data
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    console.log('Notification clicked:', event);
    event.notification.close();

    // Navigate to appropriate page based on notification type
    const data = event.notification.data;
    let url = '/home/home.html';

    if (data?.type === 'message') {
        url = '/messages/messages.html';
    } else if (data?.type === 'meetup_join') {
        url = '/events/events.html';
    }

    event.waitUntil(
        clients.openWindow(url)
    );
});
