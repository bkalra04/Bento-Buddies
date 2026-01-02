// Import Firebase modules
import { auth, db, storage, googleProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, onAuthStateChanged, sendPasswordResetEmail, doc, setDoc, getDoc, ref, uploadBytes, getDownloadURL } from '../firebase-config.js';
import { collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// DOM Elements
const loginBtn = document.getElementById('loginBtn');
const signupBtnHero = document.getElementById('signupBtnHero');
const loginModal = document.getElementById('loginModal');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const googleSignInBtn = document.getElementById('googleSignInBtn');
const signupLink = document.getElementById('signupLink');
const signupModal = document.getElementById('signupModal');
const signupClose = document.getElementById('signupClose');
const signupError = document.getElementById('signupError');
const nextBtn = document.getElementById('nextBtn');
const backBtn = document.getElementById('backBtn');
const submitBtn = document.getElementById('submitBtn');

// Signup form data
let currentStep = 1;
let isCreatingAccount = false; // Flag to prevent redirect during signup
let signupData = {
    email: '',
    username: '',
    password: '',
    firstName: '',
    lastName: '',
    year: '',
    major: '',
    bio: '',
    personality: [],
    funFact: '',
    lastMeal: '',
    favoriteFoods: [],
    profilePicture: null
};

// Check if user is already logged in
onAuthStateChanged(auth, async (user) => {
    if (user && !isCreatingAccount) {
        // User is signed in, redirect to home (but not during signup)
        window.location.href = '../home/home.html';
    }
});

// Login Modal Controls
loginBtn.addEventListener('click', () => {
    loginModal.classList.add('active');
    document.body.style.overflow = 'hidden';
});

loginModal.addEventListener('click', (e) => {
    if (e.target === loginModal) {
        loginModal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
});

// Handle Email/Password Login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        console.log('Logged in successfully:', userCredential.user);
        // Redirect happens automatically via onAuthStateChanged
    } catch (error) {
        console.error('Login error:', error);
        showError(loginError, getErrorMessage(error.code));
    }
});

// Handle Google Sign-In
googleSignInBtn.addEventListener('click', async () => {
    try {
        console.log('Starting Google Sign-In...');
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        console.log('Google Sign-In successful:', user.email);

        // Check if user profile exists in Firestore
        console.log('Checking if profile exists in Firestore...');
        const userDoc = await getDoc(doc(db, 'users', user.uid));

        if (!userDoc.exists()) {
            console.log('Creating new profile for Google user...');
            // New Google user - create basic profile
            const nameParts = user.displayName?.split(' ') || ['', ''];
            const userData = {
                email: user.email,
                firstName: nameParts[0] || '',
                lastName: nameParts.slice(1).join(' ') || '',
                name: user.displayName || '',
                username: user.email?.split('@')[0] || 'user',
                profilePicture: user.photoURL || null,
                year: '',
                major: '',
                bio: '',
                personality: [],
                funFact: '',
                lastMeal: '',
                favoriteFoods: [],
                createdAt: new Date().toISOString()
            };
            console.log('Saving Google user profile:', userData);

            try {
                console.log('Attempting to save Google user to Firestore with UID:', user.uid);
                await setDoc(doc(db, 'users', user.uid), userData);
                console.log('✓ Google user profile saved successfully!');
            } catch (firestoreError) {
                console.error('❌ FIRESTORE SAVE FAILED FOR GOOGLE USER!');
                console.error('Firestore error:', firestoreError);
                console.error('Error code:', firestoreError.code);
                console.error('Error message:', firestoreError.message);

                if (firestoreError.code === 'permission-denied') {
                    alert('⚠️ FIRESTORE PERMISSION DENIED!\n\nYou need to update your Firestore Security Rules.\n\nSee browser console for instructions.');
                    console.error('========================================');
                    console.error('FIRESTORE RULES NEEDED - Copy and paste into Firebase Console:');
                    console.error('rules_version = \'2\';');
                    console.error('service cloud.firestore {');
                    console.error('  match /databases/{database}/documents {');
                    console.error('    match /users/{userId} {');
                    console.error('      allow read: if request.auth != null;');
                    console.error('      allow write: if request.auth != null && request.auth.uid == userId;');
                    console.error('    }');
                    console.error('  }');
                    console.error('}');
                    console.error('========================================');
                }
                throw firestoreError;
            }
        } else {
            console.log('Existing user profile found, logging in...');
        }

        // Redirect happens automatically via onAuthStateChanged
    } catch (error) {
        console.error('Google sign-in error:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);

        // Show more specific error message
        let errorMessage = getErrorMessage(error.code);
        if (error.code === 'auth/popup-closed-by-user') {
            errorMessage = 'Sign-in cancelled. Please try again.';
        } else if (error.code === 'auth/popup-blocked') {
            errorMessage = 'Pop-up blocked. Please allow pop-ups for this site.';
        } else if (error.code === 'auth/unauthorized-domain') {
            errorMessage = 'This domain is not authorized for Google Sign-In. Please contact support.';
        }

        showError(loginError, errorMessage);
    }
});

// Signup Modal Controls
signupLink.addEventListener('click', (e) => {
    e.preventDefault();
    loginModal.classList.remove('active');
    signupModal.classList.add('active');
    resetSignupForm();
});

// Hero Sign Up button
signupBtnHero.addEventListener('click', () => {
    signupModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    resetSignupForm();
});

signupClose.addEventListener('click', () => {
    signupModal.classList.remove('active');
    document.body.style.overflow = 'auto';
});

// Removed click outside to close - user must click X button to close signup modal

// Step Navigation
nextBtn.addEventListener('click', () => {
    if (validateCurrentStep()) {
        saveCurrentStepData();
        currentStep++;
        showStep(currentStep);
    }
});

backBtn.addEventListener('click', () => {
    currentStep--;
    showStep(currentStep);
});

submitBtn.addEventListener('click', async () => {
    saveCurrentStepData();
    await createAccount();
});

// Handle Enter key to advance through signup steps
document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && signupModal.classList.contains('active')) {
        e.preventDefault();

        if (currentStep < 3) {
            // On steps 1 and 2, Enter advances to next step
            if (validateCurrentStep()) {
                nextBtn.click();
            }
        } else {
            // On step 3, Enter submits the form
            submitBtn.click();
        }
    }
});

function showStep(step) {
    // Hide all steps
    document.querySelectorAll('.signup-step').forEach(s => s.classList.remove('active'));

    // Show current step
    document.getElementById(`step${step}`).classList.add('active');

    // Update progress indicators
    document.querySelectorAll('.progress-step').forEach((s, index) => {
        s.classList.remove('active', 'completed');
        if (index + 1 < step) {
            s.classList.add('completed');
        } else if (index + 1 === step) {
            s.classList.add('active');
        }
    });

    // Update buttons
    backBtn.style.display = step === 1 ? 'none' : 'block';
    nextBtn.style.display = step === 3 ? 'none' : 'block';
    submitBtn.style.display = step === 3 ? 'block' : 'none';
}

function validateCurrentStep() {
    signupError.classList.remove('show');

    if (currentStep === 1) {
        const email = document.getElementById('signupEmail').value;
        const password = document.getElementById('signupPassword').value;
        const confirmPassword = document.getElementById('signupPasswordConfirm').value;

        if (!email || !password || !confirmPassword) {
            showError(signupError, 'Please fill in all fields');
            return false;
        }

        if (password.length < 8) {
            showError(signupError, 'Password must be at least 8 characters');
            return false;
        }

        if (password !== confirmPassword) {
            showError(signupError, 'Passwords do not match');
            return false;
        }
    }

    if (currentStep === 2) {
        const firstName = document.getElementById('signupFirstName').value;
        const lastName = document.getElementById('signupLastName').value;
        const year = document.getElementById('signupYear').value;
        const major = document.getElementById('signupMajor').value;

        if (!firstName || !lastName || !year || !major) {
            showError(signupError, 'Please fill in all required fields');
            return false;
        }
    }

    return true;
}

function saveCurrentStepData() {
    if (currentStep === 1) {
        signupData.email = document.getElementById('signupEmail').value;
        signupData.password = document.getElementById('signupPassword').value;
    }

    if (currentStep === 2) {
        signupData.firstName = document.getElementById('signupFirstName').value;
        signupData.lastName = document.getElementById('signupLastName').value;
        signupData.year = document.getElementById('signupYear').value;
        signupData.major = document.getElementById('signupMajor').value;
    }

    if (currentStep === 3) {
        signupData.bio = document.getElementById('signupBio').value;
        signupData.funFact = document.getElementById('signupFunFact').value;
        signupData.lastMeal = document.getElementById('signupLastMeal').value;
    }
}

// Check if username is available
async function isUsernameAvailable(username) {
    try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('username', '==', username));
        const querySnapshot = await getDocs(q);
        return querySnapshot.empty; // Returns true if no user has this username
    } catch (error) {
        console.error('Error checking username availability:', error);
        return false;
    }
}

// Generate username from first and last name
function generateUsername(firstName, lastName) {
    const username = `${firstName.toLowerCase()}.${lastName.toLowerCase()}`;
    return username;
}

async function createAccount() {
    try {
        isCreatingAccount = true; // Prevent onAuthStateChanged from redirecting
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating Account...';

        console.log('Starting account creation...');
        console.log('Signup data:', signupData);

        // Auto-generate username from name
        let finalUsername = generateUsername(signupData.firstName, signupData.lastName);
        console.log('Auto-generated username:', finalUsername);

        // Check if username is available and add number suffix if needed
        let isAvailable = await isUsernameAvailable(finalUsername);
        if (!isAvailable) {
            let counter = 1;
            let testUsername = finalUsername;
            while (!isAvailable && counter < 100) {
                testUsername = `${finalUsername}${counter}`;
                isAvailable = await isUsernameAvailable(testUsername);
                if (isAvailable) {
                    finalUsername = testUsername;
                }
                counter++;
            }
            console.log('Username was taken, using:', finalUsername);
        }

        // Create Firebase Auth user
        const userCredential = await createUserWithEmailAndPassword(auth, signupData.email, signupData.password);
        const user = userCredential.user;
        console.log('User created in Firebase Auth:', user.uid);

        // Upload profile picture if exists
        let profilePictureURL = null;
        if (signupData.profilePicture) {
            console.log('Uploading profile picture...');
            const storageRef = ref(storage, `profilePictures/${user.uid}`);
            await uploadBytes(storageRef, signupData.profilePicture);
            profilePictureURL = await getDownloadURL(storageRef);
            console.log('Profile picture uploaded:', profilePictureURL);
        }

        // Prepare user data
        const userData = {
            email: signupData.email,
            firstName: signupData.firstName,
            lastName: signupData.lastName,
            name: `${signupData.firstName} ${signupData.lastName}`,
            username: finalUsername,
            year: signupData.year,
            major: signupData.major,
            bio: signupData.bio || '',
            personality: signupData.personality || [],
            funFact: signupData.funFact || '',
            lastMeal: signupData.lastMeal || '',
            favoriteFoods: signupData.favoriteFoods || [],
            profilePicture: profilePictureURL,
            createdAt: new Date().toISOString()
        };

        console.log('Saving user profile to Firestore:', userData);

        // Create user profile in Firestore
        try {
            console.log('Attempting to save to Firestore with UID:', user.uid);
            await setDoc(doc(db, 'users', user.uid), userData);
            console.log('✓ User profile saved to Firestore successfully!');
        } catch (firestoreError) {
            console.error('❌ FIRESTORE SAVE FAILED!');
            console.error('Firestore error:', firestoreError);
            console.error('Error code:', firestoreError.code);
            console.error('Error message:', firestoreError.message);

            // This is likely a permissions error - show helpful message
            if (firestoreError.code === 'permission-denied') {
                alert('⚠️ FIRESTORE PERMISSION DENIED!\n\nYou need to update your Firestore Security Rules in Firebase Console.\n\nGo to: Firebase Console > Firestore Database > Rules\n\nAnd add the rules shown in the browser console.');
                console.error('========================================');
                console.error('FIRESTORE RULES NEEDED:');
                console.error('rules_version = \'2\';');
                console.error('service cloud.firestore {');
                console.error('  match /databases/{database}/documents {');
                console.error('    match /users/{userId} {');
                console.error('      allow read: if request.auth != null;');
                console.error('      allow write: if request.auth != null && request.auth.uid == userId;');
                console.error('    }');
                console.error('  }');
                console.error('}');
                console.error('========================================');
            }
            throw firestoreError; // Re-throw to be caught by outer catch
        }

        console.log('Account created successfully! Redirecting...');

        // Redirect to home page after successful account creation
        isCreatingAccount = false;
        window.location.href = '../home/home.html';

    } catch (error) {
        console.error('Signup error:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);

        // Reset flag on error
        isCreatingAccount = false;

        // Show user-friendly error message
        if (error.message && error.message.includes('permission')) {
            showError(signupError, 'Permission error. Please check the browser console for instructions.');
        } else if (error.message && error.message.includes('Username is already taken')) {
            showError(signupError, error.message);
        } else {
            showError(signupError, getErrorMessage(error.code));
        }

        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Account';
    }
}

function resetSignupForm() {
    currentStep = 1;
    showStep(1);
    signupData = {
        email: '',
        username: '',
        password: '',
        firstName: '',
        lastName: '',
        year: '',
        major: '',
        bio: '',
        personality: [],
        funFact: '',
        lastMeal: '',
        favoriteFoods: [],
        profilePicture: null
    };

    // Clear all inputs
    document.getElementById('signupEmail').value = '';
    document.getElementById('signupPassword').value = '';
    document.getElementById('signupPasswordConfirm').value = '';
    document.getElementById('signupFirstName').value = '';
    document.getElementById('signupLastName').value = '';
    document.getElementById('signupYear').value = '';
    document.getElementById('signupMajor').value = '';
    document.getElementById('signupBio').value = '';
    document.getElementById('signupFunFact').value = '';
    document.getElementById('signupLastMeal').value = '';
    document.getElementById('personalityTagsDisplay').innerHTML = '';
    document.querySelectorAll('.food-emoji-item').forEach(item => item.classList.remove('selected'));
    document.getElementById('foodSelectedCount').textContent = '0 / 3 selected';
    resetProfilePicPreview();
}

// Personality Tags
const personalityTagInput = document.getElementById('personalityTagInput');
const addPersonalityTag = document.getElementById('addPersonalityTag');
const personalityTagsDisplay = document.getElementById('personalityTagsDisplay');

addPersonalityTag.addEventListener('click', () => {
    const tag = personalityTagInput.value.trim();
    if (tag && signupData.personality.length < 5) {
        signupData.personality.push(tag);
        renderPersonalityTags();
        personalityTagInput.value = '';
    }
});

personalityTagInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        addPersonalityTag.click();
    }
});

function renderPersonalityTags() {
    personalityTagsDisplay.innerHTML = signupData.personality.map((tag, index) => `
        <div class="personality-tag">
            ${tag}
            <span class="remove-tag" data-index="${index}">×</span>
        </div>
    `).join('');

    // Add remove listeners
    document.querySelectorAll('.remove-tag').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.index);
            signupData.personality.splice(index, 1);
            renderPersonalityTags();
        });
    });
}

// Food Emoji Selection
const foodEmojiGrid = document.getElementById('foodEmojiGrid');
const foodSelectedCount = document.getElementById('foodSelectedCount');

foodEmojiGrid.addEventListener('click', (e) => {
    const item = e.target.closest('.food-emoji-item');
    if (!item) return;

    const emoji = item.dataset.emoji;

    if (item.classList.contains('selected')) {
        // Deselect
        item.classList.remove('selected');
        signupData.favoriteFoods = signupData.favoriteFoods.filter(f => f !== emoji);
    } else if (signupData.favoriteFoods.length < 3) {
        // Select
        item.classList.add('selected');
        signupData.favoriteFoods.push(emoji);
    }

    foodSelectedCount.textContent = `${signupData.favoriteFoods.length} / 3 selected`;
});

// Profile Picture Upload
const profilePicPreview = document.getElementById('profilePicPreview');
const profilePicInput = document.getElementById('profilePicInput');

profilePicPreview.addEventListener('click', () => {
    profilePicInput.click();
});

profilePicInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        signupData.profilePicture = file;

        // Preview image
        const reader = new FileReader();
        reader.onload = (event) => {
            profilePicPreview.innerHTML = `<img src="${event.target.result}" alt="Profile Preview">`;
        };
        reader.readAsDataURL(file);
    }
});

function resetProfilePicPreview() {
    profilePicPreview.innerHTML = `
        <div class="profile-pic-placeholder">
            <div class="icon">📷</div>
            <div class="text">Click to upload</div>
        </div>
    `;
}

// Helper Functions
function showError(element, message) {
    element.textContent = message;
    element.classList.add('show');
    setTimeout(() => {
        element.classList.remove('show');
    }, 5000);
}

function getErrorMessage(errorCode) {
    const errorMessages = {
        'auth/email-already-in-use': 'This email is already registered',
        'auth/invalid-email': 'Invalid email address',
        'auth/operation-not-allowed': 'Operation not allowed',
        'auth/weak-password': 'Password is too weak',
        'auth/user-disabled': 'This account has been disabled',
        'auth/user-not-found': 'No account found with this email',
        'auth/wrong-password': 'Incorrect password',
        'auth/invalid-credential': 'Invalid email or password',
        'auth/too-many-requests': 'Too many attempts. Please try again later',
        'auth/network-request-failed': 'Network error. Please check your connection'
    };

    return errorMessages[errorCode] || 'An error occurred. Please try again.';
}

// Password Visibility Toggle
document.querySelectorAll('.password-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
        const targetId = toggle.dataset.target;
        const input = document.getElementById(targetId);

        if (input.type === 'password') {
            input.type = 'text';
            toggle.textContent = '👁️‍🗨️'; // Eye with speech bubble (closed eye)
        } else {
            input.type = 'password';
            toggle.textContent = '👁️'; // Eye (open eye)
        }
    });
});

// Forgot Password Modal
const forgotPasswordLink = document.getElementById('forgotPasswordLink');
const forgotPasswordModal = document.getElementById('forgotPasswordModal');
const cancelResetBtn = document.getElementById('cancelResetBtn');
const sendResetBtn = document.getElementById('sendResetBtn');
const resetEmail = document.getElementById('resetEmail');
const forgotPasswordError = document.getElementById('forgotPasswordError');
const forgotPasswordSuccess = document.getElementById('forgotPasswordSuccess');

// Open forgot password modal
if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', (e) => {
        e.preventDefault();
        loginModal.classList.remove('active');
        forgotPasswordModal.classList.add('active');
        resetEmail.value = '';
        forgotPasswordError.classList.remove('show');
        forgotPasswordSuccess.style.display = 'none';
    });
}

// Cancel forgot password
if (cancelResetBtn) {
    cancelResetBtn.addEventListener('click', () => {
        forgotPasswordModal.classList.remove('active');
        loginModal.classList.add('active');
    });
}

// Send password reset email
if (sendResetBtn) {
    sendResetBtn.addEventListener('click', async () => {
        const email = resetEmail.value.trim();

        // Hide previous messages
        forgotPasswordError.classList.remove('show');
        forgotPasswordSuccess.style.display = 'none';

        if (!email) {
            showError(forgotPasswordError, 'Please enter your email address');
            return;
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showError(forgotPasswordError, 'Please enter a valid email address');
            return;
        }

        try {
            sendResetBtn.disabled = true;
            sendResetBtn.textContent = 'Sending...';

            await sendPasswordResetEmail(auth, email);

            // Show success message
            forgotPasswordSuccess.textContent = 'Password reset email sent! Check your inbox and spam folder.';
            forgotPasswordSuccess.style.display = 'block';
            resetEmail.value = '';

            // Close modal after 3 seconds
            setTimeout(() => {
                forgotPasswordModal.classList.remove('active');
                loginModal.classList.add('active');
                forgotPasswordSuccess.style.display = 'none';
            }, 3000);

        } catch (error) {
            console.error('Password reset error:', error);

            let errorMessage = 'Failed to send reset email';
            if (error.code === 'auth/user-not-found') {
                errorMessage = 'No account found with this email address';
            } else if (error.code === 'auth/invalid-email') {
                errorMessage = 'Invalid email address';
            } else if (error.code === 'auth/too-many-requests') {
                errorMessage = 'Too many requests. Please try again later';
            }

            showError(forgotPasswordError, errorMessage);
        } finally {
            sendResetBtn.disabled = false;
            sendResetBtn.textContent = 'Send Reset Link';
        }
    });
}

// Close modal when clicking outside
if (forgotPasswordModal) {
    forgotPasswordModal.addEventListener('click', (e) => {
        if (e.target === forgotPasswordModal) {
            forgotPasswordModal.classList.remove('active');
        }
    });
}
