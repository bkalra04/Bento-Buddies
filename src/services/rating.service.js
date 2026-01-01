// Rating Service
import { db, collection, doc, addDoc, getDoc, query, where, getDocs, updateDoc } from '../../firebase-config.js';
import { handleError } from '../utils/error-handler.js';

/**
 * Submit a rating for a user
 */
export async function submitRating(ratedUserId, ratingData) {
    try {
        const { fromUserId, fromUserName, fromUserPicture, meetupId, meetupName, rating, review } = ratingData;

        // Check if rating already exists for this user and meetup
        const q = query(
            collection(db, 'users', ratedUserId, 'ratings'),
            where('fromUserId', '==', fromUserId),
            where('meetupId', '==', meetupId)
        );

        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            return { success: false, error: 'You have already rated this user for this meetup' };
        }

        // Add rating
        const ratingDoc = {
            fromUserId,
            fromUserName,
            fromUserPicture: fromUserPicture || '',
            meetupId,
            meetupName,
            rating: parseInt(rating),
            review: review || '',
            timestamp: new Date()
        };

        await addDoc(collection(db, 'users', ratedUserId, 'ratings'), ratingDoc);

        // Update user's average rating
        await updateUserAverageRating(ratedUserId);

        return { success: true };
    } catch (error) {
        return handleError(error, 'Failed to submit rating');
    }
}

/**
 * Get all ratings for a user
 */
export async function getUserRatings(userId) {
    try {
        const snapshot = await getDocs(collection(db, 'users', userId, 'ratings'));

        const ratings = [];
        snapshot.forEach(docSnap => {
            ratings.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Sort by timestamp (newest first)
        ratings.sort((a, b) => {
            const timeA = a.timestamp?.toMillis?.() || 0;
            const timeB = b.timestamp?.toMillis?.() || 0;
            return timeB - timeA; // desc order
        });

        return { success: true, data: ratings };
    } catch (error) {
        return handleError(error, 'Failed to get ratings');
    }
}

/**
 * Calculate and update user's average rating
 */
async function updateUserAverageRating(userId) {
    try {
        const ratingsResult = await getUserRatings(userId);

        if (!ratingsResult.success || ratingsResult.data.length === 0) {
            // No ratings yet
            await updateDoc(doc(db, 'users', userId), {
                averageRating: 0,
                totalRatings: 0
            });
            return;
        }

        const ratings = ratingsResult.data;
        const totalRatings = ratings.length;
        const sumRatings = ratings.reduce((sum, r) => sum + r.rating, 0);
        const averageRating = sumRatings / totalRatings;

        await updateDoc(doc(db, 'users', userId), {
            averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
            totalRatings
        });
    } catch (error) {
        console.error('Error updating average rating:', error);
    }
}

/**
 * Check if user has already rated another user for a specific meetup
 */
export async function hasRatedUser(ratedUserId, fromUserId, meetupId) {
    try {
        const q = query(
            collection(db, 'users', ratedUserId, 'ratings'),
            where('fromUserId', '==', fromUserId),
            where('meetupId', '==', meetupId)
        );

        const snapshot = await getDocs(q);
        return { success: true, hasRated: !snapshot.empty };
    } catch (error) {
        return handleError(error, 'Failed to check rating status');
    }
}

/**
 * Get rateable attendees for a meetup (users you haven't rated yet)
 */
export async function getRateableAttendees(meetupId, attendees, currentUserId) {
    try {
        const rateable = [];

        for (const attendee of attendees) {
            // Skip current user
            if (attendee.userId === currentUserId) continue;

            // Check if already rated
            const checkResult = await hasRatedUser(attendee.userId, currentUserId, meetupId);

            if (checkResult.success && !checkResult.hasRated) {
                rateable.push(attendee);
            }
        }

        return { success: true, data: rateable };
    } catch (error) {
        return handleError(error, 'Failed to get rateable attendees');
    }
}
