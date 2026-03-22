# Discussion

## Feature Request / Problem Statement
Implement a true distributed DB-backed rate limiter to replace `express-rate-limit`.

## User Stories
- As an Admin, I want rate limits to apply globally horizontally, not just per server-instance memory.

## Acceptance Criteria
- [x] Create `rate_limits` table.
- [x] Write custom Express middleware backing against Supabase.

## Brainstorming & Notes
Memory-based limits break when Vercel spins up 5 different isolated instances based on traffic.
