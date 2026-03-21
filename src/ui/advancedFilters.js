import { showToast } from './notifications.js';

let currentFilters = {
  highTrafficOnly: true,
  minScore: 0,
  maxDistance: Infinity,
  categories: null,
  minVisitors: 0,
  maxVisitors: Infinity
};

/**
 * Initialize advanced filters
 */
export function initAdvancedFilters () {
  const filterToggle = document.getElementById('advancedFiltersToggle');
  const filterPanel = document.getElementById('advancedFiltersPanel');
  const applyFiltersBtn = document.getElementById('applyFiltersBtn');
  const resetFiltersBtn = document.getElementById('resetFiltersBtn');

  if (filterToggle) {
    filterToggle.addEventListener('click', () => {
      filterPanel?.classList.toggle('hidden');
    });
  }

  if (applyFiltersBtn) {
    applyFiltersBtn.addEventListener('click', handleApplyFilters);
  }

  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener('click', handleResetFilters);
  }

  // Load saved filters
  loadFilters();
  updateFilterUI();
}

/**
 * Get current filters
 */
export function getFilters () {
  return { ...currentFilters };
}

/**
 * Handle apply filters
 */
function handleApplyFilters () {
  const minScore = parseFloat(document.getElementById('filterMinScore')?.value) || 0;
  const maxDistance = parseFloat(document.getElementById('filterMaxDistance')?.value) || Infinity;
  const minVisitors = parseInt(document.getElementById('filterMinVisitors')?.value) || 0;
  const maxVisitors = parseInt(document.getElementById('filterMaxVisitors')?.value) || Infinity;
  
  const categoryCheckboxes = document.querySelectorAll('input[name="filterCategory"]:checked');
  const categories = categoryCheckboxes.length > 0 
    ? Array.from(categoryCheckboxes).map(cb => cb.value)
    : null;

  currentFilters = {
    highTrafficOnly: document.getElementById('highTrafficOnly')?.checked ?? true,
    minScore,
    maxDistance: maxDistance === Infinity ? Infinity : maxDistance * 1000, // Convert km to meters
    categories,
    minVisitors,
    maxVisitors: maxVisitors === Infinity ? Infinity : maxVisitors
  };

  saveFilters();
  updateFilterUI();
  showToast('Filters applied', 'success');
  
  // Trigger filter change event
  const event = new CustomEvent('filtersChanged', { detail: currentFilters });
  document.dispatchEvent(event);
}

/**
 * Handle reset filters
 */
function handleResetFilters () {
  currentFilters = {
    highTrafficOnly: true,
    minScore: 0,
    maxDistance: Infinity,
    categories: null,
    minVisitors: 0,
    maxVisitors: Infinity
  };

  // Reset UI
  const minScoreInput = document.getElementById('filterMinScore');
  const maxDistanceInput = document.getElementById('filterMaxDistance');
  const minVisitorsInput = document.getElementById('filterMinVisitors');
  const maxVisitorsInput = document.getElementById('filterMaxVisitors');
  const categoryCheckboxes = document.querySelectorAll('input[name="filterCategory"]');

  if (minScoreInput) minScoreInput.value = '';
  if (maxDistanceInput) maxDistanceInput.value = '';
  if (minVisitorsInput) minVisitorsInput.value = '';
  if (maxVisitorsInput) maxVisitorsInput.value = '';
  categoryCheckboxes.forEach(cb => cb.checked = false);

  saveFilters();
  updateFilterUI();
  showToast('Filters reset', 'success');
  
  // Trigger filter change event
  const event = new CustomEvent('filtersChanged', { detail: currentFilters });
  document.dispatchEvent(event);
}

/**
 * Update filter UI to reflect current state
 */
function updateFilterUI () {
  const activeFiltersCount = getActiveFiltersCount();
  const filterBadge = document.getElementById('filterBadge');
  
  if (filterBadge) {
    if (activeFiltersCount > 0) {
      filterBadge.textContent = activeFiltersCount;
      filterBadge.classList.remove('hidden');
    } else {
      filterBadge.classList.add('hidden');
    }
  }
}

/**
 * Get count of active filters (excluding defaults)
 */
function getActiveFiltersCount () {
  let count = 0;
  if (currentFilters.minScore > 0) count++;
  if (currentFilters.maxDistance < Infinity) count++;
  if (currentFilters.categories && currentFilters.categories.length > 0) count++;
  if (currentFilters.minVisitors > 0) count++;
  if (currentFilters.maxVisitors < Infinity) count++;
  return count;
}

/**
 * Save filters to localStorage
 */
function saveFilters () {
  try {
    localStorage.setItem('vendingFilters', JSON.stringify(currentFilters));
  } catch (error) {
    console.error('Failed to save filters:', error);
  }
}

/**
 * Load filters from localStorage
 */
function loadFilters () {
  try {
    const saved = localStorage.getItem('vendingFilters');
    if (saved) {
      currentFilters = { ...currentFilters, ...JSON.parse(saved) };
    }
  } catch (error) {
    console.error('Failed to load filters:', error);
  }
}













