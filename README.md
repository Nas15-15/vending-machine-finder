# Vending Machine Location Finder

A web application that helps you find the best locations to place vending machines by analyzing foot traffic, existing competition, and location potential.

## Features

- **Comprehensive Location Search**: Search by zip code, area code, city, or state
- **High-Traffic Analysis**: Automatically identifies high-traffic locations like:
  - Airports, train stations, bus stations
  - Shopping malls, supermarkets
  - Hospitals, universities, schools
  - Gyms, offices, restaurants
  - And many more...
- **Competition Analysis**: Excludes areas with existing vending machines
- **Smart Ranking**: Scores locations based on:
  - Foot traffic potential
  - Location type
  - Distance from search center
  - Competition density
- **Interactive Map**: Visualize all potential locations on an interactive map
- **Detailed Results**: View scores, metrics, and details for each location

## How to Use

### Quick Start

1. **Install dependencies**: `npm install`
2. **Copy the sample environment file**: `cp env.sample .env` and fill in the values (Stripe, Bitcoin, JWT, owner credentials, etc.)
3. **Run everything with one command**: `npm run dev` (spins up Vite on port 5173 and the API/webhook server on port 4242)
4. Open `http://localhost:5173`
5. Enter a location (zip code, area code, city, or state), provide your email, and click **Search**
6. Optionally adjust search filters:
   - **High traffic areas only**: Only show locations with foot traffic score ≥ 60
   - **Exclude areas with existing vending machines**: Filter out locations that already have vending machines
7. Review results via the interactive map and sortable list

### Stripe Card Payments

1. **Stripe account setup**
   - Create a product + price in the Stripe dashboard (recurring or one-time)
   - Copy your `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, and `STRIPE_WEBHOOK_SECRET`
2. **Environment variables**
   - Duplicate `env.sample` to `.env`
   - Fill in the Stripe keys plus your app URL (defaults to `http://localhost:5173`)
   - Set `VITE_STRIPE_PUBLISHABLE_KEY` so the browser can call `redirectToCheckout`
3. **Run the servers**
   - `npm run dev` (front-end + API)
   - Use the Stripe CLI to forward webhooks locally: `stripe listen --forward-to localhost:4242/api/webhooks/stripe`
4. **Test the flow**
   - Open the paywall, enter your email, and click **Pay with card**
   - Stripe.js handles the redirect; after payment `pay-success.html` confirms the checkout session and persists the unlock server-side

Payments (Stripe + Bitcoin + Coinbase Commerce) are verified server-side, so refreshing the page or switching browsers will still unlock the account as long as `/api/access-status` reports the email as paid.

### Bitcoin Payments (Manual Verification)

1. Set `BITCOIN_ADDRESS`, `BITCOIN_MIN_SATS`, and optionally `BITCOIN_REQUIRED_CONFIRMATIONS` in `.env`
2. User enters transaction ID (TXID) in the paywall
3. Client calls `/api/bitcoin/verify` to check transaction
4. Server verifies payment via Blockstream API:
   - Checks transaction exists and matches recipient address
   - Validates payment amount meets minimum threshold
   - Waits for required confirmations (default: 1)
5. Client polls `/api/bitcoin/status` until confirmations clear
6. Access is automatically unlocked once verified

**Note:** Manual Bitcoin verification has security limitations (transaction ID reuse possible). For a more secure solution, see Coinbase Commerce below.

### Coinbase Commerce Payments (Recommended for Crypto)

Coinbase Commerce provides secure, automated cryptocurrency payments with unique addresses per transaction, preventing payment fraud.

**See [COINBASE_COMMERCE_SETUP.md](./COINBASE_COMMERCE_SETUP.md) for complete integration guide.**

Quick setup:
1. Create account at [commerce.coinbase.com](https://commerce.coinbase.com)
2. Get API key and webhook secret
3. Set `COINBASE_COMMERCE_API_KEY`, `COINBASE_COMMERCE_WEBHOOK_SECRET`, `COINBASE_COMMERCE_PRICE_AMOUNT`, `COINBASE_COMMERCE_PRICE_CURRENCY` in `.env`
4. Install: `npm install @coinbase/commerce-sdk`
5. Follow the detailed guide in `COINBASE_COMMERCE_SETUP.md`

**Benefits:**
- ✅ Secure (unique addresses per payment)
- ✅ Supports multiple cryptocurrencies (BTC, ETH, LTC, etc.)
- ✅ Automated verification via webhooks
- ✅ Professional checkout experience

### Understanding the Results

- **Overall Score**: 0-100 rating of location potential
- **Foot Traffic Score**: Estimated daily foot traffic based on location type
- **Distance**: Distance from your search center
- **Nearby Venues**: Number of other high-traffic locations nearby (bonus points)
- **Type**: Category of location (airport, hospital, gym, etc.)

## Architecture & Security

### Backend-First Design
- **All search logic is server-side**: Geocoding, Overpass queries, and ranking happen on the backend
- **Secure authentication**: JWT-based sessions with hashed credentials stored in environment variables
- **Payment verification**: Stripe webhooks and Bitcoin verification handled server-side with persistence
- **Access control**: All access decisions made by `/api/access-status` endpoint

### API Routes

#### Authentication
- `POST /api/login` - Email + access code authentication
- `POST /api/logout` - Clear session
- `GET /api/session` - Get current session info
- `GET /api/access-status?email=...` - Check access status for an email

#### Payments
- `POST /api/create-checkout-session` - Create Stripe checkout session
- `GET /api/checkout-session?sessionId=...` - Get Stripe session status
- `POST /api/webhooks/stripe` - Stripe webhook handler (raw body)
- `POST /api/bitcoin/verify` - Verify Bitcoin transaction (manual)
- `GET /api/bitcoin/status?txId=...&email=...` - Poll Bitcoin payment status
- `POST /api/coinbase/create-charge` - Create Coinbase Commerce charge
- `GET /api/coinbase/charge-status?chargeId=...` - Get Coinbase charge status
- `POST /api/webhooks/coinbase` - Coinbase Commerce webhook handler

#### Search & Data
- `POST /api/search` - Perform location search (rate limited: 6/min)
- `POST /api/promo/redeem` - Redeem promo code
- `POST /api/waitlist` - Submit waitlist entry
- `GET /api/owner/overview` - Owner dashboard data (requires owner role)

### Environment Variables

See `env.sample` for all required variables. Key ones:
- `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` - Stripe payment configuration
- `BITCOIN_ADDRESS`, `BITCOIN_MIN_SATS`, `BITCOIN_REQUIRED_CONFIRMATIONS` - Bitcoin payment config (manual)
- `COINBASE_COMMERCE_API_KEY`, `COINBASE_COMMERCE_WEBHOOK_SECRET` - Coinbase Commerce config (recommended for crypto)
- `COINBASE_COMMERCE_PRICE_AMOUNT`, `COINBASE_COMMERCE_PRICE_CURRENCY` - Coinbase Commerce pricing
- `JWT_SECRET` - Secret for signing JWT tokens
- `OWNER_EMAIL`, `OWNER_PASSWORD_HASH` - Owner/admin credentials (bcrypt hash)
- `ACCESS_CODE_HASHES` - Comma-separated list of `label:hash` pairs for member access codes
- `NOMINATIM_CONTACT` - Contact email for Nominatim API usage

### Technical Details

- **Server-side search**: All geocoding (Nominatim) and Overpass queries happen on the backend
- **Throttling & caching**: Built-in rate limiting and geocoding cache to respect API policies
- **Persistence**: File-based storage in `data/app-store.json` for access records, waitlist, etc.
- **Frontend**: Modular ES6 codebase with Vite build system
- **Leaflet.js**: Interactive map visualization
- **Grid-based search**: Comprehensive area coverage with intelligent segmentation
- **Deterministic scoring**: Consistent ranking algorithm based on foot traffic, competition, and location type

## Future Enhancements

- Integration with Google Places API for more comprehensive location data
- Real-time vending machine database integration
- Population density data integration
- Historical foot traffic data
- Export results to CSV/PDF
- Save favorite locations

## Testing

Run the test suite:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch  # Add this script if needed
```

Run linting:
```bash
npm run lint
```

### Test Coverage
- Unit tests for access control (`tests/accessControl.spec.js`)
- Payment handler tests (`tests/paymentHandlers.spec.js`)
- Search service tests (`tests/search.spec.js`)
- Promo code tests (`tests/promoCodes.spec.js`)
- Email validation tests (`tests/email.spec.js`)

## Development

### Project Structure
```
├── lib/              # Core business logic
│   ├── accessStore.js    # Access control & persistence
│   ├── bitcoin.js        # Bitcoin payment verification
│   ├── promoCodes.js     # Promo code management
│   └── searchService.js  # Search & geocoding logic
├── src/              # Frontend source
│   ├── api/          # API client utilities
│   ├── features/     # Feature modules (search.js)
│   ├── pages/        # Page-specific scripts
│   ├── state/        # State management
│   ├── styles/       # CSS (base, layout, components, utilities)
│   └── ui/           # UI components (map, paywall, notifications)
├── tests/            # Test files
├── data/             # Persistent storage (app-store.json)
├── server.js         # Express server & routes
├── index.html        # Main entry point
├── login.html        # Login page
├── signup.html       # Signup page
├── promo.html        # Promo code redemption page
├── owner-control-center.html  # Owner dashboard
└── pay-success.html  # Payment success page
```

## Security Features

- ✅ No hardcoded credentials in client code
- ✅ All authentication via backend API
- ✅ JWT sessions with secure httpOnly cookies
- ✅ Hashed passwords and access codes
- ✅ Server-side payment verification
- ✅ Rate limiting on search endpoints
- ✅ Input validation and sanitization
- ✅ CORS protection
- ✅ Owner/admin routes protected by role checks

## Production Considerations

This application uses free APIs with rate limiting. For production use, consider:
- Using paid APIs (Google Places, Foursquare) for better data
- Database instead of file-based storage for scalability
- Redis for caching geocoding results
- Monitoring and logging (e.g., Sentry, LogRocket)
- CDN for static assets
- Separate backend hosting (Render, Railway, Fly.io)

