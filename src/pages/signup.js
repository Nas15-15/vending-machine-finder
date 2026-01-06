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
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';
    try {
      const payload = Object.fromEntries(new FormData(form).entries());
      const result = await apiPost('/api/waitlist', payload);
      setStoredEmail(payload.email);
      form.reset();
      successBanner?.classList.remove('hidden');
      showToast(`Account created and logged in! You have ${result.freeSearchesGranted || 25} free searches.`, 'success');
      // Redirect to home page immediately since user is now logged in
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 1500);
    } catch (error) {
      showToast(error.message || 'Could not create account.', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create my account';
    }
  });
});


