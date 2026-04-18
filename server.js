import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
// Removed accessStore imports

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

app.post('/api/search', searchLimiter, async (req, res) => {
  const {
    query,
    highTrafficOnly = true,
    minScore = 0,
    maxDistance = Infinity,
    categories = null,
    minVisitors = 0,
    maxVisitors = Infinity
  } = req.body || {};

  try {
    const payload = await runSearch(query, {
      highTrafficOnly: Boolean(highTrafficOnly),
      minScore: parseFloat(minScore) || 0,
      maxDistance: maxDistance === Infinity || maxDistance === 'Infinity' ? Infinity : parseFloat(maxDistance),
      categories: Array.isArray(categories) && categories.length > 0 ? categories : null,
      minVisitors: parseInt(minVisitors) || 0,
      maxVisitors: maxVisitors === Infinity || maxVisitors === 'Infinity' ? Infinity : parseInt(maxVisitors) || Infinity
    });

    res.json({
      ...payload,
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
