import express from 'express';
import Stripe from 'stripe';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';

import {
  markPaidAccess,
  hasPaidAccess,
  recordPromoUsage,
  hasPromoUsage,
  addWaitlistEntry,
  recordLoginEvent,
  recordSearchEvent,
  persistBitcoinVerification,
  grantFreeSearches,
  consumeFreeSearch,
  grantDayAccess,
  hasActiveDayAccess,
  getCreditStatus,
  ensureWelcomeCredit,
  normalizeEmail,
  getStoreSnapshot,
  hasAnonymousSearch,
  recordAnonymousSearch,
  banAccount,
  unbanAccount,
  isBanned,
  getAllBannedAccounts,
  getAccountsByIP,
  detectSuspiciousIPActivity,
  recordSuspiciousIP,
  getSuspiciousIPs,
  acknowledgeSuspiciousIP
} from './lib/accessStore.js';
import { getPromoDetails } from './lib/promoCodes.js';
import { verifyBitcoinPayment } from './lib/bitcoin.js';

const REQUIRED_CONFIRMATIONS = Number(process.env.BITCOIN_REQUIRED_CONFIRMATIONS || '1');
const MIN_CONFIRMATIONS_FOR_UNLOCK = Math.max(1, REQUIRED_CONFIRMATIONS);
import { runSearch } from './lib/searchService.js';

dotenv.config();

const requiredEnv = [
  'STRIPE_SECRET_KEY',
  'STRIPE_PRICE_ID',
  'STRIPE_WEBHOOK_SECRET',
  'APP_URL',
  'JWT_SECRET',
  'OWNER_EMAIL',
  'OWNER_PASSWORD_HASH'
];

const missing = requiredEnv.filter((key) => !process.env[key]);
if (missing.length) {
  console.warn(`⚠️ Missing environment variables: ${missing.join(', ')}`);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16'
});

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
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
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
  // Netlify provides IP in x-nf-client-connection-ip header
  const ip = req.headers['x-nf-client-connection-ip'] ||
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
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

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 6,
  message: 'Too many searches from this IP, please try again shortly.'
});

app.post(
  '/api/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET || ''
      );
    } catch (error) {
      console.error('Webhook signature verification failed.', error);
      return res.status(400).send(`Webhook Error: ${error.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      if (session.payment_status === 'paid' && session.customer_email) {
        await markPaidAccess(session.customer_email, 'stripe', { sessionId: session.id });
      }
    }

    res.json({ received: true });
  }
);

app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.post('/api/create-checkout-session', async (req, res) => {
  const { email } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return res.status(400).json({ error: 'Email is required' });
  }

  if (!stripe || !process.env.STRIPE_PRICE_ID) {
    return res.status(500).json({ error: 'Stripe is not configured' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: normalizedEmail,
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1
        }
      ],
      success_url: `${process.env.APP_URL}/pay-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL}/index.html`
    });

    res.json({ id: session.id, url: session.url });
  } catch (error) {
    console.error('Failed to create checkout session', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

app.get('/api/checkout-session', async (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    res.json({
      id: session.id,
      email: session.customer_email,
      payment_status: session.payment_status
    });
  } catch (error) {
    console.error('Failed to fetch checkout session', error);
    res.status(500).json({ error: 'Failed to fetch checkout session' });
  }
});

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

  const ownerEmail = normalizeEmail(process.env.OWNER_EMAIL || '');
  const ownerPasswordHash = process.env.OWNER_PASSWORD_HASH || '';
  let role = 'member';
  let loginMethod = 'access_code';

  // Check if this is an owner login attempt
  if (ownerEmail && normalizedEmail === ownerEmail) {
    if (!ownerPasswordHash) {
      console.error('Owner login attempted but OWNER_PASSWORD_HASH is not configured');
      return res.status(500).json({ error: 'Owner authentication is not configured. Please contact support.' });
    }

    try {
      const isOwnerValid = await bcrypt.compare(accessCode, ownerPasswordHash);
      if (!isOwnerValid) {
        console.log(`Owner login failed for ${normalizedEmail}: password mismatch`);
        return res.status(401).json({ error: 'Invalid owner password' });
      }
      console.log(`Owner login successful for ${normalizedEmail}`);
      role = 'owner';
      loginMethod = 'owner';
    } catch (error) {
      console.error('Error validating owner password:', error);
      return res.status(500).json({ error: 'Error validating owner credentials' });
    }
  } else {
    // Log if owner email is configured but doesn't match (for debugging)
    if (ownerEmail && process.env.NODE_ENV === 'development') {
      console.log(`Login attempt with email ${normalizedEmail} (owner email configured: ${ownerEmail})`);
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
      // Provide more helpful error message
      let errorMsg = 'Invalid access code';
      if (ownerEmail) {
        errorMsg += '. If you are the owner, make sure you are using the exact email: ' + ownerEmail;
      }
      return res.status(401).json({ error: errorMsg });
    }
    await markPaidAccess(normalizedEmail, 'access_code', { label: matchedCode.label });
  }

  const token = createToken({ email: normalizedEmail, role });
  res.cookie('vmf_session', token, cookieOptions);
  const clientInfo = getClientInfo(req);
  const location = await getLocationFromIP(clientInfo.ip);
  await recordLoginEvent({
    email: normalizedEmail,
    role,
    method: loginMethod,
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

app.post('/api/promo/redeem', async (req, res) => {
  const { email, code } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !code) {
    return res.status(400).json({ error: 'Email and promo code are required' });
  }
  const promoDetails = getPromoDetails(code);
  if (!promoDetails) {
    return res.status(404).json({ error: 'Promo code not found' });
  }
  const alreadyUsed = await hasPromoUsage(normalizedEmail, code);
  if (alreadyUsed) {
    return res.status(409).json({ error: 'Promo code already used for this email' });
  }

  switch (promoDetails.type) {
    case 'full_access':
      await markPaidAccess(normalizedEmail, 'promo', { code });
      break;
    case 'free_search':
      await grantFreeSearches(normalizedEmail, promoDetails.bonusSearches || 1);
      break;
    case 'day_access':
      await grantDayAccess(normalizedEmail, promoDetails.durationHours || 24);
      break;
    default:
      break;
  }
  await recordPromoUsage(normalizedEmail, code);

  res.json({
    success: true,
    type: promoDetails.type,
    message: promoDetails.successMessage || 'Promo applied.'
  });
});

app.post('/api/waitlist', async (req, res) => {
  const { name, email, company, fleetSize, goals } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  if (!name || !normalizedEmail || !company) {
    return res.status(400).json({ error: 'Name, email, and company are required' });
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

  // Add to waitlist
  await addWaitlistEntry({
    name: name.trim(),
    email: normalizedEmail,
    company: company.trim(),
    fleetSize: (fleetSize || '').trim(),
    goals: (goals || '').trim(),
    ...clientInfo,
    ...location
  });

  // Grant 25 free searches immediately upon signup
  await grantFreeSearches(normalizedEmail, 25);

  // Check for suspicious IP activity
  const accountsFromIP = await getAccountsByIP(clientInfo.ip);
  if (accountsFromIP.length >= 3) {
    await recordSuspiciousIP(clientInfo.ip, accountsFromIP.length);
  }

  // Automatically log the user in by creating a session
  const role = 'member';
  const token = createToken({ email: normalizedEmail, role });
  res.cookie('vmf_session', token, cookieOptions);
  await recordLoginEvent({
    email: normalizedEmail,
    role,
    method: 'signup',
    ...clientInfo,
    ...location
  });

  res.json({ success: true, freeSearchesGranted: 25, email: normalizedEmail, role });
});

app.get('/api/owner/overview', async (req, res) => {
  const session = readSession(req);
  if (!session || session.role !== 'owner') {
    return res.status(403).json({ error: 'Owner access required' });
  }
  const snapshot = await getStoreSnapshot();
  const waitlist = snapshot.waitlist.slice(-200).reverse();
  const logins = snapshot.loginEvents.slice(-200).reverse();
  const upgrades = Object.values(snapshot.paid || {}).slice(-200).reverse();
  const searches = (snapshot.searchEvents || []).slice(-200).reverse();

  // Check for suspicious IPs and include in response
  const suspiciousIPs = await getSuspiciousIPs(false);

  res.json({ waitlist, logins, upgrades, searches, suspiciousIPs });
});

app.post('/api/owner/ban', async (req, res) => {
  const session = readSession(req);
  if (!session || session.role !== 'owner') {
    return res.status(403).json({ error: 'Owner access required' });
  }
  const { email, reason } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return res.status(400).json({ error: 'Email is required' });
  }
  const banned = await banAccount(normalizedEmail, reason || '');
  res.json({ success: true, banned });
});

app.post('/api/owner/unban', async (req, res) => {
  const session = readSession(req);
  if (!session || session.role !== 'owner') {
    return res.status(403).json({ error: 'Owner access required' });
  }
  const { email } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return res.status(400).json({ error: 'Email is required' });
  }
  const unbanned = await unbanAccount(normalizedEmail);
  res.json({ success: unbanned });
});

app.get('/api/owner/banned', async (req, res) => {
  const session = readSession(req);
  if (!session || session.role !== 'owner') {
    return res.status(403).json({ error: 'Owner access required' });
  }
  const banned = await getAllBannedAccounts();
  res.json({ banned });
});

app.get('/api/owner/suspicious-ips', async (req, res) => {
  const session = readSession(req);
  if (!session || session.role !== 'owner') {
    return res.status(403).json({ error: 'Owner access required' });
  }
  const suspicious = await detectSuspiciousIPActivity(3);
  res.json({ suspiciousIPs: suspicious });
});

app.get('/api/owner/notifications', async (req, res) => {
  const session = readSession(req);
  if (!session || session.role !== 'owner') {
    return res.status(403).json({ error: 'Owner access required' });
  }
  const suspiciousIPs = await getSuspiciousIPs(false);
  res.json({
    suspiciousIPCount: suspiciousIPs.length,
    suspiciousIPs: suspiciousIPs.slice(0, 10) // Return top 10
  });
});

app.post('/api/owner/acknowledge-suspicious-ip', async (req, res) => {
  const session = readSession(req);
  if (!session || session.role !== 'owner') {
    return res.status(403).json({ error: 'Owner access required' });
  }
  const { ip } = req.body || {};
  if (!ip) {
    return res.status(400).json({ error: 'IP address is required' });
  }
  const acknowledged = await acknowledgeSuspiciousIP(ip);
  res.json({ success: acknowledged });
});

app.post('/api/bitcoin/verify', async (req, res) => {
  const { txId, email } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !txId) {
    return res.status(400).json({ error: 'Email and transaction ID are required' });
  }

  const address = process.env.BITCOIN_ADDRESS;
  const minSats = Number(process.env.BITCOIN_MIN_SATS || 0);
  if (!address || !minSats) {
    return res.status(500).json({ error: 'Bitcoin payments are not configured' });
  }

  try {
    const result = await verifyBitcoinPayment({ txId, address, minSats });
    await persistBitcoinVerification(txId, result);

    if (!result.meetsThreshold) {
      return res.status(400).json({
        error: 'Payment amount does not match requirements',
        totalSats: result.totalSats,
        requiredSats: minSats
      });
    }

    if (!result.confirmed) {
      return res.status(202).json({
        pending: true,
        confirmations: result.confirmations,
        requiredConfirmations: MIN_CONFIRMATIONS_FOR_UNLOCK,
        message: `Awaiting confirmations (${result.confirmations}/${MIN_CONFIRMATIONS_FOR_UNLOCK})`
      });
    }

    await markPaidAccess(normalizedEmail, 'bitcoin', {
      txId,
      confirmations: result.confirmations,
      totalSats: result.totalSats
    });
    res.json({ success: true, confirmations: result.confirmations });
  } catch (error) {
    console.error('Bitcoin verification failed', error);
    res.status(500).json({ error: `Unable to verify Bitcoin payment: ${error.message}` });
  }
});

app.get('/api/bitcoin/status', async (req, res) => {
  const { txId, email } = req.query || {};
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !txId) {
    return res.status(400).json({ error: 'Email and transaction ID are required' });
  }

  const store = await getStoreSnapshot();
  const verification = store.bitcoinVerifications?.[txId];
  if (verification) {
    const hasAccess = await hasPaidAccess(normalizedEmail);
    return res.json({
      txId,
      verified: verification.confirmed && verification.meetsThreshold,
      confirmations: verification.confirmations || 0,
      hasAccess
    });
  }

  const address = process.env.BITCOIN_ADDRESS;
  const minSats = Number(process.env.BITCOIN_MIN_SATS || 0);
  if (!address || !minSats) {
    return res.status(500).json({ error: 'Bitcoin payments are not configured' });
  }

  try {
    const result = await verifyBitcoinPayment({ txId, address, minSats });
    await persistBitcoinVerification(txId, result);

    if (result.confirmed && result.meetsThreshold) {
      await markPaidAccess(normalizedEmail, 'bitcoin', {
        txId,
        confirmations: result.confirmations,
        totalSats: result.totalSats
      });
    }

    res.json({
      txId,
      verified: result.confirmed && result.meetsThreshold,
      confirmations: result.confirmations,
      meetsThreshold: result.meetsThreshold,
      hasAccess: result.confirmed && result.meetsThreshold
    });
  } catch (error) {
    console.error('Bitcoin status check failed', error);
    res.status(500).json({ error: `Unable to check Bitcoin payment status: ${error.message}` });
  }
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

  const hasAccess = Boolean(
    session?.role === 'owner' ||
    paidAccess ||
    dayAccess
  );

  res.json({
    email: targetEmail,
    hasAccess,
    owner: session?.role === 'owner',
    dayAccessExpiry: credits.dayAccessExpiry || 0,
    freeSearchesRemaining: credits.freeSearches || 0
  });
});

app.post('/api/search', searchLimiter, async (req, res) => {
  const session = readSession(req);
  const {
    query,
    email,
    excludeExisting = true,
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
        error: 'Sign up for 5 free searches to continue',
        code: 'signup_required',
        blurred: true
      });
    }

    // Record the anonymous search BEFORE performing it
    await recordAnonymousSearch(clientInfo.ip);

    // Perform search for anonymous user (results will be blurred)
    try {
      const payload = await runSearch(query, {
        excludeExisting: Boolean(excludeExisting),
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

  // Check access permissions
  const [paidAccess, dayAccess, credits] = await Promise.all([
    hasPaidAccess(normalizedEmail),
    hasActiveDayAccess(normalizedEmail),
    getCreditStatus(normalizedEmail)
  ]);

  const hasServerAccess = session?.role === 'owner' || paidAccess || dayAccess;
  const canUseFreeSearch = !hasServerAccess && credits.freeSearches > 0;

  if (!hasServerAccess && !canUseFreeSearch) {
    return res.status(402).json({
      error: 'Access required',
      code: 'payment_required',
      freeSearchesRemaining: credits.freeSearches || 0
    });
  }

  try {
    // Perform search using search service
    const payload = await runSearch(query, {
      excludeExisting: Boolean(excludeExisting),
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
      accessType: hasServerAccess ? (session?.role === 'owner' ? 'owner' : 'paid') : 'free',
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

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

