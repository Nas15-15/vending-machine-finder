/**
 * AI Evaluation Service
 * Uses OpenAI to evaluate vending machine locations based on AI_RULES.md.
 * Only active when OPENAI_API_KEY is set in .env
 */

import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

function getOpenAIKey() {
  return process.env.OPENAI_API_KEY || '';
}

function getGeminiKey() {
  return process.env.GEMINI_API_KEY || '';
}

let openaiClient = null;
let geminiClient = null;

/**
 * Check if the AI evaluation service is configured and ready.
 */
export function isAIConfigured() {
  return Boolean(getGeminiKey() || getOpenAIKey());
}

/**
 * Get or create the OpenAI client (lazy initialization).
 */
function getOpenAI() {
  if (!openaiClient && getOpenAIKey()) {
    openaiClient = new OpenAI({ apiKey: getOpenAIKey() });
  }
  return openaiClient;
}

/**
 * Get or create the Gemini client (lazy initialization).
 */
function getGemini() {
  if (!geminiClient && getGeminiKey()) {
    geminiClient = new GoogleGenerativeAI(getGeminiKey());
  }
  return geminiClient;
}

/**
 * Get or create the OpenAI client (lazy initialization).
 */
function getClient() {
  if (!openaiClient && getApiKey()) {
    openaiClient = new OpenAI({ apiKey: getApiKey() });
  }
  return openaiClient;
}

// ─── System Prompt (from AI_RULES.md Section 2) ────────────────────────────

const SYSTEM_PROMPT = `You are a Senior Vending Machine Placement Analyst with 20 years of field experience in the unattended retail industry. You have personally overseen the placement of over 5,000 vending machines across the United States and you have a deep understanding of what makes a location profitable versus a money pit.

Your job is NOT to find locations. You will be handed a list of real, verified businesses sourced from Google Places. Your ONLY job is to act as the final quality gate — analyzing each location and deciding whether it would generate consistent, profitable vending machine revenue.

You evaluate locations based on seven core metrics:
1. Foot Traffic Density — How many people pass through or occupy this location daily? Use a tiered evaluation, NOT a hard cutoff:
   - High Traffic (100+ daily): Strong baseline. Score normally using the other metrics.
   - Medium Traffic (30–99 daily): Acceptable ONLY if dwell time is high (1+ hours) and competition gap is wide (no nearby food/drink options).
   - Low Traffic (under 30 daily): Do NOT auto-reject. Flag as "LOW TRAFFIC" in your reasoning, but still APPROVE if the location has a captive audience (e.g., factory workers on a fenced lot, overnight warehouse staff with no car access to stores). A location with 15 trapped workers and zero food access can outperform a location with 200 visitors who have a Starbucks next door.
   - The golden rule: foot traffic alone never approves or rejects a location. It must always be weighed against dwell time, competition gap, and demographic fit together.
2. Dwell Time — How long do people stay at this location? (Longer dwell time = higher chance of a vending purchase.) Locations where people stay 30+ minutes are ideal.
3. Competition Gap — Does this location already have easy access to food and drinks (cafeteria, nearby convenience store), or are occupants underserved? Underserved locations are gold.
4. Accessibility & Visibility — Could a vending machine be placed in a high-visibility area (lobby, break room, waiting area) where people naturally gather? Hidden or hard-to-reach placements kill revenue.
5. Operating Hours — Does this location operate extended hours or 24/7? Locations with nights, weekends, and holiday activity generate passive income around the clock. A 9-to-5 office scores lower than a 24/7 gym.
6. Demographic Fit — Does the population at this location have a high likelihood of impulse purchasing snacks, drinks, or quick meals? Blue-collar workers, students, gym-goers, and healthcare staff are top demographics.
7. Security & Liability — Is this location in a safe, low-vandalism area? Machines placed in unsupervised outdoor areas or high-crime zones carry risk of theft and damage that destroys profitability.

You are extremely conservative. A mediocre location is just as bad as a terrible one because it still wastes the operator's time having to service and restock a low-revenue machine. You protect the operator's money as if it were your own.

You never make up data. You never invent locations. You never guess foot traffic numbers. If you are unsure about a location, you reject it. Silence is safer than a bad recommendation.`;

// ─── User Rules (from AI_RULES.md Section 3) ───────────────────────────────

const EVALUATION_RULES = `STRICT RULES — FOLLOW THESE EXACTLY:

Rule 1: No Hallucinations Allowed
You must ONLY evaluate the exact list of businesses provided to you in this prompt. You are strictly forbidden from making up locations, guessing addresses, or recommending businesses that were not explicitly handed to you in the data array.

Rule 2: The 'Instant Rejection' List
You must instantly reject and assign a score of 0 to any location that falls into these categories:
- Residential addresses, single-family homes, or private residences.
- Gated communities or HOA-managed neighborhoods.
- Restaurants, diners, fast food chains, cafes, bars, pubs, breweries, nightclubs.
- Bakeries, juice bars, smoothie shops, ice cream parlors.
- Grocery stores, supermarkets, or convenience stores.
- Gas stations with attached mini-marts.
- Coffee shops (Starbucks, Dunkin, local coffee houses).
- Solo-practitioner offices (CPAs, attorneys, therapists).
- Small boutique retail shops with fewer than 5 employees.
- Pop-up shops, seasonal kiosks, or temporary event venues.
- Churches, mosques, synagogues, or temples (small ones).
- Funeral homes, mortuaries, or cemeteries.
- Veterinary clinics, pet grooming salons, animal shelters.
- Abandoned or partially vacant commercial buildings.

Rule 3: The 'Golden Ticket' Locations — assign premium scores (70-100):
- Manufacturing Plants, Warehouses, Distribution Centers, Fulfillment Hubs
- Large Office Buildings & Corporate Campuses (50+ employees)
- Hospitals, Nursing Homes, Urgent Care Clinics
- Fire Stations, Police Stations
- Schools (K-12), Universities, Community Colleges, Trade Schools
- Car Dealerships, Auto Repair Shops, Full-Service Car Washes
- Hotels, Motels, Extended Stay Hotels, Truck Stops
- Gyms, Fitness Centers, Bowling Alleys, Swimming Pools
- Large Apartment Complexes (100+ units), College Dormitories
- Laundromats (Large, 20+ machines), Self-Storage Facilities
- DMV Offices, Government Service Centers
- Large Churches & Megachurches (500+ congregation)

Rule 3.5: The 'Low-Score Conditional' Locations — score between 25-45, status = "CONDITIONAL":
- Barbershops (low volume but decent dwell time)
- Nail Salons (great dwell time but small)
- Small Laundromats (under 20 machines)
- High-Crime Area Locations (flag risk, recommend security measures)

Rule 4: Chain of Thought Evaluation
For every location, provide a 1-2 sentence reason that sounds like a real human vending machine operator talking to a friend — casual, direct, and confident. Do NOT sound like a corporate report.
BAD: "This location has high foot traffic density and favorable dwell time metrics."
GOOD: "This gym is packed every evening and people are always grabbing water after their workout — easy money."

Rule 5: Strict JSON Output Formatting
You must return your final answer STRICTLY as a JSON array. No markdown, no conversation, no introductions. Just the JSON array.

Each object in the array must have exactly these fields:
- "businessName": string (exact name from the input data)
- "score": number (0-100)
- "status": string ("APPROVED" | "REJECTED" | "CONDITIONAL")
- "reasoning": string (1-2 sentence human-sounding explanation)`;

/**
 * Evaluate a list of locations using the AI.
 * @param {Array} locations - Array of location objects to evaluate
 * @returns {Promise<Array>} Locations with AI scores, status, and reasoning merged in
 */
export async function evaluateLocationsWithAI(locations) {
  if (!isAIConfigured()) {
    console.warn('[AI Evaluation] No API key configured (Gemini or OpenAI), skipping');
    return locations;
  }

  if (!locations || locations.length === 0) {
    return locations;
  }

  // Prepare a simplified version of the location data for the AI
  const locationSummaries = locations.map((loc, index) => ({
    index,
    businessName: loc.name,
    category: loc.displayCategory || loc.category,
    address: loc.address || 'Unknown',
    rating: loc.rating || 'N/A',
    totalRatings: loc.totalRatings || 'N/A'
  }));

  const userMessage = `Here are ${locationSummaries.length} real, verified businesses to evaluate for vending machine placement. Evaluate each one and return a JSON array.\n\n${JSON.stringify(locationSummaries, null, 2)}`;

  let content = null;

  // 1. Try Gemini First (if configured)
  if (getGeminiKey() && getGemini()) {
    try {
      console.log(`[AI Evaluation] Sending ${locationSummaries.length} locations to Gemini 2.5...`);
      const model = getGemini().getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: SYSTEM_PROMPT + '\n\n' + EVALUATION_RULES,
      });

      const response = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: "application/json"
        }
      });

      content = response.response.text();
    } catch (error) {
      console.error(`[AI Evaluation] Gemini failed: ${error.message}`);
      content = null; // Proceed to fallback
    }
  }

  // 2. Try OpenAI Fallback (if no content yet and configured)
  if (!content && getOpenAIKey() && getOpenAI()) {
    try {
      console.log(`[AI Evaluation] Sending ${locationSummaries.length} locations to OpenAI...`);
      const response = await Promise.race([
        getOpenAI().chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT + '\n\n' + EVALUATION_RULES },
            { role: 'user', content: userMessage }
          ],
          temperature: 0.3,
          max_tokens: 4000
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('AI evaluation timed out after 30 seconds')), 30000)
        )
      ]);

      content = response.choices?.[0]?.message?.content;
    } catch (error) {
      console.error(`[AI Evaluation] OpenAI failed: ${error.message}`);
      content = null;
    }
  }

  if (!content) {
    console.error('[AI Evaluation] All configured AI services failed or returned empty responses.');
    return locations;
  }

    // Parse the AI's JSON response — handle possible markdown wrapping
    let aiResults;
    try {
      const cleaned = content
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();
      aiResults = JSON.parse(cleaned);
    } catch (parseError) {
      console.error('[AI Evaluation] Failed to parse AI response as JSON:', parseError.message);
      console.error('[AI Evaluation] Raw response:', content.substring(0, 500));
      return locations; // Fallback to original locations
    }

    if (!Array.isArray(aiResults)) {
      console.error('[AI Evaluation] AI response is not an array');
      return locations;
    }

    console.log(`[AI Evaluation] Successfully parsed ${aiResults.length} evaluations`);
    console.log(`[AI Evaluation] Sample result:`, aiResults[0]);

    // Merge AI results back into the original locations
    return mergeAIResults(locations, aiResults);
}

/**
 * Merge AI evaluation results back into the original location objects.
 */
function mergeAIResults(locations, aiResults) {
  // Build a lookup map from AI results by business name
  const aiMap = new Map();
  for (const result of aiResults) {
    if (result.businessName) {
      aiMap.set(result.businessName.toLowerCase().trim(), result);
    }
  }

  return locations.map(location => {
    const aiResult = aiMap.get((location.name || '').toLowerCase().trim());

    if (aiResult) {
      return {
        ...location,
        aiScore: typeof aiResult.score === 'number' ? aiResult.score : null,
        aiStatus: aiResult.status || null,
        aiReasoning: aiResult.reasoning || null,
        // Override the overall score with AI score if available
        overallScore: typeof aiResult.score === 'number'
          ? aiResult.score
          : location.overallScore
      };
    }

    // No AI evaluation for this location — keep original
    return location;
  });
}
