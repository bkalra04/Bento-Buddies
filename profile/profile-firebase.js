// Import Firebase modules
import { auth, db, storage, onAuthStateChanged, signOut, doc, getDoc, updateDoc, ref, uploadBytes, getDownloadURL, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from '../firebase-config.js';
import { getUserRatings } from '../src/services/rating.service.js';

let profileData = {};
let isEditing = false;
let selectedFoods = [];
let currentUser = null;

// Check authentication and load profile
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../index/index.html';
        return;
    }

    currentUser = user;

    // Setup event listeners first (they don't depend on data)
    setupEventListeners();

    // Then load and display user profile data
    await loadUserProfile(user.uid);
});

// Load user profile from Firestore
async function loadUserProfile(uid) {
    try {
        console.log('Loading profile for user:', uid);
        const userDoc = await getDoc(doc(db, 'users', uid));
        console.log('User document exists:', userDoc.exists());

        if (userDoc.exists()) {
            profileData = userDoc.data();
            console.log('Profile data loaded:', profileData);
            selectedFoods = [...(profileData.favoriteFoods || [])];

            // NOW load the data into the UI (only after we have it!)
            loadProfileData();

            // Load ratings
            loadRatings(uid);
        } else {
            // No profile found - show message
            console.error('No profile found in Firestore for user:', uid);
            document.getElementById('nameDisplay').textContent = 'Profile not found';
            document.getElementById('bioDisplay').textContent = 'No profile data available. Please contact support.';
        }
    } catch (error) {
        console.error('Error loading profile:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        document.getElementById('nameDisplay').textContent = 'Error loading profile';
        document.getElementById('bioDisplay').textContent = 'Please try refreshing the page';
    }
}

// Load profile data into UI
function loadProfileData() {
    document.getElementById('nameDisplay').textContent = profileData.name || '';
    document.getElementById('yearDisplay').textContent = profileData.year || '';
    document.getElementById('majorDisplay').textContent = profileData.major || '';
    document.getElementById('emailDisplay').textContent = profileData.email || '';
    document.getElementById('bioDisplay').textContent = profileData.bio || '';
    document.getElementById('funFactDisplay').textContent = profileData.funFact || '';
    document.getElementById('lastMealDisplay').textContent = profileData.lastMeal || '';

    // Load profile picture
    const img = document.getElementById('profileImg');
    const uploadOverlay = document.getElementById('uploadOverlay');

    if (profileData.profilePicture) {
        img.src = profileData.profilePicture;
        img.style.display = 'block';
        uploadOverlay.style.opacity = '0';
    } else {
        // Set default pink user icon
        img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjRkZCM0M2Ii8+CjxjaXJjbGUgY3g9IjEwMCIgY3k9Ijc1IiByPSIzNSIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTUwIDE3MEM1MCAxNDAgNzAgMTIwIDEwMCAxMjBDMTMwIDEyMCAxNTAgMTQwIDE1MCAxNzBMMTUwIDE4MEg1MFoiIGZpbGw9IndoaXRlIi8+Cjwvc3ZnPg==';
        img.style.display = 'block';
        uploadOverlay.style.opacity = '0';
    }

    // Load personality tags
    loadTags();

    // Load favorite foods (now using emojis)
    loadFavoriteFoods();
}

// Load personality tags
function loadTags() {
    const container = document.getElementById('tagsContainer');
    container.innerHTML = '';

    (profileData.personality || []).forEach(tag => {
        const tagElement = document.createElement('span');
        tagElement.className = 'tag';
        tagElement.textContent = tag;

        if (isEditing) {
            tagElement.classList.add('editable');
            tagElement.addEventListener('click', () => removeTag(tag));
        }

        container.appendChild(tagElement);
    });
}

// Load favorite foods (display emojis)
function loadFavoriteFoods() {
    const foodItems = document.querySelectorAll('.food-item');

    foodItems.forEach((item, index) => {
        const emojiSpan = item.querySelector('.food-emoji') || document.createElement('span');
        emojiSpan.className = 'food-emoji';

        if (profileData.favoriteFoods && profileData.favoriteFoods[index]) {
            emojiSpan.textContent = profileData.favoriteFoods[index];
            emojiSpan.style.fontSize = '48px';
            item.innerHTML = '';
            item.appendChild(emojiSpan);
            item.classList.remove('empty');
        } else {
            item.classList.add('empty');
        }
    });
}

// Setup event listeners
function setupEventListeners() {
    // Edit button
    document.getElementById('editBtn').addEventListener('click', toggleEdit);

    // Save button
    document.getElementById('saveBtn').addEventListener('click', saveProfile);

    // Cancel button
    document.getElementById('cancelBtn').addEventListener('click', cancelEdit);

    // Profile picture upload
    document.getElementById('profilePicture').addEventListener('click', () => {
        document.getElementById('fileInput').click();
    });

    document.getElementById('fileInput').addEventListener('change', handleFileUpload);

    // Add tag button
    document.getElementById('addTagBtn').addEventListener('click', () => {
        document.getElementById('tagModal').classList.add('active');
    });

    // Tag modal buttons
    document.getElementById('cancelTagBtn').addEventListener('click', () => {
        document.getElementById('tagModal').classList.remove('active');
        document.getElementById('newTagInput').value = '';
    });

    document.getElementById('confirmTagBtn').addEventListener('click', addTag);

    // Food items click - open emoji modal directly (even when not editing)
    document.querySelectorAll('.food-item').forEach(item => {
        item.addEventListener('click', () => {
            openFoodModal();
        });
    });

    // Food modal buttons
    document.getElementById('cancelFoodBtn').addEventListener('click', () => {
        document.getElementById('foodModal').classList.remove('active');
        selectedFoods = [...(profileData.favoriteFoods || [])];
    });

    document.getElementById('confirmFoodBtn').addEventListener('click', saveFoods);

    // Setup food emoji selection
    setupFoodEmojiSelection();

    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    const logoutModal = document.getElementById('logoutModal');
    const cancelLogoutBtn = document.getElementById('cancelLogoutBtn');
    const confirmLogoutBtn = document.getElementById('confirmLogoutBtn');

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            logoutModal.classList.add('active');
        });
    }

    if (cancelLogoutBtn) {
        cancelLogoutBtn.addEventListener('click', () => {
            logoutModal.classList.remove('active');
        });
    }

    if (confirmLogoutBtn) {
        confirmLogoutBtn.addEventListener('click', handleLogout);
    }

    // Close modal when clicking outside
    if (logoutModal) {
        logoutModal.addEventListener('click', (e) => {
            if (e.target === logoutModal) {
                logoutModal.classList.remove('active');
            }
        });
    }

    // Change Password Modal
    const changePasswordBtn = document.getElementById('changePasswordBtn');
    const changePasswordModal = document.getElementById('changePasswordModal');
    const cancelPasswordBtn = document.getElementById('cancelPasswordBtn');
    const confirmPasswordBtn = document.getElementById('confirmPasswordBtn');

    if (changePasswordBtn) {
        changePasswordBtn.addEventListener('click', () => {
            changePasswordModal.classList.add('active');
            // Clear previous inputs and messages
            document.getElementById('currentPassword').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmNewPassword').value = '';
            document.getElementById('passwordChangeError').style.display = 'none';
            document.getElementById('passwordChangeSuccess').style.display = 'none';
        });
    }

    if (cancelPasswordBtn) {
        cancelPasswordBtn.addEventListener('click', () => {
            changePasswordModal.classList.remove('active');
        });
    }

    if (confirmPasswordBtn) {
        confirmPasswordBtn.addEventListener('click', handlePasswordChange);
    }

    // Close password modal when clicking outside
    if (changePasswordModal) {
        changePasswordModal.addEventListener('click', (e) => {
            if (e.target === changePasswordModal) {
                changePasswordModal.classList.remove('active');
            }
        });
    }

    // Password toggle functionality for profile modals
    document.querySelectorAll('.password-toggle').forEach(toggle => {
        toggle.addEventListener('click', () => {
            const targetId = toggle.dataset.target;
            const input = document.getElementById(targetId);

            if (input.type === 'password') {
                input.type = 'text';
                toggle.textContent = '👁️‍🗨️';
            } else {
                input.type = 'password';
                toggle.textContent = '👁️';
            }
        });
    });
}

// Toggle edit mode
function toggleEdit() {
    isEditing = !isEditing;

    if (isEditing) {
        // Show edit mode
        document.getElementById('editBtn').textContent = 'Editing...';
        document.getElementById('editBtn').style.color = '#999';
        document.getElementById('actionButtons').style.display = 'flex';

        // Show inputs, hide displays
        showInput('name');
        showInput('year');
        showInput('major');
        showInput('bio');
        showInput('funFact');
        showInput('lastMeal');

        // Make tags editable
        loadTags();
        document.getElementById('addTagBtn').style.display = 'inline-block';

        // Make food items clickable (visual indication)
        document.querySelectorAll('.food-item').forEach(item => {
            item.style.cursor = 'pointer';
            item.style.border = '2px solid #FF93A9';
        });

    } else {
        // Exit edit mode without saving
        cancelEdit();
    }
}

// Show input field
function showInput(field) {
    const display = document.getElementById(`${field}Display`);
    const input = document.getElementById(`${field}Input`);

    if (display && input) {
        display.style.display = 'none';
        input.style.display = field === 'bio' ? 'block' : 'inline-block';
        input.value = display.textContent;

        // Add placeholder for bio if it's empty
        if (field === 'bio' && !input.value.trim()) {
            input.placeholder = 'Add bio here';
        }
    }
}

// Hide input field
function hideInput(field) {
    const display = document.getElementById(`${field}Display`);
    const input = document.getElementById(`${field}Input`);

    if (display && input) {
        display.style.display = 'inline';
        input.style.display = 'none';
    }
}

// Save profile to Firebase
async function saveProfile() {
    try {
        // Get all input values
        const updatedData = {
            name: document.getElementById('nameInput').value,
            year: document.getElementById('yearInput').value,
            major: document.getElementById('majorInput').value,
            bio: document.getElementById('bioInput').value,
            funFact: document.getElementById('funFactInput').value,
            lastMeal: document.getElementById('lastMealInput').value,
            personality: profileData.personality,
            favoriteFoods: profileData.favoriteFoods
        };

        // Update Firestore
        await updateDoc(doc(db, 'users', currentUser.uid), updatedData);

        // Update local profile data
        Object.assign(profileData, updatedData);

        // Exit edit mode
        isEditing = false;
        document.getElementById('editBtn').textContent = 'Edit';
        document.getElementById('editBtn').style.color = '#FF93A9';
        document.getElementById('actionButtons').style.display = 'none';
        document.getElementById('addTagBtn').style.display = 'none';

        // Hide inputs, show displays
        hideInput('name');
        hideInput('year');
        hideInput('major');
        hideInput('bio');
        hideInput('funFact');
        hideInput('lastMeal');

        // Update displays
        loadProfileData();

        // Reset food items styling
        document.querySelectorAll('.food-item').forEach(item => {
            item.style.border = 'none';
        });

        console.log('Profile saved successfully!');
    } catch (error) {
        console.error('Error saving profile:', error);
        alert('Error saving profile. Please try again.');
    }
}

// Cancel edit
function cancelEdit() {
    isEditing = false;
    document.getElementById('editBtn').textContent = 'Edit';
    document.getElementById('editBtn').style.color = '#FF93A9';
    document.getElementById('actionButtons').style.display = 'none';
    document.getElementById('addTagBtn').style.display = 'none';

    // Hide inputs, show displays
    hideInput('name');
    hideInput('year');
    hideInput('major');
    hideInput('bio');
    hideInput('funFact');
    hideInput('lastMeal');

    // Reload original data
    loadProfileData();

    // Reset food items styling
    document.querySelectorAll('.food-item').forEach(item => {
        item.style.border = 'none';
    });
}

// Handle profile picture upload to Firebase Storage
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file && currentUser) {
        try {
            // Upload to Firebase Storage
            const storageRef = ref(storage, `profilePictures/${currentUser.uid}`);
            await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(storageRef);

            // Update Firestore
            await updateDoc(doc(db, 'users', currentUser.uid), {
                profilePicture: downloadURL
            });

            // Update UI
            profileData.profilePicture = downloadURL;
            const img = document.getElementById('profileImg');
            img.src = downloadURL;
            img.style.display = 'block';
            document.getElementById('uploadOverlay').style.opacity = '0';

            console.log('Profile picture uploaded successfully!');
        } catch (error) {
            console.error('Error uploading profile picture:', error);
            alert('Error uploading image. Please try again.');
        }
    }
}

// Add personality tag
function addTag() {
    const newTag = document.getElementById('newTagInput').value.trim();

    if (newTag && !(profileData.personality || []).includes(newTag)) {
        profileData.personality = [...(profileData.personality || []), newTag];
        loadTags();
        document.getElementById('tagModal').classList.remove('active');
        document.getElementById('newTagInput').value = '';
    }
}

// Remove personality tag
function removeTag(tag) {
    if (isEditing) {
        profileData.personality = (profileData.personality || []).filter(t => t !== tag);
        loadTags();
    }
}

// Open food selection modal
function openFoodModal() {
    const modal = document.getElementById('foodModal');
    modal.classList.add('active');

    // Reset selected foods to current profile foods
    selectedFoods = [...(profileData.favoriteFoods || [])];

    // Update visual selection in modal
    const foodEmojiItems = document.querySelectorAll('#profileFoodEmojiGrid .food-emoji-item');
    foodEmojiItems.forEach(item => {
        const emoji = item.dataset.emoji;
        if (selectedFoods.includes(emoji)) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });

    updateFoodCount();
}

// Handle food emoji selection in profile modal
function setupFoodEmojiSelection() {
    const foodEmojiGrid = document.getElementById('profileFoodEmojiGrid');
    if (!foodEmojiGrid) return;

    foodEmojiGrid.addEventListener('click', (e) => {
        const item = e.target.closest('.food-emoji-item');
        if (!item) return;

        const emoji = item.dataset.emoji;

        if (item.classList.contains('selected')) {
            // Deselect
            item.classList.remove('selected');
            selectedFoods = selectedFoods.filter(f => f !== emoji);
        } else if (selectedFoods.length < 3) {
            // Select (max 3)
            item.classList.add('selected');
            selectedFoods.push(emoji);
        }

        updateFoodCount();
    });
}

// Update food selection count
function updateFoodCount() {
    const countElement = document.getElementById('profileFoodSelectedCount');
    if (countElement) {
        countElement.textContent = `${selectedFoods.length} / 3 selected`;
    }
}

// Save selected foods
async function saveFoods() {
    profileData.favoriteFoods = [...selectedFoods];

    // Update Firebase immediately
    try {
        await updateDoc(doc(db, 'users', currentUser.uid), {
            favoriteFoods: profileData.favoriteFoods
        });
        console.log('Favorite foods saved to Firebase');
    } catch (error) {
        console.error('Error saving favorite foods:', error);
    }

    loadFavoriteFoods();
    document.getElementById('foodModal').classList.remove('active');
}

// Handle logout
async function handleLogout() {
    try {
        await signOut(auth);
        window.location.href = '../index/index.html';
    } catch (error) {
        console.error('Error signing out:', error);
    }
}

// Handle password change
async function handlePasswordChange() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmNewPassword = document.getElementById('confirmNewPassword').value;
    const errorDiv = document.getElementById('passwordChangeError');
    const successDiv = document.getElementById('passwordChangeSuccess');

    // Hide previous messages
    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';

    // Validation
    if (!currentPassword || !newPassword || !confirmNewPassword) {
        errorDiv.textContent = 'Please fill in all fields';
        errorDiv.style.display = 'block';
        return;
    }

    if (newPassword.length < 8) {
        errorDiv.textContent = 'New password must be at least 8 characters';
        errorDiv.style.display = 'block';
        return;
    }

    if (newPassword !== confirmNewPassword) {
        errorDiv.textContent = 'New passwords do not match';
        errorDiv.style.display = 'block';
        return;
    }

    try {
        // Disable button during processing
        const confirmBtn = document.getElementById('confirmPasswordBtn');
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Updating...';

        // Re-authenticate user with current password
        const credential = EmailAuthProvider.credential(
            currentUser.email,
            currentPassword
        );
        await reauthenticateWithCredential(currentUser, credential);

        // Update password
        await updatePassword(currentUser, newPassword);

        // Show success message
        successDiv.textContent = 'Password updated successfully!';
        successDiv.style.display = 'block';

        // Clear inputs
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmNewPassword').value = '';

        // Close modal after 2 seconds
        setTimeout(() => {
            document.getElementById('changePasswordModal').classList.remove('active');
            successDiv.style.display = 'none';
        }, 2000);

    } catch (error) {
        console.error('Error changing password:', error);

        let errorMessage = 'Failed to change password';
        if (error.code === 'auth/wrong-password') {
            errorMessage = 'Current password is incorrect';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'New password is too weak';
        } else if (error.code === 'auth/requires-recent-login') {
            errorMessage = 'Please log out and log back in before changing your password';
        }

        errorDiv.textContent = errorMessage;
        errorDiv.style.display = 'block';
    } finally {
        // Re-enable button
        const confirmBtn = document.getElementById('confirmPasswordBtn');
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Update Password';
    }
}

/* ========================================
   CALENDAR FUNCTIONALITY
   ======================================== */

let currentDate = new Date();
const meetupDates = [30, 2, 5]; // Days with meetups (for demo)

function renderCalendar() {
    const calendarDays = document.getElementById('calendarDays');
    const currentMonth = document.getElementById('currentMonth');

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // Set month name
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    currentMonth.textContent = `${monthNames[month]} ${year}`;

    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    // Clear existing days
    calendarDays.innerHTML = '';

    // Add previous month's days
    for (let i = firstDay - 1; i >= 0; i--) {
        const day = document.createElement('div');
        day.className = 'calendar-day other-month';
        day.textContent = daysInPrevMonth - i;
        calendarDays.appendChild(day);
    }

    // Add current month's days
    const today = new Date();
    for (let i = 1; i <= daysInMonth; i++) {
        const day = document.createElement('div');
        day.className = 'calendar-day';
        day.textContent = i;

        // Highlight today
        if (year === today.getFullYear() && 
            month === today.getMonth() && 
            i === today.getDate()) {
            day.classList.add('today');
        }

        // Add meetup indicator
        if (meetupDates.includes(i)) {
            day.classList.add('has-meetup');
        }

        calendarDays.appendChild(day);
    }

    // Add next month's days to fill the grid
    const totalCells = calendarDays.children.length;
    const remainingCells = 42 - totalCells; // 6 weeks * 7 days
    for (let i = 1; i <= remainingCells; i++) {
        const day = document.createElement('div');
        day.className = 'calendar-day other-month';
        day.textContent = i;
        calendarDays.appendChild(day);
    }
}

// Calendar navigation
document.getElementById('prevMonth')?.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
});

document.getElementById('nextMonth')?.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
});

// Initialize calendar on page load
if (document.getElementById('calendarDays')) {
    renderCalendar();
}

// Load user ratings
async function loadRatings(userId) {
    try {
        const result = await getUserRatings(userId);

        if (!result.success) {
            console.error('Failed to load ratings:', result.error);
            return;
        }

        const ratings = result.data;

        // Update average rating display
        const averageRating = profileData.averageRating || 0;
        const totalRatings = profileData.totalRatings || 0;

        document.getElementById('ratingValue').textContent = averageRating > 0 ? averageRating.toFixed(1) : '--';
        document.getElementById('ratingCount').textContent = `(${totalRatings} rating${totalRatings !== 1 ? 's' : ''})`;

        // Display recent reviews
        const recentReviews = document.getElementById('recentReviews');
        recentReviews.innerHTML = '';

        if (ratings.length === 0) {
            recentReviews.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No reviews yet</p>';
            return;
        }

        // Show up to 5 most recent reviews with text
        const reviewsWithText = ratings.filter(r => r.review && r.review.trim() !== '');
        const displayReviews = reviewsWithText.slice(0, 5);

        if (displayReviews.length === 0) {
            recentReviews.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No written reviews yet</p>';
            return;
        }

        displayReviews.forEach(rating => {
            const stars = '★'.repeat(rating.rating) + '☆'.repeat(5 - rating.rating);
            const date = rating.timestamp ? new Date(rating.timestamp.toDate()).toLocaleDateString() : '';

            const reviewDiv = document.createElement('div');
            reviewDiv.style.cssText = 'padding: 15px; background: #f8f8f8; border-radius: 12px; margin-bottom: 12px;';
            reviewDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        ${rating.fromUserPicture
                            ? `<img src="${rating.fromUserPicture}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">`
                            : '<div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: 14px; font-weight: 600;">?</div>'
                        }
                        <strong>${rating.fromUserName}</strong>
                    </div>
                    <span style="color: #FFD700; font-size: 14px;">${stars}</span>
                </div>
                <p style="margin: 0; color: #666; font-size: 14px;">"${rating.review}"</p>
                <p style="margin: 8px 0 0 0; color: #999; font-size: 12px;">From ${rating.meetupName} • ${date}</p>
            `;

            recentReviews.appendChild(reviewDiv);
        });
    } catch (error) {
        console.error('Error loading ratings:', error);
    }
}
