import { bindEmailInput, setStoredEmail } from '../state/email.js';
import { showToast, attachGlobalErrorHandler } from '../ui/notifications.js';
import { apiPost } from '../api/client.js';

document.addEventListener('DOMContentLoaded', () => {
    attachGlobalErrorHandler();
    const form = document.getElementById('loginForm');
    const submitBtn = document.getElementById('loginSubmit');
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
        btnText.textContent = 'Signing in…';
        try {
            const email = emailInput.value.trim();

            // Call the login API to create a session
            const response = await apiPost('/api/login-email', { email });

            if (response.success) {
                // Store the email locally as well
                setStoredEmail(email);
                successBanner?.classList.remove('hidden');
                showToast('Logged in successfully!', 'success');
                // Redirect to home page
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 1000);
            } else {
                throw new Error(response.error || 'Login failed');
            }
        } catch (error) {
            showToast(error.message || 'Could not log in.', 'error');
            submitBtn.disabled = false;
            btnText.textContent = 'Continue';
        }
    });
});
