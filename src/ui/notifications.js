const DEFAULT_DURATION = 4000;

export function showToast (message, variant = 'info', duration = DEFAULT_DURATION) {
  let container = document.getElementById('vmfToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'vmfToastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${variant}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

export function attachGlobalErrorHandler () {
  window.addEventListener('unhandledrejection', (event) => {
    console.error(event.reason);
    showToast(event.reason?.message || 'Something went wrong', 'error');
  });
}




















