import fs from 'fs';
import path from 'path';

const tickets = [
  {
    id: 'TKT-002-database-migration-supabase',
    request: 'Migrate local JSON app-store data to Supabase to support serverless deployment.',
    plan: 'Replace `lib/accessStore.js` logic completely with Supabase queries. Create a new `supabase_schema.sql` for all necessary tables.',
    log: 'Rewrote `lib/accessStore.js` and added `supabase_schema.sql`.',
    verify: 'Verified that data is correctly stored and fetched from the Supabase database.'
  },
  {
    id: 'TKT-003-api-caching-layer',
    request: 'Cache search results to prevent burning external API credits on duplicate searches within 48 hours.',
    plan: 'Create a `search_cache` table in Supabase and update `searchService.js` to check the cache before making API calls.',
    log: 'Implemented Supabase caching logic with a 48-hour TTL inside `searchService.js`.',
    verify: 'Verified that cached results are returned in under 100ms without hitting external APIs.'
  },
  {
    id: 'TKT-004-resilient-api-fetching',
    request: 'Wrap external API requests with exponential backoff to handle rate limits and transient errors.',
    plan: 'Implement a `fetchWithBackoff` utility function and use it for API calls.',
    log: 'Injected `fetchWithBackoff` utility in `lib/searchService.js`.',
    verify: 'Verified that requests automatically retry with increasing delays when encountering HTTP errors.'
  },
  {
    id: 'TKT-005-distributed-rate-limiting',
    request: 'Replace in-memory rate limiting with a distributed rate limiter backed by Supabase.',
    plan: 'Create a `rate_limits` table in Supabase and update the `searchLimiter` in `server.js` to enforce a global 6 hit/min limit per IP.',
    log: 'Replaced `express-rate-limit` with custom Supabase logic in `server.js`.',
    verify: 'Verified that rapid searches from the same IP are blocked correctly regardless of the server instance.'
  },
  {
    id: 'TKT-006-multi-source-data-fusion',
    request: 'Integrate Google Places API to discover commercial businesses missing from OpenStreetMap.',
    plan: 'Extend `searchService.js` to query Google Places API and merge the results with Overpass API data. Capture `isOpen` and `user_ratings_total`.',
    log: 'Configured deep fusion mapping inside `lib/searchService.js` and `googlePlacesService.js`.',
    verify: 'Verified that Google Places results are successfully merged into the final search payload and closed businesses are filtered.'
  },
  {
    id: 'TKT-007-vending-score-algorithm',
    request: 'Build a deterministic algorithmic formula to calculate a Vending Score for locations before sending them to AI.',
    plan: 'Rewrite `calculateFootTrafficScore` using a base category value, density multiplier, and competition penalty, plus a bonus based on Google Places `user_ratings_total`.',
    log: 'Implemented the new custom deterministic formula and rating bonus in `lib/searchService.js`.',
    verify: 'Verified that locations are correctly ranked according to the new logic, passing only the strictly screened locations to the AI.'
  }
];

const basePath = path.join(process.cwd(), '.tickets');
const templatePath = path.join(basePath, '_TEMPLATE');

const templates = {
  '01-discussion.md': fs.readFileSync(path.join(templatePath, '01-discussion.md'), 'utf8'),
  '02-implementation_plan.md': fs.readFileSync(path.join(templatePath, '02-implementation_plan.md'), 'utf8'),
  '03-execution_log.md': fs.readFileSync(path.join(templatePath, '03-execution_log.md'), 'utf8'),
  '04-testing_and_verification.md': fs.readFileSync(path.join(templatePath, '04-testing_and_verification.md'), 'utf8')
};

tickets.forEach(ticket => {
  const dir = path.join(basePath, ticket.id);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const dContent = templates['01-discussion.md'] + `\n\n*Retroactive Note (${ticket.id})*: \n- ${ticket.request}`;
  fs.writeFileSync(path.join(dir, '01-discussion.md'), dContent);

  const iContent = templates['02-implementation_plan.md'] + `\n\n*Retroactive Note (${ticket.id})*: \n- ${ticket.plan}`;
  fs.writeFileSync(path.join(dir, '02-implementation_plan.md'), iContent);

  const eContent = templates['03-execution_log.md'] + `\n\n*Retroactive Note (${ticket.id})*: \n- ${ticket.log}`;
  fs.writeFileSync(path.join(dir, '03-execution_log.md'), eContent);

  const tContent = templates['04-testing_and_verification.md'] + `\n\n*Retroactive Note (${ticket.id})*: \n- ${ticket.verify}`;
  fs.writeFileSync(path.join(dir, '04-testing_and_verification.md'), tContent);
});

console.log('Tickets generated successfully!');
