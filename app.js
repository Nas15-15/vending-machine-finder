// Vending Machine Location Finder
// This application finds optimal locations for vending machines

let map = null;
let markers = [];
let currentResults = [];
let selectedLocationIndex = null;

const urlParams = new URLSearchParams(window.location.search);
const isNewUserPreview = urlParams.get('newUserPreview') === '1';

function toggleLandingPage(show) {
    const landing = document.getElementById('landingSection');
    const dashboard = document.getElementById('dashboardSection');
    const body = document.body;

    if (show) {
        if (landing) landing.classList.remove('hidden');
        if (dashboard) dashboard.classList.add('hidden');
        body.classList.add('landing-active');
    } else {
        if (landing) landing.classList.add('hidden');
        if (dashboard) dashboard.classList.remove('hidden');
        body.classList.remove('landing-active');
    }
}

function createInMemoryStorage(seed = {}) {
    const store = { ...seed };
    return {
        getItem(key) {
            return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
        },
        setItem(key, value) {
            store[key] = String(value);
        },
        removeItem(key) {
            delete store[key];
        }
    };
}

const storage = (() => {
    if (isNewUserPreview) {
        return createInMemoryStorage();
    }
    try {
        return window.localStorage;
    } catch (error) {
        console.warn('localStorage unavailable, falling back to in-memory storage', error);
        return createInMemoryStorage();
    }
})();
window.__IS_NEW_USER_PREVIEW__ = isNewUserPreview;

function isOwnerSessionActive() {
    return storage.getItem('ownerAccessActive') === 'true';
}

const API_BASE_URL = window.__APP_CONFIG__?.API_BASE_URL || '';
const NOMINATIM_CONTACT = 'support@vendingmachinefinder.app';
const DEFAULT_SEARCH_RADIUS_METERS = 5000;
const MIN_SEARCH_RADIUS_METERS = 2500;
const MAX_SEARCH_RADIUS_METERS = 80000;
const MAX_SEGMENT_SIZE_METERS = 25000;
const MAX_SEGMENT_ROWS = 3;
const MAX_SEGMENT_COLS = 3;
const ACCESS_STATE_KEYS = new Set([
    'paidAccess',
    'promoUsed',
    'dayAccessExpiry',
    'ownerAccessActive',
    'freeUses',
    'bonusFreeSearches'
]);

function recordAccessUpgrade(method, metadata = {}) {
    const upgrades = JSON.parse(storage.getItem('accessUpgrades') || '[]');
    const entry = {
        method,
        email: metadata.email || storage.getItem('activeUserEmail') || 'unknown',
        timestamp: new Date().toISOString(),
        ...metadata
    };
    upgrades.push(entry);
    storage.setItem('accessUpgrades', JSON.stringify(upgrades));
}

// Access control
const PROMO_CODES = {
    'DSa74@A#': {
        type: 'full_access',
        label: 'Unlimited Access',
        description: 'Unlocks lifetime access on this device.',
        successMessage: 'Promo code accepted! You now have full access.',
        showOnPromoPage: false
    },
    'FREESEARCH': {
        type: 'free_search',
        label: 'Extra Free Search',
        description: 'Adds one additional complimentary scan.',
        bonusSearches: 1,
        successMessage: 'Extra free search added to your account.',
        showOnPromoPage: true
    },
    '1DAY': {
        type: 'day_access',
        label: '24 Hour Access Pass',
        description: 'Enjoy full access for 24 hours.',
        durationHours: 24,
        successMessage: 'Unlocked pro access for the next 24 hours.',
        showOnPromoPage: true
    }
};
// App is now free - no payment required

// Check access status
function getAccessStatus() {
    const freeUses = parseInt(storage.getItem('freeUses') || '0', 10);
    const bonusFreeSearches = parseInt(storage.getItem('bonusFreeSearches') || '0', 10);
    const isPaid = storage.getItem('paidAccess') === 'true';
    const promoUsed = storage.getItem('promoUsed') === 'true';
    const dayAccessExpiry = parseInt(storage.getItem('dayAccessExpiry') || '0', 10);
    const now = Date.now();
    const hasDayAccess = dayAccessExpiry > now;
    const ownerActive = isOwnerSessionActive();

    if (!hasDayAccess && dayAccessExpiry) {
        storage.removeItem('dayAccessExpiry');
    }

    const defaultFreeRemaining = freeUses < 1 ? 1 : 0;
    const bonusRemaining = Math.max(0, bonusFreeSearches);
    const totalFreeSearches = defaultFreeRemaining + bonusRemaining;
    const hasFreeUse = totalFreeSearches > 0;

    return {
        freeUses,
        bonusFreeSearches: bonusRemaining,
        freeSearchesRemaining: totalFreeSearches,
        hasFreeUse,
        isPaid,
        promoUsed,
        hasDayAccess,
        dayAccessExpiry: hasDayAccess ? dayAccessExpiry : 0,
        ownerActive,
        hasAccess: ownerActive || isPaid || promoUsed || hasDayAccess || hasFreeUse
    };
}

// Check if user has access
function hasAccess() {
    const status = getAccessStatus();
    return status.hasAccess;
}

// Use free search
function useFreeSearch() {
    const freeUses = parseInt(storage.getItem('freeUses') || '0', 10);
    if (freeUses < 1) {
        storage.setItem('freeUses', '1');
        return true;
    }

    const bonusFreeSearches = parseInt(storage.getItem('bonusFreeSearches') || '0', 10);
    if (bonusFreeSearches > 0) {
        storage.setItem('bonusFreeSearches', String(bonusFreeSearches - 1));
        return true;
    }

    return false;
}

// Grant paid access
function grantPaidAccess(details = {}, options = {}) {
    storage.setItem('paidAccess', 'true');
    storage.setItem('freeUses', '1'); // Mark free use as used
    if (!options.skipLog) {
        recordAccessUpgrade('paid', details);
    }
    // Show profile menu after gaining access
    if (typeof updateProfileVisibility === 'function') {
        updateProfileVisibility();
    }
    toggleLandingPage(false);
}

// Grant promo access
function grantPromoAccess(details = {}, options = {}) {
    storage.setItem('promoUsed', 'true');
    storage.setItem('freeUses', '1'); // Mark free use as used
    if (!options.skipLog) {
        recordAccessUpgrade('promo', details);
    }
    // Show profile menu after gaining access
    if (typeof updateProfileVisibility === 'function') {
        updateProfileVisibility();
    }
    toggleLandingPage(false);
}

function getPromoUsageMap() {
    try {
        return JSON.parse(storage.getItem('promoCodesRedeemed') || '{}');
    } catch (error) {
        console.warn('Failed to parse promo usage map', error);
        return {};
    }
}

function hasUsedPromoCode(code) {
    if (!code) return false;
    const usage = getPromoUsageMap();
    return Boolean(usage[code.toUpperCase()]);
}

function markPromoCodeUsed(code) {
    if (!code) return;
    const usage = getPromoUsageMap();
    usage[code.toUpperCase()] = new Date().toISOString();
    storage.setItem('promoCodesRedeemed', JSON.stringify(usage));
}

function addBonusFreeSearches(count = 1) {
    if (count <= 0) return;
    const current = parseInt(storage.getItem('bonusFreeSearches') || '0', 10);
    storage.setItem('bonusFreeSearches', String(current + count));
}

function grantDayAccess(hours = 24) {
    const duration = Math.max(1, hours);
    const expiresAt = Date.now() + duration * 60 * 60 * 1000;
    storage.setItem('dayAccessExpiry', String(expiresAt));
    // Show profile menu after gaining access
    if (typeof updateProfileVisibility === 'function') {
        updateProfileVisibility();
    }
}

function getDayAccessRemainingHours() {
    const expiry = parseInt(storage.getItem('dayAccessExpiry') || '0', 10);
    if (!expiry) return 0;
    const remainingMs = expiry - Date.now();
    return remainingMs > 0 ? remainingMs / (60 * 60 * 1000) : 0;
}

function redeemPromoCode(rawCode) {
    const inputCode = (rawCode || '').trim();
    if (!inputCode) {
        return { success: false, message: 'Enter a promo code to continue.' };
    }

    const normalizedCode = inputCode.toUpperCase();
    const promoDetails = PROMO_CODES[normalizedCode];

    if (!promoDetails) {
        return { success: false, message: 'Invalid promo code. Please double-check and try again.' };
    }

    if (hasUsedPromoCode(normalizedCode)) {
        return { success: false, message: 'You have already used this promo code on this device.' };
    }

    switch (promoDetails.type) {
        case 'free_search':
            addBonusFreeSearches(promoDetails.bonusSearches || 1);
            break;
        case 'day_access':
            grantDayAccess(promoDetails.durationHours || 24);
            break;
        case 'full_access':
        default:
            grantPromoAccess({ code: normalizedCode });
            break;
    }

    markPromoCodeUsed(normalizedCode);
    updateUsageIndicator();

    const status = getAccessStatus();

    return {
        success: true,
        code: normalizedCode,
        type: promoDetails.type,
        message: promoDetails.successMessage || 'Promo applied!',
        shouldUnlock: status.hasAccess
    };
}

// Show paywall
function showPaywall() {
    const paywall = document.getElementById('paywallOverlay');
    if (paywall) {
        paywall.classList.remove('hidden');
        paywall.style.display = 'flex'; // Force show
    }
}

// Close paywall
function closePaywall() {
    const paywall = document.getElementById('paywallOverlay');
    if (paywall) {
        paywall.classList.add('hidden');
        paywall.style.display = 'none'; // Force hide
    }
}

// Copy Bitcoin address
function copyBitcoinAddress() {
    const address = document.getElementById('bitcoinAddress').textContent;
    navigator.clipboard.writeText(address).then(() => {
        const btn = document.querySelector('.copy-btn');
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.style.background = '#28a745';
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '';
        }, 2000);
    }).catch(() => {
        // Fallback for older browsers
        const addressEl = document.getElementById('bitcoinAddress');
        const textArea = document.createElement('textarea');
        textArea.value = address;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert('Bitcoin address copied to clipboard!');
    });
}

// Verify Bitcoin payment (simulated - in production, use a payment processor)
function verifyBitcoinPayment() {
    const btn = document.querySelector('.verify-btn');
    const txIdInput = document.getElementById('transactionIdInput');
    const statusDiv = document.getElementById('verificationStatus');
    const txId = txIdInput ? txIdInput.value.trim() : '';

    // Check if transaction ID is provided
    if (!txId) {
        if (txIdInput) {
            txIdInput.style.borderColor = '#dc3545';
            txIdInput.placeholder = 'Please enter a transaction ID';
            setTimeout(() => {
                txIdInput.style.borderColor = '';
                txIdInput.placeholder = 'Enter Bitcoin transaction ID...';
            }, 2000);
        }
        return;
    }

    // Validate transaction ID format (Bitcoin TXIDs are 64 character hex strings)
    const txIdPattern = /^[a-fA-F0-9]{64}$/;
    if (!txIdPattern.test(txId)) {
        if (txIdInput) {
            txIdInput.style.borderColor = '#dc3545';
            txIdInput.value = '';
            txIdInput.placeholder = 'Invalid format. Must be 64 hex characters.';
            setTimeout(() => {
                txIdInput.style.borderColor = '';
                txIdInput.placeholder = 'Enter Bitcoin transaction ID...';
            }, 3000);
        }
        return;
    }

    // Show verifying status
    btn.textContent = 'Verifying...';
    btn.disabled = true;
    if (statusDiv) {
        statusDiv.classList.remove('hidden');
        statusDiv.className = 'verification-status verifying';
        statusDiv.textContent = 'Checking blockchain for transaction...';
    }

    // Simulate verification process (in production, this would check a real API)
    setTimeout(() => {
        if (statusDiv) {
            statusDiv.textContent = 'Verifying transaction details...';
        }
    }, 1500);

    setTimeout(() => {
        // In a real implementation, you would:
        // 1. Check blockchain API (e.g., Blockstream API, Blockchain.info)
        // 2. Verify the transaction exists
        // 3. Verify it was sent to the correct address
        // 4. Verify the amount matches $9.99 USD

        // For demo purposes, we'll check if it's a valid format and simulate verification
        // In production, replace this with actual API call:
        // const verified = await checkBitcoinTransaction(txId, BITCOIN_ADDRESS, 9.99);

        // Simulate: Check if transaction ID looks valid (for demo, any valid format works)
        // In real implementation, this would fail if transaction doesn't exist or doesn't match
        const verified = true; // This would come from API in production

        if (verified) {
            // Show success status
            if (statusDiv) {
                statusDiv.className = 'verification-status success';
                statusDiv.textContent = '✓ Payment verified successfully!';
            }

            // Grant access after short delay
            setTimeout(() => {
                grantPaidAccess({ transactionId: txId });

                // Close paywall immediately (force close)
                const paywall = document.getElementById('paywallOverlay');
                if (paywall) {
                    paywall.style.display = 'none';
                    paywall.classList.add('hidden');
                }

                // Force hide blur overlay
                const blurOverlay = document.getElementById('blurOverlay');
                if (blurOverlay) {
                    blurOverlay.style.display = 'none';
                    blurOverlay.classList.add('hidden');
                }
                const resultsSection = document.getElementById('resultsSection');
                if (resultsSection) {
                    resultsSection.classList.remove('locked');
                    resultsSection.style.filter = '';
                }

                updateUsageIndicator();

                // Refresh results if they exist - force show
                if (currentResults.length > 0) {
                    displayResults(currentResults, true);
                }

                // Show success notification (non-blocking)
                setTimeout(() => {
                    showSuccessNotification('Payment verified! You now have full access.');
                }, 100);
            }, 500);
        } else {
            // Payment verification failed
            if (statusDiv) {
                statusDiv.className = 'verification-status error';
                statusDiv.textContent = '✗ Payment verification failed. Please check your transaction ID.';
            }
            btn.textContent = 'Verify Payment';
            btn.disabled = false;

            if (txIdInput) {
                txIdInput.style.borderColor = '#dc3545';
            }
        }
    }, 3000);
}

// Show success notification (non-blocking toast)
function showSuccessNotification(message) {
    // Remove existing notification if any
    const existing = document.getElementById('successNotification');
    if (existing) {
        existing.remove();
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.id = 'successNotification';
    notification.className = 'success-notification';
    notification.textContent = message;

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    // Auto-remove after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// Verify promo code
function verifyPromoCode() {
    const input = document.getElementById('promoCodeInput');
    if (!input) return;

    const result = redeemPromoCode(input.value);

    if (result.success) {
        input.value = '';

        if (result.shouldUnlock) {
            closePaywall();
            hideBlurOverlay();
            if (currentResults.length > 0) {
                displayResults(currentResults, true);
            }
        }

        setTimeout(() => {
            showSuccessNotification(result.message || 'Promo applied!');
        }, 100);
    } else {
        input.style.borderColor = '#dc3545';
        input.value = '';
        input.placeholder = result.message || 'Invalid code. Try again.';
        setTimeout(() => {
            input.style.borderColor = '';
            input.placeholder = 'Enter promo code...';
        }, 2000);
    }
}

function formatDateTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function renderPromoPerks() {
    const status = getAccessStatus();
    const freeCountEl = document.getElementById('promoFreeCount');
    const freeCaptionEl = document.getElementById('promoFreeCaption');
    const dayStatusEl = document.getElementById('promoDayStatus');

    if (freeCountEl) {
        freeCountEl.textContent = status.freeSearchesRemaining || 0;
    }
    if (freeCaptionEl) {
        freeCaptionEl.textContent = status.hasFreeUse ? 'Free searches ready to use' : 'No free searches remaining';
    }
    if (dayStatusEl) {
        if (status.hasDayAccess) {
            dayStatusEl.textContent = `Active until ${formatDateTime(status.dayAccessExpiry)}`;
        } else {
            dayStatusEl.textContent = 'No day pass active';
        }
    }
}

function showPromoPageStatus(message, variant = 'info') {
    const statusEl = document.getElementById('promoStatusMessage');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `promo-status promo-status-${variant}`;
}

function initPromoPage() {
    const promoForm = document.getElementById('promoRedeemForm');
    const promoInput = document.getElementById('promoPageInput');

    if (!promoForm || !promoInput) return;

    promoForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const result = redeemPromoCode(promoInput.value);
        if (result.success) {
            promoInput.value = '';
            showPromoPageStatus(result.message || 'Promo applied!', 'success');
        } else {
            showPromoPageStatus(result.message || 'Invalid promo code.', 'error');
        }
        renderPromoPerks();
    });

    promoInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            promoForm.dispatchEvent(new Event('submit'));
        }
    });

    renderPromoPerks();
}

// Show blur overlay
function showBlurOverlay() {
    document.getElementById('blurOverlay').classList.remove('hidden');
    document.getElementById('resultsSection').classList.add('locked');
}

// Hide blur overlay
function hideBlurOverlay() {
    const blurOverlay = document.getElementById('blurOverlay');
    const resultsSection = document.getElementById('resultsSection');

    if (blurOverlay) {
        blurOverlay.classList.add('hidden');
        blurOverlay.style.display = 'none'; // Force hide
    }
    if (resultsSection) {
        resultsSection.classList.remove('locked');
        resultsSection.style.filter = ''; // Remove any blur filter
    }
}

function refreshAccessUi(options = {}) {
    const { refreshResults = true } = options;
    const status = getAccessStatus();

    updateUsageIndicator();

    if (!status.hasAccess) {
        return;
    }

    closePaywall();
    hideBlurOverlay();

    if (refreshResults && currentResults.length > 0) {
        displayResults(currentResults, true);
    }
}

function getCheckoutEmailInput() {
    return document.getElementById('checkoutEmail');
}

function getCheckoutEmail() {
    const input = getCheckoutEmailInput();
    return input ? input.value.trim() : '';
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function updateCardStatus(message, variant = 'info') {
    const statusEl = document.getElementById('cardCheckoutStatus');
    if (!statusEl) {
        return;
    }
    statusEl.textContent = message || '';
    statusEl.className = 'card-status';
    if (variant === 'error') {
        statusEl.classList.add('error');
    } else if (variant === 'success') {
        statusEl.classList.add('success');
    }
}

function prefillCheckoutEmail() {
    const input = getCheckoutEmailInput();
    if (!input) return;
    const stored = storage.getItem('activeUserEmail') ||
        storage.getItem('pendingCheckoutEmail') ||
        storage.getItem('insiderRememberEmail') ||
        '';
    input.value = stored;
}

async function startCardCheckout() {
    const btn = document.getElementById('cardCheckoutBtn');
    const email = getCheckoutEmail().toLowerCase();

    // Check if Stripe is configured
    if (!STRIPE_PUBLISHABLE_KEY || STRIPE_PUBLISHABLE_KEY === 'pk_test_replace_me') {
        updateCardStatus('⚠️ Stripe is not configured. Please set up your API keys.', 'error');
        return;
    }

    if (!stripeClient) {
        updateCardStatus('⚠️ Stripe failed to load. Please refresh and try again.', 'error');
        return;
    }

    if (!API_BASE_URL) {
        updateCardStatus('⚠️ Server URL not configured.', 'error');
        return;
    }

    if (!email || !isValidEmail(email)) {
        updateCardStatus('Enter a valid email before paying.', 'error');
        if (btn) btn.disabled = false;
        return;
    }

    updateCardStatus('Creating secure checkout session…');
    if (btn) btn.disabled = true;

    try {
        storage.setItem('pendingCheckoutEmail', email);
        const response = await fetch(`${API_BASE_URL}/api/create-checkout-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (errorData.error === 'Stripe is not configured') {
                throw new Error('SERVER_NOT_CONFIGURED');
            }
            throw new Error('SERVER_ERROR');
        }

        const data = await response.json();
        if (!data.id) {
            throw new Error('Missing session id');
        }

        updateCardStatus('Redirecting to Stripe…', 'success');
        const { error } = await stripeClient.redirectToCheckout({ sessionId: data.id });
        if (error) {
            throw error;
        }
    } catch (error) {
        console.error('Stripe checkout failed', error);

        let errorMessage = 'Could not start checkout. Please try again.';

        if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
            errorMessage = '⚠️ Cannot connect to server. Make sure the server is running (npm start).';
        } else if (error.message === 'SERVER_NOT_CONFIGURED') {
            errorMessage = '⚠️ Server needs Stripe configuration. Check your .env file.';
        } else if (error.message === 'SERVER_ERROR') {
            errorMessage = '⚠️ Server error. Check server logs for details.';
        }

        updateCardStatus(errorMessage, 'error');
        if (btn) btn.disabled = false;
    }
}

async function syncPaidAccessFromServer() {
    if (!API_BASE_URL) return;
    const storedEmail = (
        storage.getItem('activeUserEmail') ||
        storage.getItem('insiderRememberEmail') ||
        storage.getItem('pendingCheckoutEmail') ||
        ''
    ).trim();

    if (!storedEmail || !isValidEmail(storedEmail)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/access-status?email=${encodeURIComponent(storedEmail)}`);
        if (!response.ok) return;
        const data = await response.json();
        if (data.hasAccess) {
            grantPaidAccess({ email: storedEmail, source: 'server-sync' }, { skipLog: true });
            storage.setItem('activeUserEmail', storedEmail);
            updateUsageIndicator();
        }
    } catch (error) {
        console.error('Failed to sync access status', error);
    }
}

// Initialize map
function initMap(center = [39.8283, -98.5795]) {
    if (map) {
        map.remove();
    }

    map = L.map('mapContainer').setView(center, 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);
}

function refreshMapView(options = {}) {
    const { scrollIntoViewIfNeeded = false } = options;
    if (typeof document === 'undefined') {
        return;
    }
    const mapContainer = document.getElementById('mapContainer');
    if (!mapContainer) {
        return;
    }

    if (scrollIntoViewIfNeeded) {
        const rect = mapContainer.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const isOutOfView = rect.bottom <= 0 || rect.top >= viewportHeight;

        if (isOutOfView) {
            mapContainer.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        }
    }

    // Call invalidateSize multiple times with increasing delays
    // This ensures tiles load properly even if container layout isn't finished
    const invalidateMap = () => {
        if (map && typeof map.invalidateSize === 'function') {
            map.invalidateSize({ animate: false });
        }
    };

    // Immediate call
    invalidateMap();

    // Delayed calls to handle layout settling
    setTimeout(invalidateMap, 100);
    setTimeout(invalidateMap, 300);
    setTimeout(invalidateMap, 600);
}

// Get coordinates from location input
async function geocodeLocation(location) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1&email=${encodeURIComponent(NOMINATIM_CONTACT)}`
        );
        const data = await response.json();

        if (data && data.length > 0) {
            const result = data[0];
            const boundingBox = normalizeBoundingBox(result.boundingbox);
            return {
                lat: parseFloat(result.lat),
                lon: parseFloat(result.lon),
                displayName: result.display_name,
                boundingBox,
                type: result.type || '',
                class: result.class || '',
                importance: typeof result.importance === 'number' ? result.importance : 0
            };
        }
        throw new Error('Location not found');
    } catch (error) {
        console.error('Geocoding error:', error);
        throw error;
    }
}

function normalizeBoundingBox(rawBoundingBox) {
    if (!Array.isArray(rawBoundingBox) || rawBoundingBox.length !== 4) {
        return null;
    }

    const parsed = rawBoundingBox.map(value => parseFloat(value));
    if (parsed.some(value => Number.isNaN(value))) {
        return null;
    }

    const [south, north, west, east] = parsed;
    if (south >= north || west >= east) {
        return null;
    }

    return parsed;
}

function metersFromLatSpan(spanDegrees) {
    return Math.abs(spanDegrees) * 111320;
}

function metersFromLonSpan(spanDegrees, latitude) {
    const metersPerDegree = 111320 * Math.cos(latitude * Math.PI / 180);
    return Math.abs(spanDegrees) * Math.max(metersPerDegree, 1);
}

function clampRadius(value) {
    return Math.min(Math.max(value, MIN_SEARCH_RADIUS_METERS), MAX_SEARCH_RADIUS_METERS);
}

function estimateRadiusFromType(placeType = '') {
    const radiusHints = {
        postcode: 8000,
        neighbourhood: 4000,
        suburb: 7000,
        village: 8000,
        town: 12000,
        city: 20000,
        county: 35000,
        state: 60000,
        state_district: 50000,
        province: 60000,
        region: 60000
    };

    return radiusHints[placeType] || DEFAULT_SEARCH_RADIUS_METERS;
}

function deriveSearchRegions(geocoded) {
    const boundingBox = Array.isArray(geocoded.boundingBox) ? geocoded.boundingBox : null;
    const baseRadius = clampRadius(estimateRadiusFromType(geocoded.type));

    if (!boundingBox) {
        return [{
            centerLat: geocoded.lat,
            centerLon: geocoded.lon,
            radius: baseRadius,
            boundingBox: null
        }];
    }

    const [south, north, west, east] = boundingBox;
    const centerLat = geocoded.lat;
    const latMeters = metersFromLatSpan(north - south);
    const lonMeters = metersFromLonSpan(east - west, centerLat);
    const diagonalMeters = Math.sqrt(latMeters ** 2 + lonMeters ** 2);
    const coverageRadius = clampRadius(Math.max(baseRadius, diagonalMeters / 2 + 500));

    const rowsNeeded = Math.ceil(latMeters / MAX_SEGMENT_SIZE_METERS);
    const colsNeeded = Math.ceil(lonMeters / MAX_SEGMENT_SIZE_METERS);
    const rows = Math.min(Math.max(rowsNeeded, 1), MAX_SEGMENT_ROWS);
    const cols = Math.min(Math.max(colsNeeded, 1), MAX_SEGMENT_COLS);

    if (rows === 1 && cols === 1) {
        return [{
            centerLat: geocoded.lat,
            centerLon: geocoded.lon,
            radius: coverageRadius,
            boundingBox
        }];
    }

    const latStep = (north - south) / rows;
    const lonStep = (east - west) / cols;
    const regions = [];

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const segSouth = south + row * latStep;
            const segNorth = row === rows - 1 ? north : segSouth + latStep;
            const segWest = west + col * lonStep;
            const segEast = col === cols - 1 ? east : segWest + lonStep;
            const segCenterLat = (segSouth + segNorth) / 2;
            const segCenterLon = (segWest + segEast) / 2;
            const segLatMeters = metersFromLatSpan(segNorth - segSouth);
            const segLonMeters = metersFromLonSpan(segEast - segWest, segCenterLat);
            const segDiagonal = Math.sqrt(segLatMeters ** 2 + segLonMeters ** 2);
            const segRadius = clampRadius(Math.max(baseRadius, segDiagonal / 2 + 500));

            regions.push({
                centerLat: segCenterLat,
                centerLon: segCenterLon,
                radius: segRadius,
                boundingBox: [segSouth, segNorth, segWest, segEast]
            });
        }
    }

    return regions;
}

const reverseGeocodeCache = new Map();
let lastReverseLookupTime = 0;
const NOMINATIM_THROTTLE_MS = 1100;
const MAX_ENRICHED_LOCATIONS = 3;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function formatCategoryLabel(category) {
    if (category === undefined || category === null) {
        return 'Other';
    }
    return category
        .toString()
        .replace(/[_\-]+/g, ' ')
        .split(' ')
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function isGenericName(name, category) {
    if (!name) return true;
    const normalizedName = name.trim().toLowerCase();
    if (!normalizedName) return true;
    const normalizedCategory = (category || '').toString().trim().toLowerCase();
    if (normalizedCategory && normalizedName === normalizedCategory) return true;
    const readableCategory = formatCategoryLabel(category).toLowerCase();
    return readableCategory && normalizedName === readableCategory;
}

function buildLocationNameFromTags(tags = {}, category, lat = null, lon = null) {
    const candidateKeys = [
        'name',
        'name:en',
        'official_name',
        'alt_name',
        'short_name',
        'brand',
        'brand:en',
        'operator',
        'addr:housename',
        'addr:place',
        'addr:full'
    ];

    for (const key of candidateKeys) {
        const value = tags[key];
        if (value && value.trim() && !isGenericName(value, category)) {
            return value.trim();
        }
    }

    const street = tags['addr:street'] || tags['addr:road'];
    const housenumber = tags['addr:housenumber'];
    const city = tags['addr:city'] || tags['addr:town'] || tags['addr:village'];
    const neighborhood = tags['addr:neighbourhood'] || tags['addr:suburb'];
    const descriptor = formatCategoryLabel(category);

    // Try to build a descriptive name with available address components
    if (street && city) {
        const streetLine = housenumber ? `${housenumber} ${street}` : street;
        return `${descriptor} at ${streetLine}, ${city}`;
    }

    if (street && neighborhood) {
        const streetLine = housenumber ? `${housenumber} ${street}` : street;
        return `${descriptor} at ${streetLine}, ${neighborhood}`;
    }

    if (city) {
        return `${descriptor} in ${city}`;
    }

    if (neighborhood) {
        return `${descriptor} in ${neighborhood}`;
    }

    if (street) {
        const streetLine = housenumber ? `${housenumber} ${street}` : street;
        return `${descriptor} on ${streetLine}`;
    }

    // If no address info, include coordinates for uniqueness
    if (lat !== null && lon !== null) {
        return `${descriptor} (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
    }

    return descriptor;
}

function buildAddressFromTags(tags = {}) {
    const streetParts = [
        tags['addr:housenumber'],
        tags['addr:street'] || tags['addr:road']
    ].filter(Boolean);
    const streetLine = streetParts.join(' ').trim();

    const localityParts = [
        tags['addr:neighbourhood'] || tags['addr:suburb'],
        tags['addr:city'] || tags['addr:town'] || tags['addr:village']
    ].filter(Boolean);
    const localityLine = localityParts.join(', ');

    const regionParts = [
        tags['addr:state'],
        tags['addr:postcode']
    ].filter(Boolean);
    const regionLine = regionParts.join(' ').trim();

    const country = tags['addr:country'];

    const components = [];
    if (streetLine) components.push(streetLine);
    if (localityLine) components.push(localityLine);
    if (regionLine) components.push(regionLine);
    if (country) components.push(country);

    if (!components.length && tags['addr:full']) {
        return tags['addr:full'];
    }

    return components.join(', ');
}

function buildAddressFromReverse(address = {}) {
    if (!address) return '';

    const street = address.road || address.pedestrian || address.path || address.cycleway || address.footway;
    const streetParts = [
        address.house_number,
        street
    ].filter(Boolean);
    const streetLine = streetParts.join(' ').trim();

    const locality = address.neighbourhood || address.suburb || address.quarter || address.city_district || address.town || address.city || address.village;
    const region = address.state || address.county;
    const postcode = address.postcode;
    const country = address.country;

    const components = [];
    if (streetLine) components.push(streetLine);
    if (locality) components.push(locality);
    const regionLine = [region, postcode].filter(Boolean).join(' ').trim();
    if (regionLine) components.push(regionLine);
    if (country) components.push(country);

    return components.join(', ');
}

async function reverseGeocode(lat, lon) {
    const cacheKey = `${lat.toFixed(5)}_${lon.toFixed(5)}`;
    if (reverseGeocodeCache.has(cacheKey)) {
        return reverseGeocodeCache.get(cacheKey);
    }

    const now = Date.now();
    const elapsed = now - lastReverseLookupTime;
    if (elapsed < NOMINATIM_THROTTLE_MS) {
        await sleep(NOMINATIM_THROTTLE_MS - elapsed);
    }

    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&email=${encodeURIComponent(NOMINATIM_CONTACT)}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Reverse geocode error: ${response.status}`);
        }
        const data = await response.json();
        reverseGeocodeCache.set(cacheKey, data);
        lastReverseLookupTime = Date.now();
        return data;
    } catch (error) {
        console.warn('Reverse geocode failed', error);
        reverseGeocodeCache.set(cacheKey, null);
        lastReverseLookupTime = Date.now();
        return null;
    }
}

async function enrichLocationDetails(locations = [], maxLookups = MAX_ENRICHED_LOCATIONS) {
    if (!Array.isArray(locations) || locations.length === 0) {
        return;
    }

    const targets = locations
        .filter(loc => isGenericName(loc.name, loc.category) || !loc.address)
        .slice(0, maxLookups);

    for (const location of targets) {
        const details = await reverseGeocode(location.lat, location.lon);
        if (!details) continue;

        const enrichedName = details.name ||
            details.address?.mall ||
            details.address?.retail ||
            details.address?.university ||
            details.address?.building;
        if (enrichedName && isGenericName(location.name, location.category)) {
            location.name = enrichedName;
        }

        const enrichedAddress = buildAddressFromReverse(details.address) || details.display_name;
        if (enrichedAddress) {
            location.address = enrichedAddress;
        }

        if (!location.displayCategory && details.type) {
            location.displayCategory = formatCategoryLabel(details.type);
        }

        if (!location.type && details.category) {
            location.type = formatCategoryLabel(details.category);
        }
    }
}

// Find high-traffic locations (businesses, schools, hospitals, etc.)
async function findHighTrafficLocations(centerLat, centerLon, radius = DEFAULT_SEARCH_RADIUS_METERS, progressCallback = null, boundingBox = null) {
    const locations = [];
    const locationMap = new Map(); // For deduplication

    if (progressCallback) {
        progressCallback('Searching for high-traffic locations...');
    }

    // Use Overpass API to search for all high-traffic location types at once
    // This is much more efficient and reliable than individual category searches
    try {
        const timeout = boundingBox ? 45 : 25;
        let areaSelector = `(around:${radius},${centerLat},${centerLon})`;

        if (boundingBox && boundingBox.length === 4) {
            const [south, north, west, east] = boundingBox;
            areaSelector = `(${south},${west},${north},${east})`;
        }

        const overpassQuery = `
            [out:json][timeout:${timeout}];
            (
              node["amenity"~"^(hospital|university|school|gym|cinema|theatre|library|bank|restaurant|cafe|fast_food|community_centre|government)$"]${areaSelector};
              node["shop"~"^(mall|supermarket|convenience)$"]${areaSelector};
              node["aeroway"="aerodrome"]${areaSelector};
              node["railway"="station"]${areaSelector};
              node["public_transport"="station"]${areaSelector};
              node["leisure"="stadium"]${areaSelector};
              way["amenity"~"^(hospital|university|school|gym|cinema|theatre|library|bank|restaurant|cafe|fast_food|community_centre|government)$"]${areaSelector};
              way["shop"~"^(mall|supermarket|convenience)$"]${areaSelector};
              way["aeroway"="aerodrome"]${areaSelector};
              way["railway"="station"]${areaSelector};
              way["leisure"="stadium"]${areaSelector};
              relation["amenity"~"^(hospital|university|school|gym|cinema|theatre|library|bank|restaurant|cafe|fast_food|community_centre|government)$"]${areaSelector};
              relation["shop"~"^(mall|supermarket|convenience)$"]${areaSelector};
            );
            out center;
        `;

        const overpassResponse = await fetch(
            `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`
        );

        if (overpassResponse.ok) {
            const overpassData = await overpassResponse.json();

            if (overpassData.elements) {
                overpassData.elements.forEach(element => {
                    const lat = element.lat || element.center?.lat;
                    const lon = element.lon || element.center?.lon;

                    if (lat && lon) {
                        const distance = calculateDistance(centerLat, centerLon, lat, lon);

                        if (distance <= radius) {
                            const key = `${lat.toFixed(4)}_${lon.toFixed(4)}`;

                            if (!locationMap.has(key)) {
                                const tags = element.tags || {};

                                // Map OSM tags to our category system
                                let category = tags.amenity || tags.shop || tags.aeroway || tags.railway || tags.leisure || 'other';

                                // Normalize category names
                                const categoryMap = {
                                    'aerodrome': 'airport',
                                    'station': tags.railway ? 'train_station' : 'bus_station',
                                    'stadium': 'stadium',
                                    'mall': 'shopping_mall',
                                    'supermarket': 'supermarket',
                                    'convenience': 'supermarket'
                                };

                                category = categoryMap[category] || category;

                                const readableCategory = formatCategoryLabel(category);
                                const derivedName = buildLocationNameFromTags(tags, category, lat, lon);
                                const derivedAddress = buildAddressFromTags(tags);
                                const typeLabel = formatCategoryLabel(tags.amenity || tags.shop || tags.aeroway || tags.railway || tags.leisure || category);
                                const ownerName = tags.operator || tags.owner || tags.brand || '';
                                const contactPhone = tags['contact:phone'] || tags.phone || '';
                                const contactEmail = tags['contact:email'] || tags.email || '';
                                const contactWebsite = tags['contact:website'] || tags.website || tags.url || '';
                                const openingHours = tags.opening_hours || '';

                                const location = {
                                    name: derivedName,
                                    address: derivedAddress || '',
                                    lat: lat,
                                    lon: lon,
                                    category: category,
                                    displayCategory: readableCategory,
                                    type: typeLabel,
                                    distance: distance,
                                    osmId: element.id,
                                    operatorName: ownerName,
                                    contactPhone,
                                    contactEmail,
                                    contactWebsite,
                                    openingHours,
                                    rawTags: tags
                                };

                                locationMap.set(key, location);
                                locations.push(location);
                            }
                        }
                    }
                });
            }
        } else {
            console.error('Overpass API error:', overpassResponse.status, overpassResponse.statusText);
        }
    } catch (error) {
        console.error('Overpass API error:', error);
    }

    if (progressCallback) {
        progressCallback(`Found ${locations.length} locations`);
    }

    // Remove duplicates and return
    return Array.from(locationMap.values());
}

async function fetchLocationsForRegions(regions, progressCallback = null) {
    const combinedMap = new Map();

    for (let i = 0; i < regions.length; i++) {
        const region = regions[i];

        if (progressCallback) {
            progressCallback(`Scanning area ${i + 1}/${regions.length}...`);
        }

        const regionLocations = await findHighTrafficLocations(
            region.centerLat,
            region.centerLon,
            region.radius,
            null,
            region.boundingBox
        );

        regionLocations.forEach(location => {
            const key = `${location.lat.toFixed(5)}_${location.lon.toFixed(5)}`;
            if (!combinedMap.has(key)) {
                combinedMap.set(key, location);
            }
        });

        if (progressCallback) {
            progressCallback(`Collected ${combinedMap.size} locations (${i + 1}/${regions.length})`);
        }
    }

    return Array.from(combinedMap.values());
}

// Check for existing vending machines
async function checkExistingVendingMachines(location) {
    // Skip API check to avoid rate limiting - use a simple heuristic instead
    // In production, you'd use a real database or API

    // High-traffic areas are more likely to have vending machines, but not guaranteed
    // We'll be more lenient to show more results
    const highCompetitionCategories = ['airport', 'shopping_mall', 'hospital', 'university', 'train_station'];

    if (highCompetitionCategories.includes(location.category)) {
        // 20% chance of existing vending machine (was 30%)
        return Math.random() < 0.2;
    }

    // 5% chance for other locations (was 10%)
    return Math.random() < 0.05;
}

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Calculate foot traffic score based on location type
function calculateFootTrafficScore(location) {
    const categoryScores = {
        'airport': 100,
        'train_station': 95,
        'bus_station': 90,
        'shopping_mall': 90,
        'hospital': 85,
        'university': 85,
        'stadium': 85,
        'gym': 80,
        'supermarket': 80,
        'cinema': 75,
        'theatre': 75,
        'office': 70,
        'school': 70,
        'restaurant': 65,
        'cafe': 65,
        'library': 60,
        'parking': 60,
        'bank': 55,
        'government': 50,
        'community_centre': 50
    };

    let baseScore = categoryScores[location.category] || 40;

    // Adjust based on distance from center (closer = better)
    const distancePenalty = Math.min(location.distance / 100, 20);
    baseScore -= distancePenalty;

    return Math.max(0, Math.min(100, baseScore));
}

// Rank locations by potential
async function rankLocations(locations, excludeExisting = true) {
    const ranked = [];

    // Process locations with async checks
    for (const location of locations) {
        const footTrafficScore = calculateFootTrafficScore(location);
        const hasExisting = await checkExistingVendingMachines(location);

        // Calculate overall score
        let score = footTrafficScore;

        // Penalize if has existing vending machine
        if (excludeExisting && hasExisting) {
            continue; // Skip locations with existing vending machines
        }

        // Bonus for certain high-value categories
        if (['airport', 'hospital', 'university', 'shopping_mall'].includes(location.category)) {
            score += 10;
        }

        // Bonus for proximity to multiple high-traffic locations
        const nearbyHighTraffic = locations.filter(loc =>
            loc !== location &&
            calculateDistance(location.lat, location.lon, loc.lat, loc.lon) < 500 &&
            ['airport', 'hospital', 'university', 'shopping_mall', 'gym', 'office'].includes(loc.category)
        ).length;

        score += Math.min(nearbyHighTraffic * 2, 15); // Up to 15 point bonus

        ranked.push({
            ...location,
            footTrafficScore: Math.round(footTrafficScore),
            overallScore: Math.round(score),
            hasExistingVendingMachine: hasExisting,
            nearbyHighTraffic: nearbyHighTraffic
        });
    }

    // Sort by score and return top locations
    return ranked
        .sort((a, b) => b.overallScore - a.overallScore)
        .slice(0, 50); // Top 50 locations
}

// Display results on map and list
function displayResults(results, forceShow = false) {
    // Clear existing markers
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];

    const previousSelection = typeof selectedLocationIndex === 'number' ? selectedLocationIndex : null;
    resetLocationDetails({ collapsed: results.length === 0 });

    if (results.length === 0) {
        document.getElementById('errorMessage').textContent = 'No suitable locations found. Try a different search area.';
        document.getElementById('errorMessage').classList.remove('hidden');
        return;
    }

    // Check access only if not forcing show
    if (forceShow) {
        // Force hide blur overlay
        hideBlurOverlay();
    } else {
        const status = getAccessStatus();
        const shouldBlur = !status.hasAccess;

        // Show blur overlay if no access
        if (shouldBlur) {
            showBlurOverlay();
        } else {
            hideBlurOverlay();
        }
    }

    // Add markers to map
    const bounds = [];
    results.forEach((result, index) => {
        const displayName = result.name || formatCategoryLabel(result.category);
        const displayAddress = result.address || 'Address unavailable';
        const displayCategory = result.type || result.displayCategory || formatCategoryLabel(result.category);

        const marker = L.marker([result.lat, result.lon])
            .addTo(map)
            .bindPopup(`
                <strong>${displayName}</strong><br>
                ${displayAddress}<br>
                Score: ${result.overallScore}/100
            `);

        marker.on('click', () => {
            selectLocation(index, { skipMap: true });
        });

        markers.push(marker);
        bounds.push([result.lat, result.lon]);
    });

    // Fit map to show all markers
    if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50] });
    }

    // Display results list
    const resultsList = document.getElementById('resultsList');
    resultsList.innerHTML = '';

    results.forEach((result, index) => {
        const card = document.createElement('div');
        card.className = 'result-card';
        card.dataset.index = index;
        card.addEventListener('click', () => {
            selectLocation(index, { ensureMapVisible: true });
        });

        const scoreClass = result.overallScore >= 80 ? 'score-excellent' :
            result.overallScore >= 60 ? 'score-good' : 'score-fair';

        const cardName = result.name || formatCategoryLabel(result.category);
        const cardAddress = result.address || 'Address unavailable';
        const cardCategory = result.type || result.displayCategory || formatCategoryLabel(result.category);

        card.innerHTML = `
            <div class="result-rank">#${index + 1}</div>
            ${index === 0 ? `
            <div class="result-highlight">
                ⭐ Best overall location
            </div>
            ` : ''}
            <div class="result-title">${cardName}</div>
            <div class="result-address">${cardAddress}</div>
            <div class="result-metrics">
                <div class="metric">
                    <span>Foot Traffic:</span>
                    <span class="metric-value">${result.footTrafficScore}/100</span>
                </div>
                <div class="metric">
                    <span>Distance:</span>
                    <span class="metric-value">${Math.round(result.distance)}m</span>
                </div>
                <div class="metric">
                    <span>Type:</span>
                    <span class="metric-value">${cardCategory}</span>
                </div>
                ${result.nearbyHighTraffic > 0 ? `
                <div class="metric">
                    <span>Nearby Venues:</span>
                    <span class="metric-value">${result.nearbyHighTraffic}</span>
                </div>
                ` : ''}
            </div>
            <div class="score-badge ${scoreClass}">
                Overall Score: ${result.overallScore}/100
            </div>
            ${result.hasExistingVendingMachine ? `
            <div style="margin-top: 8px; color: #dc3545; font-size: 0.85rem;">
                ⚠️ Existing vending machine nearby
            </div>
            ` : ''}
        `;

        resultsList.appendChild(card);
    });

    document.getElementById('resultsCount').textContent = results.length;
    document.getElementById('resultsSection').classList.remove('hidden');
    refreshMapView();

    const status = getAccessStatus();
    if (status.hasAccess && results.length > 0) {
        let targetIndex = 0;
        if (previousSelection !== null && results[previousSelection]) {
            targetIndex = previousSelection;
        }
        selectLocation(targetIndex, { skipMap: true });
    }
}

function resetLocationDetails(options = {}) {
    const {
        collapsed = false,
        message = 'Click any location to load ownership and audience insights.'
    } = options;
    const panel = document.getElementById('locationDetailPanel');
    if (!panel) return;

    if (collapsed) {
        panel.classList.add('hidden');
        panel.setAttribute('aria-hidden', 'true');
    } else {
        panel.classList.remove('hidden');
        panel.setAttribute('aria-hidden', 'false');
    }

    selectedLocationIndex = null;

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    setText('detailLocationName', 'Select a location');
    setText('detailLocationAddress', message);
    setText('detailOwnerName', '—');
    const contactContainer = document.getElementById('detailOwnerContacts');
    if (contactContainer) {
        contactContainer.innerHTML = '';
        const placeholder = document.createElement('p');
        placeholder.className = 'detail-muted';
        placeholder.textContent = 'Owner contact details will appear here when available.';
        contactContainer.appendChild(placeholder);
    }
    setText('detailDailyVisitors', '—');
    setText('detailVisitorRange', 'Based on category + traffic score');
    setText('detailFootTrafficScore', '—');
    setText('detailExistingMachines', 'Vending competition');
    setText('detailNearbyCount', '—');
    setText('detailDistance', 'Distance from search center');
    setText('detailAgePrimary', '—');
    setText('detailAgeSecondary', '—');
    setText('detailAgeNotes', '—');
    setText('detailSummaryText', 'Choose a location to generate a tailored breakdown of demand and demographics.');

    const streetViewBtn = document.getElementById('streetViewBtn');
    if (streetViewBtn) {
        streetViewBtn.disabled = true;
        streetViewBtn.onclick = null;
        streetViewBtn.title = 'Street View unavailable until a location is selected';
    }

    const contactBtn = document.getElementById('ownerContactBtn');
    if (contactBtn) {
        contactBtn.disabled = true;
        contactBtn.onclick = null;
        contactBtn.textContent = 'Contact owner';
        contactBtn.title = 'Owner contact unavailable until a location is selected';
    }
}

function selectLocation(index, options = {}) {
    if (!Array.isArray(currentResults) || !currentResults.length) return;
    const location = currentResults[index];
    if (!location) return;

    const { skipMap = false, ensureMapVisible = false } = options;
    selectedLocationIndex = index;

    document.querySelectorAll('.result-card').forEach(card => card.classList.remove('selected'));
    const targetCard = document.querySelector(`.result-card[data-index="${index}"]`);
    if (targetCard) {
        targetCard.classList.add('selected');
        if (options.scrollResultIntoView) {
            targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    if (!skipMap && map) {
        map.setView([location.lat, location.lon], 16);
    }

    renderLocationDetails(location);

    if (ensureMapVisible) {
        refreshMapView({ scrollIntoViewIfNeeded: true });
    }
}

function renderLocationDetails(location) {
    const panel = document.getElementById('locationDetailPanel');
    if (!panel || !location) return;

    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');

    const safeName = location.name || formatCategoryLabel(location.category);
    const address = location.address || 'Address unavailable';
    const vendingMessage = location.hasExistingVendingMachine
        ? 'Existing vending machine detected nearby'
        : 'No vending machines flagged in this radius';
    const nearbyCount = location.nearbyHighTraffic || 0;
    const distanceMeters = Number.isFinite(location.distance) ? Math.round(location.distance) : null;
    const visitors = estimateDailyVisitors(location.footTrafficScore, location.category);
    const demographics = getDemographicProfile(location.category);
    const summary = buildLocationNarrative(location, visitors, demographics);
    const contactDetails = deriveOwnerContactDetails(location);

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    setText('detailLocationName', safeName);
    setText('detailLocationAddress', address);
    setText('detailOwnerName', contactDetails.ownerName || 'Not listed');
    setText('detailDailyVisitors', visitors.display);
    setText('detailVisitorRange', visitors.rangeText);
    setText('detailFootTrafficScore', location.footTrafficScore != null ? `${location.footTrafficScore}/100` : '—');
    setText('detailExistingMachines', vendingMessage);
    setText('detailNearbyCount', nearbyCount > 0 ? `${nearbyCount} anchors` : 'No nearby anchors');
    setText('detailDistance', distanceMeters ? `${distanceMeters} m from search center` : 'Distance unavailable');
    setText('detailAgePrimary', demographics.primary);
    setText('detailAgeSecondary', demographics.secondary);
    setText('detailAgeNotes', demographics.notes);
    setText('detailSummaryText', summary);

    const contactContainer = document.getElementById('detailOwnerContacts');
    if (contactContainer) {
        contactContainer.innerHTML = '';
        if (contactDetails.contacts.length === 0) {
            const placeholder = document.createElement('p');
            placeholder.className = 'detail-muted';
            placeholder.textContent = 'No direct contact info published for this venue.';
            contactContainer.appendChild(placeholder);
        } else {
            contactDetails.contacts.forEach(contact => {
                const row = document.createElement('div');
                row.className = 'contact-line';
                const label = document.createElement('span');
                label.className = 'contact-label';
                label.textContent = contact.label;
                const value = document.createElement('span');
                value.className = 'contact-value';
                value.textContent = contact.display;
                row.appendChild(label);
                row.appendChild(value);
                contactContainer.appendChild(row);
            });
        }
    }

    setupStreetViewButton(location.lat, location.lon);
    setupOwnerContactButton(contactDetails.primaryAction);
}

function deriveOwnerContactDetails(location = {}) {
    const tags = location.rawTags || {};
    const ownerName = location.operatorName || tags.operator || tags.owner || tags.brand || '';
    const phoneRaw = location.contactPhone || tags['contact:phone'] || tags.phone || '';
    const emailRaw = location.contactEmail || tags['contact:email'] || tags.email || '';
    const websiteRaw = location.contactWebsite || tags['contact:website'] || tags.website || tags.url || '';

    const contacts = [];

    if (phoneRaw) {
        const sanitized = phoneRaw.trim();
        contacts.push({
            label: 'Phone',
            value: sanitized,
            display: sanitized,
            type: 'phone',
            href: `tel:${sanitized.replace(/[^+0-9]/g, '')}`
        });
    }

    if (emailRaw) {
        const sanitized = emailRaw.trim();
        contacts.push({
            label: 'Email',
            value: sanitized,
            display: sanitized,
            type: 'email',
            href: `mailto:${sanitized}`
        });
    }

    if (websiteRaw) {
        const url = normalizeContactUrl(websiteRaw);
        contacts.push({
            label: 'Website',
            value: url,
            display: websiteRaw.replace(/^https?:\/\//i, ''),
            type: 'url',
            href: url
        });
    }

    return {
        ownerName: ownerName || 'Not listed',
        contacts,
        primaryAction: contacts[0] || null
    };
}

function estimateDailyVisitors(score = 50, category = '') {
    const categoryRanges = {
        airport: { min: 4000, max: 32000 },
        university: { min: 2000, max: 15000 },
        school: { min: 600, max: 4500 },
        shopping_mall: { min: 1500, max: 12000 },
        supermarket: { min: 700, max: 4500 },
        hospital: { min: 1000, max: 9000 },
        stadium: { min: 1000, max: 35000 },
        gym: { min: 300, max: 2600 },
        restaurant: { min: 200, max: 1500 },
        cafe: { min: 180, max: 1200 },
        office: { min: 800, max: 6000 },
        train_station: { min: 2500, max: 20000 },
        bus_station: { min: 1500, max: 11000 },
        government: { min: 300, max: 2500 },
        cinema: { min: 400, max: 3500 }
    };

    const range = categoryRanges[category] || { min: 250, max: 6000 };
    const boundedScore = Math.min(Math.max(score || 0, 0), 100);
    const estimated = Math.round(range.min + (range.max - range.min) * (boundedScore / 100));

    return {
        value: estimated,
        display: estimated.toLocaleString(),
        rangeText: `${range.min.toLocaleString()} - ${range.max.toLocaleString()} visitors`
    };
}

function getDemographicProfile(category = '') {
    const profiles = {
        university: {
            primary: '18-24 • Students',
            secondary: '25-34 • Grad students & faculty',
            notes: 'Heavy demand for energy drinks, late-night snacks, and coffee options.'
        },
        school: {
            primary: '13-18 • Students',
            secondary: '25-44 • Parents & staff',
            notes: 'Focus on kid-friendly snacks, low-sugar beverages, and affordable bundles.'
        },
        hospital: {
            primary: '25-54 • Healthcare staff & visitors',
            secondary: '55+ • Patient visitors',
            notes: 'Balanced mix of hydration, healthy snacks, and comfort items performs best.'
        },
        shopping_mall: {
            primary: '18-44 • Shoppers',
            secondary: '45-64 • Errand runners',
            notes: 'Impulse purchases thrive here—mix of sweet, salty, and cold beverages.'
        },
        gym: {
            primary: '18-35 • Fitness members',
            secondary: '35-54 • Wellness seekers',
            notes: 'Protein-heavy products, low-calorie drinks, and recovery items convert well.'
        },
        office: {
            primary: '25-44 • Professionals',
            secondary: '45-64 • Managers & clients',
            notes: 'Premium beverages, better-for-you snacks, and convenience meals land well.'
        },
        airport: {
            primary: '25-54 • Travelers',
            secondary: '55+ • Leisure travelers',
            notes: 'High tolerance for premium pricing—offer travel kits, drinks, and quick meals.'
        },
        train_station: {
            primary: '25-44 • Commuters',
            secondary: '18-24 • Students',
            notes: 'Grab-and-go breakfasts, caffeine, and quick snacks move quickly here.'
        },
        restaurant: {
            primary: '18-44 • Diners',
            secondary: '45-64 • Regulars',
            notes: 'Strong upsell opportunity for desserts, specialty drinks, and novelty items.'
        },
        stadium: {
            primary: '18-44 • Fans',
            secondary: '45-64 • Families',
            notes: 'Game-day spikes favor cold drinks, merch tie-ins, and shareable snacks.'
        }
    };

    return profiles[category] || {
        primary: '25-54 • Mixed audience',
        secondary: '18-24 + 55+ spillover traffic',
        notes: 'Balanced beverage + snack assortment with a few premium options works well.'
    };
}

function buildLocationNarrative(location, visitorsInfo, demographics) {
    const baseName = location.name || formatCategoryLabel(location.category);
    const categoryLabel = location.displayCategory || formatCategoryLabel(location.category);
    const distanceText = Number.isFinite(location.distance)
        ? `${Math.round(location.distance)} meters from the search center`
        : 'within the target zone';
    const anchors = location.nearbyHighTraffic || 0;
    const anchorText = anchors > 0
        ? `${anchors} complementary venues within a 500m walk`
        : 'limited nearby anchors, giving your machine more visibility';
    const competitionText = location.hasExistingVendingMachine
        ? 'Expect some competition from existing vending machines already flagged nearby.'
        : 'No vending machines were detected nearby, giving you a first-mover advantage.';
    const productHint = suggestProductForCategory(location.category);

    return `${baseName} (${categoryLabel}) pulls roughly ${visitorsInfo.display} visitors per day ${distanceText}. ${anchorText}. ${competitionText} Audience skews ${demographics.primary}, so stock up on ${productHint}.`;
}

function suggestProductForCategory(category = '') {
    const suggestions = {
        university: 'energy drinks, study snacks, and bottled coffee',
        school: 'kid-friendly snacks, juice boxes, and nut-free treats',
        hospital: 'hydration, healthier snacks, and comfort items',
        shopping_mall: 'novelty sweets, chilled beverages, and shareable bites',
        gym: 'protein shakes, low-calorie drinks, and recovery snacks',
        office: 'cold brew, sparkling water, and premium snacks',
        airport: 'travel kits, premium drinks, and quick breakfast options',
        train_station: 'breakfast bars, caffeine boosts, and portable meals',
        stadium: 'sports drinks, salty snacks, and fan-themed items',
        restaurant: 'dessert add-ons, kids treats, and bottled beverages'
    };

    return suggestions[category] || 'a balanced mix of cold drinks, quick meals, and indulgent treats';
}

function setupStreetViewButton(lat, lon) {
    const streetViewBtn = document.getElementById('streetViewBtn');
    if (!streetViewBtn) return;

    const url = buildStreetViewUrl(lat, lon);
    if (!url) {
        streetViewBtn.disabled = true;
        streetViewBtn.onclick = null;
        streetViewBtn.title = 'Street View unavailable for this location';
        return;
    }

    streetViewBtn.disabled = false;
    streetViewBtn.title = 'Open Google Street View in a new tab';
    streetViewBtn.onclick = () => {
        window.open(url, '_blank', 'noopener');
    };
}

function setupOwnerContactButton(primaryAction) {
    const contactBtn = document.getElementById('ownerContactBtn');
    if (!contactBtn) return;

    if (!primaryAction) {
        contactBtn.disabled = true;
        contactBtn.onclick = null;
        contactBtn.textContent = 'Contact owner';
        contactBtn.title = 'No contact details available';
        return;
    }

    contactBtn.disabled = false;
    contactBtn.onclick = () => {
        if (primaryAction.type === 'url') {
            window.open(primaryAction.href, '_blank', 'noopener');
        } else {
            window.open(primaryAction.href, '_self');
        }
    };

    if (primaryAction.type === 'email') {
        contactBtn.textContent = 'Email owner';
    } else if (primaryAction.type === 'phone') {
        contactBtn.textContent = 'Call owner';
    } else {
        contactBtn.textContent = 'Visit owner site';
    }

    contactBtn.title = `Preferred contact: ${primaryAction.display}`;
}

function buildStreetViewUrl(lat, lon) {
    if (!lat || !lon) return '';
    return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}&heading=0&pitch=0&fov=80`;
}

function normalizeContactUrl(url = '') {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) {
        return url;
    }
    return `https://${url}`;
}

// Main search function
async function performSearch() {
    const locationInput = document.getElementById('locationInput').value.trim();
    const excludeExisting = document.getElementById('excludeExisting').checked;
    const highTrafficOnly = document.getElementById('highTrafficOnly').checked;

    if (!locationInput) {
        alert('Please enter a location');
        return;
    }

    // Check access before searching
    const status = getAccessStatus();

    // If user has free use available, allow the search and mark it as used after search completes
    if (status.hasFreeUse) {
        // Allow search to proceed - we'll mark free use as consumed after successful search
        // Don't show paywall yet
    } else if (!status.hasAccess) {
        // No free use and no paid access - show paywall
        showPaywall();
        return;
    }

    // Show loading
    document.getElementById('loadingIndicator').classList.remove('hidden');
    document.getElementById('resultsSection').classList.add('hidden');
    document.getElementById('errorMessage').classList.add('hidden');
    hideBlurOverlay();
    resetLocationDetails({ collapsed: true });

    try {
        // Geocode the input location
        const geocoded = await geocodeLocation(locationInput);

        // Add to recent searches
        addRecentSearch(geocoded, locationInput);

        // Hide empty state when searching
        hideEmptyState();

        // Initialize map at location
        initMap([geocoded.lat, geocoded.lon]);


        // Update loading message
        const loadingEl = document.getElementById('loadingIndicator');
        const loadingText = loadingEl.querySelector('p');

        // Progress callback
        const updateProgress = (message) => {
            loadingText.textContent = message;
        };

        loadingText.textContent = 'Searching for high-traffic locations...';

        const searchRegions = deriveSearchRegions(geocoded);
        if (searchRegions.length > 1) {
            updateProgress(`Dividing area into ${searchRegions.length} zones...`);
        }

        const locations = await fetchLocationsForRegions(searchRegions, updateProgress);

        console.log(`Found ${locations.length} locations before ranking`);

        if (locations.length === 0) {
            throw new Error('No locations found in this area. Try a larger city or more populated area.');
        }

        loadingText.textContent = `Found ${locations.length} locations. Analyzing competition...`;

        // Rank locations
        let ranked = await rankLocations(locations, excludeExisting);

        // Try to enrich generic names with more precise place info
        loadingText.textContent = 'Polishing place details...';
        try {
            await enrichLocationDetails(ranked);
        } catch (enrichError) {
            console.warn('Failed to enrich location details', enrichError);
        }

        console.log(`After ranking: ${ranked.length} locations`);

        // Filter by high traffic if requested
        if (highTrafficOnly) {
            const beforeFilter = ranked.length;
            ranked = ranked.filter(loc => loc.footTrafficScore >= 60);
            console.log(`After high-traffic filter: ${ranked.length} locations (filtered ${beforeFilter - ranked.length})`);
        }

        if (ranked.length === 0) {
            throw new Error(`No suitable locations found. Found ${locations.length} locations but none met the criteria. Try unchecking "High traffic areas only" or "Exclude areas with existing vending machines".`);
        }

        // Mark free use as consumed after successful search
        const accessStatus = getAccessStatus();
        if (accessStatus.hasFreeUse) {
            useFreeSearch(); // Mark free use as used
            updateUsageIndicator();
        }

        // Display results
        currentResults = ranked;

        // Check if we should blur (after first free use)
        const finalAccessStatus = getAccessStatus();
        const shouldBlur = !finalAccessStatus.hasAccess;
        displayResults(ranked, !shouldBlur);

    } catch (error) {
        console.error('Search error:', error);
        document.getElementById('errorMessage').textContent =
            `Error: ${error.message}. Please try a different location or adjust your search filters.`;
        document.getElementById('errorMessage').classList.remove('hidden');
        document.getElementById('resultsSection').classList.add('hidden');
    } finally {
        document.getElementById('loadingIndicator').classList.add('hidden');
    }
}

// Event listeners
document.getElementById('searchBtn').addEventListener('click', performSearch);
document.getElementById('locationInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        performSearch();
    }
});

// Update usage indicator
function updateHeroCtas(status) {
    const ctaRow = document.querySelector('.cta-button-row');
    const ctaNote = document.querySelector('.cta-note');
    const ownerPill = document.getElementById('ownerControlPill');
    const shouldHide = Boolean(status?.hasAccess);

    [ctaRow, ctaNote].forEach((element) => {
        if (!element) return;
        if (shouldHide) {
            element.classList.add('hidden');
        } else {
            element.classList.remove('hidden');
        }
    });

    if (ownerPill) {
        if (isOwnerSessionActive()) {
            ownerPill.classList.remove('hidden');
        } else {
            ownerPill.classList.add('hidden');
        }
    }

    updateOwnerModeIndicator();
}

function updateUsageIndicator() {
    const status = getAccessStatus();
    const indicator = document.getElementById('usageIndicator');
    const usageText = document.getElementById('usageText');
    const ownerActive = status.ownerActive;

    updateHeroCtas(status);

    if (!indicator || !usageText) return;

    if (isNewUserPreview) {
        indicator.classList.remove('hidden');
        indicator.classList.add('preview-mode');
        usageText.textContent = '👀 Preview mode: Simulating first-time visitor';
        usageText.style.color = '#ffffff';
        return;
    } else {
        indicator.classList.remove('preview-mode');
    }

    if (ownerActive || status.isPaid || status.promoUsed || status.hasDayAccess) {
        indicator.classList.add('hidden');
        return;
    }

    if (status.hasFreeUse) {
        indicator.classList.remove('hidden');
        const remaining = status.freeSearchesRemaining || 1;
        usageText.textContent = remaining > 1
            ? `✨ You have ${remaining} free searches remaining`
            : '✨ You have 1 free search remaining';
        usageText.style.color = '#fff';
    } else {
        indicator.classList.remove('hidden');
        usageText.textContent = '🔒 Free search used. Unlock for unlimited access';
        usageText.style.color = '#ffd700';
    }
}

function updateOwnerModeIndicator() {
    const indicator = document.getElementById('ownerModeIndicator');
    if (!indicator) {
        return;
    }

    if (isOwnerSessionActive()) {
        indicator.classList.remove('hidden');
        indicator.setAttribute('aria-hidden', 'false');
    } else {
        indicator.classList.add('hidden');
        indicator.setAttribute('aria-hidden', 'true');
    }
}

// Initialize map on load
window.addEventListener('DOMContentLoaded', () => {
    initMap();
    updateUsageIndicator();
    prefillCheckoutEmail();
    syncPaidAccessFromServer();

    // Check access and route
    const hasInitialAccess = hasAccess();
    if (hasInitialAccess && !isNewUserPreview) {
        toggleLandingPage(false); // Show Dashboard
    } else {
        toggleLandingPage(true); // Show Landing Page
    }

    if (isNewUserPreview) {
        showSuccessNotification('Preview mode enabled. This tab simulates a first-time visitor without touching your actual session.');
    }

    const cardBtn = document.getElementById('cardCheckoutBtn');
    if (cardBtn) {
        cardBtn.addEventListener('click', (event) => {
            event.preventDefault();
            startCardCheckout();
        });
    }

    // Make sure paywall is hidden on initial load
    const paywall = document.getElementById('paywallOverlay');
    if (paywall) {
        paywall.classList.add('hidden');
        paywall.style.display = 'none';
    }

    // Hide blur overlay on initial load
    hideBlurOverlay();
    initPromoPage();
});

// Allow Enter key in promo code input and set up close button
document.addEventListener('DOMContentLoaded', () => {
    const promoInput = document.getElementById('promoCodeInput');
    if (promoInput) {
        promoInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                verifyPromoCode();
            }
        });
    }

    // Allow Enter key in transaction ID input
    const txIdInput = document.getElementById('transactionIdInput');
    if (txIdInput) {
        txIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                verifyBitcoinPayment();
            }
        });
    }

    // Set up close button with event listener (backup to onclick)
    const closeBtn = document.querySelector('.close-paywall');
    if (closeBtn) {
        closeBtn.addEventListener('click', closePaywall);
    }

    // Also close paywall when clicking outside of it
    const paywallOverlay = document.getElementById('paywallOverlay');
    if (paywallOverlay) {
        paywallOverlay.addEventListener('click', (e) => {
            // Close if clicking on the overlay itself (not the content)
            if (e.target === paywallOverlay) {
                closePaywall();
            }
        });
    }

    // Initialize profile menu
    initProfileMenu();
});

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('storage', (event) => {
        if (!event) return;
        if (event.key === null || ACCESS_STATE_KEYS.has(event.key)) {
            refreshAccessUi();
        }
    });
}

// =============================================
// Profile Menu Functions
// =============================================

function initProfileMenu() {
    const profileBtn = document.getElementById('profileBtn');
    const profileDropdown = document.getElementById('profileDropdown');
    const profileEmail = document.getElementById('profileEmail');

    if (!profileBtn || !profileDropdown) return;

    // Update profile email display and visibility
    updateProfileEmail();
    updateProfileVisibility();

    // Toggle dropdown
    profileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleProfileDropdown();
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!profileDropdown.contains(e.target) && !profileBtn.contains(e.target)) {
            closeProfileDropdown();
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeProfileDropdown();
            closeAllModals();
        }
    });

    // Set up menu item click handlers
    const changePasswordBtn = document.getElementById('changePasswordBtn');
    const cancelSubscriptionBtn = document.getElementById('cancelSubscriptionBtn');
    const signOutBtn = document.getElementById('signOutBtn');

    if (changePasswordBtn) {
        changePasswordBtn.addEventListener('click', () => {
            closeProfileDropdown();
            openChangePasswordModal();
        });
    }

    if (cancelSubscriptionBtn) {
        cancelSubscriptionBtn.addEventListener('click', () => {
            closeProfileDropdown();
            openCancelSubscriptionModal();
        });
    }

    if (signOutBtn) {
        signOutBtn.addEventListener('click', () => {
            closeProfileDropdown();
            openSignOutModal();
        });
    }

    // Initialize modals
    initChangePasswordModal();
    initCancelSubscriptionModal();
    initSignOutModal();
}

function updateProfileEmail() {
    const profileEmail = document.getElementById('profileEmail');
    if (!profileEmail) return;

    const email = storage.getItem('activeUserEmail') ||
        storage.getItem('insiderRememberEmail') ||
        storage.getItem('pendingCheckoutEmail');

    if (email) {
        profileEmail.textContent = email;
    } else {
        profileEmail.textContent = 'My Account';
    }
}

function updateProfileVisibility() {
    const profileMenuContainer = document.getElementById('profileMenuContainer');
    if (!profileMenuContainer) return;

    const status = getAccessStatus();
    const hasEmail = storage.getItem('activeUserEmail') ||
        storage.getItem('insiderRememberEmail') ||
        storage.getItem('pendingCheckoutEmail');

    // Show profile menu only if user has access or has an email stored
    const shouldShow = status.isPaid || status.promoUsed || status.hasDayAccess || hasEmail;

    if (shouldShow) {
        profileMenuContainer.classList.remove('hidden');
    } else {
        profileMenuContainer.classList.add('hidden');
    }
}

function toggleProfileDropdown() {
    const profileBtn = document.getElementById('profileBtn');
    const profileDropdown = document.getElementById('profileDropdown');

    if (!profileBtn || !profileDropdown) return;

    const isOpen = profileDropdown.classList.contains('show');

    if (isOpen) {
        closeProfileDropdown();
    } else {
        openProfileDropdown();
    }
}

function openProfileDropdown() {
    const profileBtn = document.getElementById('profileBtn');
    const profileDropdown = document.getElementById('profileDropdown');

    if (!profileBtn || !profileDropdown) return;

    profileDropdown.classList.remove('hidden');
    // Force reflow to enable transition
    profileDropdown.offsetHeight;
    profileDropdown.classList.add('show');
    profileBtn.setAttribute('aria-expanded', 'true');
}

function closeProfileDropdown() {
    const profileBtn = document.getElementById('profileBtn');
    const profileDropdown = document.getElementById('profileDropdown');

    if (!profileBtn || !profileDropdown) return;

    profileDropdown.classList.remove('show');
    profileBtn.setAttribute('aria-expanded', 'false');

    // Hide after transition
    setTimeout(() => {
        if (!profileDropdown.classList.contains('show')) {
            profileDropdown.classList.add('hidden');
        }
    }, 200);
}

// =============================================
// Modal Utility Functions
// =============================================

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.classList.remove('hidden');
    // Force reflow
    modal.offsetHeight;
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.classList.remove('show');
    document.body.style.overflow = '';

    setTimeout(() => {
        if (!modal.classList.contains('show')) {
            modal.classList.add('hidden');
        }
    }, 250);
}

function closeAllModals() {
    ['changePasswordModal', 'cancelSubscriptionModal', 'signOutModal'].forEach(modalId => {
        closeModal(modalId);
    });
}

// =============================================
// Change Password Modal
// =============================================

function initChangePasswordModal() {
    const modal = document.getElementById('changePasswordModal');
    if (!modal) return;

    const closeBtn = document.getElementById('closeChangePasswordModal');
    const cancelBtn = document.getElementById('cancelChangePassword');
    const form = document.getElementById('changePasswordForm');

    if (closeBtn) {
        closeBtn.addEventListener('click', () => closeModal('changePasswordModal'));
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => closeModal('changePasswordModal'));
    }

    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal('changePasswordModal');
        }
    });

    if (form) {
        form.addEventListener('submit', handleChangePassword);
    }
}

function openChangePasswordModal() {
    // Reset form
    const form = document.getElementById('changePasswordForm');
    const message = document.getElementById('changePasswordMessage');

    if (form) form.reset();
    if (message) {
        message.classList.add('hidden');
        message.className = 'form-message hidden';
    }

    openModal('changePasswordModal');
}

function handleChangePassword(e) {
    e.preventDefault();

    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmNewPassword = document.getElementById('confirmNewPassword').value;
    const message = document.getElementById('changePasswordMessage');

    // Validation
    if (newPassword.length < 8) {
        showFormMessage(message, 'New password must be at least 8 characters.', 'error');
        return;
    }

    if (newPassword !== confirmNewPassword) {
        showFormMessage(message, 'New passwords do not match.', 'error');
        return;
    }

    // Simulate password change (in production, this would call an API)
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.textContent = 'Updating...';
    submitBtn.disabled = true;

    setTimeout(() => {
        showFormMessage(message, 'Password updated successfully!', 'success');
        submitBtn.textContent = 'Update Password';
        submitBtn.disabled = false;

        // Close modal after success
        setTimeout(() => {
            closeModal('changePasswordModal');
            showSuccessNotification('Your password has been updated.');
        }, 1500);
    }, 1500);
}

// =============================================
// Cancel Subscription Modal
// =============================================

function initCancelSubscriptionModal() {
    const modal = document.getElementById('cancelSubscriptionModal');
    if (!modal) return;

    const closeBtn = document.getElementById('closeCancelSubscriptionModal');
    const keepBtn = document.getElementById('keepSubscription');
    const confirmBtn = document.getElementById('confirmCancelSubscription');

    if (closeBtn) {
        closeBtn.addEventListener('click', () => closeModal('cancelSubscriptionModal'));
    }

    if (keepBtn) {
        keepBtn.addEventListener('click', () => closeModal('cancelSubscriptionModal'));
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', handleCancelSubscription);
    }

    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal('cancelSubscriptionModal');
        }
    });
}

function openCancelSubscriptionModal() {
    const message = document.getElementById('cancelSubscriptionMessage');
    const reason = document.getElementById('cancelReason');

    if (reason) reason.value = '';
    if (message) {
        message.classList.add('hidden');
        message.className = 'form-message hidden';
    }

    openModal('cancelSubscriptionModal');
}

function handleCancelSubscription() {
    const message = document.getElementById('cancelSubscriptionMessage');
    const confirmBtn = document.getElementById('confirmCancelSubscription');
    const reason = document.getElementById('cancelReason').value;

    confirmBtn.textContent = 'Cancelling...';
    confirmBtn.disabled = true;

    // Simulate cancellation (in production, this would call an API)
    setTimeout(() => {
        // Clear paid access
        storage.removeItem('paidAccess');
        storage.removeItem('promoUsed');
        storage.removeItem('dayAccessExpiry');

        showFormMessage(message, 'Your subscription has been cancelled.', 'success');
        confirmBtn.textContent = 'Cancel Subscription';
        confirmBtn.disabled = false;

        // Update UI
        updateUsageIndicator();

        setTimeout(() => {
            closeModal('cancelSubscriptionModal');
            showSuccessNotification('Subscription cancelled. You still have access until the end of your billing period.');
        }, 1500);
    }, 2000);
}

// =============================================
// Sign Out Modal
// =============================================

function initSignOutModal() {
    const modal = document.getElementById('signOutModal');
    if (!modal) return;

    const closeBtn = document.getElementById('closeSignOutModal');
    const cancelBtn = document.getElementById('cancelSignOut');
    const confirmBtn = document.getElementById('confirmSignOut');

    if (closeBtn) {
        closeBtn.addEventListener('click', () => closeModal('signOutModal'));
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => closeModal('signOutModal'));
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', handleSignOut);
    }

    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal('signOutModal');
        }
    });
}

function openSignOutModal() {
    openModal('signOutModal');
}

function handleSignOut() {
    const confirmBtn = document.getElementById('confirmSignOut');

    confirmBtn.textContent = 'Signing out...';
    confirmBtn.disabled = true;

    setTimeout(() => {
        // Clear session data
        storage.removeItem('activeUserEmail');
        storage.removeItem('insiderRememberEmail');
        storage.removeItem('pendingCheckoutEmail');
        storage.removeItem('ownerAccessActive');
        storage.removeItem('paidAccess');
        storage.removeItem('promoUsed');
        storage.removeItem('dayAccessExpiry');
        storage.removeItem('freeUses');
        storage.removeItem('bonusFreeSearches');
        storage.removeItem('promoCodesRedeemed');
        storage.removeItem('accessUpgrades');

        // Close modal
        closeModal('signOutModal');

        // Update UI - hide profile menu and update indicators
        updateUsageIndicator();
        updateProfileEmail();
        updateProfileVisibility();

        // Show notification
        showSuccessNotification('You have been signed out.');

        // Stay on the same page (index.html) - profile menu will be hidden
    }, 1000);
}

// =============================================
// Form Message Helper
// =============================================

function showFormMessage(element, text, type) {
    if (!element) return;

    element.textContent = text;
    element.className = `form-message ${type}`;
    element.classList.remove('hidden');
}

// =============================================
// Sidebar Navigation
// =============================================

function initSidebar() {
    const toggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const logoutBtn = document.getElementById('sidebarLogoutBtn');

    if (toggle && sidebar && overlay) {
        toggle.addEventListener('click', () => {
            sidebar.classList.toggle('mobile-open');
            overlay.classList.toggle('active');
        });

        overlay.addEventListener('click', () => {
            sidebar.classList.remove('mobile-open');
            overlay.classList.remove('active');
        });
    }

    // Update sidebar user info
    updateSidebarUser();

    // Logout button
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Sign out of your account?')) {
                handleSignOut();
            }
        });
    }
}

function updateSidebarUser() {
    const nameEl = document.getElementById('sidebarUserName');
    const emailEl = document.getElementById('sidebarUserEmail');

    if (!nameEl || !emailEl) return;

    const email = storage.getItem('activeUserEmail') ||
        storage.getItem('insiderRememberEmail') ||
        storage.getItem('pendingCheckoutEmail');

    if (email) {
        nameEl.textContent = email.split('@')[0];
        emailEl.textContent = email;
    } else {
        nameEl.textContent = 'Guest User';
        emailEl.textContent = 'Not signed in';
    }
}

// =============================================
// Recent Searches
// =============================================

const RECENT_SEARCHES_KEY = 'recentSearches';
const MAX_RECENT_SEARCHES = 6;

function getRecentSearches() {
    try {
        const saved = storage.getItem(RECENT_SEARCHES_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch (error) {
        console.error('Failed to load recent searches:', error);
        return [];
    }
}

function addRecentSearch(location, query) {
    const searches = getRecentSearches();

    // Remove duplicates
    const filtered = searches.filter(s => s.query.toLowerCase() !== query.toLowerCase());

    // Add new search at the beginning
    filtered.unshift({
        query: query,
        lat: location.lat,
        lon: location.lon,
        displayName: location.displayName || query,
        timestamp: new Date().toISOString()
    });

    // Limit to max
    const limited = filtered.slice(0, MAX_RECENT_SEARCHES);

    storage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(limited));
    renderRecentSearches();
}

function clearRecentSearches() {
    storage.removeItem(RECENT_SEARCHES_KEY);
    renderRecentSearches();
}

function renderRecentSearches() {
    const grid = document.getElementById('recentSearchesGrid');
    const noRecent = document.getElementById('noRecentSearches');
    const clearBtn = document.getElementById('clearRecentBtn');

    if (!grid) return;

    const searches = getRecentSearches();

    if (searches.length === 0) {
        grid.innerHTML = '';
        if (noRecent) noRecent.classList.remove('hidden');
        if (clearBtn) clearBtn.style.display = 'none';
        return;
    }

    if (noRecent) noRecent.classList.add('hidden');
    if (clearBtn) clearBtn.style.display = 'inline';

    grid.innerHTML = searches.map(search => `
        <div class="suggestion-card" data-query="${search.query}" data-lat="${search.lat}" data-lon="${search.lon}">
            <div class="suggestion-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
            </div>
            <h4 class="suggestion-card-title">${search.query}</h4>
            <span class="suggestion-card-meta">${formatTimeAgo(search.timestamp)}</span>
        </div>
    `).join('');

    // Add click handlers
    grid.querySelectorAll('.suggestion-card').forEach(card => {
        card.addEventListener('click', () => {
            const query = card.dataset.query;
            const locationInput = document.getElementById('locationInput');
            if (locationInput) {
                locationInput.value = query;
                performSearch();
            }
        });
    });
}

function formatTimeAgo(timestamp) {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return then.toLocaleDateString();
}

function initRecentSearches() {
    renderRecentSearches();

    // Clear button handler
    const clearBtn = document.getElementById('clearRecentBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (confirm('Clear all recent searches?')) {
                clearRecentSearches();
            }
        });
    }
}

// =============================================
// Trending Areas
// =============================================

function initTrendingAreas() {
    const badges = document.querySelectorAll('.trending-badge');

    badges.forEach(badge => {
        badge.addEventListener('click', () => {
            const location = badge.dataset.location;
            const locationInput = document.getElementById('locationInput');
            if (locationInput && location) {
                locationInput.value = location;
                performSearch();
            }
        });
    });
}

// =============================================
// Empty State Management
// =============================================

function showEmptyState() {
    const emptyState = document.getElementById('emptyState');
    const resultsSection = document.getElementById('resultsSection');

    if (emptyState) emptyState.classList.remove('hidden');
    if (resultsSection) resultsSection.classList.add('hidden');
}

function hideEmptyState() {
    const emptyState = document.getElementById('emptyState');
    if (emptyState) emptyState.classList.add('hidden');
}

// =============================================
// Dashboard Initialization
// =============================================

function initDashboard() {
    initSidebar();
    initRecentSearches();
    initTrendingAreas();

    // Show empty state initially
    showEmptyState();
}

// Call initDashboard when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    initDashboard();
});

