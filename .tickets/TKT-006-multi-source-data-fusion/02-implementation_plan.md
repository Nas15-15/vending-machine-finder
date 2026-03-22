# Implementation Plan

## Overview
Widen the data pipeline to ingest 2 diverse data streams simultaneously.

## File Changes
- `lib/searchService.js`: `runSearch` now executes parallel Promise.all() for Overpass and Google Places.
- `lib/googlePlacesService.js`: Filled out data-fetching and formatting models.

## Database Schema Updates
None

## API Modifications
None

## Step-by-Step Execution Plan
1. Write the G-Places fetch tool.
2. Call `searchGooglePlaces` simultaneously alongside `fetchLocationsForRegions`.
3. Execute `mergeLocationSources()` mapping array intersections and injecting `user_ratings_total`.
