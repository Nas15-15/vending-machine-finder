import { showToast } from './notifications.js';

let comparisonLocations = [];

/**
 * Initialize comparison tool
 */
export function initComparisonTool () {
  const compareBtn = document.getElementById('compareLocationsBtn');
  const comparisonPanel = document.getElementById('comparisonPanel');
  const clearComparisonBtn = document.getElementById('clearComparisonBtn');
  const exportComparisonBtn = document.getElementById('exportComparisonBtn');

  if (compareBtn) {
    compareBtn.addEventListener('click', () => {
      window.location.href = 'comparison.html';
    });
  }

  if (clearComparisonBtn) {
    clearComparisonBtn.addEventListener('click', clearComparison);
  }

  if (exportComparisonBtn) {
    exportComparisonBtn.addEventListener('click', exportComparison);
  }

  // Load saved comparison from localStorage
  loadComparison();
  updateComparisonUI();
}

/**
 * Add location to comparison
 */
export function addToComparison (location) {
  if (comparisonLocations.length >= 5) {
    showToast('Maximum 5 locations can be compared', 'error');
    return false;
  }

  // Check if already in comparison
  const exists = comparisonLocations.some(loc => 
    loc.lat === location.lat && loc.lon === location.lon
  );

  if (exists) {
    showToast('Location already in comparison', 'info');
    return false;
  }

  comparisonLocations.push(location);
  saveComparison();
  updateComparisonUI();
  showToast('Location added to comparison', 'success');
  return true;
}

/**
 * Remove location from comparison
 */
export function removeFromComparison (index) {
  comparisonLocations.splice(index, 1);
  saveComparison();
  updateComparisonUI();
  showToast('Location removed from comparison', 'success');
}

/**
 * Clear all comparisons
 */
function clearComparison () {
  comparisonLocations = [];
  saveComparison();
  updateComparisonUI();
  showToast('Comparison cleared', 'success');
}

/**
 * Get comparison locations
 */
export function getComparisonLocations () {
  return [...comparisonLocations];
}

/**
 * Save comparison to localStorage
 */
function saveComparison () {
  try {
    localStorage.setItem('vendingComparison', JSON.stringify(comparisonLocations));
  } catch (error) {
    console.error('Failed to save comparison:', error);
  }
}

/**
 * Load comparison from localStorage
 */
function loadComparison () {
  try {
    const saved = localStorage.getItem('vendingComparison');
    if (saved) {
      comparisonLocations = JSON.parse(saved);
    }
  } catch (error) {
    console.error('Failed to load comparison:', error);
    comparisonLocations = [];
  }
}

/**
 * Update comparison UI indicators
 */
function updateComparisonUI () {
  const comparisonBadge = document.getElementById('comparisonBadge');
  const comparisonCount = document.getElementById('comparisonCount');
  
  const count = comparisonLocations.length;

  if (comparisonBadge) {
    if (count > 0) {
      comparisonBadge.classList.remove('hidden');
      comparisonBadge.textContent = count;
    } else {
      comparisonBadge.classList.add('hidden');
    }
  }

  if (comparisonCount) {
    comparisonCount.textContent = count;
  }
}

/**
 * Export comparison data
 */
function exportComparison () {
  if (comparisonLocations.length === 0) {
    showToast('No locations to export', 'error');
    return;
  }

  const data = {
    comparison: comparisonLocations,
    timestamp: new Date().toISOString(),
    summary: generateComparisonSummary()
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `location-comparison-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Comparison exported', 'success');
}

/**
 * Generate comparison summary
 */
function generateComparisonSummary () {
  if (comparisonLocations.length === 0) return null;

  const scores = comparisonLocations.map(loc => loc.overallScore || 0);
  const trafficScores = comparisonLocations.map(loc => loc.footTrafficScore || 0);
  const visitors = comparisonLocations.map(loc => loc.estimatedVisitors || 0);

  return {
    averageScore: scores.reduce((a, b) => a + b, 0) / scores.length,
    highestScore: Math.max(...scores),
    lowestScore: Math.min(...scores),
    averageTraffic: trafficScores.reduce((a, b) => a + b, 0) / trafficScores.length,
    totalVisitors: visitors.reduce((a, b) => a + b, 0),
    locationCount: comparisonLocations.length
  };
}

/**
 * Get comparison recommendation
 */
export function getComparisonRecommendation () {
  if (comparisonLocations.length < 2) return null;

  // Find best location for different criteria
  const bestForROI = [...comparisonLocations].sort((a, b) => {
    const scoreA = (a.overallScore || 0) + (a.footTrafficScore || 0);
    const scoreB = (b.overallScore || 0) + (b.footTrafficScore || 0);
    return scoreB - scoreA;
  })[0];

  const bestForTraffic = [...comparisonLocations].sort((a, b) => {
    return (b.estimatedVisitors || 0) - (a.estimatedVisitors || 0);
  })[0];

  const bestForGrowth = [...comparisonLocations].filter(loc => !loc.hasExistingVendingMachine)
    .sort((a, b) => (b.overallScore || 0) - (a.overallScore || 0))[0];

  return {
    bestForROI: bestForROI ? formatLocationName(bestForROI) : null,
    bestForTraffic: bestForTraffic ? formatLocationName(bestForTraffic) : null,
    bestForGrowth: bestForGrowth ? formatLocationName(bestForGrowth) : null
  };
}

function formatLocationName (location) {
  return location.name || location.displayCategory || 'Unknown Location';
}













