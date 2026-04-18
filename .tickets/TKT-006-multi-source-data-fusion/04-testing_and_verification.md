# Backend System Testing Checklist (No UI)

This checklist covers the verification of **every single aspect of the backend system**, focusing strictly on data flow, logic, resilience, and API functionality without relying on the UI.

## 1. ⚙️ Server & Environment Configuration
- ✅ **Startup Initialization:** Run `npm run dev` and ensure the server starts without errors or crashes.
- ✅ **Environment Variables:** Verify `.env` variables are correctly loaded (`SUPABASE_URL`, `SUPABASE_KEY`, `GOOGLE_PLACES_API_KEY`, `OPENAI_API_KEY`).
- ✅ **API Key Checks:** Confirm startup logs dynamically print `[Google Places API: Active]` and `[AI Evaluation: Active]`.

## 2. 🗄️ Database Integration (Supabase)
- ❌ **Connection Test:** Execute a simple read/write operation directly to the Supabase instance to verify connectivity.
- ❌ **Data Model (Locations):** Directly invoke the endpoint for saving a location; verify the data is structured correctly in the Supabase table.
- ❌ **Data Model (Retrieval/Deletion):** Retrieve saved locations via API and verify accuracy. Delete a location via API and confirm its removal from the DB.

## 3. 🛡️ Distributed Rate Limiting (Supabase)
- ✅ **Under Limit:** Send 3 backend search requests consecutively and verify `200 OK` status for all. (Passed as regular queries returned 200).
- ❌ **Over Limit:** Rapidly send requests exceeding the configured rate limit.
- ❌ **Block Verification:** Confirm the API strictly returns a `429 Too Many Requests` or equivalent JSON error message instead of processing the request.
- ❌ **Reset Verification:** Wait for the rate limit window to expire and send a new request to confirm access is restored.

## 4. 🔗 Multi-Source Data Fusion (Search Pipeline)
- ✅ **Source 1 (Overpass API):** Trigger a backend search query and verify raw payload data comes from Overpass (OSM).
- ✅ **Source 2 (Google Places API):** Verify the enrichment step runs, augmenting OSM data with Google ratings, current operating hours, and precise business types.
- ✅ **Deduplication:** Check the final fused JSON array to ensure no identical locations appear twice (e.g., overlapping IDs or coordinates).
- ❌ **Graceful Degradation:** Temporarily disable the `GOOGLE_PLACES_API_KEY`. Verify the search completes using *only* Overpass data without crashing.

## 5. 🎯 Filtering & Categorization Rules
*Run a dense city query (e.g., "Miami 33101") via `Invoke-RestMethod` or `curl`:*
- ✅ **Instant Rejections:** Search the returned JSON to ensure **NO** elements from the 'Rejection List' exist (e.g., `restaurant`, `cafe`, `supermarket`, `fuel/gas_station`, `bank`, `bar`).
- ✅ **Golden Tickets:** Search the returned JSON to confirm 'Golden Ticket' locations successfully passed the filter (e.g., `gym`, `hospital`, `school`).

## 6. 🧮 "Vending Score" Algorithm (Pre-filtering)
- ✅ **Score Calculation:** Trigger a backend search and intercept the data payload before it reaches the AI.
- ✅ **Metrics:** Ensure each location has a computed "Vending Score" based on predefined metrics (e.g., foot traffic proxy, operating hours, category multiplier).
- ✅ **Culling:** Verify that low-scoring locations (below the minimum threshold) are discarded *before* being sent to the LLM (to save tokens).

## 7. 🤖 AI Evaluation Engine (OpenAI)
*Based strictly on the rules in `AI_RULES.md`:*
- ✅ **Payload Verification:** Check that the precise, pre-filtered location array is properly passed to the OpenAI API along with the correct persona system prompt.
- ✅ **Schema Compliance:** Ensure the AI strictly returns a valid JSON array format `[ { "businessName", "score", "status", "reasoning" } ]`.
- ✅ **Status Accuracy:** Verify the outputs map exactly to `APPROVED`, `REJECTED`, or `CONDITIONAL`.
- ✅ **Human-Like Reasoning:** Spot-check `aiReasoning` texts to confirm they read like a casual vending machine operator, without robotic wording.
- ❌ **Fallback Test:** Disable the `OPENAI_API_KEY`. Execute a search and confirm the system returns the pre-filtered locations smoothly without the AI enhancement fields.

## 8. 🔄 API Resilience & Caching Layer
- ✅ **Caching Layer (Hit/Miss):** Execute a query and check the response time. Re-execute the exact same query immediately and verify a near-instant response time (Cache HIT).
- ✅ **Cache Invalidation:** Verify that the cache naturally expires or can be bypassed as configured.
- ✅ **Exponential Backoff:** Simulate a timeout/500 error from an external API (Google or Overpass). Verify the backend executes automatic retries using progressive delays before finally aborting.
