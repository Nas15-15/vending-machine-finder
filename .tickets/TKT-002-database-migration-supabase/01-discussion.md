# Discussion

## Feature Request / Problem Statement
Migrate local JSON app-store data to Supabase to support safe serverless deployments.

## User Stories
- As a Developer, I want to remove `app-store.json` so the app doesn't lose state when deployed on Vercel.
- As a System Admin, I want data stored safely in a proper relational database.

## Acceptance Criteria
- [x] Remove `fs` usage completely from `accessStore.js`.
- [x] Create and connect to a Supabase project.
- [x] Write an SQL schema to map the app-store data.

## Brainstorming & Notes
The old JSON approach won't work on serverless environments because the file system is ephemeral.
