import re

with open("server.js", "r", encoding="utf-8") as f:
    text = f.read()

# 1. Remove accessStore imports
text = re.sub(r"import\s*\{[\s\S]*?\}\s*from\s*'\.\/lib\/accessStore\.js';", "// Removed accessStore imports", text)

# 2. Remove token and session helpers
start_idx = text.find("const cookieOptions = {")
end_idx = text.find("// Helper to extract client IP")
if start_idx != -1 and end_idx != -1:
    text = text[:start_idx] + text[end_idx:]

# 3. Remove routes from /api/session up to right before /api/search
start_idx = text.find("app.get('/api/session',")
end_idx = text.find("app.post('/api/search'")
if start_idx != -1 and end_idx != -1:
    text = text[:start_idx] + text[end_idx:]

# 4. Replace /api/search
start_idx = text.find("app.post('/api/search'")
if start_idx != -1:
    end_idx = text.find("});\n\nif (process.env.NODE_ENV === 'production') {", start_idx)
    if end_idx != -1:
        new_search = """app.post('/api/search', searchLimiter, async (req, res) => {
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
"""
        text = text[:start_idx] + new_search + text[end_idx:]

with open("server.js", "w", encoding="utf-8") as f:
    f.write(text)

print("Done")
