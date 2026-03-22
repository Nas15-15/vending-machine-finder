# Discussion

## Feature Request / Problem Statement
Wrap external API requests with exponential backoff to handle transient rate limits or 500 drops.

## User Stories
- As a User, I don't want the search to fail completely just because OSM is having a 2-second hiccup.

## Acceptance Criteria
- [x] Create a generic `fetchWithBackoff` utility.
- [x] Ensure all Nominatim and Overpass calls use it.

## Brainstorming & Notes
Nominatim occasionally drops connections. We need a 3-retry max system before failing.
