const API_BASE_URL = window.__APP_CONFIG__?.API_BASE_URL || 'http://localhost:4242';

const statusChip = document.getElementById('successStatus');
const successCopy = document.getElementById('successCopy');
const returnBtn = document.getElementById('returnBtn');

const updateStatus = (message, variant = 'progress') => {
    statusChip.textContent = message;
    statusChip.classList.remove('success', 'error');
    if (variant === 'success') {
        statusChip.style.background = '#ecfdf5';
        statusChip.style.color = '#065f46';
    } else if (variant === 'error') {
        statusChip.style.background = '#fef2f2';
        statusChip.style.color = '#b91c1c';
    } else {
        statusChip.style.background = '#eef2ff';
        statusChip.style.color = '#3730a3';
    }
};

const recordAccessUpgrade = (email, sessionId) => {
    const upgrades = JSON.parse(localStorage.getItem('accessUpgrades') || '[]');
    upgrades.push({
        method: 'paid',
        email,
        sessionId,
        timestamp: new Date().toISOString()
    });
    localStorage.setItem('accessUpgrades', JSON.stringify(upgrades));
};

const applyPaidAccess = (email, sessionId) => {
    localStorage.setItem('paidAccess', 'true');
    localStorage.setItem('promoUsed', 'true');
    localStorage.setItem('freeUses', '1');
    localStorage.setItem('activeUserEmail', email);
    recordAccessUpgrade(email, sessionId);
};

const fetchSession = async (sessionId) => {
    const response = await fetch(`${API_BASE_URL}/api/checkout-session?sessionId=${encodeURIComponent(sessionId)}`);
    if (!response.ok) {
        throw new Error('Unable to verify session');
    }
    return response.json();
};

const hydrateAccess = async () => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');

    if (!sessionId) {
        updateStatus('Missing checkout session.', 'error');
        successCopy.textContent = 'We could not find your payment session. Please contact support or try again.';
        returnBtn.disabled = false;
        return;
    }

    try {
        updateStatus('Confirming payment with Stripe…');
        const session = await fetchSession(sessionId);
        if (session.payment_status === 'paid' && session.email) {
            applyPaidAccess(session.email.toLowerCase(), session.id);
            updateStatus('Payment verified!', 'success');
            successCopy.textContent = 'Your account now has unlimited searches. Click below to jump back into the finder.';
            returnBtn.disabled = false;
            return;
        }

        updateStatus('Payment not completed.', 'error');
        successCopy.textContent = 'We could not confirm your payment. If funds were captured, please reach out so we can help.';
        returnBtn.disabled = false;
    } catch (error) {
        console.error(error);
        updateStatus('Could not verify payment.', 'error');
        successCopy.textContent = 'Please refresh this page or email support with your checkout session ID so we can assist.';
        returnBtn.disabled = false;
    }
};

returnBtn.addEventListener('click', () => {
    window.location.href = 'index.html';
});

hydrateAccess();

