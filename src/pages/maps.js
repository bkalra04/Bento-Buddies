// Maps Page - Refactored with Service Layer
import { auth, storage, ref, uploadBytes, getDownloadURL } from '../../firebase-config.js';
import { createMeetup } from '../services/meetup.service.js';
import { requireAuth } from '../services/auth.service.js';
import { showError, showSuccess, showLoading, hideLoading } from '../utils/error-handler.js';
import { getTodayDate } from '../utils/date-helpers.js';

let map;
let service;
let selectedMarker = null;
let selectedPlace = null;
let currentPlaceDetails = null;
let markers = [];
let currentUser = null;
let selectedMeetupPhoto = null;

// UBC campus center coordinates
const UBC_CENTER = { lat: 49.2606, lng: -123.2460 };

// Initialize auth check
requireAuth().then(user => {
    currentUser = user;
    // Load Google Maps after auth is confirmed
    loadGoogleMaps();
}).catch(() => {
    window.location.href = '../index/index.html';
});

function loadGoogleMaps() {
    // Check if Google Maps is already loaded
    if (window.google && window.google.maps) {
        initMap();
        return;
    }

    // Set up global callback
    window.initMap = initMap;

    const API_KEY = 'AIzaSyBHplBjzNh6sM6Umtx4bgYJinjHHIaUR28';
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places&callback=initMap`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
}

function initMap() {
    // Initialize map centered on UBC
    map = new google.maps.Map(document.getElementById('map'), {
        center: UBC_CENTER,
        zoom: 15,
        styles: [
            {
                featureType: "poi",
                elementType: "labels",
                stylers: [{ visibility: "off" }]
            },
            {
                featureType: "poi.school",
                stylers: [{ visibility: "off" }]
            }
        ],
        mapTypeControl: false,
        fullscreenControl: true,
        zoomControl: true,
        streetViewControl: false
    });

    service = new google.maps.places.PlacesService(map);
    searchRestaurants();
}

function searchRestaurants() {
    const types = ['restaurant', 'cafe', 'meal_takeaway', 'meal_delivery', 'food'];

    types.forEach(type => {
        const request = {
            location: UBC_CENTER,
            radius: 1500,
            type: type
        };

        service.nearbySearch(request, (results, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK) {
                results.forEach(place => {
                    const exists = markers.some(m => m.place.place_id === place.place_id);
                    if (!exists) {
                        createMarker(place);
                    }
                });
            }
        });
    });

    const keywords = ['chipotle', 'kinton ramen', 'blue chip', 'jamjar', 'big way'];
    keywords.forEach(keyword => {
        const request = {
            location: UBC_CENTER,
            radius: 1500,
            keyword: keyword
        };

        service.nearbySearch(request, (results, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && results.length > 0) {
                const place = results[0];
                const exists = markers.some(m => m.place.place_id === place.place_id);
                if (!exists) {
                    createMarker(place);
                }
            }
        });
    });
}

function createMarker(place) {
    const unwantedNames = ['university of british columbia', 'ubc', 'university'];
    const placeName = place.name.toLowerCase();

    if (unwantedNames.some(unwanted => placeName.includes(unwanted) && placeName === unwanted)) {
        return;
    }

    const marker = new google.maps.Marker({
        map: map,
        position: place.geometry.location,
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#000000",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2
        }
    });

    markers.push({ marker, place });

    marker.addListener('click', () => {
        selectRestaurant(marker, place);
    });
}

function selectRestaurant(marker, place) {
    if (selectedMarker) {
        selectedMarker.setIcon({
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#000000",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2
        });
    }

    marker.setIcon({
        path: google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: "#FF93A9",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2
    });

    selectedMarker = marker;
    selectedPlace = place;

    document.getElementById('selectedRestaurant').innerHTML =
        `<span>Selected: ${place.name}</span>`;

    document.getElementById('createMeetupBtn').disabled = false;

    service.getDetails({
        placeId: place.place_id,
        fields: ['name', 'rating', 'user_ratings_total', 'price_level', 'types',
                'vicinity', 'formatted_address', 'photos', 'reviews', 'formatted_phone_number',
                'website', 'opening_hours', 'url']
    }, (placeDetails, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK) {
            currentPlaceDetails = placeDetails;
            displayRestaurantCard(placeDetails);
        }
    });
}

function displayRestaurantCard(place) {
    const card = document.getElementById('restaurantCard');
    card.classList.add('active');

    const imageUrl = place.photos && place.photos.length > 0
        ? place.photos[0].getUrl({ maxWidth: 400 })
        : 'https://via.placeholder.com/400x200?text=No+Image';
    document.getElementById('restaurantImage').src = imageUrl;

    document.getElementById('restaurantNameDisplay').value = place.name;
    document.getElementById('restaurantName').textContent = place.name;
    document.getElementById('rating').textContent = place.rating || 'N/A';
    document.getElementById('reviewCount').textContent =
        `(${place.user_ratings_total || 0})`;

    const rating = place.rating || 0;
    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 >= 0.5 ? 1 : 0;
    const emptyStars = 5 - fullStars - halfStar;
    document.getElementById('stars').textContent =
        '★'.repeat(fullStars) + (halfStar ? '☆' : '') + '☆'.repeat(emptyStars);

    const priceLevel = place.price_level
        ? '$'.repeat(place.price_level)
        : '$$';
    document.getElementById('priceLevel').textContent = priceLevel;

    const types = place.types || [];
    const readableType = types
        .filter(t => t !== 'food' && t !== 'point_of_interest' && t !== 'establishment')
        .map(t => t.replace(/_/g, ' '))
        .join(', ') || 'Restaurant';
    document.getElementById('restaurantType').textContent =
        readableType.charAt(0).toUpperCase() + readableType.slice(1);

    document.getElementById('restaurantAddress').textContent =
        place.vicinity || place.formatted_address || 'Address not available';

    updateReviewsTab(place);
    updateAboutTab(place);
}

function updateReviewsTab(place) {
    const reviewsList = document.getElementById('reviewsList');

    if (place.reviews && place.reviews.length > 0) {
        reviewsList.innerHTML = place.reviews.map(review => `
            <div class="review-item">
                <div class="review-header">
                    <div class="review-avatar"></div>
                    <div>
                        <div class="review-author">${review.author_name}</div>
                        <div class="review-rating">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</div>
                    </div>
                </div>
                <div class="review-text">${review.text}</div>
                <div class="review-date">${review.relative_time_description}</div>
            </div>
        `).join('');
    } else {
        reviewsList.innerHTML = '<p style="color: #666; padding: 1rem 0;">No reviews available</p>';
    }
}

function updateAboutTab(place) {
    const aboutInfo = document.getElementById('aboutInfo');

    let html = '';

    if (place.formatted_address) {
        html += `<div class="info-row">
            <span class="info-label">Address</span>
            <span class="info-value">${place.formatted_address}</span>
        </div>`;
    }

    if (place.formatted_phone_number) {
        html += `<div class="info-row">
            <span class="info-label">Phone</span>
            <span class="info-value">${place.formatted_phone_number}</span>
        </div>`;
    }

    if (place.website) {
        html += `<div class="info-row">
            <span class="info-label">Website</span>
            <span class="info-value"><a href="${place.website}" target="_blank">Visit website</a></span>
        </div>`;
    }

    if (place.opening_hours) {
        const isOpen = place.opening_hours.open_now;
        html += `<div class="info-row">
            <span class="info-label">Hours</span>
            <span class="info-value" style="color: ${isOpen ? 'green' : 'red'}">
                ${isOpen ? 'Open now' : 'Closed'}
            </span>
        </div>`;

        if (place.opening_hours.weekday_text) {
            html += `<div class="info-row" style="flex-direction: column; align-items: flex-start;">
                <span class="info-label">Opening hours</span>
                <div style="margin-top: 0.5rem;">
                    ${place.opening_hours.weekday_text.map(day =>
                        `<div style="font-size: 14px; color: #666; margin: 0.25rem 0;">${day}</div>`
                    ).join('')}
                </div>
            </div>`;
        }
    }

    if (place.url) {
        html += `<div class="info-row">
            <span class="info-label">View on Google Maps</span>
            <span class="info-value"><a href="${place.url}" target="_blank">Open in Maps</a></span>
        </div>`;
    }

    aboutInfo.innerHTML = html || '<p style="color: #666; padding: 1rem 0;">No additional information available</p>';
}

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', function() {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        this.classList.add('active');

        const tabName = this.getAttribute('data-tab');
        document.getElementById(`${tabName}-content`).classList.add('active');
    });
});

// Create Meetup Button
document.getElementById('createMeetupBtn').addEventListener('click', () => {
    if (!currentUser) {
        showError('Please log in to create a meetup');
        return;
    }

    document.getElementById('meetupModal').classList.add('active');

    if (selectedPlace) {
        document.getElementById('modalRestaurantName').textContent = selectedPlace.name;
    }

    document.getElementById('meetupDate').min = getTodayDate();

    document.querySelectorAll('.error-icon').forEach(icon => icon.classList.remove('show'));
    document.querySelectorAll('.input-wrapper').forEach(wrapper => wrapper.classList.remove('error'));
});

// Close modal
document.getElementById('meetupModal').addEventListener('click', (e) => {
    if (e.target.id === 'meetupModal') {
        document.getElementById('meetupModal').classList.remove('active');
        clearFormNew();
    }
});

function clearFormNew() {
    document.getElementById('meetupDate').value = '';
    document.getElementById('meetupHour').value = '';
    document.getElementById('meetupMinute').value = '';
    document.getElementById('meetupSpots').value = '';
    document.getElementById('meetupDetails').value = '';

    // Clear dietary checkboxes
    document.querySelectorAll('.dietary-checkboxes input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = false;
    });

    // Clear photo
    selectedMeetupPhoto = null;
    const photoInput = document.getElementById('meetupPhotoInput');
    const photoPreview = document.getElementById('meetupPhotoPreview');
    if (photoInput) photoInput.value = '';
    if (photoPreview) photoPreview.style.display = 'none';

    document.querySelectorAll('.error-icon').forEach(icon => icon.classList.remove('show'));
    document.querySelectorAll('.input-wrapper').forEach(wrapper => wrapper.classList.remove('error'));
}

// Confirm Button - CREATE MEETUP WITH FIRESTORE
document.getElementById('confirmBtn').addEventListener('click', async () => {
    const date = document.getElementById('meetupDate').value;
    const hour = document.getElementById('meetupHour').value;
    const minute = document.getElementById('meetupMinute').value;
    const spots = parseInt(document.getElementById('meetupSpots').value);
    const details = document.getElementById('meetupDetails').value;

    // Clear previous errors
    document.querySelectorAll('.error-icon').forEach(icon => icon.classList.remove('show'));
    document.querySelectorAll('.input-wrapper').forEach(wrapper => {
        wrapper.classList.remove('error');
        wrapper.classList.remove('shake');
    });

    let hasError = false;

    // Validate date
    if (!date) {
        document.getElementById('dateError').classList.add('show');
        const wrapper = document.getElementById('meetupDate').parentElement;
        wrapper.classList.add('error');
        setTimeout(() => wrapper.classList.add('shake'), 10);
        hasError = true;
    }

    // Validate time
    if (!hour || !minute) {
        document.getElementById('timeError').classList.add('show');
        hasError = true;
    }

    // Validate spots
    if (!spots || spots < 1 || spots > 10) {
        document.getElementById('spotsError').classList.add('show');
        const wrapper = document.getElementById('meetupSpots').parentElement;
        wrapper.classList.add('error');
        setTimeout(() => wrapper.classList.add('shake'), 10);
        hasError = true;
        if (spots > 10) {
            showError('Maximum 10 spots allowed!');
        }
    }

    if (hasError) {
        return;
    }

    if (!currentUser) {
        showError('You must be logged in to create a meetup');
        return;
    }

    if (!selectedPlace || !currentPlaceDetails) {
        showError('Please select a restaurant first');
        return;
    }

    // Collect dietary preferences
    const dietaryPreferences = [];
    document.querySelectorAll('.dietary-checkboxes input[type="checkbox"]:checked').forEach(checkbox => {
        dietaryPreferences.push(checkbox.value);
    });

    // Show loading
    showLoading('Creating meetup...');

    try {
        // Upload photo if selected
        let userPhotoURL = null;
        if (selectedMeetupPhoto) {
            try {
                const fileName = `meetups/${currentUser.uid}/${Date.now()}_${selectedMeetupPhoto.name}`;
                const storageRef = ref(storage, fileName);
                await uploadBytes(storageRef, selectedMeetupPhoto);
                userPhotoURL = await getDownloadURL(storageRef);
            } catch (photoError) {
                console.error('Error uploading photo:', photoError);
                // Continue without photo
            }
        }

        // Prepare meetup data
        const meetupData = {
            restaurantName: selectedPlace.name,
            restaurantAddress: currentPlaceDetails.formatted_address || currentPlaceDetails.vicinity || 'Address not available',
            restaurantLocation: {
                lat: selectedPlace.geometry.location.lat(),
                lng: selectedPlace.geometry.location.lng()
            },
            restaurantPlaceId: selectedPlace.place_id,
            restaurantPhoto: currentPlaceDetails.photos && currentPlaceDetails.photos.length > 0
                ? currentPlaceDetails.photos[0].getUrl({ maxWidth: 400 })
                : '',
            date: date,
            time: `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`,
            maxSpots: spots,
            details: details || '',
            dietaryPreferences: dietaryPreferences,
            userPhoto: userPhotoURL || '' // Add user-uploaded photo
        };

        // Create meetup using service
        const result = await createMeetup(meetupData, currentUser);

        hideLoading();

        if (result.success) {
            // Success!
            document.getElementById('meetupModal').classList.remove('active');
            document.getElementById('successPopup').classList.add('active');

            // Auto-hide success popup
            setTimeout(() => {
                document.getElementById('successPopup').classList.remove('active');
                clearFormNew();
            }, 2500);

            showSuccess('Meetup created successfully!');

            console.log('Meetup created with ID:', result.id);
        } else {
            showError(result.error || 'Failed to create meetup');
        }
    } catch (error) {
        hideLoading();
        console.error('Error creating meetup:', error);
        showError('An unexpected error occurred');
    }
});

// Click outside success popup to close
document.getElementById('successPopup').addEventListener('click', (e) => {
    if (e.target.id === 'successPopup') {
        document.getElementById('successPopup').classList.remove('active');
    }
});

// Photo Viewer
let currentPhotoIndex = 0;
let currentPhotos = [];

document.getElementById('restaurantImage').addEventListener('click', () => {
    if (currentPlaceDetails && currentPlaceDetails.photos && currentPlaceDetails.photos.length > 0) {
        currentPhotos = currentPlaceDetails.photos;
        currentPhotoIndex = 0;
        openPhotoViewer();
    }
});

document.querySelector('.photo-badge').addEventListener('click', () => {
    if (currentPlaceDetails && currentPlaceDetails.photos && currentPlaceDetails.photos.length > 0) {
        currentPhotos = currentPlaceDetails.photos;
        currentPhotoIndex = 0;
        openPhotoViewer();
    }
});

function openPhotoViewer() {
    const modal = document.getElementById('photoViewerModal');
    const image = document.getElementById('photoViewerImage');
    const counter = document.getElementById('photoCounter');

    if (currentPhotos.length > 0) {
        image.src = currentPhotos[currentPhotoIndex].getUrl({ maxWidth: 1200, maxHeight: 800 });
        counter.textContent = `${currentPhotoIndex + 1} / ${currentPhotos.length}`;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closePhotoViewer() {
    const modal = document.getElementById('photoViewerModal');
    const image = document.getElementById('photoViewerImage');
    image.classList.remove('zoomed');
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

function nextPhoto() {
    if (currentPhotoIndex < currentPhotos.length - 1) {
        currentPhotoIndex++;
        const image = document.getElementById('photoViewerImage');
        const counter = document.getElementById('photoCounter');
        image.classList.remove('zoomed');
        image.src = currentPhotos[currentPhotoIndex].getUrl({ maxWidth: 1200, maxHeight: 800 });
        counter.textContent = `${currentPhotoIndex + 1} / ${currentPhotos.length}`;
    }
}

function prevPhoto() {
    if (currentPhotoIndex > 0) {
        currentPhotoIndex--;
        const image = document.getElementById('photoViewerImage');
        const counter = document.getElementById('photoCounter');
        image.classList.remove('zoomed');
        image.src = currentPhotos[currentPhotoIndex].getUrl({ maxWidth: 1200, maxHeight: 800 });
        counter.textContent = `${currentPhotoIndex + 1} / ${currentPhotos.length}`;
    }
}

document.getElementById('photoViewerImage').addEventListener('click', (e) => {
    e.stopPropagation();
    const image = e.target;
    image.classList.toggle('zoomed');
});

document.getElementById('photoCloseBtn').addEventListener('click', closePhotoViewer);
document.getElementById('photoNextBtn').addEventListener('click', nextPhoto);
document.getElementById('photoPrevBtn').addEventListener('click', prevPhoto);

document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('photoViewerModal');
    if (modal.classList.contains('active')) {
        if (e.key === 'ArrowRight') nextPhoto();
        if (e.key === 'ArrowLeft') prevPhoto();
        if (e.key === 'Escape') closePhotoViewer();
    }
});

// Meetup photo upload handlers
const meetupPhotoBtn = document.getElementById('meetupPhotoBtn');
const meetupPhotoInput = document.getElementById('meetupPhotoInput');
const meetupPhotoPreview = document.getElementById('meetupPhotoPreview');
const meetupPreviewImage = document.getElementById('meetupPreviewImage');
const removeMeetupPhotoBtn = document.getElementById('removeMeetupPhotoBtn');

if (meetupPhotoBtn) {
    meetupPhotoBtn.addEventListener('click', () => {
        meetupPhotoInput.click();
    });
}

if (meetupPhotoInput) {
    meetupPhotoInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            showError('Please select an image file');
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            showError('Image must be less than 5MB');
            return;
        }

        try {
            // Compress and preview image
            const compressedFile = await compressImage(file);
            selectedMeetupPhoto = compressedFile;

            // Show preview
            const reader = new FileReader();
            reader.onload = (e) => {
                meetupPreviewImage.src = e.target.result;
                meetupPhotoPreview.style.display = 'block';
            };
            reader.readAsDataURL(compressedFile);
        } catch (error) {
            console.error('Error processing image:', error);
            showError('Failed to process image');
        }
    });
}

if (removeMeetupPhotoBtn) {
    removeMeetupPhotoBtn.addEventListener('click', () => {
        selectedMeetupPhoto = null;
        meetupPhotoInput.value = '';
        meetupPhotoPreview.style.display = 'none';
        meetupPreviewImage.src = '';
    });
}

// Compress image before upload
async function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Max dimensions
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

// Make initMap available globally for Google Maps callback
window.initMap = initMap;
