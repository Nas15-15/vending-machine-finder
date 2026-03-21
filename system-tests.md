# 🔍 Search System Testing Checklist

> **Note:** All commands below are for **PowerShell**. Your dev server must be running (`npm run dev`).

---

## Test 1: Server Startup — Integration Status
Open the terminal where `npm run dev` is running. You should see:
```
Integration status:
  ✅ Google Places API: Active
  ✅ AI Evaluation:     Active
```
- [ ] Both show ✅? If either shows ⚠️, the API key in `.env` is missing or empty.

---

## Test 2: Basic Search — Hit the API
Open a **new** PowerShell terminal and run:
```powershell
Invoke-RestMethod -Uri "http://localhost:4242/api/search" -Method POST -ContentType "application/json" -Body '{"query":"33101","email":"test@test.com"}' | ConvertTo-Json -Depth 10
```
*(33101 = Miami. Use any zip code you want.)*

- [ ] Does it return results? (not an error)
- [ ] Check the server terminal logs — do you see `[Google Places]` log lines?
- [ ] Check the server terminal logs — do you see `[AI Evaluation] Sending X locations to OpenAI...`?

---

## Test 3: No Rejected Categories
Look at the JSON results from Test 2. Check every result's `category` field.

- [ ] **No restaurants** appear (`restaurant`, `fast_food`)
- [ ] **No cafes** appear (`cafe`)
- [ ] **No supermarkets/grocery stores** appear (`supermarket`, `convenience`) — **NO PUBLIX**
- [ ] **No bars/pubs** appear
- [ ] **No banks** appear
- [ ] **No gas stations** appear (`fuel`)

**Quick check command** — lists all categories in the results:
```powershell
$r = Invoke-RestMethod -Uri "http://localhost:4242/api/search" -Method POST -ContentType "application/json" -Body '{"query":"33101","email":"test@test.com"}'
$r.results | ForEach-Object { $_.category } | Sort-Object -Unique
```

---

## Test 4: Golden Ticket Categories Show Up
The results should contain vending-relevant locations:

- [ ] Gyms / Fitness Centers (`gym`)
- [ ] Hospitals / Medical (`hospital`)
- [ ] Schools / Universities (`school`, `university`)
- [ ] Hotels (`hotel`) — if any in the area
- [ ] Fire Stations / Police Stations (`fire_station`, `police_station`) — if any
- [ ] Car dealerships / repair shops (`car_dealership`, `car_repair`) — if any
- [ ] Libraries, community centers (`library`, `community_centre`)

---

## Test 5: AI Evaluation Working
Look at the result objects in the JSON. Each should have AI fields:

- [ ] `aiScore` — a number 0–100
- [ ] `aiStatus` — `"APPROVED"`, `"REJECTED"`, or `"CONDITIONAL"`
- [ ] `aiReasoning` — a human-sounding sentence (e.g., *"This gym is packed every evening..."*)

**Quick check command:**
```powershell
$r = Invoke-RestMethod -Uri "http://localhost:4242/api/search" -Method POST -ContentType "application/json" -Body '{"query":"33101","email":"test@test.com"}'
$r.results | Select-Object name, category, aiScore, aiStatus, aiReasoning | Format-Table -Wrap
```

---

## Test 6: Different Locations
Run the search with different queries:

**Big city (NYC):**
```powershell
Invoke-RestMethod -Uri "http://localhost:4242/api/search" -Method POST -ContentType "application/json" -Body '{"query":"10001","email":"test@test.com"}' | ConvertTo-Json -Depth 5
```
- [ ] Returns results

**Suburb (Winter Park, FL):**
```powershell
Invoke-RestMethod -Uri "http://localhost:4242/api/search" -Method POST -ContentType "application/json" -Body '{"query":"32789","email":"test@test.com"}' | ConvertTo-Json -Depth 5
```
- [ ] Returns results

**Rural area (Montana):**
```powershell
Invoke-RestMethod -Uri "http://localhost:4242/api/search" -Method POST -ContentType "application/json" -Body '{"query":"59001","email":"test@test.com"}' | ConvertTo-Json -Depth 5
```
- [ ] Returns results OR a clear `"No locations found"` error

**Empty query:**
```powershell
Invoke-RestMethod -Uri "http://localhost:4242/api/search" -Method POST -ContentType "application/json" -Body '{"query":"","email":"test@test.com"}'
```
- [ ] Returns error: `"Location query required"`

**Fake location:**
```powershell
Invoke-RestMethod -Uri "http://localhost:4242/api/search" -Method POST -ContentType "application/json" -Body '{"query":"zzzzzzzzz","email":"test@test.com"}'
```
- [ ] Returns error: `"Location not found"`

---

## Test 7: Fallback — No AI Key
1. In `.env`, temporarily set `OPENAI_API_KEY=` (blank)
2. Restart `npm run dev`
3. Run any search from Test 2

- [ ] Results still come back (just without `aiScore`/`aiReasoning` fields)
- [ ] Server logs show `[AI Evaluation] No API key configured, skipping`
- [ ] Startup shows `⚠️ AI Evaluation: Not configured`

**Restore the key when done.**

---

## Test 8: Fallback — No Google Places Key
1. In `.env`, temporarily set `GOOGLE_PLACES_API_KEY=` (blank)
2. Restart `npm run dev`
3. Run any search from Test 2

- [ ] Results still come back (from Overpass/OSM only)
- [ ] Server logs show `[Google Places] No API key configured, skipping`
- [ ] Startup shows `⚠️ Google Places API: Not configured`

**Restore the key when done.**

---

## Test 9: Rate Limiting
Run this command **7 times in a row** as fast as you can:
```powershell
1..7 | ForEach-Object { Write-Host "Request $_"; Invoke-RestMethod -Uri "http://localhost:4242/api/search" -Method POST -ContentType "application/json" -Body '{"query":"33101","email":"test@test.com"}' | Select-Object -ExpandProperty error -ErrorAction SilentlyContinue }
```
- [ ] The 7th request returns `"Too many searches from this IP, please try again shortly."`

---

## Alternative: Browser Console Method
If PowerShell gives you issues, open `http://localhost:5173` in your browser, press F12, go to Console, and paste:
```js
fetch('/api/search', {
  method: 'POST',
  headers: {'Content-Type':'application/json'},
  body: JSON.stringify({query:'33101', email:'test@test.com'})
}).then(r => r.json()).then(d => {
  console.log('Total results:', d.results?.length);
  console.table(d.results?.map(r => ({
    name: r.name,
    category: r.category,
    aiScore: r.aiScore,
    aiStatus: r.aiStatus,
    aiReasoning: r.aiReasoning
  })));
});
```
