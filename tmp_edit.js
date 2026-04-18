const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// 1. Remove accessStore imports
code = code.replace(/import\s*\{\s*hasPaidAccess[\s\S]*?\}\s*from\s*'\.\/lib\/accessStore\.js';/, '// Removed accessStore imports');

// 2. Remove token and session helpers
// Match from const cookieOptions = { ... up to but not including // Helper to extract client IP
code = code.replace(/const cookieOptions = \{[\s\S]*?(?=\/\/ Helper to extract client IP)/, '');

// 3. Remove routes from /api/session up to right before /api/search
code = code.replace(/app\.get\('\/api\/session',[\s\S]*?(?=app\.post\('\/api\/search')/, '');

// 4. Update /api/search
const searchRegex = /app\.post\('\/api\/search', searchLimiter, async \(req, res\) => \{[\s\S]*?\}\);\n/;
const newSearch = `app.post('/api/search', searchLimiter, async (req, res) => {
  const {
    query,
    highTrafficOnly = true,
    minScore = 0,
    maxDistance = Infinity,
    categories = null,
    minVisitors = 0,
    maxVisitors = Infinity
  } = req.body || {};

  try {
    const payload = await runSearch(query, {
      highTrafficOnly: Boolean(highTrafficOnly),
      minScore: parseFloat(minScore) || 0,
      maxDistance: maxDistance === Infinity || maxDistance === 'Infinity' ? Infinity : parseFloat(maxDistance),
      categories: Array.isArray(categories) && categories.length > 0 ? categories : null,
      minVisitors: parseInt(minVisitors) || 0,
      maxVisitors: maxVisitors === Infinity || maxVisitors === 'Infinity' ? Infinity : parseInt(maxVisitors) || Infinity
    });

    res.json({
      ...payload,
      blurred: false
    });
  } catch (error) {
    console.error('[Search Route] Error:', error);
    const statusCode = error.message.includes('not found') ? 404 : 500;
    res.status(statusCode).json({
      error: error.message || 'Search failed',
      code: 'SEARCH_ERROR'
    });
  }
});\n`;

code = code.replace(searchRegex, newSearch);

fs.writeFileSync('server.js', code);
console.log('Done replacement text');
