import { apiPost } from '../api/client.js';
import { bindEmailInput, getStoredEmail, setStoredEmail } from '../state/email.js';
import { showToast, attachGlobalErrorHandler } from '../ui/notifications.js';

document.addEventListener('DOMContentLoaded', () => {
  attachGlobalErrorHandler();
  const form = document.getElementById('loginForm');
  const submitBtn = document.getElementById('loginSubmit');
  const messageBox = document.getElementById('loginMessage');
  const emailInput = document.getElementById('loginEmail');
  bindEmailInput(emailInput);
  if (emailInput && !emailInput.value) {
    emailInput.value = getStoredEmail();
  }

  // Password toggle functionality
  const passwordInput = document.getElementById('accessCode');
  const togglePasswordBtn = document.getElementById('togglePassword');
  const toggleIcon = togglePasswordBtn?.querySelector('.password-toggle-icon');

  togglePasswordBtn?.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    
    if (toggleIcon) {
      toggleIcon.textContent = isPassword ? 'Hide' : 'Show';
    }
    
    togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
    togglePasswordBtn.setAttribute('aria-pressed', isPassword ? 'true' : 'false');
  });

  const setStatus = (text, variant = 'success') => {
    if (!messageBox) return;
    messageBox.textContent = text;
    messageBox.className = `login-message ${variant}`;
    messageBox.classList.remove('hidden');
  };

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    messageBox?.classList.add('hidden');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Authenticating…';
    try {
      const payload = new FormData(form);
      const email = payload.get('email');
      const accessCode = payload.get('accessCode');
      const result = await apiPost('/api/login', { email, accessCode });
      setStoredEmail(result.email);
      setStatus('Access granted! Redirecting…', 'success');
      showToast('Logged in successfully', 'success');
      setTimeout(() => {
        window.location.href = result.role === 'owner' ? 'owner-control-center.html' : 'index.html';
      }, 600);
    } catch (error) {
      setStatus(error.message || 'Login failed.', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Log In';
    }
  });
});


