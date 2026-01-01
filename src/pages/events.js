// Events Page - Real Meetups from Firestore
import { auth, storage, ref, uploadBytes, getDownloadURL } from '../../firebase-config.js';
import {
    onMeetupsChange,
    joinMeetup,
    leaveMeetup,
    getMeetup
} from '../services/meetup.service.js';
import {
    getOrCreateConversation,
    sendMessage,
    sendGroupMessage,
    onGroupMessagesChange
} from '../services/message.service.js';
import {
    submitRating,
    getRateableAttendees
} from '../services/rating.service.js';
import { getUserProfile, saveMeetup, unsaveMeetup, isMeetupSaved } from '../services/user.service.js';
import { notifyMeetupJoin } from '../services/notification.service.js';
import { requireAuth } from '../services/auth.service.js';
import { showError, showSuccess, showLoading, hideLoading } from '../utils/error-handler.js';
import { formatDate, formatTime, isToday, getTodayDate } from '../utils/date-helpers.js';

let currentUser = null;
let allMeetups = [];
let unsubscribeMeetups = null;
let selectedMeetup = null;
let unsubscribeGroupChat = null;
let selectedGroupChatPhoto = null;
let selectedRating = 0;
let currentRatingUser = null;
let userSavedMeetups = [];

// Advanced filter state
let activeTimeFilter = 'all';
let activeDateFilter = 'all';
let activeSortOption = 'date';

// Carousel state
let todayScrollInterval;
let futureScrollInterval;
let todayPaused = false;
let futurePaused = false;

// DOM elements
const searchInput = document.getElementById('searchInput');
const todayCarousel = document.getElementById('todayCarousel');
const futureCarousel = document.getElementById('futureCarousel');
const eventModal = document.getElementById('eventModal');
const closeModal = document.getElementById('closeModal');

// Initialize
async function init() {
    try {
        currentUser = await requireAuth();
        await loadUserSavedMeetups();
        loadMeetups();
        setupEventListeners();
    } catch (error) {
        console.error('Auth error:', error);
        window.location.href = '../index/index.html';
    }
}

// Load user's saved meetups
async function loadUserSavedMeetups() {
    const userResult = await getUserProfile(currentUser.uid);
    if (userResult.success) {
        userSavedMeetups = userResult.data.savedMeetups || [];
    }
}

// Load meetups with real-time updates
function loadMeetups() {
    if (unsubscribeMeetups) {
        unsubscribeMeetups();
    }

    // Real-time listener for meetups (no filters - filter in JS to avoid index requirement)
    unsubscribeMeetups = onMeetupsChange((meetups) => {
        // Filter out cancelled meetups
        allMeetups = meetups.filter(m => m.status === 'open' || m.status === 'full' || m.status === 'completed');

        // Separate into today, future, and past
        const today = getTodayDate();
        const todayMeetups = allMeetups.filter(m => m.date === today && m.status !== 'completed');
        const futureMeetups = allMeetups.filter(m => m.date > today && m.status !== 'completed');
        const pastMeetups = allMeetups.filter(m => m.date < today || m.status === 'completed');

        console.log('Today:', today);
        console.log('All meetups:', allMeetups.length);
        console.log('Today meetups:', todayMeetups.length);
        console.log('Future meetups:', futureMeetups.length);
        console.log('Past meetups:', pastMeetups.length);

        renderEvents(todayMeetups, 'todayCarousel');
        renderEvents(futureMeetups, 'futureCarousel');
        renderEvents(pastMeetups, 'pastCarousel');

        // Start carousels
        startCarousel('todayCarousel');
        startCarousel('futureCarousel');
        startCarousel('pastCarousel');
    });
}

// Render events
function renderEvents(meetups, carouselId) {
    const carousel = document.getElementById(carouselId);
    carousel.innerHTML = '';

    if (meetups.length === 0) {
        carousel.innerHTML = `
            <div class="empty-state" style="
                width: 100%;
                padding: 60px 20px;
                text-align: center;
                color: #666;
            ">
                <p style="font-size: 16px; margin-bottom: 10px;">No meetups ${carouselId === 'todayCarousel' ? 'today' : 'scheduled'}</p>
                <p style="font-size: 14px;">Create one from the Maps page!</p>
            </div>
        `;
        return;
    }

    // Duplicate meetups for infinite scroll effect (only if more than 2 meetups)
    const extendedMeetups = meetups.length > 2
        ? [...meetups, ...meetups, ...meetups]
        : meetups;

    extendedMeetups.forEach((meetup, index) => {
        const card = createMeetupCard(meetup, index % meetups.length, carouselId);
        carousel.appendChild(card);
    });
}

// Create meetup card
function createMeetupCard(meetup, originalIndex, carouselId) {
    const card = document.createElement('div');
    card.className = 'event-card';
    card.dataset.originalIndex = originalIndex;
    card.dataset.meetupId = meetup.id;

    // Calculate spots left
    const spotsLeft = meetup.maxSpots - meetup.attendees.length;
    const isFull = spotsLeft <= 0;
    const isUserAttending = meetup.attendees.some(a => a.userId === currentUser.uid);

    // Image container
    const imageContainer = document.createElement('div');
    imageContainer.className = 'event-image';

    const imgElement = document.createElement('img');
    // Prioritize user-uploaded photo, then restaurant photo, then placeholder
    imgElement.src = meetup.userPhoto || meetup.restaurantPhoto || '../Images/placeholder.png';
    imgElement.alt = meetup.restaurantName;
    imgElement.style.width = '100%';
    imgElement.style.height = '100%';
    imgElement.style.objectFit = 'cover';
    imageContainer.appendChild(imgElement);

    // Bookmark icon
    const isSaved = userSavedMeetups.includes(meetup.id);
    const bookmarkIcon = document.createElement('div');
    bookmarkIcon.className = 'bookmark-icon';
    bookmarkIcon.innerHTML = isSaved ? '❤️' : '🤍';
    bookmarkIcon.title = isSaved ? 'Remove from favorites' : 'Add to favorites';
    bookmarkIcon.addEventListener('click', async (e) => {
        e.stopPropagation();
        await toggleSaveMeetup(meetup.id, bookmarkIcon);
    });
    imageContainer.appendChild(bookmarkIcon);

    // Status badge
    let statusBadge = '';
    if (isUserAttending) {
        statusBadge = '<div class="status-badge joined">Joined</div>';
    } else if (isFull) {
        statusBadge = '<div class="status-badge full">Full</div>';
    }

    // Dietary icons
    const dietaryIcons = {
        'vegetarian': '🥗',
        'vegan': '🌱',
        'halal': '☪️',
        'kosher': '✡️',
        'gluten-free': '🌾',
        'dairy-free': '🥛',
        'nut-allergy': '🥜',
        'pescatarian': '🐟'
    };

    let dietaryHTML = '';
    if (meetup.dietaryPreferences && meetup.dietaryPreferences.length > 0) {
        const icons = meetup.dietaryPreferences.map(pref => dietaryIcons[pref] || '').join(' ');
        dietaryHTML = `<div class="dietary-icons">${icons}</div>`;
    }

    // Event info
    const eventInfo = document.createElement('div');
    eventInfo.className = 'event-info';
    eventInfo.innerHTML = `
        <h3>${meetup.restaurantName}</h3>
        ${dietaryHTML}
        <p>${formatTime(meetup.time)}</p>
        <div class="event-footer">
            <div class="attendees-preview">
                ${renderAttendeesPreview(meetup.attendees)}
            </div>
            <span class="spots-left ${isFull ? 'full' : ''}">${isFull ? 'Full' : `${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} left`}</span>
        </div>
        ${statusBadge}
    `;

    card.appendChild(imageContainer);
    card.appendChild(eventInfo);

    // Click to show details
    card.addEventListener('click', () => {
        showMeetupDetails(meetup);
    });

    // Pause carousel on hover
    card.addEventListener('mouseenter', () => {
        if (carouselId === 'todayCarousel') {
            todayPaused = true;
        } else {
            futurePaused = true;
        }
    });

    card.addEventListener('mouseleave', () => {
        if (carouselId === 'todayCarousel') {
            todayPaused = false;
        } else {
            futurePaused = false;
        }
    });

    return card;
}

// Render attendees preview (show first 3 avatars)
function renderAttendeesPreview(attendees) {
    const preview = attendees.slice(0, 3);
    let html = '';

    preview.forEach((attendee, index) => {
        if (attendee.picture) {
            html += `<img src="${attendee.picture}" alt="${attendee.name}" style="width: 30px; height: 30px; border-radius: 50%; margin-right: -10px; border: 2px solid white;">`;
        } else {
            const initials = getInitials(attendee.name);
            const gradient = getGradientForName(attendee.name);
            html += `<div style="
                width: 30px;
                height: 30px;
                border-radius: 50%;
                background: ${gradient};
                display: inline-flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 12px;
                font-weight: 600;
                margin-right: -10px;
                border: 2px solid white;
            ">${initials}</div>`;
        }
    });

    if (attendees.length > 3) {
        html += `<div style="
            width: 30px;
            height: 30px;
            border-radius: 50%;
            background: #ddd;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            color: #666;
            border: 2px solid white;
        ">+${attendees.length - 3}</div>`;
    }

    return html;
}

// Show meetup details modal
function showMeetupDetails(meetup) {
    selectedMeetup = meetup;

    const modalImage = document.getElementById('modalImage');
    const modalTitle = document.getElementById('modalTitle');
    const modalDate = document.getElementById('modalDate');
    const modalTime = document.getElementById('modalTime');
    const modalLocation = document.getElementById('modalLocation');

    // Prioritize user-uploaded photo, then restaurant photo, then placeholder
    modalImage.src = meetup.userPhoto || meetup.restaurantPhoto || '../Images/placeholder.png';
    modalTitle.textContent = meetup.restaurantName;
    modalDate.textContent = formatDate(meetup.date);
    modalTime.textContent = formatTime(meetup.time);
    modalLocation.textContent = meetup.restaurantAddress;

    // Add attendees section to modal if not exists
    let modalDetails = document.querySelector('.modal-details');

    // Remove existing join/leave button if present
    const existingBtn = document.getElementById('joinLeaveBtn');
    if (existingBtn) existingBtn.remove();

    const spotsLeft = meetup.maxSpots - meetup.attendees.length;
    const isFull = spotsLeft <= 0;
    const isUserAttending = meetup.attendees.some(a => a.userId === currentUser.uid);
    const isCreator = meetup.createdBy === currentUser.uid;

    // Add attendees list
    let attendeesHTML = `
        <p><strong>👥 Attendees (${meetup.attendees.length}/${meetup.maxSpots}):</strong></p>
        <div class="attendees-list" style="margin: 10px 0; display: flex; flex-wrap: wrap; gap: 10px;">
    `;

    meetup.attendees.forEach(attendee => {
        const isYou = attendee.userId === currentUser.uid;
        attendeesHTML += `
            <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: #f5f5f5; border-radius: 8px; flex: 1; min-width: 120px;">
                ${attendee.picture
                    ? `<img src="${attendee.picture}" style="width: 30px; height: 30px; border-radius: 50%;">`
                    : `<div style="width: 30px; height: 30px; border-radius: 50%; background: ${getGradientForName(attendee.name)}; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: 600;">${getInitials(attendee.name)}</div>`
                }
                <span style="font-size: 14px;">${attendee.name}${isYou ? ' (You)' : ''}</span>
                ${attendee.userId === meetup.createdBy ? '<span style="font-size: 12px; color: #FF93A9;">👑</span>' : ''}
            </div>
        `;
    });

    attendeesHTML += '</div>';

    if (meetup.details) {
        attendeesHTML += `<p><strong>📝 Details:</strong> ${meetup.details}</p>`;
    }

    // Replace or add attendees section
    const existingAttendees = modalDetails.querySelector('.attendees-list');
    if (existingAttendees) {
        existingAttendees.parentElement.remove();
    }
    modalDetails.insertAdjacentHTML('beforeend', attendeesHTML);

    // Add join/leave button
    if (!isCreator) {
        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'margin-top: 20px; display: flex; gap: 10px;';

        const joinLeaveBtn = document.createElement('button');
        joinLeaveBtn.id = 'joinLeaveBtn';
        joinLeaveBtn.style.cssText = `
            flex: 1;
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
        `;

        if (isUserAttending) {
            joinLeaveBtn.textContent = 'Leave Meetup';
            joinLeaveBtn.style.background = '#fff';
            joinLeaveBtn.style.color = '#ff4444';
            joinLeaveBtn.style.border = '2px solid #ff4444';
            joinLeaveBtn.onclick = () => handleLeaveMeetup(meetup.id);
        } else if (isFull) {
            joinLeaveBtn.textContent = 'Full';
            joinLeaveBtn.style.background = '#ccc';
            joinLeaveBtn.style.color = '#666';
            joinLeaveBtn.disabled = true;
            joinLeaveBtn.style.cursor = 'not-allowed';
        } else {
            joinLeaveBtn.textContent = 'Join Meetup';
            joinLeaveBtn.style.background = 'linear-gradient(135deg, #FF93A9, #FF8375)';
            joinLeaveBtn.style.color = 'white';
            joinLeaveBtn.onclick = () => handleJoinMeetup(meetup.id);
        }

        btnContainer.appendChild(joinLeaveBtn);
        modalDetails.appendChild(btnContainer);
    }

    // Add "Rate Attendees" button for past meetups
    const meetupDate = new Date(meetup.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isPastMeetup = meetupDate < today;

    // Remove existing rate button if present
    const existingRateBtn = document.getElementById('rateAttendeesBtn');
    if (existingRateBtn) existingRateBtn.remove();

    if (isPastMeetup && isUserAttending) {
        const rateBtnContainer = document.createElement('div');
        rateBtnContainer.style.cssText = 'margin-top: 15px;';

        const rateBtn = document.createElement('button');
        rateBtn.id = 'rateAttendeesBtn';
        rateBtn.textContent = '⭐ Rate Attendees';
        rateBtn.style.cssText = `
            width: 100%;
            padding: 12px 24px;
            background: linear-gradient(135deg, #FFD700, #FFA500);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
        `;
        rateBtn.onclick = () => showRateAttendeesModal(meetup);

        rateBtnContainer.appendChild(rateBtn);
        modalDetails.appendChild(rateBtnContainer);
    }

    // Show/hide group chat section
    const groupChatSection = document.getElementById('groupChatSection');
    if (isUserAttending) {
        groupChatSection.style.display = 'block';
        loadGroupChat(meetup.id);
    } else {
        groupChatSection.style.display = 'none';
        // Unsubscribe from group chat if not attending
        if (unsubscribeGroupChat) {
            unsubscribeGroupChat();
            unsubscribeGroupChat = null;
        }
    }

    eventModal.style.display = 'block';
}

// Handle join meetup
async function handleJoinMeetup(meetupId) {
    showLoading('Joining meetup...');

    const result = await joinMeetup(meetupId, currentUser);

    hideLoading();

    if (result.success) {
        // Get updated meetup details
        const updated = await getMeetup(meetupId);

        if (updated.success) {
            const meetup = updated.data;

            // Auto-create conversation with meetup creator and send notification
            if (meetup.createdBy !== currentUser.uid) {
                console.log('Creating conversation between:', currentUser.uid, 'and', meetup.createdBy);
                const conversationResult = await getOrCreateConversation(currentUser.uid, meetup.createdBy);
                console.log('Conversation result:', conversationResult);

                if (conversationResult.success) {
                    // Get current user's profile to get their name
                    const userProfileResult = await getUserProfile(currentUser.uid);
                    const userName = userProfileResult.success ? userProfileResult.data.name : 'Someone';

                    // Send automatic notification message from joiner's perspective
                    const notificationText = `Hi! I just joined your meetup at ${meetup.restaurantName} on ${formatDate(meetup.date)} at ${formatTime(meetup.time)}! 🎉 Looking forward to it!`;

                    console.log('Sending notification message to conversation:', conversationResult.id);
                    const messageResult = await sendMessage(
                        conversationResult.id,
                        currentUser.uid,
                        userName,
                        notificationText
                    );
                    console.log('Message send result:', messageResult);

                    // Trigger browser notification for meetup creator (if they have the tab open)
                    // Note: For production, this would be sent via Cloud Functions to the creator's FCM token
                    notifyMeetupJoin(userName, meetup.restaurantName);

                    showSuccess('Successfully joined! You can now message the organizer in the Messages tab.');
                } else {
                    console.error('Failed to create conversation:', conversationResult.error);
                    showSuccess('Successfully joined the meetup!');
                }
            } else {
                showSuccess('Successfully joined the meetup!');
            }

            showMeetupDetails(meetup);
        } else {
            showSuccess('Successfully joined the meetup!');
        }
    } else {
        showError(result.error || 'Failed to join meetup');
    }
}

// Handle leave meetup
async function handleLeaveMeetup(meetupId) {
    if (!confirm('Are you sure you want to leave this meetup?')) {
        return;
    }

    showLoading('Leaving meetup...');

    // Get meetup details before leaving
    const meetupResult = await getMeetup(meetupId);
    const meetup = meetupResult.success ? meetupResult.data : null;

    const result = await leaveMeetup(meetupId, currentUser);

    hideLoading();

    if (result.success) {
        // Send leave notification if there's a conversation with the creator
        if (meetup && meetup.createdBy !== currentUser.uid) {
            const conversationResult = await getOrCreateConversation(currentUser.uid, meetup.createdBy);

            if (conversationResult.success) {
                const userProfileResult = await getUserProfile(currentUser.uid);
                const userName = userProfileResult.success ? userProfileResult.data.name : 'Someone';

                const leaveNotification = `I had to leave the meetup at ${meetup.restaurantName} on ${formatDate(meetup.date)} at ${formatTime(meetup.time)}. Sorry about that!`;

                await sendMessage(
                    conversationResult.id,
                    currentUser.uid,
                    userName,
                    leaveNotification
                );
            }
        }

        showSuccess('Successfully left the meetup');

        // Close the modal after leaving
        eventModal.style.display = 'none';
        selectedMeetup = null;

        // Real-time listener will automatically update the cards
    } else {
        showError(result.error || 'Failed to leave meetup');
    }
}

// Start carousel auto-scroll
function startCarousel(carouselId) {
    const carousel = document.getElementById(carouselId);
    const isToday = carouselId === 'todayCarousel';

    // Clear existing interval
    if (isToday && todayScrollInterval) {
        clearInterval(todayScrollInterval);
    } else if (!isToday && futureScrollInterval) {
        clearInterval(futureScrollInterval);
    }

    const interval = setInterval(() => {
        if ((isToday && todayPaused) || (!isToday && futurePaused)) {
            return;
        }

        carousel.scrollLeft += 1;

        // Reset scroll if reached end
        const maxScroll = carousel.scrollWidth - carousel.clientWidth;
        if (carousel.scrollLeft >= maxScroll - 10) {
            carousel.scrollLeft = 0;
        }
    }, 30);

    if (isToday) {
        todayScrollInterval = interval;
    } else {
        futureScrollInterval = interval;
    }
}

// Search functionality
function setupEventListeners() {
    // Search emoji click to focus input
    const searchIcon = document.querySelector('.search-icon');
    if (searchIcon) {
        searchIcon.style.cursor = 'pointer';
        searchIcon.addEventListener('click', () => {
            searchInput.focus();
        });
    }

    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const allCards = document.querySelectorAll('.event-card');

        allCards.forEach(card => {
            const eventName = card.querySelector('h3').textContent.toLowerCase();
            const location = allMeetups.find(m => m.id === card.dataset.meetupId)?.restaurantAddress.toLowerCase() || '';

            if (eventName.includes(searchTerm) || location.includes(searchTerm)) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    });

    // Dietary filter buttons
    const filterButtons = document.querySelectorAll('.dietary-filter-btn');
    let activeFilter = 'all';

    // Set "All" as active by default
    const allBtn = document.querySelector('.dietary-filter-btn[data-filter="all"]');
    if (allBtn) allBtn.classList.add('active');

    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const filter = btn.dataset.filter;

            // Update active state
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilter = filter;

            // Filter meetups
            filterMeetupsByDietary(filter);
        });
    });

    // Close modal
    closeModal.addEventListener('click', () => {
        eventModal.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target === eventModal) {
            eventModal.style.display = 'none';
        }
    });

    // Plan a visit button
    const planVisitBtn = document.querySelector('.plan-visit-btn');
    if (planVisitBtn) {
        planVisitBtn.addEventListener('click', () => {
            window.location.href = '../maps/maps.html';
        });
    }

    // Time of day filter buttons
    const timeFilterButtons = document.querySelectorAll('.time-filter-btn');
    timeFilterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const timeFilter = btn.dataset.time;
            timeFilterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeTimeFilter = timeFilter;
            applyAllFilters();
        });
    });

    // Date range filter buttons
    const dateFilterButtons = document.querySelectorAll('.date-filter-btn');
    dateFilterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const dateFilter = btn.dataset.date;
            dateFilterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeDateFilter = dateFilter;
            applyAllFilters();
        });
    });

    // Sort select
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            activeSortOption = e.target.value;
            applyAllFilters();
        });
    }
}

// Helper functions
function getInitials(name) {
    if (!name) return '??';
    const parts = name.split(' ');
    return parts.length >= 2
        ? parts[0][0] + parts[1][0]
        : name.substring(0, 2);
}

function getGradientForName(name) {
    const gradients = [
        'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
        'linear-gradient(135deg, #fa709a 0%, #fee140 100%)'
    ];
    return gradients[name.charCodeAt(0) % gradients.length];
}

// Filter meetups by dietary preferences
function filterMeetupsByDietary(filter) {
    const allCards = document.querySelectorAll('.event-card');

    allCards.forEach(card => {
        const meetupId = card.dataset.meetupId;
        const meetup = allMeetups.find(m => m.id === meetupId);

        if (!meetup) {
            card.style.display = 'none';
            return;
        }

        // Show all if filter is "all"
        if (filter === 'all') {
            card.style.display = 'block';
            return;
        }

        // Show only saved meetups if filter is "saved"
        if (filter === 'saved') {
            card.style.display = userSavedMeetups.includes(meetupId) ? 'block' : 'none';
            return;
        }

        // Check if meetup has the selected dietary preference
        const hasDietaryPreference = meetup.dietaryPreferences &&
                                     meetup.dietaryPreferences.includes(filter);

        card.style.display = hasDietaryPreference ? 'block' : 'none';
    });
}

// Load group chat for a meetup
function loadGroupChat(meetupId) {
    // Unsubscribe from previous chat
    if (unsubscribeGroupChat) {
        unsubscribeGroupChat();
    }

    const groupChatMessages = document.getElementById('groupChatMessages');
    groupChatMessages.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">Loading messages...</p>';

    // Real-time listener for group messages
    unsubscribeGroupChat = onGroupMessagesChange(meetupId, (messages) => {
        renderGroupMessages(messages);
    });
}

// Render group chat messages
function renderGroupMessages(messages) {
    const groupChatMessages = document.getElementById('groupChatMessages');
    groupChatMessages.innerHTML = '';

    if (messages.length === 0) {
        groupChatMessages.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No messages yet. Start the conversation!</p>';
        return;
    }

    messages.forEach(msg => {
        const isCurrentUser = msg.senderId === currentUser.uid;
        const messageDiv = document.createElement('div');
        messageDiv.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: ${isCurrentUser ? 'flex-end' : 'flex-start'};
            margin-bottom: 15px;
        `;

        // Avatar and name for other users
        let avatarHTML = '';
        if (!isCurrentUser) {
            const initials = getInitials(msg.senderName);
            const gradient = getGradientForName(msg.senderName);

            if (msg.senderPicture) {
                avatarHTML = `
                    <img src="${msg.senderPicture}"
                         style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; margin-right: 8px;">
                `;
            } else {
                avatarHTML = `
                    <div style="width: 28px; height: 28px; border-radius: 50%; background: ${gradient}; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: 600; margin-right: 8px;">
                        ${initials}
                    </div>
                `;
            }
        }

        // Photo HTML
        let photoHTML = '';
        if (msg.photoURL) {
            photoHTML = `<img src="${msg.photoURL}"
                             style="max-width: 250px; border-radius: 12px; margin-top: 8px; cursor: pointer; transition: transform 0.2s;"
                             onclick="showPhotoViewer('${msg.photoURL}')">`;
        }

        messageDiv.innerHTML = `
            <div style="display: flex; align-items: flex-end; ${isCurrentUser ? 'flex-direction: row-reverse;' : ''}; max-width: 70%;">
                ${avatarHTML}
                <div>
                    ${!isCurrentUser ? `<span style="font-size: 12px; color: #666; margin-left: ${msg.senderPicture ? '36px' : '36px'};">${msg.senderName}</span>` : ''}
                    ${photoHTML}
                    ${msg.text ? `<div style="
                        background: ${isCurrentUser ? '#f0f0f0' : '#FFD4E0'};
                        padding: 10px 15px;
                        border-radius: 18px;
                        margin-top: 4px;
                    ">
                        <p style="margin: 0; font-size: 14px;">${escapeHtml(msg.text)}</p>
                    </div>` : ''}
                    <span style="font-size: 11px; color: #999; margin-top: 4px; display: block; ${isCurrentUser ? 'margin-right: 10px;' : 'margin-left: 10px;'}">
                        ${msg.timestamp ? getRelativeTime(msg.timestamp) : 'Just now'}
                    </span>
                </div>
            </div>
        `;

        groupChatMessages.appendChild(messageDiv);
    });

    // Scroll to bottom
    groupChatMessages.scrollTop = groupChatMessages.scrollHeight;
}

// Handle sending group message
async function handleSendGroupMessage() {
    const groupChatInput = document.getElementById('groupChatInput');
    const text = groupChatInput.value.trim();
    const hasPhoto = selectedGroupChatPhoto !== null;

    if (!text && !hasPhoto) return;
    if (!selectedMeetup) return;

    // Clear input immediately
    const originalText = text;
    const originalPhoto = selectedGroupChatPhoto;
    groupChatInput.value = '';
    selectedGroupChatPhoto = null;
    const groupChatPhotoPreview = document.getElementById('groupChatPhotoPreview');
    const groupChatPhotoInput = document.getElementById('groupChatPhotoInput');
    groupChatPhotoPreview.style.display = 'none';
    groupChatPhotoInput.value = '';

    try {
        let photoURL = null;

        // Upload photo if selected
        if (hasPhoto) {
            const fileName = `groupChats/${selectedMeetup.id}/${Date.now()}_${originalPhoto.name}`;
            const storageRef = ref(storage, fileName);
            await uploadBytes(storageRef, originalPhoto);
            photoURL = await getDownloadURL(storageRef);
        }

        const result = await sendGroupMessage(
            selectedMeetup.id,
            currentUser.uid,
            currentUser.displayName || 'You',
            currentUser.photoURL || '',
            text || '📷 Photo',
            photoURL
        );

        if (!result.success) {
            showError(result.error || 'Failed to send message');
            // Restore message if send failed
            groupChatInput.value = originalText;
            selectedGroupChatPhoto = originalPhoto;
        }
    } catch (error) {
        console.error('Error sending group message:', error);
        showError('Failed to send message');
        groupChatInput.value = originalText;
        selectedGroupChatPhoto = originalPhoto;
    }
}

// Group chat photo upload handlers
const groupChatPhotoBtn = document.getElementById('groupChatPhotoBtn');
const groupChatPhotoInput = document.getElementById('groupChatPhotoInput');
const groupChatPhotoPreview = document.getElementById('groupChatPhotoPreview');
const groupChatPreviewImage = document.getElementById('groupChatPreviewImage');
const removeGroupChatPhotoBtn = document.getElementById('removeGroupChatPhotoBtn');

if (groupChatPhotoBtn) {
    groupChatPhotoBtn.addEventListener('click', () => {
        groupChatPhotoInput.click();
    });
}

if (groupChatPhotoInput) {
    groupChatPhotoInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            showError('Please select an image file');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            showError('Image must be less than 5MB');
            return;
        }

        try {
            const compressedFile = await compressImage(file);
            selectedGroupChatPhoto = compressedFile;

            const reader = new FileReader();
            reader.onload = (e) => {
                groupChatPreviewImage.src = e.target.result;
                groupChatPhotoPreview.style.display = 'block';
            };
            reader.readAsDataURL(compressedFile);
        } catch (error) {
            console.error('Error processing image:', error);
            showError('Failed to process image');
        }
    });
}

if (removeGroupChatPhotoBtn) {
    removeGroupChatPhotoBtn.addEventListener('click', () => {
        selectedGroupChatPhoto = null;
        groupChatPhotoInput.value = '';
        groupChatPhotoPreview.style.display = 'none';
        groupChatPreviewImage.src = '';
    });
}

// Group chat send button
const groupChatSendBtn = document.getElementById('groupChatSendBtn');
if (groupChatSendBtn) {
    groupChatSendBtn.addEventListener('click', handleSendGroupMessage);
}

// Group chat input enter key
const groupChatInput = document.getElementById('groupChatInput');
if (groupChatInput) {
    groupChatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendGroupMessage();
        }
    });
}

// Image compression function (reused from messages)
async function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

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

// Photo viewer function (simple version)
function showPhotoViewer(photoURL) {
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
        `;

        photoModal.innerHTML = `
            <span id="closePhotoViewer" style="position: absolute; top: 20px; right: 30px; color: white; font-size: 40px; font-weight: bold; cursor: pointer;">&times;</span>
            <img id="photoViewerImage" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); max-width: 90%; max-height: 90%; border-radius: 8px;">
        `;

        document.body.appendChild(photoModal);

        photoModal.querySelector('#closePhotoViewer').addEventListener('click', () => {
            photoModal.style.display = 'none';
        });

        photoModal.addEventListener('click', (e) => {
            if (e.target === photoModal) {
                photoModal.style.display = 'none';
            }
        });
    }

    const photoImg = photoModal.querySelector('#photoViewerImage');
    photoImg.src = photoURL;
    photoModal.style.display = 'block';
}

// Helper function to get relative time
function getRelativeTime(timestamp) {
    if (!timestamp) return 'Just now';

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
}

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show rate attendees modal
async function showRateAttendeesModal(meetup) {
    showLoading('Loading attendees...');

    const result = await getRateableAttendees(meetup.id, meetup.attendees, currentUser.uid);

    hideLoading();

    if (!result.success) {
        showError('Failed to load attendees');
        return;
    }

    const rateable = result.data;

    if (rateable.length === 0) {
        showSuccess('You have already rated all attendees!');
        return;
    }

    // Create temporary modal to show attendee list
    const listModal = document.createElement('div');
    listModal.className = 'modal';
    listModal.style.display = 'block';

    let attendeesHTML = '';
    rateable.forEach(attendee => {
        const initials = getInitials(attendee.name);
        const gradient = getGradientForName(attendee.name);

        attendeesHTML += `
            <div class="rateable-attendee" data-user-id="${attendee.userId}" data-user-name="${attendee.name}" data-user-picture="${attendee.picture || ''}"
                 style="display: flex; align-items: center; gap: 15px; padding: 15px; background: #f8f8f8; border-radius: 12px; margin-bottom: 12px; cursor: pointer; transition: background 0.2s;"
                 onmouseover="this.style.background='#ececec'" onmouseout="this.style.background='#f8f8f8'">
                ${attendee.picture
                    ? `<img src="${attendee.picture}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover;">`
                    : `<div style="width: 50px; height: 50px; border-radius: 50%; background: ${gradient}; display: flex; align-items: center; justify-content: center; color: white; font-size: 20px; font-weight: 600;">${initials}</div>`
                }
                <div style="flex: 1;">
                    <h4 style="margin: 0 0 5px 0;">${attendee.name}</h4>
                    <p style="margin: 0; color: #666; font-size: 14px;">Click to rate</p>
                </div>
                <span style="font-size: 24px; color: #FFD700;">⭐</span>
            </div>
        `;
    });

    listModal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <span class="close-btn" id="closeAttendeeList">&times;</span>
            <h2 style="margin-bottom: 20px;">Rate Attendees</h2>
            <p style="color: #666; margin-bottom: 20px;">Select an attendee to rate:</p>
            <div style="max-height: 400px; overflow-y: auto;">
                ${attendeesHTML}
            </div>
        </div>
    `;

    document.body.appendChild(listModal);

    // Add click handlers
    listModal.querySelector('#closeAttendeeList').addEventListener('click', () => {
        listModal.remove();
    });

    listModal.addEventListener('click', (e) => {
        if (e.target === listModal) {
            listModal.remove();
        }
    });

    listModal.querySelectorAll('.rateable-attendee').forEach(attendee => {
        attendee.addEventListener('click', () => {
            const userId = attendee.dataset.userId;
            const userName = attendee.dataset.userName;
            const userPicture = attendee.dataset.userPicture;

            listModal.remove();
            showRatingModal(meetup, { userId, name: userName, picture: userPicture });
        });
    });
}

// Show rating modal for specific user
function showRatingModal(meetup, user) {
    currentRatingUser = user;
    selectedRating = 0;

    const ratingModal = document.getElementById('ratingModal');
    const ratingUserInfo = document.getElementById('ratingUserInfo');
    const ratingReview = document.getElementById('ratingReview');
    const submitBtn = document.getElementById('submitRatingBtn');

    // Reset
    ratingReview.value = '';
    submitBtn.disabled = true;
    document.querySelectorAll('.star').forEach(star => {
        star.textContent = '☆';
        star.style.color = '#ddd';
    });

    // Show user info
    const initials = getInitials(user.name);
    const gradient = getGradientForName(user.name);

    ratingUserInfo.innerHTML = `
        ${user.picture
            ? `<img src="${user.picture}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover;">`
            : `<div style="width: 60px; height: 60px; border-radius: 50%; background: ${gradient}; display: flex; align-items: center; justify-content: center; color: white; font-size: 24px; font-weight: 600;">${initials}</div>`
        }
        <div>
            <h3 style="margin: 0 0 5px 0;">${user.name}</h3>
            <p style="margin: 0; color: #666; font-size: 14px;">${meetup.restaurantName} • ${formatDate(meetup.date)}</p>
        </div>
    `;

    ratingModal.style.display = 'block';
}

// Star rating handlers
const stars = document.querySelectorAll('.star');
const ratingText = document.getElementById('ratingText');
const submitRatingBtn = document.getElementById('submitRatingBtn');

stars.forEach(star => {
    star.addEventListener('click', () => {
        selectedRating = parseInt(star.dataset.rating);
        updateStarDisplay();
        submitRatingBtn.disabled = false;
    });

    star.addEventListener('mouseenter', () => {
        const rating = parseInt(star.dataset.rating);
        highlightStars(rating);
    });

    star.addEventListener('mouseleave', () => {
        highlightStars(selectedRating);
    });
});

function highlightStars(rating) {
    stars.forEach(star => {
        const starRating = parseInt(star.dataset.rating);
        if (starRating <= rating) {
            star.textContent = '★';
            star.style.color = '#FFD700';
        } else {
            star.textContent = '☆';
            star.style.color = '#ddd';
        }
    });

    const ratingLabels = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];
    ratingText.textContent = rating > 0 ? ratingLabels[rating] : 'Select a rating';
}

function updateStarDisplay() {
    highlightStars(selectedRating);
}

// Submit rating
submitRatingBtn.addEventListener('click', async () => {
    if (selectedRating === 0 || !currentRatingUser) return;

    const review = document.getElementById('ratingReview').value.trim();

    showLoading('Submitting rating...');

    const result = await submitRating(currentRatingUser.userId, {
        fromUserId: currentUser.uid,
        fromUserName: currentUser.displayName || 'Anonymous',
        fromUserPicture: currentUser.photoURL || '',
        meetupId: selectedMeetup.id,
        meetupName: selectedMeetup.restaurantName,
        rating: selectedRating,
        review: review
    });

    hideLoading();

    if (result.success) {
        showSuccess('Rating submitted successfully!');
        document.getElementById('ratingModal').style.display = 'none';
        selectedRating = 0;
        currentRatingUser = null;
    } else {
        showError(result.error || 'Failed to submit rating');
    }
});

// Close rating modal
document.getElementById('closeRatingModal').addEventListener('click', () => {
    document.getElementById('ratingModal').style.display = 'none';
    selectedRating = 0;
    currentRatingUser = null;
});

document.getElementById('cancelRatingBtn').addEventListener('click', () => {
    document.getElementById('ratingModal').style.display = 'none';
    selectedRating = 0;
    currentRatingUser = null;
});

document.getElementById('ratingModal').addEventListener('click', (e) => {
    if (e.target.id === 'ratingModal') {
        document.getElementById('ratingModal').style.display = 'none';
        selectedRating = 0;
        currentRatingUser = null;
    }
});

// Apply all filters (time, date, and sort)
function applyAllFilters() {
    let filteredMeetups = [...allMeetups];

    // Apply time filter
    if (activeTimeFilter !== 'all') {
        filteredMeetups = filteredMeetups.filter(meetup => {
            const time = parseInt(meetup.time.split(':')[0]);
            switch (activeTimeFilter) {
                case 'breakfast':
                    return time >= 6 && time < 11;
                case 'lunch':
                    return time >= 11 && time < 15;
                case 'dinner':
                    return time >= 17 && time < 21;
                case 'late':
                    return time >= 21 || time < 6;
                default:
                    return true;
            }
        });
    }

    // Apply date filter
    if (activeDateFilter !== 'all') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        filteredMeetups = filteredMeetups.filter(meetup => {
            const meetupDate = new Date(meetup.date);
            meetupDate.setHours(0, 0, 0, 0);

            switch (activeDateFilter) {
                case 'today':
                    return meetupDate.getTime() === today.getTime();
                case 'week':
                    const weekFromNow = new Date(today);
                    weekFromNow.setDate(weekFromNow.getDate() + 7);
                    return meetupDate >= today && meetupDate <= weekFromNow;
                case 'month':
                    const monthFromNow = new Date(today);
                    monthFromNow.setMonth(monthFromNow.getMonth() + 1);
                    return meetupDate >= today && meetupDate <= monthFromNow;
                default:
                    return true;
            }
        });
    }

    // Apply sorting
    filteredMeetups.sort((a, b) => {
        switch (activeSortOption) {
            case 'date':
                if (a.date === b.date) {
                    return a.time > b.time ? 1 : -1;
                }
                return a.date > b.date ? 1 : -1;
            case 'spots':
                const spotsA = a.maxSpots - a.attendees.length;
                const spotsB = b.maxSpots - b.attendees.length;
                return spotsB - spotsA;
            case 'attendees':
                return b.attendees.length - a.attendees.length;
            default:
                return 0;
        }
    });

    // Show/hide cards based on filtered results
    const allCards = document.querySelectorAll('.event-card');
    allCards.forEach(card => {
        const meetupId = card.dataset.meetupId;
        const isInFilteredList = filteredMeetups.some(m => m.id === meetupId);
        card.style.display = isInFilteredList ? 'block' : 'none';
    });
}

// Toggle save/unsave meetup
async function toggleSaveMeetup(meetupId, iconElement) {
    const isSaved = userSavedMeetups.includes(meetupId);

    try {
        if (isSaved) {
            const result = await unsaveMeetup(currentUser.uid, meetupId);
            if (result.success) {
                userSavedMeetups = userSavedMeetups.filter(id => id !== meetupId);
                iconElement.innerHTML = '🤍';
                iconElement.title = 'Add to favorites';
                showSuccess('Removed from favorites');
            } else {
                showError(result.error || 'Failed to remove from favorites');
            }
        } else {
            const result = await saveMeetup(currentUser.uid, meetupId);
            if (result.success) {
                userSavedMeetups.push(meetupId);
                iconElement.innerHTML = '❤️';
                iconElement.title = 'Remove from favorites';
                showSuccess('Added to favorites');
            } else {
                showError(result.error || 'Failed to add to favorites');
            }
        }
    } catch (error) {
        console.error('Error toggling save:', error);
        showError('Failed to update favorites');
    }
}

// Cleanup
window.addEventListener('beforeunload', () => {
    if (unsubscribeMeetups) unsubscribeMeetups();
    if (unsubscribeGroupChat) unsubscribeGroupChat();
    if (todayScrollInterval) clearInterval(todayScrollInterval);
    if (futureScrollInterval) clearInterval(futureScrollInterval);
});

// Initialize
init();
