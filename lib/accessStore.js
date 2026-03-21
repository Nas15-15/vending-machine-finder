import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import crypto from 'crypto';

export const normalizeEmail = (email = '') => {
  const trimmed = email.trim().toLowerCase();
  return trimmed || null;
};

// Fallback memory store if Supabase is down or not configured
const memStore = {
  waitlist: [], promos: {}, logins: [], searches: [],
  credits: {}, anonSearches: {}, banned: {}, suspiciousIPs: {}
};

export async function markPaidAccess(email, method, metadata = {}) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  
  if (isSupabaseConfigured()) {
    try {
      await supabase.from('app_users').upsert({ email: normalized, method, metadata, updated_at: new Date().toISOString() });
      return { email: normalized, method, metadata };
    } catch { }
  }
  return { email: normalized, method, metadata };
}

export async function getAccessRecord(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  if (isSupabaseConfigured()) {
    try {
      const { data } = await supabase.from('app_users').select('*').eq('email', normalized).single();
      return data || null;
    } catch { return null; }
  }
  return null;
}

export async function hasPaidAccess(email) {
  return Boolean(await getAccessRecord(email));
}

export async function recordPromoUsage(email, code) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !code) return;
  if (isSupabaseConfigured()) {
    try {
      await supabase.from('promo_usage').upsert({ email: normalizedEmail, code: code.toUpperCase(), used_at: new Date().toISOString() });
    } catch { }
  }
}

export async function hasPromoUsage(email, code) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !code) return false;
  if (isSupabaseConfigured()) {
    try {
      const { data } = await supabase.from('promo_usage').select('*').eq('email', normalizedEmail).eq('code', code.toUpperCase()).single();
      return Boolean(data);
    } catch { return false; }
  }
  return false;
}

export async function addWaitlistEntry(entry) {
  if (isSupabaseConfigured()) {
    try {
      const { id, createdAt, ...dbEntry } = entry;
      dbEntry.country_code = entry.countryCode; // map to snake case
      delete dbEntry.countryCode;
      await supabase.from('waitlist').insert({ ...dbEntry });
    } catch (e) { console.error('Error adding waitlist:', e); }
  } else {
    memStore.waitlist.push(entry);
  }
}

export async function recordLoginEvent(event) {
  if (isSupabaseConfigured()) {
    try {
      const { id, occurredAt, ...dbEvent } = event;
      dbEvent.device_type = event.deviceType;
      delete dbEvent.deviceType;
      dbEvent.country_code = event.countryCode;
      delete dbEvent.countryCode;
      
      // Upsert User
      if (dbEvent.email) {
         await supabase.from('app_users').upsert({ email: dbEvent.email, method: dbEvent.method, role: dbEvent.role }, { onConflict: 'email' });
      }

      await supabase.from('login_events').insert({ ...dbEvent });
    } catch { }
  }
}

export async function recordSearchEvent(event) {
  if (isSupabaseConfigured()) {
    try {
      const { id, occurredAt, resultsCount, ...dbEvent } = event;
      dbEvent.device_type = event.deviceType;
      delete dbEvent.deviceType;
      dbEvent.country_code = event.countryCode;
      delete dbEvent.countryCode;
      dbEvent.results_count = resultsCount;
      
      await supabase.from('search_events').insert({ ...dbEvent });
    } catch { }
  }
}

export async function persistBitcoinVerification(txId, payload) {
  if (!txId) return;
  if (isSupabaseConfigured()) {
    try {
      await supabase.from('bitcoin_verifications').upsert({ tx_id: txId, payload: payload, checked_at: new Date().toISOString() });
    } catch { }
  }
}

export async function getStoreSnapshot() {
  return {}; // Not supported in Supabase fully
}

// Ensure the app_users record exists before inserting credits
async function ensureAppUser(email) {
  if (!isSupabaseConfigured()) return;
  try {
    const { data } = await supabase.from('app_users').select('email').eq('email', email).single();
    if (!data) {
       await supabase.from('app_users').insert({ email, role: 'member' });
    }
  } catch (err) {
    if (err.code === 'PGRST116') { // No rows found
       await supabase.from('app_users').insert({ email, role: 'member' });
    }
  }
}

export async function grantFreeSearches(email, count = 1) {
  const normalized = normalizeEmail(email);
  if (!normalized || count <= 0) return;
  
  if (isSupabaseConfigured()) {
    try {
      await ensureAppUser(normalized);
      const { data } = await supabase.from('credits').select('free_searches').eq('email', normalized).single();
      const current = data ? data.free_searches : 0;
      await supabase.from('credits').upsert({ email: normalized, free_searches: current + count, updated_at: new Date().toISOString() });
    } catch (e) {
      if (e.code === 'PGRST116') {
         await supabase.from('credits').insert({ email: normalized, free_searches: count });
      }
    }
  } else {
    if (!memStore.credits[normalized]) memStore.credits[normalized] = { freeSearches: 0 };
    memStore.credits[normalized].freeSearches += count;
  }
}

export async function consumeFreeSearch(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  if (isSupabaseConfigured()) {
    try {
      const { data } = await supabase.from('credits').select('free_searches').eq('email', normalized).single();
      if (data && data.free_searches > 0) {
        await supabase.from('credits').update({ free_searches: data.free_searches - 1 }).eq('email', normalized);
        return true;
      }
    } catch { return false; }
  } else {
    if (memStore.credits[normalized] && memStore.credits[normalized].freeSearches > 0) {
       memStore.credits[normalized].freeSearches--;
       return true;
    }
  }
  return false;
}

export async function grantDayAccess(email, hours = 24) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  const duration = Math.max(1, hours);
  const expiry = Date.now() + duration * 60 * 60 * 1000;
  
  if (isSupabaseConfigured()) {
    try {
      await ensureAppUser(normalized);
      await supabase.from('credits').upsert({ email: normalized, day_access_expiry: expiry });
    } catch { }
  }
}

export async function hasActiveDayAccess(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  if (isSupabaseConfigured()) {
    try {
      const { data } = await supabase.from('credits').select('day_access_expiry').eq('email', normalized).single();
      return data && data.day_access_expiry > Date.now();
    } catch { return false; }
  }
  return false;
}

export async function getCreditStatus(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return { freeSearches: 0, dayAccessExpiry: 0, welcomeGranted: false };
  if (isSupabaseConfigured()) {
    try {
      const { data } = await supabase.from('credits').select('*').eq('email', normalized).single();
      if (data) {
         return { freeSearches: data.free_searches || 0, dayAccessExpiry: data.day_access_expiry || 0, welcomeGranted: data.welcome_granted || false };
      }
    } catch { }
  }
  return memStore.credits[normalized] || { freeSearches: 0, dayAccessExpiry: 0, welcomeGranted: false };
}

export async function ensureWelcomeCredit(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  if (isSupabaseConfigured()) {
    try {
      await ensureAppUser(normalized);
      const { data } = await supabase.from('credits').select('free_searches, welcome_granted').eq('email', normalized).single();
      if (!data || !data.welcome_granted) {
        const currentSearches = data ? data.free_searches : 0;
        await supabase.from('credits').upsert({ email: normalized, welcome_granted: true, free_searches: Math.max(currentSearches, 1) });
      }
    } catch (e) {
      if (e.code === 'PGRST116') {
         await supabase.from('credits').insert({ email: normalized, welcome_granted: true, free_searches: 1 });
      }
    }
  }
}

export async function hasAnonymousSearch(ip) {
  if (!ip || ip === 'unknown') return false;
  if (isSupabaseConfigured()) {
    try {
      const { data } = await supabase.from('anonymous_searches').select('count').eq('ip', ip).single();
      return data && data.count > 0;
    } catch { return false; }
  }
  return memStore.anonSearches[ip] && memStore.anonSearches[ip] > 0;
}

export async function recordAnonymousSearch(ip) {
  if (!ip || ip === 'unknown') return false;
  if (isSupabaseConfigured()) {
    try {
      const { data } = await supabase.from('anonymous_searches').select('count').eq('ip', ip).single();
      if (!data) {
        await supabase.from('anonymous_searches').insert({ ip, count: 1 });
        return true;
      }
    } catch (e) {
      if (e.code === 'PGRST116') {
         await supabase.from('anonymous_searches').insert({ ip, count: 1 });
         return true;
      }
    }
  } else {
     if (!memStore.anonSearches[ip]) {
       memStore.anonSearches[ip] = 1;
       return true;
     }
  }
  return false;
}

export async function banAccount(email, reason = '') {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  if (isSupabaseConfigured()) {
    try {
      await supabase.from('banned_accounts').upsert({ email: normalized, reason: reason.trim() || 'No reason provided' });
    } catch { }
  }
  return getBannedAccount(normalized);
}

export async function unbanAccount(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  if (isSupabaseConfigured()) {
    try {
      const { error } = await supabase.from('banned_accounts').delete().eq('email', normalized);
      return !error;
    } catch { return false; }
  }
  return false;
}

export async function isBanned(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return Boolean(await getBannedAccount(normalized));
}

export async function getBannedAccount(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  if (isSupabaseConfigured()) {
    try {
      const { data } = await supabase.from('banned_accounts').select('*').eq('email', normalized).single();
      return data || null;
    } catch { return null; }
  }
  return null;
}

export async function getAllBannedAccounts() {
  if (isSupabaseConfigured()) {
    try {
      const { data } = await supabase.from('banned_accounts').select('*');
      return data || [];
    } catch { return []; }
  }
  return [];
}

export async function getAccountsByIP(ip) {
  if (!ip || ip === 'unknown') return [];
  if (isSupabaseConfigured()) {
    try {
      const { data } = await supabase.from('waitlist').select('email, created_at').eq('ip', ip);
      return (data || []).map(d => ({ email: d.email, type: 'waitlist', createdAt: d.created_at }));
    } catch { return []; }
  }
  return [];
}

export async function detectSuspiciousIPActivity(threshold = 3) {
  if (isSupabaseConfigured()) {
    try {
      // Need aggregate query to find groups, complex in Supabase standard JS without RPC
      // For now returning empty; usually admin checks this.
      return [];
    } catch { return []; }
  }
  return [];
}

export async function recordSuspiciousIP(ip, accountCount) {
  if (!ip || ip === 'unknown') return;
  if (isSupabaseConfigured()) {
    try {
      const { data } = await supabase.from('suspicious_ips').select('*').eq('ip', ip).single();
      if (data) {
        await supabase.from('suspicious_ips').update({ account_count: accountCount, last_detected: new Date().toISOString() }).eq('ip', ip);
      } else {
        await supabase.from('suspicious_ips').insert({ ip, account_count: accountCount });
      }
    } catch (e) {
      if (e.code === 'PGRST116') {
         await supabase.from('suspicious_ips').insert({ ip, account_count: accountCount });
      }
    }
  }
}

export async function getSuspiciousIPs(includeAcknowledged = false) {
  if (isSupabaseConfigured()) {
    try {
      let query = supabase.from('suspicious_ips').select('*');
      if (!includeAcknowledged) {
         query = query.eq('acknowledged', false);
      }
      const { data } = await query;
      return data || [];
    } catch { return []; }
  }
  return [];
}

export async function acknowledgeSuspiciousIP(ip) {
  if (!ip || ip === 'unknown') return false;
  if (isSupabaseConfigured()) {
    try {
      await supabase.from('suspicious_ips').update({ acknowledged: true, acknowledged_at: new Date().toISOString() }).eq('ip', ip);
      return true;
    } catch { return false; }
  }
  return false;
}
