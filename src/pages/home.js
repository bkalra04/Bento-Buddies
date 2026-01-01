// Home Dashboard - Real Statistics from Firestore
import { db } from '../../firebase-config.js';
import { getAllUsers } from '../services/user.service.js';
import { getMeetups } from '../services/meetup.service.js';
import { requireAuth } from '../services/auth.service.js';

let currentUser = null;

// Initialize
async function init() {
    try {
        currentUser = await requireAuth();
        await loadDashboardData();
    } catch (error) {
        console.error('Error:', error);
        // Allow viewing home page even without login
        loadDashboardData();
    }
}

// Load all dashboard data
async function loadDashboardData() {
    try {
        // Get all users and meetups
        const usersResult = await getAllUsers();
        const meetupsResult = await getMeetups();

        if (usersResult.success && meetupsResult.success) {
            const users = usersResult.data;
            const meetups = meetupsResult.data;

            // Update statistics
            updateStatistics(users, meetups);

            // Update most active users
            updateMostActiveUsers(users, meetups);

            // Update popular restaurants
            updatePopularRestaurants(meetups);

            // Update peak times
            updatePeakTimes(meetups);

            // Update demographics
            updateDemographics(users);
        }
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

// Update statistics cards
function updateStatistics(users, meetups) {
    // Total Users
    const totalUsersEl = document.querySelector('.stat-card:nth-child(1) h3');
    if (totalUsersEl) {
        totalUsersEl.textContent = users.length;
    }

    // Active Users (users who created or joined meetups)
    const activeUserIds = new Set();
    meetups.forEach(meetup => {
        activeUserIds.add(meetup.createdBy);
        meetup.attendees.forEach(attendee => activeUserIds.add(attendee.userId));
    });

    const activeUsersEl = document.querySelector('.stat-card:nth-child(2) h3');
    if (activeUsersEl) {
        activeUsersEl.textContent = activeUserIds.size;
    }

    // Total Meetups
    const meetupsEl = document.querySelector('.stat-card:nth-child(3) h3');
    if (meetupsEl) {
        meetupsEl.textContent = meetups.length;
    }

    // Average Rating (placeholder - you can add rating system later)
    const ratingEl = document.querySelector('.stat-card:nth-child(4) h3');
    if (ratingEl) {
        ratingEl.textContent = '4.8';
    }
}

// Update most active users section
function updateMostActiveUsers(users, meetups) {
    // Count meetups per user
    const userMeetupCounts = {};

    meetups.forEach(meetup => {
        // Count as creator
        if (!userMeetupCounts[meetup.createdBy]) {
            userMeetupCounts[meetup.createdBy] = 0;
        }
        userMeetupCounts[meetup.createdBy]++;

        // Count as attendee
        meetup.attendees.forEach(attendee => {
            if (attendee.userId !== meetup.createdBy) {
                if (!userMeetupCounts[attendee.userId]) {
                    userMeetupCounts[attendee.userId] = 0;
                }
                userMeetupCounts[attendee.userId]++;
            }
        });
    });

    // Get top 8 most active users
    const sortedUsers = users
        .map(user => ({
            ...user,
            meetupCount: userMeetupCounts[user.id] || 0
        }))
        .filter(user => user.meetupCount > 0)
        .sort((a, b) => b.meetupCount - a.meetupCount)
        .slice(0, 8);

    // Render active users
    const activeUsersGrid = document.querySelector('.active-users-grid');
    if (activeUsersGrid && sortedUsers.length > 0) {
        activeUsersGrid.innerHTML = sortedUsers.map((user, index) => {
            const initials = getInitials(user.name);
            const gradient = getGradientForName(user.name);

            return `
                <div class="active-user-card">
                    <div class="user-rank">#${index + 1}</div>
                    <div class="user-avatar" style="background: ${gradient};">
                        <span style="color: white; font-size: 28px; font-weight: 700;">${initials}</span>
                    </div>
                    <h4>${user.name}</h4>
                    <p>${user.major || 'UBC Student'}</p>
                    <div class="user-meetups">${user.meetupCount} meetup${user.meetupCount !== 1 ? 's' : ''}</div>
                </div>
            `;
        }).join('');
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
        'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
        'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
        'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
        'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)'
    ];
    return gradients[name.charCodeAt(0) % gradients.length];
}

// Update peak times section
function updatePeakTimes(meetups) {
    // Define time slots
    const timeSlots = {
        '11:00 AM - 12:00 PM': { start: 11, end: 12, count: 0 },
        '12:00 PM - 1:00 PM': { start: 12, end: 13, count: 0 },
        '1:00 PM - 2:00 PM': { start: 13, end: 14, count: 0 },
        '5:00 PM - 6:00 PM': { start: 17, end: 18, count: 0 },
        '6:00 PM - 7:00 PM': { start: 18, end: 19, count: 0 },
        '7:00 PM - 8:00 PM': { start: 19, end: 20, count: 0 }
    };

    // Count meetups in each time slot
    meetups.forEach(meetup => {
        if (meetup.time) {
            // Parse time (format: "HH:MM" or "HH:MM AM/PM")
            const timeParts = meetup.time.match(/(\d+):(\d+)\s*(AM|PM)?/i);
            if (timeParts) {
                let hour = parseInt(timeParts[1]);
                const meridiem = timeParts[3];

                // Convert to 24-hour format
                if (meridiem) {
                    if (meridiem.toUpperCase() === 'PM' && hour !== 12) {
                        hour += 12;
                    } else if (meridiem.toUpperCase() === 'AM' && hour === 12) {
                        hour = 0;
                    }
                }

                // Find matching time slot
                Object.keys(timeSlots).forEach(slotName => {
                    const slot = timeSlots[slotName];
                    if (hour >= slot.start && hour < slot.end) {
                        slot.count++;
                    }
                });
            }
        }
    });

    // Sort slots by count
    const sortedSlots = Object.entries(timeSlots)
        .map(([name, data]) => ({ name, count: data.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 4); // Top 4 time slots

    // Calculate max count for scaling bars
    const maxCount = sortedSlots.length > 0 ? sortedSlots[0].count : 1;

    // Render time chart
    const timeChart = document.querySelector('.time-chart');
    if (timeChart && sortedSlots.length > 0) {
        timeChart.innerHTML = sortedSlots.map(slot => {
            const percentage = maxCount > 0 ? (slot.count / maxCount * 100) : 0;
            return `
                <div class="time-bar">
                    <div class="time-label">${slot.name}</div>
                    <div class="bar-container">
                        <div class="bar" style="width: ${percentage}%"></div>
                    </div>
                    <span class="time-count">${slot.count} meetup${slot.count !== 1 ? 's' : ''}</span>
                </div>
            `;
        }).join('');
    } else if (timeChart) {
        timeChart.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #666;">
                <p>No time data yet. Create meetups to see peak times!</p>
            </div>
        `;
    }
}

// Update demographics section
function updateDemographics(users) {
    // Count users by year
    const yearCounts = {
        'Year 1': 0,
        'Year 2': 0,
        'Year 3': 0,
        'Year 4+': 0,
        'Grad Students': 0
    };

    users.forEach(user => {
        if (user.year) {
            const year = parseInt(user.year);
            if (year === 1) {
                yearCounts['Year 1']++;
            } else if (year === 2) {
                yearCounts['Year 2']++;
            } else if (year === 3) {
                yearCounts['Year 3']++;
            } else if (year === 4) {
                yearCounts['Year 4+']++;
            } else if (year >= 5) {
                yearCounts['Grad Students']++;
            }
        }
    });

    const totalUsers = users.length;

    // Render demographics
    const demographicsGrid = document.querySelector('.demographics-grid');
    if (demographicsGrid && totalUsers > 0) {
        demographicsGrid.innerHTML = Object.entries(yearCounts).map(([label, count]) => {
            const percentage = Math.round((count / totalUsers) * 100);
            return `
                <div class="demo-item">
                    <div class="demo-label">${label}</div>
                    <div class="demo-bar" style="width: ${percentage}%">${percentage}%</div>
                </div>
            `;
        }).join('');
    } else if (demographicsGrid) {
        demographicsGrid.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #666;">
                <p>No demographic data yet.</p>
            </div>
        `;
    }
}

// Update popular restaurants section
function updatePopularRestaurants(meetups) {
    // Count meetups per restaurant
    const restaurantCounts = {};

    meetups.forEach(meetup => {
        if (meetup.restaurantName) {
            if (!restaurantCounts[meetup.restaurantName]) {
                restaurantCounts[meetup.restaurantName] = {
                    name: meetup.restaurantName,
                    location: meetup.restaurantAddress || 'UBC Campus',
                    count: 0
                };
            }
            restaurantCounts[meetup.restaurantName].count++;
        }
    });

    // Sort by count and get top 5
    const topRestaurants = Object.values(restaurantCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    // Render restaurant list
    const restaurantsList = document.querySelector('.restaurants-list');
    if (restaurantsList && topRestaurants.length > 0) {
        restaurantsList.innerHTML = topRestaurants.map((restaurant, index) => {
            // Determine price range based on restaurant name (simple heuristic)
            let priceRange = '$$';
            if (restaurant.name.toLowerCase().includes('pizza') ||
                restaurant.name.toLowerCase().includes("triple o's") ||
                restaurant.name.toLowerCase().includes('fatih')) {
                priceRange = '$';
            } else if (restaurant.name.toLowerCase().includes('mahoney') ||
                       restaurant.name.toLowerCase().includes('hot pot')) {
                priceRange = '$$';
            }

            return `
                <div class="restaurant-item hover-lift">
                    <div class="rank">${index + 1}</div>
                    <div class="restaurant-info">
                        <h4>${restaurant.name}</h4>
                        <p>${restaurant.location} • ${priceRange}</p>
                    </div>
                    <div class="restaurant-stats">
                        <span class="stat-value">${restaurant.count} meetup${restaurant.count !== 1 ? 's' : ''}</span>
                    </div>
                </div>
            `;
        }).join('');
    } else if (restaurantsList) {
        // Show placeholder if no data
        restaurantsList.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #666;">
                <p>No restaurant data yet. Create meetups to see popular spots!</p>
            </div>
        `;
    }
}

// Initialize
init();
