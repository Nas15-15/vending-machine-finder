import 'leaflet/dist/leaflet.css';

import { initMap } from '../ui/map.js';
import { initSearchForm } from '../features/search.js';
import { initPaywallControls, hidePaywall, hideBlurOverlay } from '../ui/paywall.js';
import { attachGlobalErrorHandler, showToast } from '../ui/notifications.js';
import { bindEmailInput, getStoredEmail } from '../state/email.js';
import { loadSession } from '../state/access.js';
import { initROICalculator } from '../ui/roiCalculator.js';
import { initComparisonTool } from '../ui/comparisonTool.js';
import { initExportPanel, setExportLocations } from '../ui/exportPanel.js';
import { initSavedLocationsPanel } from '../ui/savedLocationsPanel.js';
import { initAdvancedFilters, getFilters } from '../ui/advancedFilters.js';

function initOwnerPreview () {
  const ownerLink = document.getElementById('ownerControlLink');
  if (!ownerLink) return;
  ownerLink.addEventListener('click', async (event) => {
    event.preventDefault();
    const session = await loadSession();
    if (!session?.active || session.role !== 'owner') {
      showToast('Owner access required.', 'error');
      return;
    }
    window.location.href = ownerLink.href;
  });
}

function initLogoutButton () {
  const logoutBtn = document.getElementById('logoutBtn');
  if (!logoutBtn) return;
  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    showToast('Signed out', 'success');
    window.location.reload();
  });
}

async function hydrateSessionUi () {
  const profileMenu = document.getElementById('profileMenuContainer');
  const session = await loadSession();
  if (!session?.active) {
    profileMenu?.classList.add('hidden');
    return;
  }
  profileMenu?.classList.remove('hidden');
  const emailLabel = document.getElementById('profileEmail');
  if (emailLabel) {
    emailLabel.textContent = session.email;
  }
}

function initEmailInputs () {
  const checkoutEmail = document.getElementById('checkoutEmail');
  if (checkoutEmail && !checkoutEmail.value) {
    checkoutEmail.value = getStoredEmail();
  }
  bindEmailInput(document.getElementById('searchEmailInput'));
  bindEmailInput(checkoutEmail);
}

function initBlurUnlockButton () {
  const unlockBtn = document.querySelector('.unlock-btn');
  unlockBtn?.addEventListener('click', () => {
    hideBlurOverlay();
    hidePaywall();
    const paywallBtn = document.getElementById('cardCheckoutBtn');
    paywallBtn?.focus();
  });
}

function initStartSearchBtn () {
  const startBtn = document.getElementById('startSearchBtn');
  startBtn?.addEventListener('click', () => {
    document.getElementById('locationInput')?.focus();
  });
}

function initHeroCtas () {
  const ctaRow = document.querySelector('.cta-button-row');
  loadSession().then((session) => {
    if (session?.active) {
      ctaRow?.classList.add('hidden');
    }
  });
}

// Advanced Scroll Animation System
let scrollAnimationFrame = null;
let lastScrollY = 0;
let ticking = false;

function getScrollProgress(element) {
  const rect = element.getBoundingClientRect();
  const windowHeight = window.innerHeight;
  const elementTop = rect.top;
  const elementHeight = rect.height;
  
  // Calculate progress: 0 when element is below viewport, 1 when above, 0-1 when in viewport
  let progress = 0;
  
  if (elementTop < windowHeight && elementTop + elementHeight > 0) {
    // Element is in viewport - make it appear earlier
    // Start revealing when element is 80% down the viewport
    const revealStartPoint = windowHeight * 0.8;
    const revealEndPoint = windowHeight * 0.2;
    
    if (elementTop < revealStartPoint) {
      // Element has entered the reveal zone
      if (elementTop < revealEndPoint) {
        // Fully visible
        progress = 1;
      } else {
        // Calculate progress based on position
        progress = Math.max(0, Math.min(1, (revealStartPoint - elementTop) / (revealStartPoint - revealEndPoint)));
      }
    } else {
      // Element is entering viewport but not in reveal zone yet
      progress = Math.max(0, (revealStartPoint - elementTop) / (windowHeight * 0.2));
    }
  } else if (elementTop + elementHeight <= 0) {
    // Element is above viewport
    progress = 1;
  } else if (elementTop >= windowHeight) {
    // Element is below viewport - start showing it slightly
    const distanceBelow = elementTop - windowHeight;
    const maxDistance = windowHeight * 0.5; // Start revealing when 50% of viewport away
    progress = Math.max(0, 1 - (distanceBelow / maxDistance));
  }
  
  return progress;
}

function applyParallaxEffect(element, progress) {
  const parallaxSpeed = parseFloat(element.dataset.parallaxSpeed) || 0.5;
  const offset = (1 - progress) * 100 * parallaxSpeed;
  element.style.transform = `translateY(${offset}px)`;
}

function applyProgressiveReveal(element, progress) {
  const startThreshold = parseFloat(element.dataset.revealStart) || 0.1;
  const endThreshold = parseFloat(element.dataset.revealEnd) || 0.4;
  
  if (progress < startThreshold) {
    element.style.opacity = '0';
    element.style.transform = 'translateY(30px) scale(0.95)';
  } else if (progress > endThreshold) {
    element.style.opacity = '1';
    element.style.transform = 'translateY(0) scale(1)';
  } else {
    const revealProgress = (progress - startThreshold) / (endThreshold - startThreshold);
    // Ensure minimum opacity of 0.3 for visibility
    const opacity = Math.max(0.3, revealProgress);
    element.style.opacity = opacity.toString();
    const translateY = 30 * (1 - revealProgress);
    const scale = 0.95 + (0.05 * revealProgress);
    element.style.transform = `translateY(${translateY}px) scale(${scale})`;
  }
}

function applyStickySection(section, progress) {
  const shouldStick = section.dataset.sticky === 'true';
  if (!shouldStick) return;
  
  const rect = section.getBoundingClientRect();
  const windowHeight = window.innerHeight;
  const stickyThreshold = parseFloat(section.dataset.stickyThreshold) || 0.1;
  
  if (rect.top <= stickyThreshold * windowHeight && rect.bottom > windowHeight) {
    section.classList.add('is-sticky');
  } else {
    section.classList.remove('is-sticky');
  }
}

function animateOnScroll() {
  const scrollY = window.scrollY || window.pageYOffset;
  const deltaY = scrollY - lastScrollY;
  lastScrollY = scrollY;
  
  // Animate feature sections
  const featureSections = document.querySelectorAll('.feature-section');
  featureSections.forEach(section => {
    const progress = getScrollProgress(section);
    
    // Apply sticky behavior
    applyStickySection(section, progress);
    
    // Apply parallax to icons
    const icon = section.querySelector('.feature-icon');
    if (icon) {
      applyParallaxEffect(icon, progress);
    }
    
    // Apply progressive reveal to content - make it appear earlier
    const content = section.querySelector('.feature-section-content');
    if (content) {
      // Use a more aggressive reveal for content
      const contentProgress = Math.min(1, progress * 1.5); // Reveal 1.5x faster
      applyProgressiveReveal(content, contentProgress);
    }
    
    // Apply parallax to text elements - make them appear together
    const textElements = section.querySelectorAll('.feature-text h3, .feature-text > p');
    textElements.forEach((text, index) => {
      // Reduce delay between text elements
      const textProgress = Math.max(0, Math.min(1, progress - (index * 0.05)));
      applyProgressiveReveal(text, textProgress);
    });
  });
  
  // Animate features hero
  const featuresHero = document.querySelector('.features-hero');
  if (featuresHero) {
    const progress = getScrollProgress(featuresHero);
    applyProgressiveReveal(featuresHero, progress);
  }
  
  // Animate CTA section - make it always visible when in viewport
  const featuresCta = document.querySelector('.features-cta');
  if (featuresCta) {
    const progress = getScrollProgress(featuresCta);
    const rect = featuresCta.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    
    // If CTA is in viewport, make it fully visible
    if (rect.top < windowHeight && rect.bottom > 0) {
      featuresCta.style.opacity = '1';
      featuresCta.style.transform = 'translateY(0) scale(1)';
    } else {
      applyProgressiveReveal(featuresCta, progress);
    }
  }
  
  // Animate all scroll-reveal elements
  const revealElements = document.querySelectorAll('.scroll-reveal');
  revealElements.forEach(element => {
    const progress = getScrollProgress(element);
    applyProgressiveReveal(element, progress);
  });
  
  ticking = false;
}

function handleScroll() {
  if (!ticking) {
    window.requestAnimationFrame(animateOnScroll);
    ticking = true;
  }
}

function initScrollReveal() {
  // Set up initial states - check if elements are already in viewport
  const revealElements = document.querySelectorAll('.scroll-reveal');
  revealElements.forEach(element => {
    const rect = element.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    
    // If element is already in viewport on load, make it visible
    if (rect.top < windowHeight && rect.bottom > 0) {
      element.style.opacity = '1';
      element.style.transform = 'translateY(0) scale(1)';
    } else {
      element.style.opacity = '0';
      element.style.transform = 'translateY(30px) scale(0.95)';
    }
    element.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
    element.style.willChange = 'opacity, transform';
  });
  
  // Set up feature sections for parallax
  const featureSections = document.querySelectorAll('.feature-section');
  featureSections.forEach(section => {
    const icon = section.querySelector('.feature-icon');
    if (icon) {
      icon.style.willChange = 'transform';
      icon.style.transition = 'transform 0.1s ease-out';
    }
  });
  
  // Initial animation after a short delay to ensure DOM is ready
  setTimeout(() => {
    animateOnScroll();
  }, 100);
  
  // Listen to scroll events with optimized throttling using requestAnimationFrame
  let rafId = null;
  window.addEventListener('scroll', () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
    }
    rafId = requestAnimationFrame(handleScroll);
  }, { passive: true });
  
  // Also handle resize events for responsive behavior
  let resizeTimeout;
  window.addEventListener('resize', () => {
    if (resizeTimeout) {
      clearTimeout(resizeTimeout);
    }
    resizeTimeout = setTimeout(() => {
      animateOnScroll();
    }, 150);
  }, { passive: true });
  
  // Also use IntersectionObserver for initial load optimization
  const observerOptions = {
    threshold: [0, 0.1, 0.5, 1],
    rootMargin: '0px 0px -50px 0px'
  };
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-viewport');
      } else {
        entry.target.classList.remove('in-viewport');
      }
    });
  }, observerOptions);
  
  revealElements.forEach(element => {
    observer.observe(element);
  });
  
  featureSections.forEach(section => {
    observer.observe(section);
  });
}

function initFeaturesCta () {
  const startSearchBtn = document.getElementById('startSearchFromFeatures');
  if (startSearchBtn) {
    startSearchBtn.addEventListener('click', () => {
      const locationInput = document.getElementById('locationInput');
      if (locationInput) {
        locationInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
          locationInput.focus();
        }, 500);
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  attachGlobalErrorHandler();
  initMap();
  initPaywallControls();
  initSearchForm();
  initHeroCtas();
  initOwnerPreview();
  initLogoutButton();
  initBlurUnlockButton();
  initStartSearchBtn();
  initEmailInputs();
  hydrateSessionUi();
  initROICalculator();
  initComparisonTool();
  initExportPanel();
  initSavedLocationsPanel();
  initAdvancedFilters();
  initScrollReveal();
  initFeaturesCta();
  
  // Listen for filter changes and re-run search if needed
  document.addEventListener('filtersChanged', () => {
    // Filters changed, user can re-run search
  });
});


