// Meetup Service
import { db, collection, doc, addDoc, getDoc, updateDoc, deleteDoc, query, where, orderBy, getDocs, onSnapshot } from '../../firebase-config.js';
import { handleError } from '../utils/error-handler.js';
import { getUserProfile } from './user.service.js';

/**
 * Create a new meetup
 */
export async function createMeetup(meetupData, currentUser) {
    try {
        // Get current user's profile
        const userResult = await getUserProfile(currentUser.uid);
        if (!userResult.success) {
            return { success: false, error: 'Could not fetch user profile' };
        }

        const userData = userResult.data;

        const meetup = {
            createdBy: currentUser.uid,
            creatorName: userData.name || 'Anonymous',
            creatorPicture: userData.profilePicture || '',
            restaurantName: meetupData.restaurantName,
            restaurantAddress: meetupData.restaurantAddress,
            restaurantLocation: meetupData.restaurantLocation,
            restaurantPlaceId: meetupData.restaurantPlaceId,
            restaurantPhoto: meetupData.restaurantPhoto || '',
            date: meetupData.date,
            time: meetupData.time,
            maxSpots: parseInt(meetupData.maxSpots),
            details: meetupData.details || '',
            attendees: [{
                userId: currentUser.uid,
                name: userData.name,
                picture: userData.profilePicture || '',
                joinedAt: new Date().toISOString()
            }],
            status: 'open', // open, full, cancelled, completed
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const docRef = await addDoc(collection(db, 'meetups'), meetup);
        return { success: true, id: docRef.id };
    } catch (error) {
        return handleError(error, 'Failed to create meetup');
    }
}

/**
 * Get meetup by ID
 */
export async function getMeetup(meetupId) {
    try {
        const meetupDoc = await getDoc(doc(db, 'meetups', meetupId));
        if (meetupDoc.exists()) {
            return { success: true, data: { id: meetupDoc.id, ...meetupDoc.data() } };
        }
        return { success: false, error: 'Meetup not found' };
    } catch (error) {
        return handleError(error, 'Failed to get meetup');
    }
}

/**
 * Get all meetups (with optional filters)
 */
export async function getMeetups(filters = {}) {
    try {
        // Just get all meetups - no compound queries to avoid index requirements
        const q = collection(db, 'meetups');
        const snapshot = await getDocs(q);

        let meetups = [];
        snapshot.forEach(docSnap => {
            meetups.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Apply filters in JavaScript
        if (filters.status) {
            meetups = meetups.filter(m => m.status === filters.status);
        }
        if (filters.date) {
            meetups = meetups.filter(m => m.date === filters.date);
        }
        if (filters.createdBy) {
            meetups = meetups.filter(m => m.createdBy === filters.createdBy);
        }

        // Sort by date in JavaScript
        meetups.sort((a, b) => {
            if (a.date === b.date) {
                return a.time > b.time ? 1 : -1;
            }
            return a.date > b.date ? 1 : -1;
        });

        return { success: true, data: meetups };
    } catch (error) {
        return handleError(error, 'Failed to get meetups');
    }
}

/**
 * Listen to meetups in real-time
 */
export function onMeetupsChange(callback, filters = {}) {
    try {
        // Just get all meetups, no complex queries to avoid index requirements
        const q = collection(db, 'meetups');

        return onSnapshot(q, (snapshot) => {
            const meetups = [];
            snapshot.forEach(docSnap => {
                meetups.push({ id: docSnap.id, ...docSnap.data() });
            });

            // Sort by date in JavaScript
            meetups.sort((a, b) => {
                if (a.date === b.date) {
                    return a.time > b.time ? 1 : -1;
                }
                return a.date > b.date ? 1 : -1;
            });

            callback(meetups);
        });
    } catch (error) {
        console.error('Error listening to meetups:', error);
        return () => {}; // Return empty unsubscribe function
    }
}

/**
 * Join a meetup
 */
export async function joinMeetup(meetupId, currentUser) {
    try {
        const meetupResult = await getMeetup(meetupId);
        if (!meetupResult.success) {
            return meetupResult;
        }

        const meetup = meetupResult.data;

        // Check if already joined
        if (meetup.attendees.some(a => a.userId === currentUser.uid)) {
            return { success: false, error: 'You have already joined this meetup' };
        }

        // Check if full
        if (meetup.attendees.length >= meetup.maxSpots) {
            return { success: false, error: 'This meetup is full' };
        }

        // Get user profile
        const userResult = await getUserProfile(currentUser.uid);
        if (!userResult.success) {
            return { success: false, error: 'Could not fetch user profile' };
        }

        const userData = userResult.data;

        // Add user to attendees
        const newAttendee = {
            userId: currentUser.uid,
            name: userData.name,
            picture: userData.profilePicture || '',
            joinedAt: new Date().toISOString()
        };

        const updatedAttendees = [...meetup.attendees, newAttendee];
        const newStatus = updatedAttendees.length >= meetup.maxSpots ? 'full' : 'open';

        await updateDoc(doc(db, 'meetups', meetupId), {
            attendees: updatedAttendees,
            status: newStatus,
            updatedAt: new Date()
        });

        return { success: true };
    } catch (error) {
        return handleError(error, 'Failed to join meetup');
    }
}

/**
 * Leave a meetup
 */
export async function leaveMeetup(meetupId, currentUser) {
    try {
        const meetupResult = await getMeetup(meetupId);
        if (!meetupResult.success) {
            return meetupResult;
        }

        const meetup = meetupResult.data;

        // Can't leave if you're the creator
        if (meetup.createdBy === currentUser.uid) {
            return { success: false, error: 'Creator cannot leave the meetup. You can cancel it instead.' };
        }

        // Check if actually joined
        if (!meetup.attendees.some(a => a.userId === currentUser.uid)) {
            return { success: false, error: 'You are not a member of this meetup' };
        }

        // Remove user from attendees
        const updatedAttendees = meetup.attendees.filter(a => a.userId !== currentUser.uid);

        await updateDoc(doc(db, 'meetups', meetupId), {
            attendees: updatedAttendees,
            status: 'open', // Re-open if was full
            updatedAt: new Date()
        });

        return { success: true };
    } catch (error) {
        return handleError(error, 'Failed to leave meetup');
    }
}

/**
 * Update meetup details (creator only)
 */
export async function updateMeetup(meetupId, updateData, currentUser) {
    try {
        const meetupResult = await getMeetup(meetupId);
        if (!meetupResult.success) {
            return meetupResult;
        }

        const meetup = meetupResult.data;

        // Only creator can update
        if (meetup.createdBy !== currentUser.uid) {
            return { success: false, error: 'Only the creator can update this meetup' };
        }

        await updateDoc(doc(db, 'meetups', meetupId), {
            ...updateData,
            updatedAt: new Date()
        });

        return { success: true };
    } catch (error) {
        return handleError(error, 'Failed to update meetup');
    }
}

/**
 * Cancel a meetup (creator only)
 */
export async function cancelMeetup(meetupId, currentUser) {
    try {
        return await updateMeetup(meetupId, { status: 'cancelled' }, currentUser);
    } catch (error) {
        return handleError(error, 'Failed to cancel meetup');
    }
}

/**
 * Delete a meetup (creator only)
 */
export async function deleteMeetup(meetupId, currentUser) {
    try {
        const meetupResult = await getMeetup(meetupId);
        if (!meetupResult.success) {
            return meetupResult;
        }

        const meetup = meetupResult.data;

        // Only creator can delete
        if (meetup.createdBy !== currentUser.uid) {
            return { success: false, error: 'Only the creator can delete this meetup' };
        }

        await deleteDoc(doc(db, 'meetups', meetupId));
        return { success: true };
    } catch (error) {
        return handleError(error, 'Failed to delete meetup');
    }
}

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

/**
 * Get meetups happening today
 */
export async function getTodayMeetups() {
    return await getMeetups({ status: 'open', date: getTodayDate() });
}

/**
 * Get user's meetups
 */
export async function getUserMeetups(userId) {
    try {
        const allMeetups = await getMeetups({ status: 'open' });
        if (!allMeetups.success) {
            return allMeetups;
        }

        // Filter meetups where user is an attendee
        const userMeetups = allMeetups.data.filter(meetup =>
            meetup.attendees.some(a => a.userId === userId)
        );

        return { success: true, data: userMeetups };
    } catch (error) {
        return handleError(error, 'Failed to get user meetups');
    }
}

/**
 * Get user's past meetup history (already happened)
 */
export async function getUserMeetupHistory(userId) {
    try {
        // Get all user's meetups
        const userMeetupsResult = await getUserMeetups(userId);

        if (!userMeetupsResult.success) {
            return userMeetupsResult;
        }

        // Filter for past meetups only
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const pastMeetups = userMeetupsResult.data.filter(meetup => {
            const meetupDate = new Date(meetup.date);
            return meetupDate < today;
        });

        // Sort by date (most recent first)
        pastMeetups.sort((a, b) => {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            return dateB - dateA;
        });

        return { success: true, data: pastMeetups };
    } catch (error) {
        return handleError(error, 'Failed to get meetup history');
    }
}

/**
 * Get user's saved/favorite meetups
 */
export async function getSavedMeetups(userId, savedMeetupIds) {
    try {
        if (!savedMeetupIds || savedMeetupIds.length === 0) {
            return { success: true, data: [] };
        }

        // Get all meetup details for saved IDs
        const meetupPromises = savedMeetupIds.map(id => getMeetup(id));
        const results = await Promise.all(meetupPromises);

        // Filter successful results
        const meetups = results
            .filter(result => result.success)
            .map(result => result.data);

        // Sort by date
        meetups.sort((a, b) => {
            if (a.date === b.date) {
                return a.time > b.time ? 1 : -1;
            }
            return a.date > b.date ? 1 : -1;
        });

        return { success: true, data: meetups };
    } catch (error) {
        return handleError(error, 'Failed to get saved meetups');
    }
}
