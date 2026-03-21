/**
 * Google Places API Service
 * Searches for real businesses near a location and fetches contact details.
 * Only active when GOOGLE_PLACES_API_KEY is set in .env
 */

function getApiKey() {
  return process.env.GOOGLE_PLACES_API_KEY || '';
}

// In-memory cache to avoid redundant API calls (keyed by lat_lon_radius)
const placesCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Business types that are relevant for vending machine placement.
 * Maps to Google Places API "type" parameter.
 */
const VENDING_RELEVANT_TYPES = [
  'gym',
  'hospital',
  'school',
  'university',
  'car_dealer',
  'car_repair',
  'car_wash',
  'lodging',
  'fire_station',
  'police',
  'bowling_alley',
  'bus_station',
  'train_station',
  'airport',
  'laundry',
  'storage',
  'stadium',
  'shopping_mall',
  'library',
  'movie_theater',
  'community_center',
  'swimming_pool'
];

/**
 * Check if the Google Places service is configured and ready.
 */
export function isGooglePlacesConfigured() {
  return Boolean(getApiKey());
}

/**
 * Search Google Places API for vending-relevant businesses near a location.
 * @param {number} lat - Center latitude
 * @param {number} lon - Center longitude
 * @param {number} radius - Search radius in meters (max 50000)
 * @returns {Promise<Array>} Array of normalized location objects
 */
export async function searchGooglePlaces(lat, lon, radius = 5000) {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('[Google Places] No API key configured, skipping');
    return [];
  }

  const cacheKey = `${lat.toFixed(4)}_${lon.toFixed(4)}_${radius}`;
  const cached = placesCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log(`[Google Places] Cache hit for ${cacheKey}`);
    return cached.data;
  }

  const clampedRadius = Math.min(Math.max(radius, 1000), 50000);
  const allResults = new Map(); // Deduplicate by place_id

  // Search each relevant type
  for (const type of VENDING_RELEVANT_TYPES) {
    try {
      const results = await nearbySearch(lat, lon, clampedRadius, type);
      for (const place of results) {
        if (!allResults.has(place.place_id)) {
          allResults.set(place.place_id, place);
        }
      }
    } catch (error) {
      console.error(`[Google Places] Error searching type "${type}":`, error.message);
      // Continue searching other types
    }
  }

  console.log(`[Google Places] Found ${allResults.size} unique places across all types`);

  // Fetch details for top results (limit to 20 to control API costs)
  const topPlaces = Array.from(allResults.values()).slice(0, 20);
  const enrichedLocations = [];

  for (const place of topPlaces) {
    try {
      const details = await fetchPlaceDetails(place.place_id);
      enrichedLocations.push(normalizePlaceToLocation(place, details));
    } catch (error) {
      console.error(`[Google Places] Error fetching details for "${place.name}":`, error.message);
      // Still include with basic data
      enrichedLocations.push(normalizePlaceToLocation(place, null));
    }
  }

  // Cache the results
  placesCache.set(cacheKey, {
    data: enrichedLocations,
    timestamp: Date.now()
  });

  return enrichedLocations;
}

/**
 * Perform a Nearby Search request to Google Places API.
 */
async function nearbySearch(lat, lon, radius, type) {
  const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
  url.searchParams.set('location', `${lat},${lon}`);
  url.searchParams.set('radius', String(radius));
  url.searchParams.set('type', type);
  url.searchParams.set('key', getApiKey());

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Google Places Nearby Search failed: ${response.status}`);
  }

  const data = await response.json();

  if (data.status === 'REQUEST_DENIED') {
    throw new Error(`Google Places API denied: ${data.error_message || 'Check API key'}`);
  }

  if (data.status === 'INVALID_REQUEST') {
    throw new Error(`Google Places invalid request: ${data.error_message || 'Bad parameters'}`);
  }

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    console.warn(`[Google Places] Unexpected status: ${data.status}`);
  }

  return data.results || [];
}

/**
 * Fetch detailed information about a specific place.
 */
async function fetchPlaceDetails(placeId) {
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', placeId);
  url.searchParams.set('fields', 'formatted_phone_number,international_phone_number,website,url,opening_hours,user_ratings_total,rating,business_status');
  url.searchParams.set('key', getApiKey());

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Google Places Details failed: ${response.status}`);
  }

  const data = await response.json();

  if (data.status !== 'OK') {
    return null;
  }

  return data.result || null;
}

/**
 * Convert a Google Places result + details into the normalized location format
 * used by the rest of the app.
 */
function normalizePlaceToLocation(place, details) {
  const lat = place.geometry?.location?.lat;
  const lon = place.geometry?.location?.lng;

  // Map Google Places types to our category system
  const category = mapGoogleTypeToCategory(place.types || []);

  // Extract contact info from details
  const contactPhone = details?.formatted_phone_number || details?.international_phone_number || '';
  const contactWebsite = details?.website || '';
  const googleMapsUrl = details?.url || '';
  const rating = place.rating || 0;
  const totalRatings = place.user_ratings_total || details?.user_ratings_total || 0;
  const isOpen = details?.business_status === 'OPERATIONAL';
  const openingHours = details?.opening_hours?.weekday_text || [];

  return {
    id: `gp_${place.place_id}`,
    name: place.name || 'Unknown Business',
    address: place.vicinity || '',
    lat,
    lon,
    category,
    displayCategory: formatCategoryLabel(category),
    distance: 0, // Will be calculated by searchService
    operatorName: place.name || '',
    contactPhone,
    contactEmail: '', // Google Places rarely provides email
    contactWebsite,
    googleMapsUrl,
    rating,
    totalRatings,
    isOpen,
    openingHours,
    source: 'google_places',
    rawTags: {}
  };
}

/**
 * Map Google Places types to our internal category system.
 */
function mapGoogleTypeToCategory(types) {
  const typeMap = {
    gym: 'gym',
    hospital: 'hospital',
    school: 'school',
    university: 'university',
    car_dealer: 'car_dealership',
    car_repair: 'car_repair',
    car_wash: 'car_wash',
    lodging: 'hotel',
    fire_station: 'fire_station',
    police: 'police_station',
    bowling_alley: 'bowling_alley',
    bus_station: 'bus_station',
    train_station: 'train_station',
    airport: 'airport',
    laundry: 'laundromat',
    storage: 'self_storage',
    stadium: 'stadium',
    shopping_mall: 'shopping_mall',
    library: 'library',
    movie_theater: 'cinema',
    community_center: 'community_centre',
    swimming_pool: 'swimming_pool'
  };

  for (const type of types) {
    if (typeMap[type]) {
      return typeMap[type];
    }
  }

  return 'other';
}

/**
 * Format a category slug into a human-readable label.
 */
function formatCategoryLabel(category) {
  if (!category) return 'Other';
  return category
    .replace(/[_\-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
