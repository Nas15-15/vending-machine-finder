import dotenv from 'dotenv';
dotenv.config();

import { runSearch, geocodeLocation } from './lib/searchService.js';
import { isAIConfigured } from './lib/aiEvaluationService.js';

console.log('OPENAI_API_KEY set:', !!process.env.OPENAI_API_KEY);
console.log('isAIConfigured:', isAIConfigured());

async function testQuery(q) {
  try {
    console.log(`\n\n--- Testing Query: ${q} ---`);
    const geo = await geocodeLocation(q);
    console.log('Geocoded to:', JSON.stringify(geo).substring(0, 150));
    const result = await runSearch(q, {
      excludeExisting: true,
      highTrafficOnly: true,
      minScore: 0,
      maxDistance: Infinity,
      categories: null,
      minVisitors: 0,
      maxVisitors: Infinity
    }, (msg) => console.log(' Progress:', msg));
    
    console.log(`Results found: ${result.results.length}`);
    if (result.results.length > 0) {
      const top = result.results[0];
      console.log(`Top result: ${top.name} (${top.category})`);
      console.log(`AI fields -> score: ${top.aiScore}, status: ${top.aiStatus}, reasoning: ${top.aiReasoning}`);
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

async function runAll() {
  await testQuery('10001');
  await testQuery('32789');
  await testQuery('59001');
  console.log('DONE');
}

runAll();
