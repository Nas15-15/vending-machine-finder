const NOMINATIM_CONTACT = process.env.NOMINATIM_CONTACT || 'support@vendingmachinefinder.app';
const DEFAULT_SEARCH_RADIUS_METERS = 5000;
const MIN_SEARCH_RADIUS_METERS = 2500;
const MAX_SEARCH_RADIUS_METERS = 80000;
const MAX_SEGMENT_SIZE_METERS = 25000;
const MAX_SEGMENT_ROWS = 3;
const MAX_SEGMENT_COLS = 3;
const NOMINATIM_THROTTLE_MS = 1100;

import { searchGooglePlaces, isGooglePlacesConfigured } from './googlePlacesService.js';
import { evaluateLocationsWithAI, isAIConfigured } from './aiEvaluationService.js';
import crypto from 'crypto';
import { supabase, isSupabaseConfigured } from './supabaseClient.js';

const geocodeCache = new Map();
const reverseGeocodeCache = new Map();

let lastNominatimCall = 0;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithBackoff(url, options = {}, maxRetries = 3, baseDelayMs = 1000) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`HTTP Error ${response.status}`);
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * (2 ** attempt);
        console.warn(`[API] Fetch failed (${error.message}). Retrying in ${delay}ms... (Attempt ${attempt + 1}/${maxRetries})`);
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

async function fetchJsonWithIdent(url) {
  const headers = {
    'User-Agent': `VendingMachineFinder/1.1 (${NOMINATIM_CONTACT})`
  };
  const response = await fetchWithBackoff(url, { headers });
  if (!response.ok) {
    throw new Error(`Request failed ${response.status}`);
  }
  return response.json();
}

async function waitForNominatimWindow() {
  const elapsed = Date.now() - lastNominatimCall;
  if (elapsed < NOMINATIM_THROTTLE_MS) {
    await sleep(NOMINATIM_THROTTLE_MS - elapsed);
  }
  lastNominatimCall = Date.now();
}

export async function geocodeLocation(query) {
  const trimmed = (query || '').trim();
  if (!trimmed) {
    throw new Error('Location query required');
  }
  if (geocodeCache.has(trimmed)) {
    return geocodeCache.get(trimmed);
  }
  await waitForNominatimWindow();
  // Detect US zip codes (5 digits or 5+4 format) and restrict to US results
  const isUSZip = /^\d{5}(-\d{4})?$/.test(trimmed);
  const countryParam = isUSZip ? '&countrycodes=us' : '';
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmed)}&limit=1${countryParam}&email=${encodeURIComponent(NOMINATIM_CONTACT)}`;
  const data = await fetchJsonWithIdent(url);
  if (!data?.length) {
    throw new Error('Location not found');
  }
  const result = data[0];
  const normalized = {
    lat: parseFloat(result.lat),
    lon: parseFloat(result.lon),
    displayName: result.display_name,
    type: result.type || '',
    class: result.class || '',
    boundingBox: normalizeBoundingBox(result.boundingbox),
    importance: typeof result.importance === 'number' ? result.importance : 0
  };
  geocodeCache.set(trimmed, normalized);
  return normalized;
}

function normalizeBoundingBox(raw) {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  const parsed = raw.map(Number);
  if (parsed.some(Number.isNaN)) return null;
  const [south, north, west, east] = parsed;
  if (south >= north || west >= east) return null;
  return parsed;
}

function metersFromLatSpan(spanDegrees) {
  return Math.abs(spanDegrees) * 111320;
}

function metersFromLonSpan(spanDegrees, latitude) {
  const metersPerDegree = 111320 * Math.cos(latitude * Math.PI / 180);
  return Math.abs(spanDegrees) * Math.max(metersPerDegree, 1);
}

const clampRadius = (value) => Math.min(Math.max(value, MIN_SEARCH_RADIUS_METERS), MAX_SEARCH_RADIUS_METERS);

function estimateRadiusFromType(placeType = '') {
  const radiusHints = {
    postcode: 8000,
    neighbourhood: 4000,
    suburb: 7000,
    village: 8000,
    town: 12000,
    city: 20000,
    county: 35000,
    state: 60000,
    state_district: 50000,
    province: 60000,
    region: 60000
  };
  return radiusHints[placeType] || DEFAULT_SEARCH_RADIUS_METERS;
}

function deriveSearchRegions(geocoded) {
  const boundingBox = Array.isArray(geocoded.boundingBox) ? geocoded.boundingBox : null;
  const baseRadius = clampRadius(estimateRadiusFromType(geocoded.type));

  if (!boundingBox) {
    return [{
      centerLat: geocoded.lat,
      centerLon: geocoded.lon,
      radius: baseRadius,
      boundingBox: null
    }];
  }

  const [south, north, west, east] = boundingBox;
  const centerLat = geocoded.lat;
  const latMeters = metersFromLatSpan(north - south);
  const lonMeters = metersFromLonSpan(east - west, centerLat);
  const diagonalMeters = Math.sqrt(latMeters ** 2 + lonMeters ** 2);
  const coverageRadius = clampRadius(Math.max(baseRadius, diagonalMeters / 2 + 500));

  const rowsNeeded = Math.ceil(latMeters / MAX_SEGMENT_SIZE_METERS);
  const colsNeeded = Math.ceil(lonMeters / MAX_SEGMENT_SIZE_METERS);
  const rows = Math.min(Math.max(rowsNeeded, 1), MAX_SEGMENT_ROWS);
  const cols = Math.min(Math.max(colsNeeded, 1), MAX_SEGMENT_COLS);

  if (rows === 1 && cols === 1) {
    return [{
      centerLat: geocoded.lat,
      centerLon: geocoded.lon,
      radius: coverageRadius,
      boundingBox
    }];
  }

  const latStep = (north - south) / rows;
  const lonStep = (east - west) / cols;
  const regions = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const segSouth = south + row * latStep;
      const segNorth = row === rows - 1 ? north : segSouth + latStep;
      const segWest = west + col * lonStep;
      const segEast = col === cols - 1 ? east : segWest + lonStep;
      const segCenterLat = (segSouth + segNorth) / 2;
      const segCenterLon = (segWest + segEast) / 2;
      const segLatMeters = metersFromLatSpan(segNorth - segSouth);
      const segLonMeters = metersFromLonSpan(segEast - segWest, segCenterLat);
      const segDiagonal = Math.sqrt(segLatMeters ** 2 + segLonMeters ** 2);
      const segRadius = clampRadius(Math.max(baseRadius, segDiagonal / 2 + 500));

      regions.push({
        centerLat: segCenterLat,
        centerLon: segCenterLon,
        radius: segRadius,
        boundingBox: [segSouth, segNorth, segWest, segEast]
      });
    }
  }

  return regions;
}

const CATEGORY_SCORES = {
  airport: 100,
  train_station: 95,
  bus_station: 90,
  hospital: 90,
  university: 90,
  fire_station: 90,
  police_station: 85,
  stadium: 85,
  gym: 85,
  school: 80,
  hotel: 80,
  car_dealership: 75,
  car_repair: 75,
  car_wash: 70,
  cinema: 70,
  bowling_alley: 70,
  office: 70,
  library: 65,
  laundromat: 65,
  swimming_pool: 65,
  community_centre: 60,
  government: 55,
  self_storage: 55,
  shopping_mall: 50
};

// Categories from AI_RULES.md Rule 2 that should be filtered out of results
const REJECTED_CATEGORIES = new Set([
  'restaurant', 'cafe', 'fast_food', 'supermarket', 'convenience',
  'bar', 'pub', 'bakery', 'ice_cream', 'bank', 'parking',
  'fuel', 'veterinary', 'funeral_home', 'place_of_worship',
  'theatre' // low vending value
]);

const HIGH_VALUE_CATEGORIES = new Set(['airport', 'hospital', 'university', 'gym', 'school', 'fire_station', 'hotel']);
const DENSITY_CATEGORIES = new Set(['airport', 'hospital', 'university', 'train_station', 'stadium', 'gym', 'school']);

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatCategoryLabel(category) {
  if (category === undefined || category === null) {
    return 'Other';
  }
  return category
    .toString()
    .replace(/[_\-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function buildLocationNameFromTags(tags = {}, category) {
  const candidateKeys = [
    'name',
    'name:en',
    'official_name',
    'alt_name',
    'short_name',
    'brand',
    'brand:en',
    'operator',
    'addr:housename',
    'addr:place',
    'addr:full'
  ];

  for (const key of candidateKeys) {
    const value = tags[key];
    if (value && value.trim()) {
      return value.trim();
    }
  }

  const street = tags['addr:street'] || tags['addr:road'];
  const housenumber = tags['addr:housenumber'];
  const city = tags['addr:city'] || tags['addr:town'] || tags['addr:village'];
  const descriptor = formatCategoryLabel(category);

  if (street && city) {
    const streetLine = housenumber ? `${housenumber} ${street}` : street;
    return `${descriptor} near ${streetLine}, ${city}`;
  }

  if (city) {
    return `${descriptor} in ${city}`;
  }

  if (street) {
    const streetLine = housenumber ? `${housenumber} ${street}` : street;
    return `${descriptor} on ${streetLine}`;
  }

  return descriptor;
}

function buildAddressFromTags(tags = {}) {
  const streetParts = [
    tags['addr:housenumber'],
    tags['addr:street'] || tags['addr:road']
  ].filter(Boolean);
  const streetLine = streetParts.join(' ').trim();

  const localityParts = [
    tags['addr:neighbourhood'] || tags['addr:suburb'],
    tags['addr:city'] || tags['addr:town'] || tags['addr:village']
  ].filter(Boolean);
  const localityLine = localityParts.join(', ');

  const regionParts = [
    tags['addr:state'],
    tags['addr:postcode']
  ].filter(Boolean);
  const regionLine = regionParts.join(' ').trim();

  const country = tags['addr:country'];

  const components = [];
  if (streetLine) components.push(streetLine);
  if (localityLine) components.push(localityLine);
  if (regionLine) components.push(regionLine);
  if (country) components.push(country);

  if (!components.length && tags['addr:full']) {
    return tags['addr:full'];
  }

  // If no address but we have location info, build a descriptive string
  if (!components.length) {
    const city = tags['addr:city'] || tags['addr:town'] || tags['addr:village'];
    const state = tags['addr:state'];
    const suburb = tags['addr:neighbourhood'] || tags['addr:suburb'];

    if (city && state) {
      return `${city}, ${state}`;
    }
    if (city) {
      return city;
    }
    if (suburb && state) {
      return `${suburb}, ${state}`;
    }
    if (suburb) {
      return suburb;
    }
  }

  return components.join(', ');
}

async function fetchLocationsForRegions(regions, progressCallback = null) {
  const combinedMap = new Map();
  console.log(`Fetching locations for ${regions.length} region(s)`);

  for (let i = 0; i < regions.length; i += 1) {
    const region = regions[i];
    console.log(`Region ${i + 1}: center=(${region.centerLat}, ${region.centerLon}), radius=${region.radius}m`);
    if (progressCallback) {
      progressCallback(`Scanning area ${i + 1}/${regions.length}...`);
    }
    try {
      const regionLocations = await findHighTrafficLocations(
        region.centerLat,
        region.centerLon,
        region.radius,
        null,
        region.boundingBox
      );
      console.log(`Region ${i + 1}: got ${regionLocations.length} locations`);
      regionLocations.forEach((location) => {
        const key = `${location.lat.toFixed(5)}_${location.lon.toFixed(5)}`;
        if (!combinedMap.has(key)) {
          combinedMap.set(key, location);
        }
      });
      if (progressCallback) {
        progressCallback(`Collected ${combinedMap.size} locations (${i + 1}/${regions.length})`);
      }
    } catch (error) {
      console.error(`Error fetching locations for region ${i + 1}:`, error.message);
      // Continue to next region instead of failing completely
    }
  }

  console.log(`Total unique locations collected: ${combinedMap.size}`);
  return Array.from(combinedMap.values());
}

async function findHighTrafficLocations(centerLat, centerLon, radius, _ignored, boundingBox) {
  // Calculate bounding box for ways/relations
  const latDelta = radius / 111320;
  const lonDelta = radius / (111320 * Math.cos(centerLat * Math.PI / 180));
  const bbox = [
    (centerLat - latDelta).toFixed(6),
    (centerLon - lonDelta).toFixed(6),
    (centerLat + latDelta).toFixed(6),
    (centerLon + lonDelta).toFixed(6)
  ].join(',');

  const overpassQuery = `
    [out:json][timeout:60];
    (
      node
        (around:${Math.round(radius)},${centerLat},${centerLon})
        ["amenity"~"^(hospital|university|school|gym|cinema|library|community_centre|government|fire_station|police|vending_machine)$"];
      node
        (around:${Math.round(radius)},${centerLat},${centerLon})
        ["shop"~"^(mall)$"];
      node
        (around:${Math.round(radius)},${centerLat},${centerLon})
        ["tourism"~"^(hotel|motel)$"];
      node
        (around:${Math.round(radius)},${centerLat},${centerLon})
        ["shop"~"^(car_repair|car|laundry|storage_rental)$"];
      node
        (around:${Math.round(radius)},${centerLat},${centerLon})
        ["leisure"~"^(fitness_centre|swimming_pool|bowling_alley)$"];
      node
        (around:${Math.round(radius)},${centerLat},${centerLon})
        ["amenity"="vending_machine"];
      way(${bbox})["leisure"="stadium"];
      way(${bbox})["amenity"~"^(hospital|university|school|gym|cinema|library|community_centre|government|fire_station|police)$"];
      way(${bbox})["shop"~"^(mall)$"];
      way(${bbox})["tourism"~"^(hotel|motel)$"];
      way(${bbox})["leisure"~"^(fitness_centre|swimming_pool|bowling_alley)$"];
      relation(${bbox})["amenity"~"^(hospital|university|school|gym|cinema|library|community_centre|government|fire_station|police)$"];
      relation(${bbox})["shop"~"^(mall)$"];
      relation(${bbox})["tourism"~"^(hotel|motel)$"];
    );
    out center;
  `.trim();

  const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;
  const overpassHeaders = {
    'User-Agent': `VendingMachineFinder/1.1 (${NOMINATIM_CONTACT})`
  };

  try {
    console.log(`Calling Overpass API: ${overpassUrl.substring(0, 200)}...`);
    const overpassResponse = await fetchWithBackoff(overpassUrl, { headers: overpassHeaders });

    if (!overpassResponse.ok) {
      const errorText = await overpassResponse.text().catch(() => 'Unknown error');
      console.error(`Overpass API HTTP error (${overpassResponse.status}):`, errorText.substring(0, 500));
      throw new Error(`Overpass API error (${overpassResponse.status}): ${errorText.substring(0, 200)}`);
    }

    const responseText = await overpassResponse.text();
    if (!responseText || responseText.trim() === '') {
      throw new Error('Overpass API returned empty response');
    }

    let overpassData;
    try {
      overpassData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Overpass API JSON parse error. Response:', responseText.substring(0, 500));
      throw new Error(`Overpass API returned invalid JSON: ${parseError.message}`);
    }

    // Check for Overpass API errors in response
    if (overpassData.error) {
      const errorMsg = typeof overpassData.error === 'string' ? overpassData.error : JSON.stringify(overpassData.error);
      console.error('Overpass API returned error:', errorMsg);
      console.error('Full Overpass response:', JSON.stringify(overpassData, null, 2));
      throw new Error(`Overpass API error: ${errorMsg || 'Unknown error'}`);
    }

    // Check for remark - Overpass sometimes returns errors here
    if (overpassData.remark) {
      console.warn('Overpass API remark:', overpassData.remark);
      // If remark contains error indicators, treat as error
      if (overpassData.remark.toLowerCase().includes('error') ||
        overpassData.remark.toLowerCase().includes('runtime error') ||
        overpassData.remark.toLowerCase().includes('syntax error')) {
        throw new Error(`Overpass API error: ${overpassData.remark}`);
      }
    }

    const elements = overpassData.elements || [];
    console.log(`Overpass API returned ${elements.length} elements`);
    return processOverpassElements(elements, centerLat, centerLon, radius);
  } catch (error) {
    console.error('Overpass API error:', error.message);
    console.error('Error stack:', error.stack);
    throw error;
  }
}

function processOverpassElements(elements, centerLat, centerLon, radius) {
  const locations = [];
  let skippedNoCoords = 0;
  let skippedDistance = 0;

  for (const element of elements) {
    const lat = element.lat || element.center?.lat;
    const lon = element.lon || element.center?.lon;
    if (!lat || !lon) {
      skippedNoCoords++;
      continue;
    }
    const distance = calculateDistance(centerLat, centerLon, lat, lon);
    if (distance > radius) {
      skippedDistance++;
      continue;
    }

    const tags = element.tags || {};
    let category = tags.amenity || tags.shop || tags.aeroway || tags.railway || tags.leisure || tags.tourism || 'other';
    const categoryMap = {
      aerodrome: 'airport',
      station: tags.railway ? 'train_station' : 'bus_station',
      stadium: 'stadium',
      mall: 'shopping_mall',
      hotel: 'hotel',
      motel: 'hotel',
      fire_station: 'fire_station',
      police: 'police_station',
      car_repair: 'car_repair',
      car: 'car_dealership',
      laundry: 'laundromat',
      storage_rental: 'self_storage',
      fitness_centre: 'gym',
      swimming_pool: 'swimming_pool',
      bowling_alley: 'bowling_alley'
    };
    category = categoryMap[category] || category;

    const readableCategory = formatCategoryLabel(category);
    const derivedName = buildLocationNameFromTags(tags, category);
    const derivedAddress = buildAddressFromTags(tags);
    const ownerName = tags.operator || tags.owner || tags.brand || '';
    const contactPhone = tags['contact:phone'] || tags.phone || '';
    const contactEmail = tags['contact:email'] || tags.email || '';
    const contactWebsite = tags['contact:website'] || tags.website || tags.url || '';

    locations.push({
      id: element.id,
      name: derivedName,
      address: derivedAddress,
      lat,
      lon,
      category,
      displayCategory: readableCategory,
      distance,
      operatorName: ownerName,
      contactPhone,
      contactEmail,
      contactWebsite,
      rawTags: tags
    });
  }
  console.log(`Processed ${elements.length} elements -> ${locations.length} locations (skipped: ${skippedNoCoords} no coords, ${skippedDistance} out of range)`);
  return locations;
}

function calculateFootTrafficScore(location) {
  const BaseCategoryValue = CATEGORY_SCORES[location.category] || 40;
  
  // DensityMultiplier: boosts score based on nearby commercial anchors and overall density (max 1.5x)
  const DensityMultiplier = 1 + Math.min((location.nearbyHighTraffic * 0.15) + (location.localDensity * 0.05), 0.5);
  
  // CompetitionPenalty: strict flat penalty
  const CompetitionPenalty = location.hasExistingVendingMachine ? 20 : 0;
  
  // Calculate raw Vending Score
  const rawScore = (BaseCategoryValue * DensityMultiplier) - CompetitionPenalty;
  
  // Rating Bonus: Use user_ratings_total from Google Places as a proxy for foot traffic
  let ratingBonus = 0;
  if (location.totalRatings > 0) {
    ratingBonus = Math.min(10, Math.log10(location.totalRatings + 1) * 2.5);
  }

  return Math.max(0, Math.min(100, Math.round(rawScore + ratingBonus)));
}

function estimateDailyVisitors(footTrafficScore) {
  const minVisitors = 150;
  const maxVisitors = 4200;
  const normalized = footTrafficScore / 100;
  return Math.round(minVisitors + (maxVisitors - minVisitors) * normalized);
}

// Age demographics based on location category
const CATEGORY_DEMOGRAPHICS = {
  airport: { '18-24': 15, '25-34': 28, '35-44': 25, '45-54': 20, '55+': 12 },
  train_station: { '18-24': 22, '25-34': 30, '35-44': 22, '45-54': 16, '55+': 10 },
  bus_station: { '18-24': 28, '25-34': 25, '35-44': 20, '45-54': 15, '55+': 12 },
  shopping_mall: { '18-24': 25, '25-34': 28, '35-44': 22, '45-54': 15, '55+': 10 },
  hospital: { '18-24': 8, '25-34': 18, '35-44': 22, '45-54': 25, '55+': 27 },
  university: { '18-24': 65, '25-34': 25, '35-44': 6, '45-54': 3, '55+': 1 },
  stadium: { '18-24': 30, '25-34': 28, '35-44': 22, '45-54': 12, '55+': 8 },
  gym: { '18-24': 32, '25-34': 35, '35-44': 20, '45-54': 9, '55+': 4 },
  cinema: { '18-24': 35, '25-34': 30, '35-44': 18, '45-54': 10, '55+': 7 },
  office: { '18-24': 10, '25-34': 35, '35-44': 30, '45-54': 18, '55+': 7 },
  school: { '18-24': 45, '25-34': 25, '35-44': 20, '45-54': 8, '55+': 2 },
  library: { '18-24': 40, '25-34': 25, '35-44': 15, '45-54': 12, '55+': 8 },
  government: { '18-24': 10, '25-34': 22, '35-44': 26, '45-54': 25, '55+': 17 },
  community_centre: { '18-24': 18, '25-34': 20, '35-44': 22, '45-54': 22, '55+': 18 },
  hotel: { '18-24': 12, '25-34': 30, '35-44': 28, '45-54': 18, '55+': 12 },
  fire_station: { '18-24': 5, '25-34': 35, '35-44': 35, '45-54': 18, '55+': 7 },
  police_station: { '18-24': 8, '25-34': 32, '35-44': 30, '45-54': 20, '55+': 10 },
  car_dealership: { '18-24': 10, '25-34': 28, '35-44': 30, '45-54': 22, '55+': 10 },
  car_repair: { '18-24': 12, '25-34': 30, '35-44': 28, '45-54': 20, '55+': 10 },
  car_wash: { '18-24': 18, '25-34': 28, '35-44': 25, '45-54': 18, '55+': 11 },
  laundromat: { '18-24': 25, '25-34': 30, '35-44': 22, '45-54': 15, '55+': 8 },
  bowling_alley: { '18-24': 28, '25-34': 25, '35-44': 22, '45-54': 15, '55+': 10 },
  swimming_pool: { '18-24': 30, '25-34': 22, '35-44': 25, '45-54': 13, '55+': 10 },
  self_storage: { '18-24': 8, '25-34': 28, '35-44': 30, '45-54': 22, '55+': 12 }
};

const DEFAULT_DEMOGRAPHICS = { '18-24': 20, '25-34': 25, '35-44': 22, '45-54': 18, '55+': 15 };

// Peak hours based on category
const CATEGORY_PEAK_HOURS = {
  airport: '6-9am, 4-8pm',
  train_station: '7-9am, 5-7pm',
  bus_station: '7-9am, 4-6pm',
  shopping_mall: '12-3pm, 5-8pm',
  hospital: '10am-2pm, 24/7 staff',
  university: '10am-2pm',
  stadium: 'Event times',
  gym: '6-8am, 5-8pm',
  cinema: '7-10pm',
  office: '7-9am, 12-1pm',
  school: '7-8am, 3-4pm',
  library: '10am-6pm',
  government: '9am-4pm',
  community_centre: '9am-8pm',
  hotel: '24/7 (peak check-in 3-6pm)',
  fire_station: '24/7',
  police_station: '24/7',
  car_dealership: '9am-7pm (service waits 1-3hrs)',
  car_repair: '8am-6pm (service waits 1-2hrs)',
  car_wash: '8am-6pm',
  laundromat: '7am-10pm (30-60min waits)',
  bowling_alley: '4-10pm, weekends all day',
  swimming_pool: '10am-8pm, weekends all day',
  self_storage: '8am-6pm'
};

// Best products based on category
const CATEGORY_PRODUCTS = {
  airport: 'Snacks, Drinks, Travel items',
  train_station: 'Coffee, Snacks, Water',
  bus_station: 'Snacks, Cold drinks',
  shopping_mall: 'Snacks, Candy, Drinks',
  hospital: 'Healthy snacks, Water, Coffee',
  university: 'Energy drinks, Snacks, Coffee',
  stadium: 'Sports drinks, Snacks, Water',
  gym: 'Protein bars, Sports drinks, Water',
  cinema: 'Candy, Popcorn, Drinks',
  office: 'Coffee, Healthy snacks, Water',
  school: 'Snacks, Juice, Water',
  library: 'Snacks, Coffee, Water',
  government: 'Snacks, Coffee, Water',
  community_centre: 'Snacks, Sports drinks, Water',
  hotel: 'Snacks, Drinks, Water, Candy',
  fire_station: 'Energy drinks, Coffee, Snacks',
  police_station: 'Energy drinks, Coffee, Snacks',
  car_dealership: 'Coffee, Snacks, Water',
  car_repair: 'Coffee, Snacks, Water',
  car_wash: 'Drinks, Snacks',
  laundromat: 'Snacks, Drinks, Candy',
  bowling_alley: 'Snacks, Drinks, Candy',
  swimming_pool: 'Water, Sports drinks, Snacks',
  self_storage: 'Water, Snacks, Energy drinks'
};

function getAgeDemographics(category) {
  return CATEGORY_DEMOGRAPHICS[category] || DEFAULT_DEMOGRAPHICS;
}

function getPeakHours(category) {
  return CATEGORY_PEAK_HOURS[category] || '9am-6pm';
}

function getBestProducts(category) {
  return CATEGORY_PRODUCTS[category] || 'Snacks, Drinks';
}

function generateLocationDescription(location) {
  const { category, displayCategory, name, footTrafficScore, estimatedVisitors, nearbyHighTraffic, hasExistingVendingMachine, distance } = location;

  const trafficLevel = footTrafficScore >= 80 ? 'excellent' : footTrafficScore >= 60 ? 'strong' : 'moderate';
  const visitorText = estimatedVisitors >= 2000 ? 'thousands of people' : estimatedVisitors >= 500 ? 'hundreds of visitors' : 'steady foot traffic';

  let description = '';

  // Opening based on category
  const categoryDescriptions = {
    airport: `This airport location sees ${visitorText} daily, with travelers constantly looking for quick refreshments and snacks.`,
    train_station: `A busy transit hub where commuters and travelers pass through regularly. The ${trafficLevel} foot traffic creates consistent demand for convenient snacks and drinks.`,
    bus_station: `This bus station serves commuters and travelers who often need quick refreshments while waiting or on the go.`,
    shopping_mall: `Located in a shopping center environment, this spot benefits from recreational shoppers who tend to make impulse purchases.`,
    hospital: `Healthcare facilities attract visitors, staff, and patients throughout the day. Staff work 12-hour shifts and need 24/7 food access. Healthy snack options perform particularly well here.`,
    university: `College campuses have a captive audience of students and staff. The young demographic typically drives strong demand for energy drinks, snacks, and quick meals.`,
    stadium: `Event venues see massive crowds during games and concerts. While traffic is cyclical, peak times can generate exceptional sales volume.`,
    gym: `Fitness centers attract health-conscious customers looking for protein bars, sports drinks, and water before and after workouts.`,
    cinema: `Movie theaters generate strong impulse purchases, especially candy and drinks for those who didn't buy at the concession stand.`,
    office: `Office buildings provide a captive weekday audience of professionals looking for coffee, snacks, and quick lunch options.`,
    school: `Students are a goldmine — constant snack and drink purchases throughout the day. High volume, captive audience, recurring daily traffic.`,
    library: `Libraries attract students and researchers who appreciate convenient snack and drink options during long study sessions.`,
    hotel: `Hotel guests want 24/7 access to drinks and snacks without leaving the building. Budget and mid-tier hotels without restaurants are especially strong.`,
    fire_station: `First responders work 24-hour shifts and are always in the building. Captive, hungry audience with high energy drink and coffee demand.`,
    police_station: `Officers work long shifts with limited break time. Strong demand for energy drinks, coffee, and quick snacks.`,
    car_dealership: `Customers wait 1-3 hours for service with nothing to do. Great dwell time and a bored, thirsty audience stuck in a lobby.`,
    car_repair: `Auto repair customers wait 1-2 hours with nothing to do but sit in the lobby. Perfect impulse buy environment.`,
    car_wash: `Full-service car wash customers wait 15-30 minutes in the lobby — enough time to grab a drink or snack.`,
    laundromat: `People wait 30-60 minutes for their laundry with nothing to do. Boredom drives impulse purchases of drinks and snacks.`,
    bowling_alley: `Groups spend 1-3 hours bowling, often with kids who want snacks. Strong impulse buy environment with good dwell time.`,
    swimming_pool: `Families and swimmers spend hours at the pool with high hydration demand. Water and sports drinks are top sellers.`,
    self_storage: `People spend time moving items in and out and get thirsty. Low competition and decent foot traffic during peak move-in seasons.`
  };

  description = categoryDescriptions[category] || `This ${displayCategory || 'location'} sees ${trafficLevel} foot traffic with ${visitorText} passing through regularly.`;

  // Add anchor information
  if (nearbyHighTraffic > 0) {
    description += ` Being close to ${nearbyHighTraffic} other high-traffic ${nearbyHighTraffic === 1 ? 'location' : 'locations'} increases overall visibility and potential customer flow.`;
  }

  // Add competition status
  if (hasExistingVendingMachine) {
    description += ' Note: There may be existing vending machines in this area, so differentiation through product selection or machine quality could be key.';
  } else {
    description += ' This area appears to have limited vending competition, presenting a good first-mover opportunity.';
  }

  // Add recommendation
  if (footTrafficScore >= 75) {
    description += ' Overall, this is a high-potential location worth serious consideration.';
  } else if (footTrafficScore >= 55) {
    description += ' This location shows solid potential and could be a reliable addition to your route.';
  }

  return description;
}

function determineCompetition(location, neighbors) {
  // 1. Direct tag check
  if (location.rawTags?.vending === 'yes') {
    return true;
  }

  // 2. Check for explicit vending machine nodes nearby
  const nearbyMachine = neighbors.find(n =>
    n.category === 'vending_machine' &&
    calculateDistance(location.lat, location.lon, n.lat, n.lon) <= 100
  );
  if (nearbyMachine) {
    return true;
  }

  // 3. Density heuristic for high-traffic areas
  if (!DENSITY_CATEGORIES.has(location.category)) {
    return false;
  }
  const nearbySimilar = neighbors.filter((neighbor) => {
    if (neighbor === location) return false;
    return neighbor.category === location.category &&
      calculateDistance(location.lat, location.lon, neighbor.lat, neighbor.lon) <= 150;
  });
  return nearbySimilar.length >= 2;
}

function computeNearbyMetrics(locations) {
  return locations.map((location, index, list) => {
    let anchorCount = 0;
    let density = 0;
    for (let i = 0; i < list.length; i += 1) {
      if (i === index) continue;
      const comparison = list[i];
      const distance = calculateDistance(location.lat, location.lon, comparison.lat, comparison.lon);
      if (distance <= 500 && HIGH_VALUE_CATEGORIES.has(comparison.category)) {
        anchorCount += 1;
      }
      if (distance <= 250) {
        density += 1;
      }
    }
    return {
      ...location,
      nearbyHighTraffic: anchorCount,
      localDensity: density
    };
  });
}

function rankLocations(locations, {
  highTrafficOnly = false,
  minScore = 0,
  maxDistance = Infinity,
  categories = null,
  minVisitors = 0,
  maxVisitors = Infinity
} = {}) {
  const enriched = computeNearbyMetrics(locations).map((location, _, list) => {
    const hasExistingVendingMachine = determineCompetition(location, list);
    return {
      ...location,
      hasExistingVendingMachine
    };
  });

  const ranked = [];
  for (const location of enriched) {
    // Filter out actual vending machine nodes from results
    if (location.category === 'vending_machine') {
      continue;
    }

    // Filter out categories from AI_RULES.md Rule 2 (Instant Rejection List)
    if (REJECTED_CATEGORIES.has(location.category)) {
      continue;
    }

    // Filter out permanently closed businesses identified by Google Places
    if (location.isOpen === false) {
      continue;
    }

    const footTrafficScore = calculateFootTrafficScore(location);
    if (highTrafficOnly && footTrafficScore < 60) {
      continue;
    }

    const estimatedVisitors = estimateDailyVisitors(footTrafficScore);

    // Advanced filters
    if (categories && !categories.includes(location.category)) {
      continue;
    }

    if (location.distance > maxDistance) {
      continue;
    }

    if (estimatedVisitors < minVisitors || estimatedVisitors > maxVisitors) {
      continue;
    }

    let score = footTrafficScore;
    if (HIGH_VALUE_CATEGORIES.has(location.category)) {
      score += 8;
    }
    score += Math.min(location.nearbyHighTraffic * 2, 10);

    // Apply min score filter
    if (score < minScore) {
      continue;
    }

    // Generate enriched data
    const demographics = getAgeDemographics(location.category);
    const peakHours = getPeakHours(location.category);
    const bestProducts = getBestProducts(location.category);

    const enrichedLocation = {
      ...location,
      footTrafficScore,
      estimatedVisitors,
      overallScore: Math.min(100, Math.round(score)),
      hasExistingVendingMachine: location.hasExistingVendingMachine,
      demographics,
      peakHours,
      bestProducts
    };

    // Generate description with all the enriched data
    enrichedLocation.description = generateLocationDescription(enrichedLocation);

    ranked.push(enrichedLocation);
  }

  return ranked.sort((a, b) => b.overallScore - a.overallScore).slice(0, 50);
}

export async function runSearch(query, options = {}, progressCallback = null) {
  const queryHash = crypto.createHash('sha256').update(JSON.stringify({ query, options })).digest('hex');
  if (isSupabaseConfigured()) {
    try {
      if (progressCallback) progressCallback('Checking cache...');
      const { data, error } = await supabase
        .from('search_cache')
        .select('payload, created_at')
        .eq('query_hash', queryHash)
        .single();
        
      if (data && data.payload) {
        // Check if cache is older than 48 hours
        const ageHours = (Date.now() - new Date(data.created_at).getTime()) / (1000 * 60 * 60);
        if (ageHours < 48) {
          console.log(`[Search] Cache hit for query: "${query}" (Age: ${ageHours.toFixed(2)}h)`);
          return data.payload;
        }
      }
    } catch (err) {
      console.warn('[Search] Cache read error/miss:', err.message);
    }
  }

  const geocoded = await geocodeLocation(query);
  if (progressCallback) {
    progressCallback('Location found, generating search regions...');
  }
  const regions = deriveSearchRegions(geocoded);

  // Run Overpass and Google Places searches in parallel
  const [overpassLocations, googleLocations] = await Promise.all([
    fetchLocationsForRegions(regions, progressCallback),
    (async () => {
      if (!isGooglePlacesConfigured()) return [];
      if (progressCallback) progressCallback('Searching Google Places...');
      try {
        const radius = regions[0]?.radius || DEFAULT_SEARCH_RADIUS_METERS;
        return await searchGooglePlaces(geocoded.lat, geocoded.lon, radius);
      } catch (error) {
        console.error('[Search] Google Places search failed, continuing with Overpass only:', error.message);
        return [];
      }
    })()
  ]);

  // Merge and deduplicate locations from both sources
  const mergedLocations = mergeLocationSources(overpassLocations, googleLocations);

  if (!mergedLocations.length) {
    throw new Error('No locations found in this area. Try searching a larger city or different location.');
  }

  if (progressCallback) {
    progressCallback(`Found ${mergedLocations.length} locations, ranking...`);
  }

  const ranked = rankLocations(mergedLocations, options);
  if (!ranked.length) {
    throw new Error('No suitable locations met the selected filters.');
  }

  // Run AI evaluation if configured
  let finalResults = ranked;
  if (isAIConfigured()) {
    if (progressCallback) progressCallback('AI is evaluating locations...');
    console.log('[Search] AI is configured, evaluating', ranked.length, 'locations...');
    try {
      finalResults = await evaluateLocationsWithAI(ranked);
      const withAI = finalResults.filter(r => r.aiScore !== undefined).length;
      console.log(`[Search] AI evaluation complete: ${withAI}/${finalResults.length} locations got AI scores`);
      // Re-sort by AI score if available
      finalResults.sort((a, b) => (b.aiScore ?? b.overallScore) - (a.aiScore ?? a.overallScore));
    } catch (error) {
      console.error('[Search] AI evaluation failed, using default scores:', error.message);
      console.error('[Search] AI error stack:', error.stack);
      // finalResults stays as the ranked array
    }
  } else {
    console.log('[Search] AI is NOT configured (OPENAI_API_KEY missing or empty)');
  }

  const payload = {
    center: geocoded,
    results: finalResults
  };

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('search_cache').upsert({
        query_hash: queryHash,
        payload: payload,
        created_at: new Date().toISOString()
      }, { onConflict: 'query_hash' });
      console.log(`[Search] Saved results to cache for query: "${query}"`);
    } catch (err) {
      console.warn('[Search] Cache write error:', err.message);
    }
  }

  return payload;
}

/**
 * Merge locations from Overpass and Google Places, deduplicating by proximity.
 * Google Places data enriches existing Overpass data (adds phone, website, etc).
 */
function mergeLocationSources(overpassLocations, googleLocations) {
  if (!googleLocations.length) return overpassLocations;
  if (!overpassLocations.length) return googleLocations;

  const merged = [...overpassLocations];
  const PROXIMITY_THRESHOLD_METERS = 100; // Consider two locations the same if < 100m apart

  for (const gPlace of googleLocations) {
    // Check if this Google Place already exists in Overpass results
    const existingIndex = merged.findIndex(existing => {
      const dist = calculateDistance(existing.lat, existing.lon, gPlace.lat, gPlace.lon);
      return dist < PROXIMITY_THRESHOLD_METERS;
    });

    if (existingIndex !== -1) {
      // Enrich existing Overpass location with Google Places data
      const existing = merged[existingIndex];
      merged[existingIndex] = {
        ...existing,
        contactPhone: existing.contactPhone || gPlace.contactPhone,
        contactEmail: existing.contactEmail || gPlace.contactEmail,
        contactWebsite: existing.contactWebsite || gPlace.contactWebsite,
        googleMapsUrl: gPlace.googleMapsUrl || '',
        rating: gPlace.rating || existing.rating || 0,
        totalRatings: gPlace.totalRatings || existing.totalRatings || 0,
        isOpen: gPlace.isOpen,
        source: 'merged'
      };
    } else {
      // New location from Google Places — add to the list
      merged.push({
        ...gPlace,
        source: 'google_places'
      });
    }
  }

  console.log(`[Search] Merged: ${overpassLocations.length} Overpass + ${googleLocations.length} Google Places = ${merged.length} total (after dedup)`);
  return merged;
}
