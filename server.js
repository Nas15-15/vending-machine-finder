import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';

import {
  hasPaidAccess,
  addWaitlistEntry,
  recordLoginEvent,
  recordSearchEvent,
  grantFreeSearches,
  consumeFreeSearch,
  hasActiveDayAccess,
  getCreditStatus,
  ensureWelcomeCredit,
  normalizeEmail,
  hasAnonymousSearch,
  recordAnonymousSearch,
  isBanned,
  getAccountsByIP,
  recordSuspiciousIP
} from './lib/accessStore.js';

import { runSearch } from './lib/searchService.js';
import { supabase, isSupabaseConfigured } from './lib/supabaseClient.js';

dotenv.config();

const requiredEnv = [
  'APP_URL',
  'JWT_SECRET'
];

const missing = requiredEnv.filter((key) => !process.env[key]);
if (missing.length) {
  console.warn(`⚠️ Missing environment variables: ${missing.join(', ')}`);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, 'dist');

const app = express();
const port = process.env.PORT || 4242;

const allowedOrigins = new Set(
  (process.env.APP_URL || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
);

const corsOptions = {
  origin(origin, callback) {
    if (
      !origin || 
      allowedOrigins.has(origin) || 
      (process.env.NODE_ENV !== 'production' && origin.startsWith('http://localhost:'))
    ) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true
};

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 1000 * 60 * 60 * 24 * 30
};

const parseAccessCodeHashes = (config = '') => {
  return config
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [label, hash] = entry.split(':').map((value) => value.trim());
      if (!label || !hash) return null;
      return { label, hash };
    })
    .filter(Boolean);
};

const memberAccessCodes = parseAccessCodeHashes(process.env.ACCESS_CODE_HASHES || '');

const createToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET || 'change-me', {
    expiresIn: '30d'
  });
};

const readSession = (req) => {
  const token = req.cookies?.vmf_session;
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'change-me');
  } catch {
    return null;
  }
};

// Helper to extract client IP and device info
const getClientInfo = (req) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.ip ||
    req.connection?.remoteAddress ||
    'unknown';

  const userAgent = req.headers['user-agent'] || 'unknown';

  // Extract device type from user agent
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);
  const isTablet = /Tablet|iPad/i.test(userAgent);
  const deviceType = isTablet ? 'tablet' : (isMobile ? 'mobile' : 'desktop');

  return { ip, userAgent, deviceType };
};

// Helper to get location from IP (optional enhancement)
const getLocationFromIP = async (ip) => {
  if (!ip || ip === 'unknown') return { country: 'Unknown', city: 'Unknown' };

  try {
    // Using free ipapi.co service (1000 requests/day free)
    const response = await fetch(`https://ipapi.co/${ip}/json/`);
    const data = await response.json();
    return {
      country: data.country_name || 'Unknown',
      city: data.city || 'Unknown',
      region: data.region || 'Unknown',
      countryCode: data.country_code || 'Unknown'
    };
  } catch (error) {
    return { country: 'Unknown', city: 'Unknown' };
  }
};

const fallbackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 6,
  message: 'Too many searches from this IP, please try again shortly.'
});

const searchLimiter = async (req, res, next) => {
  if (!isSupabaseConfigured()) {
    return fallbackLimiter(req, res, next);
  }

  const clientInfo = getClientInfo(req);
  const ip = clientInfo.ip;
  if (!ip || ip === 'unknown') return next();

  const windowMs = 60 * 1000;
  const maxHits = 6;
  const now = Date.now();

  try {
    const { data: limitRecord } = await supabase
      .from('rate_limits')
      .select('*')
      .eq('ip', ip)
      .single();

    if (!limitRecord) {
      await supabase.from('rate_limits').insert({ ip, hits: 1, window_start: now });
      return next();
    }

    if (now - limitRecord.window_start > windowMs) {
      await supabase.from('rate_limits').update({ hits: 1, window_start: now }).eq('ip', ip);
      return next();
    }

    if (limitRecord.hits >= maxHits) {
      return res.status(429).json({ error: 'Too many searches from this IP, please try again shortly.', retryAfter: windowMs / 1000 });
    }

    await supabase.from('rate_limits').update({ hits: limitRecord.hits + 1 }).eq('ip', ip);
    next();
  } catch (error) {
    console.error('Distributed Rate Limit error:', error.message);
    fallbackLimiter(req, res, next);
  }
};

app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get('/api/session', (req, res) => {
  const session = readSession(req);
  if (!session) {
    return res.json({ active: false });
  }
  res.json({
    active: true,
    email: session.email,
    role: session.role
  });
});

app.post('/api/login', async (req, res) => {
  const { email, accessCode } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !accessCode) {
    return res.status(400).json({ error: 'Email and access code are required' });
  }

  // Check if account is banned
  const banned = await isBanned(normalizedEmail);
  if (banned) {
    return res.status(403).json({
      error: 'Account access has been restricted',
      code: 'account_banned'
    });
  }

  // Member access code validation
  if (memberAccessCodes.length === 0) {
    console.warn('No member access codes configured');
  }

  let matchedCode = null;
  for (const entry of memberAccessCodes) {
    try {
      const match = await bcrypt.compare(accessCode, entry.hash);
      if (match) {
        matchedCode = entry;
        break;
      }
    } catch (error) {
      console.error('Error comparing access code:', error);
      continue;
    }
  }

  if (!matchedCode) {
    return res.status(401).json({ error: 'Invalid access code' });
  }

  const role = 'member';
  const token = createToken({ email: normalizedEmail, role });
  res.cookie('vmf_session', token, cookieOptions);
  const clientInfo = getClientInfo(req);
  const location = await getLocationFromIP(clientInfo.ip);
  await recordLoginEvent({
    email: normalizedEmail,
    role,
    method: 'access_code',
    ...clientInfo,
    ...location
  });

  res.json({ email: normalizedEmail, role });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('vmf_session', {
    ...cookieOptions,
    maxAge: 0
  });
  res.json({ ok: true });
});

// Simple email-only login for returning users
app.post('/api/login-email', async (req, res) => {
  const { email } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return res.status(400).json({ error: 'Email is required' });
  }

  // Check if account is banned
  const banned = await isBanned(normalizedEmail);
  if (banned) {
    return res.status(403).json({
      error: 'Account access has been restricted',
      code: 'account_banned'
    });
  }

  const clientInfo = getClientInfo(req);
  const location = await getLocationFromIP(clientInfo.ip);

  // Create session for the user
  const role = 'member';
  const token = createToken({ email: normalizedEmail, role });
  res.cookie('vmf_session', token, cookieOptions);

  await recordLoginEvent({
    email: normalizedEmail,
    role,
    method: 'email_login',
    ...clientInfo,
    ...location
  });

  // Get current credit status
  const credits = await getCreditStatus(normalizedEmail);

  res.json({
    success: true,
    email: normalizedEmail,
    role,
    freeSearchesRemaining: credits.freeSearches
  });
});

app.post('/api/waitlist', async (req, res) => {
  const { name, email, company, fleetSize, goals } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  if (!name || !normalizedEmail) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  // Check if account is banned
  const banned = await isBanned(normalizedEmail);
  if (banned) {
    return res.status(403).json({
      error: 'Account access has been restricted',
      code: 'account_banned'
    });
  }

  const clientInfo = getClientInfo(req);
  const location = await getLocationFromIP(clientInfo.ip);

  // Check if this email already has an account (credits record exists)
  const existingCredits = await getCreditStatus(normalizedEmail);
  const isNewAccount = !existingCredits.welcomeGranted && existingCredits.freeSearches === 0 && existingCredits.dayAccessExpiry === 0;

  if (isNewAccount) {
    // New account: add to waitlist and grant free searches
    await addWaitlistEntry({
      name: name.trim(),
      email: normalizedEmail,
      company: (company || '').trim(),
      fleetSize: (fleetSize || '').trim(),
      goals: (goals || '').trim(),
      ...clientInfo,
      ...location
    });

    // Grant 25 free searches only for new accounts
    await grantFreeSearches(normalizedEmail, 25);

    // Check for suspicious IP activity
    const accountsFromIP = await getAccountsByIP(clientInfo.ip);
    if (accountsFromIP.length >= 3) {
      await recordSuspiciousIP(clientInfo.ip, accountsFromIP.length);
    }
  }

  // Log the user in (works for both new and existing accounts)
  const role = 'member';
  const token = createToken({ email: normalizedEmail, role });
  res.cookie('vmf_session', token, cookieOptions);
  await recordLoginEvent({
    email: normalizedEmail,
    role,
    method: isNewAccount ? 'signup' : 'login_via_signup',
    ...clientInfo,
    ...location
  });

  // Get current credit status to return accurate count
  const currentCredits = await getCreditStatus(normalizedEmail);

  res.json({
    success: true,
    freeSearchesGranted: isNewAccount ? 25 : 0,
    freeSearchesRemaining: currentCredits.freeSearches,
    isNewAccount,
    email: normalizedEmail,
    role
  });
});

app.get('/api/access-status', async (req, res) => {
  const session = readSession(req);
  const queryEmail = normalizeEmail(req.query.email || '');
  const targetEmail = queryEmail || session?.email;
  if (!targetEmail) {
    return res.status(400).json({ error: 'Email is required' });
  }

  await ensureWelcomeCredit(targetEmail);
  const [paidAccess, dayAccess, credits] = await Promise.all([
    hasPaidAccess(targetEmail),
    hasActiveDayAccess(targetEmail),
    getCreditStatus(targetEmail)
  ]);

  // App is now free - everyone has access
  const hasAccess = true;

  res.json({
    email: targetEmail,
    hasAccess,
    dayAccessExpiry: credits.dayAccessExpiry || 0,
    freeSearchesRemaining: credits.freeSearches || 0
  });
});

app.post('/api/search', searchLimiter, async (req, res) => {
  const session = readSession(req);
  const {
    query,
    email,
    highTrafficOnly = true,
    minScore = 0,
    maxDistance = Infinity,
    categories = null,
    minVisitors = 0,
    maxVisitors = Infinity
  } = req.body || {};
  const normalizedEmail = normalizeEmail(email) || session?.email;
  const clientInfo = getClientInfo(req);

  // Check if this is an anonymous search (no email, no session)
  const isAnonymous = !normalizedEmail && !session;

  // If email provided, check if banned
  if (normalizedEmail) {
    const banned = await isBanned(normalizedEmail);
    if (banned) {
      return res.status(403).json({
        error: 'Account access has been restricted',
        code: 'account_banned'
      });
    }
  }

  // Check if user has used anonymous search (by IP)
  const hasUsedAnonymous = await hasAnonymousSearch(clientInfo.ip);

  // If no email/session OR email provided but no account/credits, treat as anonymous
  let isAnonymousUser = isAnonymous;
  if (normalizedEmail && !session) {
    // Check if this email has any account/credits
    const [paidAccess, dayAccess, credits] = await Promise.all([
      hasPaidAccess(normalizedEmail),
      hasActiveDayAccess(normalizedEmail),
      getCreditStatus(normalizedEmail)
    ]);
    const hasAccount = paidAccess || dayAccess || (credits.freeSearches > 0) || credits.welcomeGranted;
    // If email provided but no account, treat as anonymous
    if (!hasAccount) {
      isAnonymousUser = true;
    }
  }

  // Anonymous search handling (no account or already used free search)
  if (isAnonymousUser) {
    if (hasUsedAnonymous) {
      // Already used anonymous search, require signup
      return res.status(402).json({
        error: 'Sign up for free searches to continue',
        code: 'signup_required',
        blurred: true
      });
    }

    // Record the anonymous search BEFORE performing it
    await recordAnonymousSearch(clientInfo.ip);

    // Perform search for anonymous user (results will be blurred)
    try {
      const payload = await runSearch(query, {
        highTrafficOnly: Boolean(highTrafficOnly),
        minScore: parseFloat(minScore) || 0,
        maxDistance: maxDistance === Infinity || maxDistance === 'Infinity' ? Infinity : parseFloat(maxDistance),
        categories: Array.isArray(categories) && categories.length > 0 ? categories : null,
        minVisitors: parseInt(minVisitors) || 0,
        maxVisitors: maxVisitors === Infinity || maxVisitors === 'Infinity' ? Infinity : parseInt(maxVisitors) || Infinity
      });

      const location = await getLocationFromIP(clientInfo.ip);
      await recordSearchEvent({
        email: normalizedEmail || null,
        query,
        resultsCount: payload.results?.length || 0,
        ...clientInfo,
        ...location
      });

      return res.json({
        ...payload,
        blurred: true,
        accessType: 'anonymous'
      });
    } catch (error) {
      console.error('[Search Route] Error:', error);
      const statusCode = error.message.includes('not found') ? 404 : 500;
      return res.status(statusCode).json({
        error: error.message || 'Search failed',
        code: 'SEARCH_ERROR'
      });
    }
  }

  // Regular search with email and account
  if (!normalizedEmail) {
    return res.status(400).json({ error: 'Email is required for search' });
  }

  // Check access permissions - app is now free, so always allow
  const credits = await getCreditStatus(normalizedEmail);
  const canUseFreeSearch = credits.freeSearches > 0;

  try {
    // Perform search using search service
    const payload = await runSearch(query, {
      highTrafficOnly: Boolean(highTrafficOnly),
      minScore: parseFloat(minScore) || 0,
      maxDistance: maxDistance === Infinity || maxDistance === 'Infinity' ? Infinity : parseFloat(maxDistance),
      categories: Array.isArray(categories) && categories.length > 0 ? categories : null,
      minVisitors: parseInt(minVisitors) || 0,
      maxVisitors: maxVisitors === Infinity || maxVisitors === 'Infinity' ? Infinity : parseInt(maxVisitors) || Infinity
    });

    // Consume free search if used
    if (canUseFreeSearch) {
      await consumeFreeSearch(normalizedEmail);
    }

    // Record search event with IP/device info
    const location = await getLocationFromIP(clientInfo.ip);
    await recordSearchEvent({
      email: normalizedEmail,
      query,
      resultsCount: payload.results?.length || 0,
      ...clientInfo,
      ...location
    });

    res.json({
      ...payload,
      consumedFreeSearch: canUseFreeSearch,
      accessType: 'free',
      blurred: false
    });
  } catch (error) {
    console.error('[Search Route] Error:', error);
    const statusCode = error.message.includes('not found') ? 404 : 500;
    res.status(statusCode).json({
      error: error.message || 'Search failed',
      code: 'SEARCH_ERROR'
    });
  }
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

import { isGooglePlacesConfigured } from './lib/googlePlacesService.js';
import { isAIConfigured } from './lib/aiEvaluationService.js';

app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${port}`);
  console.log(`Access from network: http://192.168.0.41:${port}`);
  console.log('');
  console.log('Integration status:');
  console.log(`  ${isGooglePlacesConfigured() ? '✅' : '⚠️'} Google Places API: ${isGooglePlacesConfigured() ? 'Active' : 'Not configured (set GOOGLE_PLACES_API_KEY in .env)'}`);
  console.log(`  ${isAIConfigured() ? '✅' : '⚠️'} AI Evaluation:     ${isAIConfigured() ? 'Active (Primary: Gemini, Fallback: OpenAI)' : 'Not configured (set GEMINI_API_KEY or OPENAI_API_KEY in .env)'}`);
});
