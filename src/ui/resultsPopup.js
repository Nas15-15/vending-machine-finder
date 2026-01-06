import { showToast } from './notifications.js';

let currentPopup = null;

function createConfetti() {
  const colors = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444'];
  const confettiCount = 50;
  
  for (let i = 0; i < confettiCount; i++) {
    const confetti = document.createElement('div');
    confetti.style.position = 'fixed';
    confetti.style.width = `${Math.random() * 10 + 5}px`;
    confetti.style.height = `${Math.random() * 10 + 5}px`;
    confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    confetti.style.left = `${Math.random() * 100}%`;
    confetti.style.top = '-10px';
    confetti.style.zIndex = '10002';
    confetti.style.pointerEvents = 'none';
    confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
    confetti.style.opacity = '0.9';
    
    const angle = Math.random() * Math.PI * 2;
    const velocity = Math.random() * 300 + 200;
    const rotation = Math.random() * 720 - 360;
    
    document.body.appendChild(confetti);
    
    const duration = Math.random() * 2000 + 2000;
    confetti.animate([
      {
        transform: `translate(0, 0) rotate(0deg)`,
        opacity: 1
      },
      {
        transform: `translate(${Math.cos(angle) * velocity}px, ${Math.sin(angle) * velocity + window.innerHeight}px) rotate(${rotation}deg)`,
        opacity: 0
      }
    ], {
      duration: duration,
      easing: 'cubic-bezier(0.5, 0, 0.5, 1)'
    }).onfinish = () => confetti.remove();
  }
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatVisitors(count) {
  if (!Number.isFinite(count)) return '—';
  return count.toLocaleString();
}

function getScoreColor(score) {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#3b82f6';
  if (score >= 40) return '#f59e0b';
  return '#ef4444';
}

function createLocationCard(location, index) {
  const card = document.createElement('div');
  card.className = 'popup-location-card';
  card.style.animationDelay = `${index * 0.05}s`;
  
  const scoreColor = getScoreColor(location.overallScore);
  
  card.innerHTML = `
    <div class="popup-card-header">
      <div class="popup-rank-badge" style="background: ${scoreColor}">
        #${index + 1}
      </div>
      <div class="popup-card-title">
        <h4>${location.name || location.displayCategory || 'Untitled location'}</h4>
        <p class="popup-card-address">${location.address || 'Address unavailable'}</p>
      </div>
    </div>
    <div class="popup-card-stats">
      <div class="popup-stat">
        <span class="popup-stat-label">Score</span>
        <span class="popup-stat-value" style="color: ${scoreColor}">
          ${location.overallScore}/100
        </span>
      </div>
      <div class="popup-stat">
        <span class="popup-stat-label">Traffic</span>
        <span class="popup-stat-value">${location.footTrafficScore}/100</span>
      </div>
      <div class="popup-stat">
        <span class="popup-stat-label">Visitors/day</span>
        <span class="popup-stat-value">${formatVisitors(location.estimatedVisitors)}</span>
      </div>
      <div class="popup-stat">
        <span class="popup-stat-label">Distance</span>
        <span class="popup-stat-value">${formatDistance(location.distance)}</span>
      </div>
    </div>
    <div class="popup-card-footer">
      <span class="popup-category-badge">${location.displayCategory || location.category || 'Other'}</span>
      ${location.nearbyHighTraffic > 0 ? `<span class="popup-anchor-badge">${location.nearbyHighTraffic} nearby anchors</span>` : ''}
    </div>
  `;
  
  return card;
}

export function showResultsPopup(locations = []) {
  // Remove existing popup if any
  if (currentPopup) {
    currentPopup.remove();
  }
  
  if (!locations || locations.length === 0) {
    showToast('No locations found', 'error');
    return;
  }
  
  // Create confetti effect
  createConfetti();
  
  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'results-popup-overlay';
  overlay.id = 'resultsPopupOverlay';
  
  // Create popup content
  const popup = document.createElement('div');
  popup.className = 'results-popup-content';
  
  const topLocations = locations.slice(0, 10); // Show top 10
  
  popup.innerHTML = `
    <div class="popup-header">
      <div class="popup-success-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
      </div>
      <h2 class="popup-title">🎉 Amazing! We Found ${locations.length} Hot Spots!</h2>
      <p class="popup-subtitle">Here are the top ${topLocations.length} locations ranked by potential</p>
    </div>
    
    <div class="popup-locations-grid" id="popupLocationsGrid">
      ${topLocations.map((location, index) => createLocationCard(location, index).outerHTML).join('')}
    </div>
    
    <div class="popup-footer">
      <button class="popup-view-all-btn" id="popupViewAllBtn">
        View All ${locations.length} Locations
      </button>
      <button class="popup-close-btn" id="popupCloseBtn">
        Close
      </button>
    </div>
  `;
  
  overlay.appendChild(popup);
  document.body.appendChild(overlay);
  currentPopup = overlay;
  
  // Trigger animations
  requestAnimationFrame(() => {
    overlay.classList.add('show');
    popup.classList.add('show');
    
    // Animate location cards
    const cards = popup.querySelectorAll('.popup-location-card');
    cards.forEach((card, index) => {
      setTimeout(() => {
        card.classList.add('animate-in');
      }, index * 50);
    });
  });
  
  // Close button handler
  const closeBtn = popup.querySelector('#popupCloseBtn');
  closeBtn.addEventListener('click', () => {
    hideResultsPopup();
  });
  
  // View all button handler
  const viewAllBtn = popup.querySelector('#popupViewAllBtn');
  viewAllBtn.addEventListener('click', () => {
    hideResultsPopup();
    // Scroll to results section
    const resultsSection = document.getElementById('resultsSection');
    if (resultsSection) {
      resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => {
        resultsSection.classList.remove('hidden');
      }, 300);
    }
  });
  
  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      hideResultsPopup();
    }
  });
  
  // Close on Escape key
  const escapeHandler = (e) => {
    if (e.key === 'Escape') {
      hideResultsPopup();
      document.removeEventListener('keydown', escapeHandler);
    }
  };
  document.addEventListener('keydown', escapeHandler);
}

export function hideResultsPopup() {
  if (currentPopup) {
    currentPopup.classList.remove('show');
    const popup = currentPopup.querySelector('.results-popup-content');
    if (popup) {
      popup.classList.remove('show');
    }
    setTimeout(() => {
      if (currentPopup && currentPopup.parentNode) {
        currentPopup.remove();
      }
      currentPopup = null;
    }, 300);
  }
}



















