import { apiPost } from '../api/client.js';
import { getStoredEmail, setStoredEmail, sanitizeEmail } from '../state/email.js';
import { fetchAccessStatus, invalidateAccessCache } from '../state/access.js';
import { renderMarkers } from '../ui/map.js';
import { renderResults, clearResults, selectLocation } from '../ui/results.js';
import { showToast } from '../ui/notifications.js';
import { showResultsPopup } from '../ui/resultsPopup.js';
import { setExportLocations } from '../ui/exportPanel.js';
import { getFilters } from '../ui/advancedFilters.js';

// App is now free - no paywall needed
const showPaywall = () => { };
const showBlurOverlay = () => { };
const hideBlurOverlay = () => { };

const loadingIndicator = document.getElementById('loadingIndicator');
const errorMessage = document.getElementById('errorMessage');
const resultsSection = document.getElementById('resultsSection');
const resultsCount = document.getElementById('resultsCount');

function setLoading(state, message = 'Analyzing locations…') {
  if (!loadingIndicator) return;
  const text = loadingIndicator.querySelector('p');
  if (text) text.textContent = message;
  loadingIndicator.classList.toggle('hidden', !state);
}

function showError(message) {
  if (errorMessage) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
  }
}

function hideError() {
  errorMessage?.classList.add('hidden');
}

async function loadAccessUi(email) {
  const usageIndicator = document.getElementById('usageIndicator');
  const usageText = document.getElementById('usageText');
  const ownerPill = document.getElementById('ownerControlPill');
  const ownerIndicator = document.getElementById('ownerModeIndicator');
  const status = await fetchAccessStatus(email).catch(() => null);
  if (!status) return;
  if (ownerPill) {
    ownerPill.classList.toggle('hidden', !status.owner);
  }
  if (ownerIndicator) {
    ownerIndicator.classList.toggle('hidden', !status.owner);
  }
  if (!usageIndicator || !usageText) return;
  if (status.hasAccess) {
    usageIndicator.classList.add('hidden');
    hideBlurOverlay();
  } else if (status.freeSearchesRemaining > 0) {
    usageIndicator.classList.remove('hidden');
    usageText.textContent = `You have ${status.freeSearchesRemaining} free search${status.freeSearchesRemaining > 1 ? 'es' : ''} remaining`;
  } else {
    usageIndicator.classList.remove('hidden');
    usageText.textContent = 'Access locked. Run checkout to continue.';
  }
}

export async function performSearch() {
  console.log('performSearch called');
  hideError();
  const queryInput = document.getElementById('locationInput');
  const emailInput = document.getElementById('searchEmailInput');
  const excludeExisting = document.getElementById('excludeExisting')?.checked ?? true;
  const highTrafficOnly = document.getElementById('highTrafficOnly')?.checked ?? true;
  const query = queryInput?.value?.trim() || '';
  const email = sanitizeEmail(emailInput?.value || getStoredEmail());
  console.log('Search params:', { query, email: email ? '***' : 'missing', excludeExisting, highTrafficOnly });
  if (!query) {
    console.warn('No query provided');
    showToast('Enter a location to search.', 'error');
    queryInput?.focus();
    return;
  }
  // Email is optional - allow anonymous search
  // If no email, will search as anonymous (one free blurred search)
  if (email) {
    setStoredEmail(email);
  }
  setLoading(true, 'Searching for high-traffic locations…');
  try {
    const advancedFilters = getFilters();
    const requestBody = {
      query,
      email: email || undefined,
      excludeExisting,
      highTrafficOnly,
      ...advancedFilters
    };
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b612881c-bd0e-49ba-9272-bdca4a0a1a9d', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'search.js:84', message: 'calling apiPost', data: { path: '/api/search', hasQuery: !!query, hasEmail: !!email, excludeExisting, highTrafficOnly, filterKeys: Object.keys(advancedFilters) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
    // #endregion
    const response = await apiPost('/api/search', requestBody);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b612881c-bd0e-49ba-9272-bdca4a0a1a9d', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'search.js:92', message: 'apiPost response received', data: { hasResponse: !!response, hasResults: !!response?.results, resultsCount: response?.results?.length || 0, blurred: response?.blurred }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
    // #endregion
    const locations = response.results || [];

    // Handle blurred results (anonymous search)
    if (response.blurred) {
      // Don't render actual results for anonymous users - just show blur overlay
      clearResults();
      showBlurOverlay();
      resultsSection?.classList.add('hidden');
      showToast('Sign up for 5 free searches to view location details', 'info');
    } else {
      hideBlurOverlay();
      resultsSection?.classList.remove('hidden');
      renderMarkers(locations, selectLocation);
      renderResults(locations);
      setExportLocations(locations);
      if (resultsCount) {
        resultsCount.textContent = locations.length.toString();
      }
      // Show exciting popup with results!
      if (locations.length > 0) {
        setTimeout(() => {
          showResultsPopup(locations);
        }, 500); // Small delay for loading to finish
      }
    }

    if (response.consumedFreeSearch && email) {
      invalidateAccessCache(email);
      await loadAccessUi(email);
    }
  } catch (error) {
    console.error('Search error:', error);
    clearResults();

    // Handle network/connectivity errors
    if (error.isNetworkError || error.status === 0) {
      const errorMsg = 'Unable to connect to the server. The backend API may not be running or configured correctly.';
      showError(errorMsg);
      showToast('Connection error - please try again later', 'error');
      console.error('Backend connectivity issue:', {
        message: error.message,
        apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '(not set)',
        hint: 'Make sure VITE_API_BASE_URL is set to your backend URL in production'
      });
    } else if (error.status === 402) {
      if (error.code === 'signup_required') {
        showBlurOverlay();
        showError('Sign up for 5 free searches to continue.');
      } else {
        showPaywall();
        showBlurOverlay();
        showError('Unlock access to view results.');
      }
    } else if (error.status === 403) {
      showError('Account access has been restricted.');
      showToast('Account access has been restricted', 'error');
    } else {
      const errorMsg = error.message || 'Search failed. Please try again.';
      console.error('Search failed:', errorMsg);
      showError(errorMsg);
      showToast(errorMsg, 'error');
    }
  } finally {
    setLoading(false);
  }
}

export async function handleSearchSubmit(event) {
  if (event) {
    event.preventDefault();
  }
  console.log('Search form submitted');
  await performSearch();
}

export function initSearchForm() {
  console.log('=== initSearchForm called ===');
  const form = document.getElementById('searchForm');
  if (!form) {
    console.error('Search form not found');
    return;
  }
  console.log('Search form found');

  // Handle form submission (for Enter key presses)
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    console.log('Form submit event triggered');
    performSearch();
  });

  // Handle button click - primary method
  const searchButton = document.getElementById('searchBtn');
  if (!searchButton) {
    console.error('Search button not found');
    return;
  }
  console.log('Search button found');

  searchButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('=== Search button clicked ===');
    performSearch();
  });

  console.log('Search form initialized successfully');

  const emailInput = document.getElementById('searchEmailInput');
  if (emailInput && !emailInput.value) {
    const stored = getStoredEmail();
    if (stored) emailInput.value = stored;
  }
  clearResults();
  // Load access UI asynchronously without blocking form initialization
  loadAccessUi(emailInput?.value || getStoredEmail()).catch(err => {
    console.error('Failed to load access UI:', err);
  });
}


