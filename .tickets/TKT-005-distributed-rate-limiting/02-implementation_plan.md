# Implementation Plan

## Overview
Modify `server.js` to utilize Supabase for stateful IP limit tracking.

## File Changes
- `server.js`: Ripped out `express-rate-limit` from the primary search route and injected custom Supabase checker.

## Database Schema Updates
Created `rate_limits` table parsing hits and rolling 60s windows.

## API Modifications
The `/api/search` route maintains the 429 HTTP status code properly.

## Step-by-Step Execution Plan
1. Update schema.
2. Build the async middleware function in server.js.
3. Keep a fallback in-memory limiter just in case Supabase is unconfigured.
