import { getComparisonLocations, removeFromComparison, getComparisonRecommendation } from '../ui/comparisonTool.js';
import { showToast } from '../ui/notifications.js';

function initComparisonPage () {
  const locations = getComparisonLocations();
  const emptyState = document.getElementById('comparisonEmpty');
  const comparisonGrid = document.getElementById('comparisonGrid');
  const recommendations = document.getElementById('comparisonRecommendations');

  if (locations.length === 0) {
    emptyState?.classList.remove('hidden');
    comparisonGrid?.classList.add('hidden');
    recommendations?.classList.add('hidden');
    return;
  }

  emptyState?.classList.add('hidden');
  comparisonGrid?.classList.remove('hidden');
  recommendations?.classList.remove('hidden');

  renderComparison(locations);
  renderRecommendations();
}

function renderComparison (locations) {
  const grid = document.getElementById('comparisonGrid');
  if (!grid) return;

  grid.innerHTML = locations.map((location, index) => `
    <div class="comparison-card">
      <button class="remove-comparison-btn" data-index="${index}" type="button" aria-label="Remove from comparison">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
      <div class="comparison-card-header">
        <h3>${formatLocationName(location)}</h3>
        <span class="comparison-category">${location.displayCategory || location.category || 'Location'}</span>
      </div>
      <div class="comparison-metrics">
        <div class="comparison-metric">
          <span class="metric-label">Overall Score</span>
          <span class="metric-value">${location.overallScore || 0}/100</span>
        </div>
        <div class="comparison-metric">
          <span class="metric-label">Traffic Score</span>
          <span class="metric-value">${location.footTrafficScore || 0}/100</span>
        </div>
        <div class="comparison-metric">
          <span class="metric-label">Daily Visitors</span>
          <span class="metric-value">${formatNumber(location.estimatedVisitors || 0)}</span>
        </div>
        <div class="comparison-metric">
          <span class="metric-label">Distance</span>
          <span class="metric-value">${formatDistance(location.distance || 0)}</span>
        </div>
        <div class="comparison-metric">
          <span class="metric-label">Nearby Anchors</span>
          <span class="metric-value">${location.nearbyHighTraffic || 0}</span>
        </div>
        <div class="comparison-metric">
          <span class="metric-label">Competition</span>
          <span class="metric-value ${location.hasExistingVendingMachine ? 'has-competition' : 'no-competition'}">
            ${location.hasExistingVendingMachine ? 'Yes' : 'No'}
          </span>
        </div>
      </div>
      <div class="comparison-details">
        <p class="comparison-address">${location.address || 'Address unavailable'}</p>
        <p class="comparison-description">${location.description || 'No description available'}</p>
      </div>
      <div class="comparison-pros-cons">
        <div class="pros">
          <h4>Pros</h4>
          <ul>
            ${generatePros(location).map(pro => `<li>${pro}</li>`).join('')}
          </ul>
        </div>
        <div class="cons">
          <h4>Cons</h4>
          <ul>
            ${generateCons(location).map(con => `<li>${con}</li>`).join('')}
          </ul>
        </div>
      </div>
    </div>
  `).join('');

  // Attach remove handlers
  grid.querySelectorAll('.remove-comparison-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.currentTarget.dataset.index);
      removeFromComparison(index);
      initComparisonPage();
    });
  });
}

function renderRecommendations () {
  const rec = getComparisonRecommendation();
  if (!rec) return;

  const bestROI = document.getElementById('bestForROI');
  const bestTraffic = document.getElementById('bestForTraffic');
  const bestGrowth = document.getElementById('bestForGrowth');

  if (bestROI) bestROI.textContent = rec.bestForROI || '—';
  if (bestTraffic) bestTraffic.textContent = rec.bestForTraffic || '—';
  if (bestGrowth) bestGrowth.textContent = rec.bestForGrowth || '—';
}

function generatePros (location) {
  const pros = [];
  if (location.overallScore >= 80) pros.push('Excellent overall score');
  if (location.footTrafficScore >= 80) pros.push('High foot traffic');
  if (!location.hasExistingVendingMachine) pros.push('No existing competition');
  if (location.nearbyHighTraffic >= 3) pros.push('Multiple anchor businesses nearby');
  if (location.estimatedVisitors >= 2000) pros.push('High visitor volume');
  if (location.category === 'airport' || location.category === 'hospital') pros.push('Premium location type');
  return pros.length > 0 ? pros : ['Moderate potential'];
}

function generateCons (location) {
  const cons = [];
  if (location.hasExistingVendingMachine) cons.push('Existing competition present');
  if (location.overallScore < 60) cons.push('Lower overall score');
  if (location.footTrafficScore < 60) cons.push('Moderate foot traffic');
  if (location.distance > 5000) cons.push('Far from search center');
  if (location.nearbyHighTraffic === 0) cons.push('Few anchor businesses nearby');
  return cons.length > 0 ? cons : ['No significant concerns'];
}

function formatLocationName (location) {
  return location.name || location.displayCategory || 'Unknown Location';
}

function formatNumber (num) {
  return new Intl.NumberFormat('en-US').format(num);
}

function formatDistance (meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  initComparisonPage();
  
  // Setup clear and export buttons
  const clearBtn = document.getElementById('clearComparisonBtn');
  const exportBtn = document.getElementById('exportComparisonBtn');
  
  clearBtn?.addEventListener('click', () => {
    if (confirm('Clear all locations from comparison?')) {
      localStorage.removeItem('vendingComparison');
      initComparisonPage();
      showToast('Comparison cleared', 'success');
    }
  });
  
  exportBtn?.addEventListener('click', () => {
    const locations = getComparisonLocations();
    if (locations.length === 0) {
      showToast('No locations to export', 'error');
      return;
    }
    
    const data = {
      comparison: locations,
      timestamp: new Date().toISOString(),
      summary: {
        locationCount: locations.length,
        averageScore: locations.reduce((sum, loc) => sum + (loc.overallScore || 0), 0) / locations.length
      }
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `location-comparison-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Comparison exported', 'success');
  });
});













