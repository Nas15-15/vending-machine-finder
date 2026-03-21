const STORAGE_KEY = 'vmfActiveEmail';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function sanitizeEmail(value = '') {
  const normalized = value.trim().toLowerCase();
  return emailRegex.test(normalized) ? normalized : '';
}

export function getStoredEmail() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) || '';
    return sanitizeEmail(raw);
  } catch {
    return '';
  }
}

export function setStoredEmail(value) {
  const normalized = sanitizeEmail(value);
  if (!normalized) return '';
  try {
    window.localStorage.setItem(STORAGE_KEY, normalized);
  } catch {
    // ignore storage errors
  }
  return normalized;
}

export function clearStoredEmail() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

export function bindEmailInput(input) {
  if (!input) return;
  const existing = getStoredEmail();
  if (existing) {
    input.value = existing;
  }
  input.addEventListener('blur', () => {
    setStoredEmail(input.value);
  });
}




















