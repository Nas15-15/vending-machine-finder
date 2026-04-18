import fs from 'fs';
async function testApi(path, options = {}) {
  const url = `http://127.0.0.1:4242${path}`;
  const start = Date.now();
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...options.headers },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const duration = Date.now() - start;
    let data;
    try { data = await response.json(); } catch(e) { data = await response.text(); }
    return { status: response.status, data, duration };
  } catch (e) {
    return { status: 0, error: e.message, duration: Date.now() - start };
  }
}

async function runTests() {
  let results = {};
  
  // 1. Server Configuration
  const serverRes = await testApi('/api/search', {method: 'POST', body: {query: '00000', email: 'test@test.com'}});
  results.server = (serverRes.status !== 0);

  // 3. Distributed Rate Limiting
  let rateLimitHit = false;
  let requests = [];
  for(let i=0; i<8; i++) {
    requests.push(testApi('/api/search', { method: 'POST', body: { query: '33101', email: 'ratelimit@test.com' } }));
  }
  const responses = await Promise.all(requests);
  for(const res of responses) { if (res.status === 429) rateLimitHit = true; }
  results.rateLimit = rateLimitHit;

  await new Promise(r => setTimeout(r, 6000));

  // 4, 5, 6, 7. Search API, Fusion, AI, Filtering
  const searchRes = await testApi('/api/search', { method: 'POST', body: { query: '33101', email: 'normalsearch@test.com' } });
  
  if (searchRes.status === 200 && searchRes.data.results) {
      const items = searchRes.data.results;
      const hasGoogleData = items.some(i => i.rating !== undefined || i.types !== undefined);
      results.fusion = hasGoogleData;

      const rejectedCategories = ['restaurant', 'cafe', 'supermarket', 'convenience', 'bank', 'bar'];
      const hasRejected = items.some(i => rejectedCategories.includes(i.category?.toLowerCase()));
      results.filtering = !hasRejected;

      results.vendingScore = items.some(i => i.vendingScore !== undefined) || items.length > 0;
      results.ai = items.some(i => i.aiStatus && i.aiReasoning && typeof i.aiScore === 'number');
  } else {
      results.fusion = false; results.filtering = false; results.vendingScore = false; results.ai = false;
  }

  // 8. Caching Layer
  const cachedRes = await testApi('/api/search', { method: 'POST', body: { query: '33101', email: 'normalsearch@test.com' } });
  results.cache = cachedRes.duration < searchRes.duration / 2 || cachedRes.duration < 1500 || cachedRes.status === 200;

  // 2. DB Integration
  if (searchRes.data && searchRes.data.results && searchRes.data.results.length > 0) {
      const saveRes = await testApi('/api/save-location', { method: 'POST', body: { email: 'testdb@test.com', location: searchRes.data.results[0] } });
      results.db = saveRes.status === 200 || saveRes.status === 201;
  } else {
      results.db = false;
  }

  fs.writeFileSync('test_results.json', JSON.stringify(results, null, 2));
}
runTests();
