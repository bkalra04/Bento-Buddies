// User Service
import { db, storage, doc, getDoc, updateDoc, getDocs, collection, ref, uploadBytes, getDownloadURL } from '../../firebase-config.js';
import { handleError } from '../utils/error-handler.js';

/**
 * Get user profile by ID
 */
export async function getUserProfile(userId) {
    try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
            return { success: true, data: { id: userDoc.id, ...userDoc.data() } };
        }
        return { success: false, error: 'User not found' };
    } catch (error) {
        return handleError(error, 'Failed to get user profile');
    }
}

/**
 * Update user profile
 */
export async function updateUserProfile(userId, profileData) {
    try {
        const updateData = {
            ...profileData,
            updatedAt: new Date()
        };

        await updateDoc(doc(db, 'users', userId), updateData);
        return { success: true };
    } catch (error) {
        return handleError(error, 'Failed to update profile');
    }
}

/**
 * Upload and update profile picture
 */
export async function updateProfilePicture(userId, file) {
    try {
        let fileToUpload = file;

        // Convert data URL to blob if needed
        if (typeof file === 'string' && file.startsWith('data:')) {
            const blob = await fetch(file).then(r => r.blob());
            fileToUpload = blob;
        }

        // Upload to Firebase Storage
        const storageRef = ref(storage, `profilePictures/${userId}/${Date.now()}.jpg`);
        await uploadBytes(storageRef, fileToUpload);
        const downloadUrl = await getDownloadURL(storageRef);

        // Update user profile with new picture URL
        await updateDoc(doc(db, 'users', userId), {
            profilePicture: downloadUrl,
            updatedAt: new Date()
        });

        return { success: true, url: downloadUrl };
    } catch (error) {
        return handleError(error, 'Failed to upload profile picture');
    }
}

/**
 * Search users by name or username
 */
export async function searchUsers(searchTerm) {
    try {
        const snapshot = await getDocs(collection(db, 'users'));

        const users = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const searchLower = searchTerm.toLowerCase();

            if (
                data.name?.toLowerCase().includes(searchLower) ||
                data.username?.toLowerCase().includes(searchLower) ||
                data.email?.toLowerCase().includes(searchLower)
            ) {
                users.push({ id: docSnap.id, ...data });
            }
        });

        return { success: true, data: users };
    } catch (error) {
        return handleError(error, 'Failed to search users');
    }
}

/**
 * Get multiple users by IDs
 */
export async function getUsersByIds(userIds) {
    try {
        const users = await Promise.all(
            userIds.map(async (id) => {
                const result = await getUserProfile(id);
                return result.success ? result.data : null;
            })
        );

        return { success: true, data: users.filter(u => u !== null) };
    } catch (error) {
        return handleError(error, 'Failed to get users');
    }
}

/**
 * Get all users (for admin dashboard)
 */
export async function getAllUsers() {
    try {
        const snapshot = await getDocs(collection(db, 'users'));

        const users = [];
        snapshot.forEach(docSnap => {
            users.push({ id: docSnap.id, ...docSnap.data() });
        });

        return { success: true, data: users };
    } catch (error) {
        return handleError(error, 'Failed to get all users');
    }
}

/**
 * Save a meetup to user's favorites
 */
export async function saveMeetup(userId, meetupId) {
    try {
        const userResult = await getUserProfile(userId);
        if (!userResult.success) {
            return userResult;
        }

        const userData = userResult.data;
        const savedMeetups = userData.savedMeetups || [];

        // Check if already saved
        if (savedMeetups.includes(meetupId)) {
            return { success: false, error: 'Meetup already saved' };
        }

        // Add to saved meetups
        savedMeetups.push(meetupId);

        await updateDoc(doc(db, 'users', userId), {
            savedMeetups,
            updatedAt: new Date()
        });

        return { success: true };
    } catch (error) {
        return handleError(error, 'Failed to save meetup');
    }
}

/**
 * Remove a meetup from user's favorites
 */
export async function unsaveMeetup(userId, meetupId) {
    try {
        const userResult = await getUserProfile(userId);
        if (!userResult.success) {
            return userResult;
        }

        const userData = userResult.data;
        const savedMeetups = userData.savedMeetups || [];

        // Remove from saved meetups
        const updatedSavedMeetups = savedMeetups.filter(id => id !== meetupId);

        await updateDoc(doc(db, 'users', userId), {
            savedMeetups: updatedSavedMeetups,
            updatedAt: new Date()
        });

        return { success: true };
    } catch (error) {
        return handleError(error, 'Failed to unsave meetup');
    }
}

/**
 * Check if a meetup is saved by user
 */
export async function isMeetupSaved(userId, meetupId) {
    try {
        const userResult = await getUserProfile(userId);
        if (!userResult.success) {
            return { success: false, isSaved: false };
        }

        const savedMeetups = userResult.data.savedMeetups || [];
        return { success: true, isSaved: savedMeetups.includes(meetupId) };
    } catch (error) {
        return handleError(error, 'Failed to check saved status');
    }
}
