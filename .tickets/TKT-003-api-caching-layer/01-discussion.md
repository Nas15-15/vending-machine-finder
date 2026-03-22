# Discussion

## Feature Request / Problem Statement
Cache API search payloads in the database to prevent duplicate requests from eating up API credits.

## User Stories
- As the platform Owner, I want duplicate searches within 48 hours to be served for free so I don't burn Google/OpenAI funds.

## Acceptance Criteria
- [x] Create a `search_cache` table.
- [x] Hash the search payload request and store the result.
- [x] Serve results from cache if under 48h old.

## Brainstorming & Notes
Using a SHA-256 hash of the query + options object creates a perfect cache key.
