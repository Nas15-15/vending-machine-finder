# Vending Machine Location Finder

A web application that helps you find the best locations to place vending machines by analyzing foot traffic, existing competition, and location potential.

## Features

- **Comprehensive Location Search**: Search by zip code, area code, city, or state
- **High-Traffic Analysis**: Automatically identifies high-traffic locations like airports, malls, hospitals, universities, gyms, and more
- **Competition Analysis**: Excludes areas with existing vending machines
- **Smart Ranking**: Scores locations based on foot traffic potential, location type, distance from search center, and competition density
- **Interactive Map**: Visualize all potential locations on an interactive map
- **Detailed Results**: View scores, metrics, and details for each location

## Quick Start

1. **Install dependencies**: `npm install`
2. **Copy the sample environment file**: `cp env.sample .env`
3. **Run everything**: `npm run dev` (spins up Vite on port 5173 and the API server on port 4242)
4. Open `http://localhost:5173`
5. Enter a location (zip code, city, or state), provide your email, and click **Search**

## Understanding the Results

- **Overall Score**: 0-100 rating of location potential
- **Foot Traffic Score**: Estimated daily foot traffic based on location type
- **Distance**: Distance from your search center
- **Nearby Venues**: Number of other high-traffic locations nearby
- **Type**: Category of location (airport, hospital, gym, etc.)

## API Routes

### Authentication
- `POST /api/login` - Email + access code authentication
- `POST /api/logout` - Clear session
- `GET /api/session` - Get current session info
- `GET /api/access-status?email=...` - Check access status

### Search & Data
- `POST /api/search` - Perform location search (rate limited: 6/min)
- `POST /api/waitlist` - Submit signup entry

### Environment Variables

See `env.sample` for all required variables:
- `APP_URL` - Frontend URL
- `JWT_SECRET` - Secret for signing JWT tokens
- `ACCESS_CODE_HASHES` - Comma-separated list of `label:hash` pairs for access codes
- `NOMINATIM_CONTACT` - Contact email for Nominatim API usage

## Technical Details

- **Server-side search**: All geocoding (Nominatim) and Overpass queries happen on the backend
- **Throttling & caching**: Built-in rate limiting and geocoding cache
- **Persistence**: File-based storage in `data/app-store.json`
- **Frontend**: Modular ES6 codebase with Vite build system
- **Leaflet.js**: Interactive map visualization

## Project Structure

```
├── lib/              # Core business logic
│   ├── accessStore.js    # Access control & persistence
│   └── searchService.js  # Search & geocoding logic
├── src/              # Frontend source
│   ├── api/          # API client utilities
│   ├── features/     # Feature modules (search.js)
│   ├── pages/        # Page-specific scripts
│   ├── state/        # State management
│   ├── styles/       # CSS
│   └── ui/           # UI components
├── tests/            # Test files
├── data/             # Persistent storage
├── server.js         # Express server & routes
├── index.html        # Main entry point
└── signup.html       # Signup page
```

## Testing

```bash
npm test           # Run test suite
npm run lint       # Run linting
```

## Security Features

- JWT sessions with secure httpOnly cookies
- Hashed access codes
- Rate limiting on endpoints
- Input validation and sanitization
- CORS protection

## License

MIT
