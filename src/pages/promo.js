import { apiPost } from '../api/client.js';
import { getStoredEmail, setStoredEmail } from '../state/email.js';
import { showToast, attachGlobalErrorHandler } from '../ui/notifications.js';

document.addEventListener('DOMContentLoaded', () => {
  attachGlobalErrorHandler();
  const form = document.getElementById('promoRedeemForm');
  const statusEl = document.getElementById('promoStatusMessage');
  const countEl = document.getElementById('promoFreeCount');
  const captionEl = document.getElementById('promoFreeCaption');

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const codeInput = document.getElementById('promoPageInput');
    const emailInput = document.getElementById('promoEmailInput');
    const email = (emailInput?.value || getStoredEmail()).trim();
    const code = codeInput?.value.trim();
    if (!email || !code) {
      statusEl.textContent = 'Email and promo code are required.';
      statusEl.className = 'promo-status error';
      return;
    }
    statusEl.textContent = 'Validating promo…';
    statusEl.className = 'promo-status progress';
    try {
      const result = await apiPost('/api/promo/redeem', { email, code });
      statusEl.textContent = result.message || 'Promo applied!';
      statusEl.className = 'promo-status success';
      setStoredEmail(email);
      if (result.type === 'free_search') {
        countEl.textContent = '1';
        captionEl.textContent = 'One extra free search unlocked';
      } else if (result.type === 'day_access') {
        captionEl.textContent = '24 hour pass active';
        const dayStatus = document.getElementById('promoDayStatus');
        if (dayStatus) {
          dayStatus.textContent = 'Day pass active';
        }
      } else {
        captionEl.textContent = 'Full access enabled';
      }
      showToast(statusEl.textContent, 'success');
    } catch (error) {
      statusEl.textContent = error.message || 'Promo failed.';
      statusEl.className = 'promo-status error';
    }
  });
});


