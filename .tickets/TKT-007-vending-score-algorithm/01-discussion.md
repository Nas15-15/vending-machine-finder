# Discussion

## Feature Request / Problem Statement
Build a deterministic algorithmic formula to pre-filter/score locations before sending them to AI.

## User Stories
- As the platform Owner, I want to slash OpenAI API costs by strictly sending only the absolute best 50 locations out of the hundreds we find.

## Acceptance Criteria
- [x] Implement a formula mapping Density Multiplier and Competition Penalty.
- [x] Inject `user_ratings_total` as a log-based foot traffic bonus.

## Brainstorming & Notes
Formula: VendingScore = (BaseCategoryValue * DensityMultiplier) - CompetitionPenalty + RatingBonus.
