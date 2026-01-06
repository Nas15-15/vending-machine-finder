import { apiPost, apiGet } from '../api/client.js';
import { getStoredEmail, sanitizeEmail, setStoredEmail } from '../state/email.js';
import { invalidateAccessCache } from '../state/access.js';
import { showToast } from './notifications.js';

const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';

const overlay = document.getElementById('paywallOverlay');
const blurOverlay = document.getElementById('blurOverlay');
let stripeClient = null;

function getStripeClient () {
  if (!STRIPE_PUBLISHABLE_KEY) return null;
  if (typeof window === 'undefined' || typeof window.Stripe !== 'function') return null;
  if (!stripeClient) {
    stripeClient = window.Stripe(STRIPE_PUBLISHABLE_KEY);
  }
  return stripeClient;
}

function toggleElement (element, visible) {
  if (!element) return;
  if (visible) {
    element.classList.remove('hidden');
    element.style.display = 'flex';
  } else {
    element.classList.add('hidden');
    element.style.display = 'none';
  }
}

export function showPaywall () {
  toggleElement(overlay, true);
}

export function hidePaywall () {
  toggleElement(overlay, false);
}

export function showBlurOverlay () {
  toggleElement(blurOverlay, true);
}

export function hideBlurOverlay () {
  toggleElement(blurOverlay, false);
}

async function handleCheckout (event) {
  event.preventDefault();
  const emailInput = document.getElementById('checkoutEmail');
  const status = document.getElementById('cardCheckoutStatus');
  const btn = event.currentTarget;
  const email = sanitizeEmail(emailInput?.value || getStoredEmail());
  if (!email) {
    status.textContent = 'Enter a valid email.';
    status.className = 'card-status error';
    emailInput?.focus();
    return;
  }
  status.textContent = 'Creating checkout session…';
  status.className = 'card-status progress';
  btn.disabled = true;
  try {
    const session = await apiPost('/api/create-checkout-session', { email });
    setStoredEmail(email);
    const stripe = getStripeClient();
    if (stripe) {
      const { error } = await stripe.redirectToCheckout({ sessionId: session.id });
      if (error) {
        throw new Error(error.message);
      }
    } else if (session.url) {
      window.location.href = session.url;
    } else {
      throw new Error('Stripe.js unavailable. Refresh and try again.');
    }
  } catch (error) {
    status.textContent = error.message || 'Failed to start checkout.';
    status.className = 'card-status error';
    btn.disabled = false;
  }
}

async function handlePromoSubmit (event) {
  event.preventDefault();
  const input = document.getElementById('promoCodeInput');
  const status = document.getElementById('promoStatus');
  const email = sanitizeEmail(document.getElementById('checkoutEmail')?.value || getStoredEmail());
  if (!email) {
    status.textContent = 'Add your email so we can apply the promo.';
    status.className = 'promo-status error';
    return;
  }
  const code = (input?.value || '').trim();
  if (!code) {
    status.textContent = 'Enter a promo code.';
    status.className = 'promo-status error';
    return;
  }
  status.textContent = 'Checking promo code…';
  status.className = 'promo-status progress';
  try {
    const result = await apiPost('/api/promo/redeem', { email, code });
    status.textContent = result.message || 'Promo applied!';
    status.className = 'promo-status success';
    setStoredEmail(email);
    invalidateAccessCache(email);
    showToast('Promo applied. Try your search again.', 'success');
    hidePaywall();
  } catch (error) {
    status.textContent = error.message || 'Promo failed.';
    status.className = 'promo-status error';
  }
}

export function initPaywallControls () {
  const cardBtn = document.getElementById('cardCheckoutBtn');
  const promoBtn = document.getElementById('promoSubmitBtn');
  const closeBtn = document.querySelector('.close-paywall');
  const overlayBackground = document.getElementById('paywallOverlay');
  if (cardBtn) {
    cardBtn.addEventListener('click', handleCheckout);
  }
  if (promoBtn) {
    promoBtn.addEventListener('click', handlePromoSubmit);
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', hidePaywall);
  }
  if (overlayBackground) {
    overlayBackground.addEventListener('click', (event) => {
      if (event.target === overlayBackground) {
        hidePaywall();
      }
    });
  }
}


