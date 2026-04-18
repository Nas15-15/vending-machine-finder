import fs from 'fs';
fetch('http://127.0.0.1:4242/api/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: '33101', email: 'test@test.com' })
})
.then(r => r.json())
.then(data => fs.writeFileSync('debug_search.json', JSON.stringify(data, null, 2)))
.catch(console.error);
