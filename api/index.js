import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import serverlessExpress from '@vendia/serverless-express';

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
} from '../lib/accessStore.js';

import { runSearch } from '../lib/searchService.js';

const app = express();

const allowedOrigins = new Set(
    (process.env.APP_URL || 'http://localhost:5173')
        .split(',')
        .map((origin) => origin.trim())
);

const corsOptions = {
    origin(origin, callback) {
        // Allow requests with no origin (mobile apps, curl, etc)
        if (!origin || allowedOrigins.has(origin)) {
            callback(null, true);
        } else {
            // In production, be more permissive for Vercel preview deployments
            if (process.env.VERCEL && origin?.includes('vercel.app')) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        }
    },
    credentials: true
};

const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: true, // Always secure in production
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

const getClientInfo = (req) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.ip ||
        req.connection?.remoteAddress ||
        'unknown';

    const userAgent = req.headers['user-agent'] || 'unknown';
    const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);
    const isTablet = /Tablet|iPad/i.test(userAgent);
    const deviceType = isTablet ? 'tablet' : (isMobile ? 'mobile' : 'desktop');

    return { ip, userAgent, deviceType };
};

const getLocationFromIP = async (ip) => {
    if (!ip || ip === 'unknown') return { country: 'Unknown', city: 'Unknown' };

    try {
        const response = await fetch(`https://ipapi.co/${ip}/json/`);
        const data = await response.json();
        return {
            country: data.country_name || 'Unknown',
            city: data.city || 'Unknown',
            region: data.region || 'Unknown',
            countryCode: data.country_code || 'Unknown'
        };
    } catch {
        return { country: 'Unknown', city: 'Unknown' };
    }
};

// Simple in-memory rate limiting for serverless
const searchRateLimit = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 6;

const checkRateLimit = (ip) => {
    const now = Date.now();
    const record = searchRateLimit.get(ip);

    if (!record || (now - record.start) > RATE_LIMIT_WINDOW) {
        searchRateLimit.set(ip, { start: now, count: 1 });
        return true;
    }

    if (record.count >= RATE_LIMIT_MAX) {
        return false;
    }

    record.count++;
    return true;
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

    const banned = await isBanned(normalizedEmail);
    if (banned) {
        return res.status(403).json({
            error: 'Account access has been restricted',
            code: 'account_banned'
        });
    }

    let matchedCode = null;
    for (const entry of memberAccessCodes) {
        try {
            const match = await bcrypt.compare(accessCode, entry.hash);
            if (match) {
                matchedCode = entry;
                break;
            }
        } catch {
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

app.post('/api/login-email', async (req, res) => {
    const { email } = req.body || {};
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
        return res.status(400).json({ error: 'Email is required' });
    }

    const banned = await isBanned(normalizedEmail);
    if (banned) {
        return res.status(403).json({
            error: 'Account access has been restricted',
            code: 'account_banned'
        });
    }

    const clientInfo = getClientInfo(req);
    const location = await getLocationFromIP(clientInfo.ip);

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

    const banned = await isBanned(normalizedEmail);
    if (banned) {
        return res.status(403).json({
            error: 'Account access has been restricted',
            code: 'account_banned'
        });
    }

    const clientInfo = getClientInfo(req);
    const location = await getLocationFromIP(clientInfo.ip);

    const existingCredits = await getCreditStatus(normalizedEmail);
    const isNewAccount = !existingCredits.welcomeGranted && existingCredits.freeSearches === 0 && existingCredits.dayAccessExpiry === 0;

    if (isNewAccount) {
        await addWaitlistEntry({
            name: name.trim(),
            email: normalizedEmail,
            company: (company || '').trim(),
            fleetSize: (fleetSize || '').trim(),
            goals: (goals || '').trim(),
            ...clientInfo,
            ...location
        });

        await grantFreeSearches(normalizedEmail, 25);

        const accountsFromIP = await getAccountsByIP(clientInfo.ip);
        if (accountsFromIP.length >= 3) {
            await recordSuspiciousIP(clientInfo.ip, accountsFromIP.length);
        }
    }

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

    const hasAccess = true;

    res.json({
        email: targetEmail,
        hasAccess,
        dayAccessExpiry: credits.dayAccessExpiry || 0,
        freeSearchesRemaining: credits.freeSearches || 0
    });
});

app.post('/api/search', async (req, res) => {
    const clientInfo = getClientInfo(req);

    // Rate limiting
    if (!checkRateLimit(clientInfo.ip)) {
        return res.status(429).json({
            error: 'Too many searches from this IP, please try again shortly.'
        });
    }

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

    const isAnonymous = !normalizedEmail && !session;

    if (normalizedEmail) {
        const banned = await isBanned(normalizedEmail);
        if (banned) {
            return res.status(403).json({
                error: 'Account access has been restricted',
                code: 'account_banned'
            });
        }
    }

    const hasUsedAnonymous = await hasAnonymousSearch(clientInfo.ip);

    let isAnonymousUser = isAnonymous;
    if (normalizedEmail && !session) {
        const [paidAccess, dayAccess, credits] = await Promise.all([
            hasPaidAccess(normalizedEmail),
            hasActiveDayAccess(normalizedEmail),
            getCreditStatus(normalizedEmail)
        ]);
        const hasAccount = paidAccess || dayAccess || (credits.freeSearches > 0) || credits.welcomeGranted;
        if (!hasAccount) {
            isAnonymousUser = true;
        }
    }

    if (isAnonymousUser) {
        if (hasUsedAnonymous) {
            return res.status(402).json({
                error: 'Sign up for free searches to continue',
                code: 'signup_required',
                blurred: true
            });
        }

        await recordAnonymousSearch(clientInfo.ip);

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

    if (!normalizedEmail) {
        return res.status(400).json({ error: 'Email is required for search' });
    }

    const credits = await getCreditStatus(normalizedEmail);
    const canUseFreeSearch = credits.freeSearches > 0;

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

        if (canUseFreeSearch) {
            await consumeFreeSearch(normalizedEmail);
        }

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

// Export the serverless handler
export default serverlessExpress({ app });
