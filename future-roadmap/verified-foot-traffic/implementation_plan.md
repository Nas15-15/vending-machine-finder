# Implementation Plan: Verified Foot Traffic Data Integration

## Goal

Replace or augment the current `estimateDailyVisitors()` model-based estimates with real, device-level foot traffic data. The user should see "2,347 daily visitors (verified)" instead of "estimated 2,100 visitors" when data is available.

---

## 1. Data Provider Comparison

| Factor | SafeGraph | Placer.ai | Advan Research | **BestTime.app** |
|---|---|---|---|---|
| **Pricing** | $30K-150K/year enterprise. Free academic via Dewey (requires university affiliation). | $1K+/month. $40-50K/year for full access. 12-month commitment. Freemium dashboard (no API). | Enterprise only. No public pricing. Contact sales. | **$5-50/month.** 100 free credits to start. Pay-as-you-go at $0.04-0.06/credit. |
| **API Access** | Bulk data downloads via S3/Snowflake. No real-time per-venue API for startups. | REST API available, but only on paid plans ($1K+/mo). Well documented. | Bulk CSV delivery. No real-time API. | **REST API.** Per-venue queries. JSON response. Well documented. |
| **Data Type** | Actual device pings (GPS). Monthly aggregates per POI. | Actual device pings. Daily/weekly/monthly. Trade areas. Demographics. | Actual device pings. Daily foot traffic counts. | **Predicted foot traffic** based on Google popular times + ML models. Busyness forecasts by hour. |
| **Coverage** | ~9M US POIs | ~20M+ US locations | ~8M POIs | **Any venue with a Google Business listing** |
| **Startup Viable?** | No. Minimum spend far exceeds bootstrap budget. | No. Even basic API access is $12K+/year. | No. Enterprise sales cycle. | **Yes.** $0-50/month. No contracts. No sales calls. |

### Recommendation

**Phase 1: BestTime.app** — only provider viable at bootstrap budget. Per-venue foot traffic predictions via REST API at $5-50/month. Predicted (not measured GPS), but based on real Google data.

**Phase 2: Placer.ai** — upgrade path once revenue justifies $1K+/month. Actual device-measured foot traffic with demographics and trade areas.

---

## 2. Integration Architecture

### New Service Module

**[NEW] `lib/footTrafficService.js`**

- `fetchFootTraffic(venueName, lat, lon)` — calls BestTime API, returns daily visitor estimate + peak hours + hourly busyness
- `isFootTrafficConfigured()` — checks `BESTTIME_API_KEY` in `.env`
- Supabase caching (7-day TTL, keyed by venue name + lat/lon hash)
- Graceful fallback: returns `null` if venue not found

**BestTime API flow (2 calls per venue):**
1. `POST https://besttime.app/api/v1/forecasts` with venue name + lat/lon → returns `venue_id` + forecast data
2. Parse `analysis.day_info` (daily breakdown) and `analysis.busy_hours` (peak times)

### Modifications

**`lib/searchService.js` — `rankLocations()` (lines 794-881):**
- After computing `estimatedVisitors`, attempt BestTime fetch for each location
- Override `estimatedVisitors` and `peakHours` if BestTime returns data
- Add `trafficSource: 'besttime' | 'estimated'` field
- BestTime calls happen AFTER filtering, limiting to ~30-50 API calls per search

**`.env`** — add `BESTTIME_API_KEY=`

**`server.js`** — add BestTime status to startup display

### Supabase Schema

```sql
CREATE TABLE foot_traffic_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_hash TEXT UNIQUE NOT NULL,
  venue_name TEXT,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  daily_visitors INTEGER,
  peak_hours JSONB,
  hourly_busyness JSONB,
  raw_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);
```

---

## 3. Fallback Strategy

| Scenario | Result | User Sees |
|---|---|---|
| BestTime configured + venue found | Use BestTime data | "~2,340/day 📡 Data-backed" |
| BestTime configured + venue NOT found | Fall back to existing formula | "~2,100/day 📐 Estimated" |
| BestTime NOT configured | Skip entirely | "~2,100/day 📐 Estimated" |
| BestTime rate limited/down | Use cache or fall back | Cache or "Estimated" |

---

## 4. Cost at Startup Scale

| Plan | Cost | Forecasts | Searches/month (with 7-day cache) |
|---|---|---|---|
| Free trial | $0 | 100 credits | Testing only |
| Bronze | $5/mo | 100 forecasts | ~2 searches |
| **Gold** | **$25/mo** | **1,000 forecasts** | **~20 searches** |
| Platinum | $50/mo | 10,000 forecasts | ~200 searches |

**Recommended start:** Gold plan ($25/month).

---

## 5. UX Change

**With BestTime data:** `📊 Daily Visitors: ~2,340/day  📡 Data-backed`

**Without (fallback):** `📊 Daily Visitors: ~2,100/day  📐 Estimated`

Label as "data-backed" (not "verified") since BestTime is predicted, not device-measured. Reserve "verified" for Phase 2 (Placer.ai).

---

## Verification Plan

1. **Unit test** (`test_foot_traffic.js`): verify API call, response parsing, fallback on unknown venue, cache hit
2. **Browser test**: search a city, confirm mix of "Data-backed" and "Estimated" badges
3. **Manual**: compare visitor counts against operator experience
