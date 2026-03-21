import { apiGet, withQuery } from '../api/client.js';
import { getStoredEmail, sanitizeEmail } from './email.js';

let sessionCache = null;
const accessCache = new Map();

export async function loadSession() {
  if (sessionCache) return sessionCache;
  sessionCache = await apiGet('/api/session').catch(() => ({ active: false }));
  return sessionCache;
}

export async function refreshSession() {
  sessionCache = null;
  return loadSession();
}

export function clearSessionCache() {
  sessionCache = null;
}

export async function fetchAccessStatus(email = getStoredEmail()) {
  const normalized = sanitizeEmail(email);
  if (!normalized) {
    return {
      hasAccess: false,
      freeSearchesRemaining: 0,
      owner: false
    };
  }
  if (accessCache.has(normalized)) {
    return accessCache.get(normalized);
  }
  const data = await apiGet(withQuery('/api/access-status', { email: normalized }));
  accessCache.set(normalized, data);
  setTimeout(() => accessCache.delete(normalized), 60 * 1000);
  return data;
}

export function invalidateAccessCache(email = getStoredEmail()) {
  const normalized = sanitizeEmail(email);
  if (normalized) {
    accessCache.delete(normalized);
  }
}




















