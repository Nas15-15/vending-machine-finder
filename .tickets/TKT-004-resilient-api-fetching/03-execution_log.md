# Execution Log

## Actions Taken
Replaced native fetches successfully.

## Code Changes
Wrote the while/for loop backoff engine catching 429 and 5xx errors.

## Challenges & Solutions
Ensuring error messages still bubble up if max retries fail.
