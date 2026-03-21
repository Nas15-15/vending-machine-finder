-- Supabase Schema for Vending Machine Finder
-- Run this in the Supabase SQL Editor

-- 1. Users & Credits
CREATE TABLE IF NOT EXISTS app_users (
  email TEXT PRIMARY KEY,
  method TEXT,
  role TEXT DEFAULT 'member',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credits (
  email TEXT PRIMARY KEY REFERENCES app_users(email) ON DELETE CASCADE,
  free_searches INTEGER DEFAULT 0,
  day_access_expiry BIGINT DEFAULT 0,
  welcome_granted BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Access Control & Bans
CREATE TABLE IF NOT EXISTS banned_accounts (
  email TEXT PRIMARY KEY,
  reason TEXT,
  banned_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Waitlist & Promo & Verification
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT,
  company TEXT,
  fleet_size TEXT,
  goals TEXT,
  ip TEXT,
  user_agent TEXT,
  device_type TEXT,
  country TEXT,
  city TEXT,
  region TEXT,
  country_code TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promo_usage (
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (email, code)
);

CREATE TABLE IF NOT EXISTS bitcoin_verifications (
  tx_id TEXT PRIMARY KEY,
  payload JSONB,
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tracking & Events
CREATE TABLE IF NOT EXISTS login_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  role TEXT,
  method TEXT,
  ip TEXT,
  user_agent TEXT,
  device_type TEXT,
  country TEXT,
  city TEXT,
  region TEXT,
  country_code TEXT,
  occurred_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS search_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  query TEXT,
  results_count INTEGER,
  ip TEXT,
  user_agent TEXT,
  device_type TEXT,
  country TEXT,
  city TEXT,
  region TEXT,
  country_code TEXT,
  occurred_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS anonymous_searches (
  ip TEXT PRIMARY KEY,
  count INTEGER DEFAULT 0,
  last_search TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suspicious_ips (
  ip TEXT PRIMARY KEY,
  account_count INTEGER DEFAULT 0,
  first_detected TIMESTAMPTZ DEFAULT NOW(),
  last_detected TIMESTAMPTZ DEFAULT NOW(),
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ
);

-- 5. Caching & Rate Limiting
CREATE TABLE IF NOT EXISTS search_cache (
  query_hash TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rate_limits (
  ip TEXT PRIMARY KEY,
  hits INTEGER DEFAULT 0,
  window_start BIGINT NOT NULL
);

-- Create simple RLS policies to restrict external access if needed,
-- but since this is used server-side with service-role, it will bypass RLS.
