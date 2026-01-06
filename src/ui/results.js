import { showToast } from './notifications.js';
import { updateCalculatorForLocation } from './roiCalculator.js';
import { addToComparison } from './comparisonTool.js';
import { updateSavedPanelForLocation } from './savedLocationsPanel.js';
import { predictRevenue } from '../../lib/revenuePredictor.js';
import { recommendProducts } from '../../lib/productRecommender.js';
import { analyzeCompetition } from '../../lib/competitorAnalysis.js';

let currentSelection = -1;
let cachedResults = [];

const listEl = document.getElementById('resultsList');
const detailPanel = document.getElementById('locationDetailPanel');
const backdrop = document.getElementById('locationDetailBackdrop');

// Initialize close button
const closeBtn = document.getElementById('closePanelBtn');
if (closeBtn) {
  closeBtn.addEventListener('click', () => {
    hideDetailPanel();
  });
}

// Close panel when clicking backdrop
if (backdrop) {
  backdrop.addEventListener('click', () => {
    hideDetailPanel();
  });
}

function hideDetailPanel () {
  if (detailPanel) {
    detailPanel.classList.add('hidden');
    detailPanel.setAttribute('aria-hidden', 'true');
  }
  if (backdrop) {
    backdrop.classList.remove('active');
  }
  currentSelection = -1;
  const cards = listEl?.querySelectorAll('.result-card') || [];
  cards.forEach(card => card.classList.remove('active'));
}

function formatDistance (meters) {
  if (!Number.isFinite(meters)) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatVisitors (count) {
  if (!Number.isFinite(count)) return '—';
  return count.toLocaleString();
}

function formatLocationName (location) {
  // If we have an actual name (not just category), use it
  if (location.name && location.name !== location.displayCategory) {
    return location.name;
  }
  // Build a more descriptive name from category + context
  const category = location.displayCategory || 'Location';
  // Try to add context from address if available
  if (location.address) {
    return `${category} — ${location.address}`;
  }
  // Fall back to category with distance context
  return `${category} (${formatDistance(location.distance)} away)`;
}

function formatAddress (location) {
  if (location.address) {
    return location.address;
  }
  // Show coordinates as a fallback with "View on map" hint
  if (location.lat && location.lon) {
    return `📍 ${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}`;
  }
  return 'See map for location';
}

function renderCard (location, index) {
  const div = document.createElement('div');
  div.className = 'result-card';
  if (index === currentSelection) {
    div.classList.add('active');
  }
  div.dataset.index = index.toString();
  div.innerHTML = `
    <div class="result-rank">#${index + 1}</div>
    <div class="result-title">${formatLocationName(location)}</div>
    <div class="result-address">${formatAddress(location)}</div>
    <div class="result-meta">
      <span>Foot traffic: ${location.footTrafficScore}/100</span>
      <span>Distance: ${formatDistance(location.distance)}</span>
      <span>Nearby anchors: ${location.nearbyHighTraffic}</span>
    </div>
    <div class="result-actions">
      <div class="score-badge">
        Overall Score: ${location.overallScore}/100
      </div>
      <button class="compare-btn" data-index="${index}" type="button" title="Add to comparison">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
        </svg>
        Compare
      </button>
    </div>
  `;
  div.addEventListener('click', (e) => {
    // Don't trigger selection if clicking the compare button
    if (!e.target.closest('.compare-btn')) {
      selectLocation(index);
    }
  });
  
  // Add compare button handler
  const compareBtn = div.querySelector('.compare-btn');
  if (compareBtn) {
    compareBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      addToComparison(location);
    });
  }
  
  return div;
}

function generateTrafficExplanation (location) {
  const visitors = location.estimatedVisitors;
  const category = location.displayCategory || location.category;
  const score = location.footTrafficScore;
  
  if (score >= 80) {
    return `This ${category} is a high-traffic hotspot. With an estimated ${formatVisitors(visitors)} daily visitors, you can expect strong sales potential and consistent customer flow throughout operating hours.`;
  } else if (score >= 60) {
    return `This location sees solid traffic with approximately ${formatVisitors(visitors)} people passing through daily. The ${category} setting provides reliable foot traffic during peak hours.`;
  } else {
    return `This ${category} has moderate traffic levels with around ${formatVisitors(visitors)} daily visitors. While not the busiest location, it could still be profitable with the right product mix.`;
  }
}

function updateStreetView (location) {
  const container = document.getElementById('streetViewContainer');
  const frame = document.getElementById('streetViewFrame');
  const link = document.getElementById('streetViewLink');
  const placeholder = container?.querySelector('.street-view-placeholder');
  
  if (!location.lat || !location.lon) {
    if (frame) frame.classList.add('hidden');
    if (link) link.classList.add('hidden');
    if (placeholder) placeholder.style.display = 'flex';
    return;
  }
  
  // Google Maps Street View embed URL
  const streetViewUrl = `https://www.google.com/maps/embed/v1/streetview?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&location=${location.lat},${location.lon}&heading=0&pitch=0&fov=90`;
  
  // Google Maps link for full view
  const fullViewUrl = `https://www.google.com/maps/@${location.lat},${location.lon},3a,75y,0h,90t/data=!3m6!1e1!3m4!1s!2e0!7i16384!8i8192`;
  
  if (frame) {
    frame.src = streetViewUrl;
    frame.classList.remove('hidden');
  }
  if (link) {
    link.href = fullViewUrl;
    link.classList.remove('hidden');
  }
  if (placeholder) {
    placeholder.style.display = 'none';
  }
}

function updateVendingStatus (location) {
  const indicator = document.getElementById('vendingStatusIndicator');
  const statusText = document.getElementById('vendingStatusText');
  const statusDetail = document.getElementById('vendingStatusDetail');
  
  if (!indicator || !statusText || !statusDetail) return;
  
  if (location.hasExistingVendingMachine) {
    indicator.className = 'vending-status-indicator has-machines';
    statusText.textContent = 'Competition Detected';
    statusDetail.textContent = 'Our analysis indicates there may be existing vending machines in this area. Consider differentiating with unique products, healthier options, or premium machine features to stand out from competitors.';
  } else {
    indicator.className = 'vending-status-indicator no-machines';
    statusText.textContent = 'No Vending Machines Detected';
    statusDetail.textContent = 'This location appears to be untapped territory! No existing vending machines were detected nearby, giving you a first-mover advantage in this area.';
  }
}

function updateOwnerSection (location) {
  const ownerName = document.getElementById('detailOwnerName');
  const contactsEl = document.getElementById('detailOwnerContacts');
  
  if (ownerName) {
    ownerName.textContent = location.operatorName || 'Property Owner (Unknown)';
  }
  
  if (!contactsEl) return;
  
  contactsEl.innerHTML = '';
  
  const hasContacts = location.contactWebsite || location.contactEmail || location.contactPhone;
  
  if (!hasContacts) {
    contactsEl.innerHTML = '<p class="no-contacts">Contact information not available. Try searching for the business online or visit in person.</p>';
    return;
  }
  
  if (location.contactWebsite) {
    const websiteUrl = location.contactWebsite.startsWith('http') 
      ? location.contactWebsite 
      : `https://${location.contactWebsite}`;
    const item = document.createElement('a');
    item.href = websiteUrl;
    item.target = '_blank';
    item.rel = 'noopener';
    item.className = 'contact-item clickable';
    item.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="2" y1="12" x2="22" y2="12"></line>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
      </svg>
      <span>Visit Website</span>
    `;
    contactsEl.appendChild(item);
  }
  
  if (location.contactEmail) {
    const item = document.createElement('div');
    item.className = 'contact-item clickable';
    item.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
        <polyline points="22,6 12,13 2,6"></polyline>
      </svg>
      <span>${location.contactEmail}</span>
    `;
    item.addEventListener('click', () => {
      navigator.clipboard.writeText(location.contactEmail).then(() => {
        showToast('Email copied to clipboard!', 'success');
      });
    });
    contactsEl.appendChild(item);
  }
  
  if (location.contactPhone) {
    const item = document.createElement('a');
    item.href = `tel:${location.contactPhone}`;
    item.className = 'contact-item clickable';
    item.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
      </svg>
      <span>${location.contactPhone}</span>
    `;
    contactsEl.appendChild(item);
  }
}

function updateDemographics (location) {
  const demographics = location.demographics || {
    '18-24': 20, '25-34': 25, '35-44': 22, '45-54': 18, '55+': 15
  };
  
  const ageGroups = ['18-24', '25-34', '35-44', '45-54', '55+'];
  
  // Update bars with animation delay
  ageGroups.forEach((age, index) => {
    const percent = demographics[age] || 0;
    const bar = document.querySelector(`.age-bar-fill[data-age="${age}"]`);
    const percentEl = document.querySelector(`.age-percent[data-age="${age}"]`);
    
    if (bar) {
      // Reset first for animation
      bar.style.width = '0%';
      setTimeout(() => {
        bar.style.width = `${percent}%`;
      }, 100 + (index * 80));
    }
    if (percentEl) {
      percentEl.textContent = `${percent}%`;
    }
  });
  
  // Update demographics note
  const noteEl = document.getElementById('demographicsNote');
  if (noteEl) {
    const category = location.displayCategory || location.category || 'this location';
    // Find the dominant age group
    let maxAge = '25-34';
    let maxPercent = 0;
    for (const age of ageGroups) {
      if (demographics[age] > maxPercent) {
        maxPercent = demographics[age];
        maxAge = age;
      }
    }
    noteEl.textContent = `Based on typical visitor patterns for ${category}. Primary demographic: ${maxAge} year olds (${maxPercent}%).`;
  }
}

function updateDetailPanel (location) {
  if (!detailPanel) return;
  
  // Show the panel and backdrop
  detailPanel.classList.remove('hidden');
  detailPanel.setAttribute('aria-hidden', 'false');
  if (backdrop) {
    backdrop.classList.add('active');
  }
  
  // Header info
  const categoryBadge = document.getElementById('detailCategoryBadge');
  if (categoryBadge) {
    categoryBadge.textContent = location.displayCategory || location.category || 'Location';
  }
  
  const nameEl = document.getElementById('detailLocationName');
  if (nameEl) {
    nameEl.textContent = formatLocationName(location);
  }
  
  const addressEl = document.getElementById('detailLocationAddress');
  if (addressEl) {
    addressEl.textContent = formatAddress(location);
  }
  
  // Scores
  const overallScore = document.getElementById('detailOverallScore');
  if (overallScore) {
    overallScore.textContent = `${location.overallScore}/100`;
  }
  
  const trafficScore = document.getElementById('detailFootTrafficScore');
  if (trafficScore) {
    trafficScore.textContent = `${location.footTrafficScore}/100`;
  }
  
  // Street View
  updateStreetView(location);
  
  // Vending Status
  updateVendingStatus(location);
  
  // Owner Section
  updateOwnerSection(location);
  
  // Traffic Numbers
  const visitorsEl = document.getElementById('detailDailyVisitors');
  if (visitorsEl) {
    visitorsEl.textContent = formatVisitors(location.estimatedVisitors);
  }
  
  const explanationEl = document.getElementById('detailTrafficExplanation');
  if (explanationEl) {
    explanationEl.textContent = generateTrafficExplanation(location);
  }
  
  // Demographics
  updateDemographics(location);
  
  // Description
  const descriptionEl = document.getElementById('detailDescription');
  if (descriptionEl) {
    descriptionEl.textContent = location.description || 
      'This location shows potential for vending machine placement based on foot traffic analysis and nearby anchor businesses.';
  }
  
  // Quick Stats
  const distanceEl = document.getElementById('detailDistance');
  if (distanceEl) {
    distanceEl.textContent = formatDistance(location.distance);
  }
  
  const nearbyEl = document.getElementById('detailNearbyCount');
  if (nearbyEl) {
    nearbyEl.textContent = location.nearbyHighTraffic || 0;
  }
  
  const peakHoursEl = document.getElementById('detailPeakHours');
  if (peakHoursEl) {
    peakHoursEl.textContent = location.peakHours || '9am-6pm';
  }
  
  const bestProductsEl = document.getElementById('detailBestProducts');
  if (bestProductsEl) {
    bestProductsEl.textContent = location.bestProducts || 'Snacks, Drinks';
  }

  // Update ROI Calculator
  updateCalculatorForLocation(location);
  
  // Update Saved Locations Panel
  updateSavedPanelForLocation(location);
  
  // Update Revenue Predictions
  updateRevenuePredictions(location);
  
  // Update Product Recommendations
  updateProductRecommendations(location);
  
  // Update Competitive Analysis (if we have all locations)
  const allLocations = cachedResults;
  if (allLocations.length > 0) {
    updateCompetitiveAnalysis(location, allLocations);
  }
}

function updateCompetitiveAnalysis (location, allLocations) {
  const container = document.getElementById('competitiveAnalysis');
  if (!container) return;
  
  try {
    const analysis = analyzeCompetition(location, allLocations);
    
    container.innerHTML = `
      <div class="competitive-stats">
        <div class="competitive-stat">
          <span class="stat-label">Competitors Nearby</span>
          <span class="stat-value">${analysis.competitorCount}</span>
        </div>
        <div class="competitive-stat">
          <span class="stat-label">Market Saturation</span>
          <span class="stat-value saturation-${analysis.saturationLevel.level}">${analysis.saturationLevel.description}</span>
        </div>
        <div class="competitive-stat">
          <span class="stat-label">Positioning</span>
          <span class="stat-value">${analysis.positioning.position.replace('_', ' ')}</span>
        </div>
      </div>
      <div class="competitive-positioning">
        <h4>${analysis.positioning.description}</h4>
        <p>${analysis.positioning.advantage}</p>
      </div>
      ${analysis.gaps.length > 0 ? `
        <div class="competitive-gaps">
          <h4>Market Gaps</h4>
          <ul>
            ${analysis.gaps.map(gap => `
              <li class="gap-${gap.opportunity}">${gap.description}</li>
            `).join('')}
          </ul>
        </div>
      ` : ''}
      ${analysis.recommendations.length > 0 ? `
        <div class="competitive-recommendations">
          <h4>Recommendations</h4>
          <ul>
            ${analysis.recommendations.map(rec => `
              <li class="rec-${rec.priority}">${rec.text}</li>
            `).join('')}
          </ul>
        </div>
      ` : ''}
    `;
  } catch (error) {
    console.error('Competitive analysis error:', error);
  }
}

function updateRevenuePredictions (location) {
  const container = document.getElementById('revenuePredictions');
  if (!container) return;
  
  try {
    const predictions = predictRevenue(location);
    
    container.innerHTML = `
      <div class="revenue-ranges">
        <div class="revenue-range conservative">
          <span class="range-label">Conservative</span>
          <span class="range-value">$${predictions.conservative.monthly.toLocaleString()}/mo</span>
          <span class="range-annual">$${predictions.conservative.annual.toLocaleString()}/yr</span>
        </div>
        <div class="revenue-range realistic">
          <span class="range-label">Realistic</span>
          <span class="range-value">$${predictions.realistic.monthly.toLocaleString()}/mo</span>
          <span class="range-annual">$${predictions.realistic.annual.toLocaleString()}/yr</span>
        </div>
        <div class="revenue-range optimistic">
          <span class="range-label">Optimistic</span>
          <span class="range-value">$${predictions.optimistic.monthly.toLocaleString()}/mo</span>
          <span class="range-annual">$${predictions.optimistic.annual.toLocaleString()}/yr</span>
        </div>
      </div>
      <div class="revenue-details">
        <div class="revenue-detail-item">
          <span class="detail-label">Payback Period:</span>
          <span class="detail-value">${predictions.paybackPeriod.months} months (${predictions.paybackPeriod.years} years)</span>
        </div>
        <div class="revenue-detail-item">
          <span class="detail-label">Break-Even Revenue:</span>
          <span class="detail-value">$${predictions.breakEven.monthlyRevenue.toLocaleString()}/month</span>
        </div>
        <div class="revenue-detail-item">
          <span class="detail-label">Confidence:</span>
          <span class="detail-value">${predictions.confidence}%</span>
        </div>
      </div>
      ${predictions.factors.length > 0 ? `
        <div class="revenue-factors">
          <h4>Key Factors</h4>
          <ul>
            ${predictions.factors.map(factor => `
              <li class="factor-${factor.type}">${factor.text}</li>
            `).join('')}
          </ul>
        </div>
      ` : ''}
    `;
  } catch (error) {
    console.error('Revenue prediction error:', error);
    container.innerHTML = '<p class="text-muted">Unable to generate revenue predictions</p>';
  }
}

function updateProductRecommendations (location) {
  const container = document.getElementById('productRecommendations');
  if (!container) return;
  
  try {
    const recommendations = recommendProducts(location);
    
    if (recommendations.length === 0) {
      container.innerHTML = '<p class="text-muted">No product recommendations available</p>';
      return;
    }
    
    container.innerHTML = `
      <div class="product-recommendations-list">
        ${recommendations.slice(0, 5).map(rec => `
          <div class="product-recommendation-item">
            <div class="product-header">
              <span class="product-name">${rec.name}</span>
              <span class="product-score">Score: ${rec.score}</span>
            </div>
            <div class="product-details">
              <span class="product-detail">Margin: ${(rec.margin * 100).toFixed(0)}%</span>
              <span class="product-detail">Est. Monthly: $${rec.estimatedMonthlyRevenue.toLocaleString()}</span>
              <span class="product-detail">Est. Profit: $${rec.estimatedMonthlyProfit.toLocaleString()}</span>
            </div>
            <p class="product-recommendation">${rec.recommendation}</p>
          </div>
        `).join('')}
      </div>
    `;
  } catch (error) {
    console.error('Product recommendation error:', error);
    container.innerHTML = '<p class="text-muted">Unable to generate product recommendations</p>';
  }
}

export function selectLocation (index) {
  if (index < 0 || index >= cachedResults.length) return;
  currentSelection = index;
  const cards = listEl?.querySelectorAll('.result-card') || [];
  cards.forEach((card, idx) => {
    if (idx === index) {
      card.classList.add('active');
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      card.classList.remove('active');
    }
  });
  updateDetailPanel(cachedResults[index]);
}

export function renderResults (results = []) {
  cachedResults = results;
  currentSelection = -1;
  
  // Hide detail panel when rendering new results
  hideDetailPanel();
  
  if (!listEl) return;
  listEl.innerHTML = '';
  if (!results.length) {
    listEl.innerHTML = '<p class="result-empty">No locations found.</p>';
    return;
  }
  results.forEach((location, index) => {
    listEl.appendChild(renderCard(location, index));
  });
  // Auto-select first result to show panel
  selectLocation(0);
}

export function clearResults () {
  cachedResults = [];
  currentSelection = -1;
  if (listEl) {
    listEl.innerHTML = '<p class="result-empty">Run a search to see opportunities.</p>';
  }
  hideDetailPanel();
}
