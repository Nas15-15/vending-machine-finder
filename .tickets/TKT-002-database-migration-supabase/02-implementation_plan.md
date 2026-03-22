# Implementation Plan

## Overview
Rewrite `lib/accessStore.js` to use Supabase JS client for all operations previously interacting with the `app-store.json` file.

## File Changes
- `lib/accessStore.js`: Completely rewritten to remove `fs` and use `supabase`.
- `lib/supabaseClient.js`: New file exposing configured Supabase client.
- `supabase_schema.sql`: New file containing table definitions.

## Database Schema Updates
Created `app_users`, `credits`, `waitlist`, `login_events`, `search_events`, `anonymous_searches`, `banned_accounts`, `suspicious_ips`.

## API Modifications
None

## Step-by-Step Execution Plan
1. Create `supabase_schema.sql`.
2. Write `supabaseClient.js` wrapper.
3. Rewrite all exports in `accessStore.js` to run Supabase selects/inserts/upserts.
