# Implementation Plan

## Overview
Inject a Promise-based sleep loop wrapper for native `fetch` inside `searchService.js`.

## File Changes
- `lib/searchService.js`: Replaced raw `await fetch()` calls with `fetchWithBackoff()`.

## Database Schema Updates
None

## API Modifications
None

## Step-by-Step Execution Plan
1. Build `fetchWithBackoff` loop utility.
2. Swap out `fetchJsonWithIdent` and Overpass fetch blocks to use the new wrapper.
