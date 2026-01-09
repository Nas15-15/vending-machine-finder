import { apiPost } from '../api/client.js';
import { bindEmailInput, setStoredEmail } from '../state/email.js';
import { showToast, attachGlobalErrorHandler } from '../ui/notifications.js';

document.addEventListener('DOMContentLoaded', () => {
  attachGlobalErrorHandler();
  const form = document.getElementById('insiderForm');
  const submitBtn = document.getElementById('insiderSubmit');
  const successBanner = document.getElementById('formSuccess');
  const emailInput = document.getElementById('email');
  bindEmailInput(emailInput);

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const btnText = submitBtn.querySelector('span') || submitBtn;
    submitBtn.disabled = true;
    btnText.textContent = 'Creating account…';
    try {
      const payload = Object.fromEntries(new FormData(form).entries());
      const result = await apiPost('/api/waitlist', payload);
      setStoredEmail(payload.email);
      form.reset();
      successBanner?.classList.remove('hidden');

      // Show different message for new vs existing accounts
      if (result.isNewAccount) {
        showToast(`Account created! You have ${result.freeSearchesGranted || 25} free searches.`, 'success');
      } else {
        showToast(`Welcome back! You have ${result.freeSearchesRemaining || 0} searches remaining.`, 'success');
      }

      // Redirect to home page
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 1500);
    } catch (error) {
      showToast(error.message || 'Could not create account.', 'error');
      submitBtn.disabled = false;
      btnText.textContent = 'Get started free';
    }
  });
});


