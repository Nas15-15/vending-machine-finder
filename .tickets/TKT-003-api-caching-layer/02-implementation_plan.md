# Implementation Plan

## Overview
Implement a Supabase caching layer wrapping the `runSearch` export in `searchService.js`.

## File Changes
- `lib/searchService.js`: Added caching logic overriding the standard fetch path if a hit is found.

## Database Schema Updates
Created `search_cache` table with `query_hash`, `payload` (JSONB), and `created_at`.

## API Modifications
Internal data fetch only. No public endpoint changes.

## Step-by-Step Execution Plan
1. Add `search_cache` table to schema.
2. In `runSearch`, compute SHA256 hash of query parameters.
3. Attempt to fetch from Supabase. If 48h fresh, return.
4. If stale or miss, run full search pipeline and upsert result.
