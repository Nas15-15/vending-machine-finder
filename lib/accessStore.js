import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'app-store.json');

const DEFAULT_STATE = {
  paid: {},
  promoUsage: {},
  waitlist: [],
  bitcoinVerifications: {},
  loginEvents: [],
  credits: {},
  searchEvents: [],
  anonymousSearches: {},
  bannedAccounts: {},
  suspiciousIPs: {}
};

let mutationQueue = Promise.resolve();

export const normalizeEmail = (email = '') => {
  const trimmed = email.trim().toLowerCase();
  return trimmed || null;
};

async function ensureStore () {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(STORE_PATH);
  } catch {
    await fs.writeFile(STORE_PATH, JSON.stringify(DEFAULT_STATE, null, 2));
  }
}

async function readStore () {
  await ensureStore();
  const raw = await fs.readFile(STORE_PATH, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_STATE,
      ...parsed,
      paid: parsed.paid || {},
      promoUsage: parsed.promoUsage || {},
      waitlist: Array.isArray(parsed.waitlist) ? parsed.waitlist : [],
      bitcoinVerifications: parsed.bitcoinVerifications || {},
      loginEvents: Array.isArray(parsed.loginEvents) ? parsed.loginEvents : [],
      credits: parsed.credits || {},
      searchEvents: Array.isArray(parsed.searchEvents) ? parsed.searchEvents : [],
      anonymousSearches: parsed.anonymousSearches || {},
      bannedAccounts: parsed.bannedAccounts || {},
      suspiciousIPs: parsed.suspiciousIPs || {}
    };
  } catch (error) {
    console.error('Failed to parse store, resetting', error);
    await fs.writeFile(STORE_PATH, JSON.stringify(DEFAULT_STATE, null, 2));
    return DEFAULT_STATE;
  }
}

function enqueueMutation (mutator) {
  mutationQueue = mutationQueue.then(async () => {
    const store = await readStore();
    const result = await mutator(store);
    if (result !== false) {
      await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2));
    }
    return store;
  }).catch((error) => {
    console.error('Store mutation failed', error);
  });
  return mutationQueue;
}

export async function markPaidAccess (email, method, metadata = {}) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  await enqueueMutation((store) => {
    store.paid[normalized] = {
      email: normalized,
      method,
      metadata,
      updatedAt: new Date().toISOString()
    };
  });
  return getAccessRecord(normalized);
}

export async function getAccessRecord (email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const store = await readStore();
  return store.paid[normalized] || null;
}

export async function hasPaidAccess (email) {
  return Boolean(await getAccessRecord(email));
}

export async function recordPromoUsage (email, code) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !code) return;
  await enqueueMutation((store) => {
    if (!store.promoUsage[normalizedEmail]) {
      store.promoUsage[normalizedEmail] = {};
    }
    store.promoUsage[normalizedEmail][code.toUpperCase()] = new Date().toISOString();
  });
}

export async function hasPromoUsage (email, code) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !code) return false;
  const store = await readStore();
  return Boolean(
    store.promoUsage?.[normalizedEmail]?.[code.toUpperCase()]
  );
}

export async function addWaitlistEntry (entry) {
  await enqueueMutation((store) => {
    store.waitlist.push({
      ...entry,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    });
  });
}

export async function recordLoginEvent (event) {
  await enqueueMutation((store) => {
    store.loginEvents.push({
      ...event,
      id: crypto.randomUUID(),
      occurredAt: new Date().toISOString()
    });
  });
}

export async function recordSearchEvent (event) {
  await enqueueMutation((store) => {
    if (!store.searchEvents) store.searchEvents = [];
    store.searchEvents.push({
      ...event,
      id: crypto.randomUUID(),
      occurredAt: new Date().toISOString()
    });
  });
}

export async function persistBitcoinVerification (txId, payload) {
  if (!txId) return;
  await enqueueMutation((store) => {
    store.bitcoinVerifications[txId] = {
      ...payload,
      txId,
      checkedAt: new Date().toISOString()
    };
  });
}

export async function getStoreSnapshot () {
  return readStore();
}

function ensureCreditRecord (store, email) {
  if (!store.credits[email]) {
    store.credits[email] = {
      freeSearches: 0,
      dayAccessExpiry: 0,
      welcomeGranted: false
    };
  }
  return store.credits[email];
}

export async function grantFreeSearches (email, count = 1) {
  const normalized = normalizeEmail(email);
  if (!normalized || count <= 0) return;
  await enqueueMutation((store) => {
    const credits = ensureCreditRecord(store, normalized);
    credits.freeSearches += count;
  });
}

export async function consumeFreeSearch (email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  let consumed = false;
  await enqueueMutation((store) => {
    const credits = ensureCreditRecord(store, normalized);
    if (credits.freeSearches > 0) {
      credits.freeSearches -= 1;
      consumed = true;
    }
  });
  return consumed;
}

export async function grantDayAccess (email, hours = 24) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  const duration = Math.max(1, hours);
  await enqueueMutation((store) => {
    const credits = ensureCreditRecord(store, normalized);
    credits.dayAccessExpiry = Date.now() + duration * 60 * 60 * 1000;
  });
}

export async function hasActiveDayAccess (email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const store = await readStore();
  const expiry = store.credits?.[normalized]?.dayAccessExpiry || 0;
  return expiry > Date.now();
}

export async function getCreditStatus (email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return { freeSearches: 0, dayAccessExpiry: 0 };
  const store = await readStore();
  const credits = store.credits?.[normalized] || { freeSearches: 0, dayAccessExpiry: 0, welcomeGranted: false };
  return credits;
}

export async function ensureWelcomeCredit (email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  await enqueueMutation((store) => {
    const credits = ensureCreditRecord(store, normalized);
    if (!credits.welcomeGranted) {
      credits.welcomeGranted = true;
      credits.freeSearches = Math.max(credits.freeSearches, 1);
    }
  });
}

// Anonymous search tracking by IP
export async function hasAnonymousSearch (ip) {
  if (!ip || ip === 'unknown') return false;
  const store = await readStore();
  const record = store.anonymousSearches?.[ip];
  return record && record.count > 0;
}

export async function recordAnonymousSearch (ip) {
  if (!ip || ip === 'unknown') return false;
  let consumed = false;
  await enqueueMutation((store) => {
    if (!store.anonymousSearches) store.anonymousSearches = {};
    if (!store.anonymousSearches[ip]) {
      store.anonymousSearches[ip] = { count: 0, lastSearch: null };
    }
    if (store.anonymousSearches[ip].count === 0) {
      store.anonymousSearches[ip].count = 1;
      store.anonymousSearches[ip].lastSearch = new Date().toISOString();
      consumed = true;
    }
  });
  return consumed;
}

// Ban account functionality
export async function banAccount (email, reason = '') {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  await enqueueMutation((store) => {
    if (!store.bannedAccounts) store.bannedAccounts = {};
    store.bannedAccounts[normalized] = {
      email: normalized,
      reason: reason.trim() || 'No reason provided',
      bannedAt: new Date().toISOString()
    };
  });
  return getBannedAccount(normalized);
}

export async function unbanAccount (email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  let unbanned = false;
  await enqueueMutation((store) => {
    if (store.bannedAccounts?.[normalized]) {
      delete store.bannedAccounts[normalized];
      unbanned = true;
    }
  });
  return unbanned;
}

export async function isBanned (email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const store = await readStore();
  return Boolean(store.bannedAccounts?.[normalized]);
}

export async function getBannedAccount (email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const store = await readStore();
  return store.bannedAccounts?.[normalized] || null;
}

export async function getAllBannedAccounts () {
  const store = await readStore();
  return Object.values(store.bannedAccounts || {});
}

// IP tracking for abuse detection
export async function getAccountsByIP (ip) {
  if (!ip || ip === 'unknown') return [];
  const store = await readStore();
  const accounts = [];
  
  // Check waitlist entries
  for (const entry of store.waitlist || []) {
    if (entry.ip === ip) {
      accounts.push({ email: entry.email, type: 'waitlist', createdAt: entry.createdAt });
    }
  }
  
  // Check credits (accounts with free searches)
  for (const [email, credits] of Object.entries(store.credits || {})) {
    // Check if this email's signup IP matches
    const waitlistEntry = store.waitlist?.find(e => normalizeEmail(e.email) === email && e.ip === ip);
    if (waitlistEntry) {
      accounts.push({ email, type: 'account', createdAt: waitlistEntry.createdAt });
    }
  }
  
  return accounts;
}

export async function detectSuspiciousIPActivity (threshold = 3) {
  const store = await readStore();
  const ipCounts = {};
  const suspiciousIPs = [];
  
  // Count accounts per IP from waitlist
  for (const entry of store.waitlist || []) {
    if (entry.ip && entry.ip !== 'unknown') {
      if (!ipCounts[entry.ip]) {
        ipCounts[entry.ip] = { count: 0, accounts: [] };
      }
      ipCounts[entry.ip].count++;
      ipCounts[entry.ip].accounts.push({
        email: entry.email,
        createdAt: entry.createdAt
      });
    }
  }
  
  // Find IPs above threshold
  for (const [ip, data] of Object.entries(ipCounts)) {
    if (data.count >= threshold) {
      suspiciousIPs.push({
        ip,
        accountCount: data.count,
        accounts: data.accounts,
        firstSeen: data.accounts[0]?.createdAt,
        lastSeen: data.accounts[data.accounts.length - 1]?.createdAt
      });
    }
  }
  
  return suspiciousIPs;
}

export async function recordSuspiciousIP (ip, accountCount) {
  if (!ip || ip === 'unknown') return;
  await enqueueMutation((store) => {
    if (!store.suspiciousIPs) store.suspiciousIPs = {};
    if (!store.suspiciousIPs[ip]) {
      store.suspiciousIPs[ip] = {
        ip,
        accountCount,
        firstDetected: new Date().toISOString(),
        acknowledged: false
      };
    } else {
      store.suspiciousIPs[ip].accountCount = accountCount;
      store.suspiciousIPs[ip].lastDetected = new Date().toISOString();
    }
  });
}

export async function getSuspiciousIPs (includeAcknowledged = false) {
  const store = await readStore();
  const all = Object.values(store.suspiciousIPs || {});
  if (includeAcknowledged) return all;
  return all.filter(ip => !ip.acknowledged);
}

export async function acknowledgeSuspiciousIP (ip) {
  if (!ip || ip === 'unknown') return false;
  let acknowledged = false;
  await enqueueMutation((store) => {
    if (store.suspiciousIPs?.[ip]) {
      store.suspiciousIPs[ip].acknowledged = true;
      store.suspiciousIPs[ip].acknowledgedAt = new Date().toISOString();
      acknowledged = true;
    }
  });
  return acknowledged;
}

