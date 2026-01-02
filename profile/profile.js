// Load profile data from localStorage or use defaults
let profileData = JSON.parse(localStorage.getItem('userProfile')) || {
    name: 'Emily Tate',
    username: '@eemily.tate',
    year: 3,
    major: 'Psychology',
    bio: "Hi I'm Emily! I love grabbing a cookie and an iced matcha latte from Blue Chip between my classes! Never miss a day of sweet treats!!!!!!",
    personality: ['Hungry', 'Easygoing', 'Kind'],
    funFact: 'Have never tried bubble tea',
    lastMeal: 'Carbonara',
    favoriteFoods: ['ramen', 'rice', 'taco'],
    profilePicture: null,
    dietaryPreferences: [] // vegetarian, vegan, halal, kosher, gluten-free, dairy-free, nut-allergy, pescatarian
};

let isEditing = false;
let selectedFoods = [...profileData.favoriteFoods];

// Initialize page
function initProfile() {
    loadProfileData();
    setupEventListeners();
}

// Load profile data into UI
function loadProfileData() {
    document.getElementById('nameDisplay').textContent = profileData.name;
    document.getElementById('usernameDisplay').textContent = profileData.username;
    document.getElementById('yearDisplay').textContent = profileData.year;
    document.getElementById('majorDisplay').textContent = profileData.major;
    document.getElementById('bioDisplay').textContent = profileData.bio;
    document.getElementById('funFactDisplay').textContent = profileData.funFact;
    document.getElementById('lastMealDisplay').textContent = profileData.lastMeal;
    
    // Load profile picture
    if (profileData.profilePicture) {
        const img = document.getElementById('profileImg');
        img.src = profileData.profilePicture;
        img.style.display = 'block';
        document.getElementById('uploadOverlay').style.opacity = '0';
    }
    
    // Load personality tags
    loadTags();

    // Load dietary preferences
    loadDietaryPreferences();

    // Load favorite foods
    loadFavoriteFoods();
}

// Load personality tags
function loadTags() {
    const container = document.getElementById('tagsContainer');
    container.innerHTML = '';

    profileData.personality.forEach(tag => {
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

// Load dietary preferences
function loadDietaryPreferences() {
    const dietaryTags = document.getElementById('dietaryTags');
    const dietaryOptions = document.getElementById('dietaryOptions');

    // Ensure dietary preferences exist
    if (!profileData.dietaryPreferences) {
        profileData.dietaryPreferences = [];
    }

    // Map dietary values to display text with emojis
    const dietaryLabels = {
        'vegetarian': '🥗 Vegetarian',
        'vegan': '🌱 Vegan',
        'halal': '☪️ Halal',
        'kosher': '✡️ Kosher',
        'gluten-free': '🌾 Gluten-Free',
        'dairy-free': '🥛 Dairy-Free',
        'nut-allergy': '🥜 Nut Allergy',
        'pescatarian': '🐟 Pescatarian'
    };

    // Display dietary tags
    dietaryTags.innerHTML = '';
    if (profileData.dietaryPreferences.length > 0) {
        profileData.dietaryPreferences.forEach(pref => {
            const tag = document.createElement('span');
            tag.className = 'dietary-tag';
            tag.textContent = dietaryLabels[pref] || pref;
            dietaryTags.appendChild(tag);
        });
    } else {
        dietaryTags.innerHTML = '<span style="color: #999; font-size: 16px;">No dietary preferences set</span>';
    }

    // Update checkboxes when in edit mode
    if (isEditing) {
        const checkboxes = dietaryOptions.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = profileData.dietaryPreferences.includes(checkbox.value);
        });
    }
}

// Load favorite foods
function loadFavoriteFoods() {
    const foodItems = document.querySelectorAll('.food-item');
    
    foodItems.forEach((item, index) => {
        const img = item.querySelector('img');
        if (profileData.favoriteFoods[index]) {
            img.src = `${profileData.favoriteFoods[index]}.png`;
            item.classList.remove('empty');
        } else {
            img.style.display = 'none';
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
    
    // Food items click
    document.querySelectorAll('.food-item').forEach(item => {
        item.addEventListener('click', () => {
            if (isEditing) {
                openFoodModal();
            }
        });
    });
    
    // Food modal buttons
    document.getElementById('cancelFoodBtn').addEventListener('click', () => {
        document.getElementById('foodModal').classList.remove('active');
        selectedFoods = [...profileData.favoriteFoods];
    });
    
    document.getElementById('confirmFoodBtn').addEventListener('click', saveFoods);
    
    // Food selection
    document.querySelectorAll('.food-option').forEach(option => {
        option.addEventListener('click', () => toggleFoodSelection(option));
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
        showInput('username');
        showInput('year');
        showInput('major');
        showInput('bio');
        showInput('funFact');
        showInput('lastMeal');
        
        // Make tags editable
        loadTags();
        document.getElementById('addTagBtn').style.display = 'inline-block';

        // Show dietary options for editing
        document.getElementById('dietaryOptions').style.display = 'grid';
        loadDietaryPreferences();

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

// Save profile
function saveProfile() {
    // Get all input values
    profileData.name = document.getElementById('nameInput').value;
    profileData.username = document.getElementById('usernameInput').value;
    profileData.year = parseInt(document.getElementById('yearInput').value);
    profileData.major = document.getElementById('majorInput').value;
    profileData.bio = document.getElementById('bioInput').value;
    profileData.funFact = document.getElementById('funFactInput').value;
    profileData.lastMeal = document.getElementById('lastMealInput').value;

    // Save dietary preferences
    const checkedDietary = [];
    document.querySelectorAll('#dietaryOptions input[type="checkbox"]:checked').forEach(checkbox => {
        checkedDietary.push(checkbox.value);
    });
    profileData.dietaryPreferences = checkedDietary;

    // Save to localStorage
    localStorage.setItem('userProfile', JSON.stringify(profileData));
    
    // Exit edit mode
    isEditing = false;
    document.getElementById('editBtn').textContent = 'Edit';
    document.getElementById('editBtn').style.color = '#FF93A9';
    document.getElementById('actionButtons').style.display = 'none';
    document.getElementById('addTagBtn').style.display = 'none';
    document.getElementById('dietaryOptions').style.display = 'none';
    
    // Hide inputs, show displays
    hideInput('name');
    hideInput('username');
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
}

// Cancel edit
function cancelEdit() {
    isEditing = false;
    document.getElementById('editBtn').textContent = 'Edit';
    document.getElementById('editBtn').style.color = '#FF93A9';
    document.getElementById('actionButtons').style.display = 'none';
    document.getElementById('addTagBtn').style.display = 'none';
    document.getElementById('dietaryOptions').style.display = 'none';
    
    // Hide inputs, show displays
    hideInput('name');
    hideInput('username');
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

// Handle profile picture upload
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            profileData.profilePicture = e.target.result;
            const img = document.getElementById('profileImg');
            img.src = e.target.result;
            img.style.display = 'block';
            
            // Save to localStorage
            localStorage.setItem('userProfile', JSON.stringify(profileData));
        };
        reader.readAsDataURL(file);
    }
}

// Add personality tag
function addTag() {
    const newTag = document.getElementById('newTagInput').value.trim();
    
    if (newTag && !profileData.personality.includes(newTag)) {
        profileData.personality.push(newTag);
        loadTags();
        document.getElementById('tagModal').classList.remove('active');
        document.getElementById('newTagInput').value = '';
    }
}

// Remove personality tag
function removeTag(tag) {
    if (isEditing) {
        profileData.personality = profileData.personality.filter(t => t !== tag);
        loadTags();
    }
}

// Open food selection modal
function openFoodModal() {
    document.getElementById('foodModal').classList.add('active');
    selectedFoods = [...profileData.favoriteFoods];
    
    // Update visual selection
    document.querySelectorAll('.food-option').forEach(option => {
        const food = option.dataset.food;
        if (selectedFoods.includes(food)) {
            option.classList.add('selected');
        } else {
            option.classList.remove('selected');
        }
    });
}

// Toggle food selection
function toggleFoodSelection(option) {
    const food = option.dataset.food;
    
    if (selectedFoods.includes(food)) {
        // Remove food
        selectedFoods = selectedFoods.filter(f => f !== food);
        option.classList.remove('selected');
    } else if (selectedFoods.length < 3) {
        // Add food (max 3)
        selectedFoods.push(food);
        option.classList.add('selected');
    }
}

// Save selected foods
function saveFoods() {
    profileData.favoriteFoods = [...selectedFoods];
    loadFavoriteFoods();
    document.getElementById('foodModal').classList.remove('active');
}

// Initialize on page load
initProfile();