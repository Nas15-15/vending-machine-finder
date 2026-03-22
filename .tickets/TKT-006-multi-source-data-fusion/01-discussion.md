# Discussion

## Feature Request / Problem Statement
Integrate Google Places API to find businesses OSM misses.

## User Stories
- As a User, I expect the system to find highly trafficked businesses like car dealerships that OSM usually lacks.

## Acceptance Criteria
- [x] Implement `searchGooglePlaces` in `googlePlacesService.js`.
- [x] Run API in parallel with Overpass.
- [x] Merge arrays and deduplicate by 100m proximity.
- [x] Use Google 'isOpen' flag to filter out permanently closed spots.

## Brainstorming & Notes
Google provides excellent operational status. If a spot is closed permanently, discard it.
