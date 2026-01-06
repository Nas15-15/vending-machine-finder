import { apiGet, withQuery } from '../api/client.js';
import { setStoredEmail } from '../state/email.js';
import { attachGlobalErrorHandler, showToast } from '../ui/notifications.js';

const statusChip = document.getElementById('successStatus');
const successCopy = document.getElementById('successCopy');
const returnBtn = document.getElementById('returnBtn');

const setStatus = (message, variant = 'progress') => {
  statusChip.textContent = message;
  statusChip.classList.remove('success', 'error', 'progress');
  statusChip.classList.add(variant);
};

async function fetchCheckoutSession (sessionId) {
  return apiGet(`/api/checkout-session?sessionId=${encodeURIComponent(sessionId)}`);
}

async function pollAccessStatus (email, maxAttempts = 10, delayMs = 2000) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const status = await apiGet(withQuery('/api/access-status', { email }));
      if (status.hasAccess) {
        return status;
      }
      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      console.error('Error polling access status:', error);
      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  return null;
}

async function hydrateAccess () {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session_id');
  if (!sessionId) {
    setStatus('Missing checkout session.', 'error');
    successCopy.textContent = 'We could not locate your payment session. Contact support if you were charged.';
    returnBtn.disabled = false;
    return;
  }
  try {
    setStatus('Confirming payment with Stripe…', 'progress');
    const session = await fetchCheckoutSession(sessionId);
    if (session.payment_status !== 'paid') {
      setStatus('Payment not completed.', 'error');
      successCopy.textContent = 'We could not confirm your payment. If funds were taken, reach out to support.';
      returnBtn.disabled = false;
      return;
    }
    const email = session.email;
    if (!email) {
      setStatus('Email not found in session.', 'error');
      successCopy.textContent = 'We could not identify your account. Contact support with your checkout session ID.';
      returnBtn.disabled = false;
      return;
    }
    setStoredEmail(email);
    setStatus('Verifying access unlock…', 'progress');
    successCopy.textContent = 'Waiting for payment processing to complete…';
    const accessStatus = await pollAccessStatus(email);
    if (accessStatus?.hasAccess) {
      setStatus('Payment verified!', 'success');
      successCopy.textContent = 'Your account now has unlimited searches. Click below to return to the finder.';
      showToast('Payment verified. You now have full access.', 'success');
    } else {
      setStatus('Payment processed, verifying access…', 'progress');
      successCopy.textContent = 'Your payment was received. Access may take a few moments to activate. You can return to the finder and try again.';
      showToast('Payment received. Access should activate shortly.', 'success');
    }
  } catch (error) {
    console.error(error);
    setStatus('Could not verify payment.', 'error');
    successCopy.textContent = error.message || 'Please refresh this page or email support with your checkout session ID.';
  } finally {
    returnBtn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  attachGlobalErrorHandler();
  hydrateAccess();
  returnBtn?.addEventListener('click', () => {
    window.location.href = 'index.html';
  });
});


