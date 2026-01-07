const NOMINATIM_CONTACT = process.env.NOMINATIM_CONTACT || 'support@vendingmachinefinder.app';
const DEFAULT_SEARCH_RADIUS_METERS = 5000;
const MIN_SEARCH_RADIUS_METERS = 2500;
const MAX_SEARCH_RADIUS_METERS = 80000;
const MAX_SEGMENT_SIZE_METERS = 25000;
const MAX_SEGMENT_ROWS = 3;
const MAX_SEGMENT_COLS = 3;
const NOMINATIM_THROTTLE_MS = 1100;

const geocodeCache = new Map();
const reverseGeocodeCache = new Map();

let lastNominatimCall = 0;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchJsonWithIdent(url) {
  const headers = {
    'User-Agent': `VendingMachineFinder/1.1 (${NOMINATIM_CONTACT})`
  };
  const response = await fetch(url, { headers });
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
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmed)}&limit=1&email=${encodeURIComponent(NOMINATIM_CONTACT)}`;
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
  shopping_mall: 90,
  hospital: 85,
  university: 85,
  stadium: 85,
  gym: 80,
  supermarket: 80,
  cinema: 75,
  theatre: 75,
  office: 70,
  school: 70,
  restaurant: 65,
  cafe: 65,
  library: 60,
  parking: 60,
  bank: 55,
  government: 50,
  community_centre: 50
};

const HIGH_VALUE_CATEGORIES = new Set(['airport', 'hospital', 'university', 'shopping_mall']);
const DENSITY_CATEGORIES = new Set(['airport', 'shopping_mall', 'hospital', 'university', 'train_station', 'supermarket']);

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
        ["amenity"~"^(hospital|university|school|gym|cinema|theatre|library|bank|restaurant|cafe|fast_food|community_centre|government|vending_machine)$"];
      node
        (around:${Math.round(radius)},${centerLat},${centerLon})
        ["shop"~"^(mall|supermarket|convenience)$"];
      node
        (around:${Math.round(radius)},${centerLat},${centerLon})
        ["amenity"="vending_machine"];
      way(${bbox})["leisure"="stadium"];
      way(${bbox})["amenity"~"^(hospital|university|school|gym|cinema|theatre|library|bank|restaurant|cafe|fast_food|community_centre|government)$"];
      way(${bbox})["shop"~"^(mall|supermarket|convenience)$"];
      relation(${bbox})["amenity"~"^(hospital|university|school|gym|cinema|theatre|library|bank|restaurant|cafe|fast_food|community_centre|government)$"];
      relation(${bbox})["shop"~"^(mall|supermarket|convenience)$"];
    );
    out center;
  `.trim();

  const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;
  const overpassHeaders = {
    'User-Agent': `VendingMachineFinder/1.1 (${NOMINATIM_CONTACT})`
  };

  try {
    console.log(`Calling Overpass API: ${overpassUrl.substring(0, 200)}...`);
    const overpassResponse = await fetch(overpassUrl, { headers: overpassHeaders });

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
    let category = tags.amenity || tags.shop || tags.aeroway || tags.railway || tags.leisure || 'other';
    const categoryMap = {
      aerodrome: 'airport',
      station: tags.railway ? 'train_station' : 'bus_station',
      stadium: 'stadium',
      mall: 'shopping_mall',
      supermarket: 'supermarket',
      convenience: 'supermarket'
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
  const baseScore = CATEGORY_SCORES[location.category] || 40;
  const distancePenalty = Math.min(location.distance / 100, 20);
  const anchorBonus = Math.min(location.nearbyHighTraffic * 3, 18);
  const densityBonus = Math.min(location.localDensity * 5, 15);
  const competitionPenalty = location.hasExistingVendingMachine ? 15 : 0;

  return Math.max(0, Math.min(100, Math.round(baseScore - distancePenalty + anchorBonus + densityBonus - competitionPenalty)));
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
  supermarket: { '18-24': 12, '25-34': 22, '35-44': 28, '45-54': 22, '55+': 16 },
  cinema: { '18-24': 35, '25-34': 30, '35-44': 18, '45-54': 10, '55+': 7 },
  theatre: { '18-24': 15, '25-34': 20, '35-44': 25, '45-54': 22, '55+': 18 },
  office: { '18-24': 10, '25-34': 35, '35-44': 30, '45-54': 18, '55+': 7 },
  school: { '18-24': 45, '25-34': 25, '35-44': 20, '45-54': 8, '55+': 2 },
  restaurant: { '18-24': 22, '25-34': 30, '35-44': 24, '45-54': 15, '55+': 9 },
  cafe: { '18-24': 28, '25-34': 32, '35-44': 22, '45-54': 12, '55+': 6 },
  library: { '18-24': 40, '25-34': 25, '35-44': 15, '45-54': 12, '55+': 8 },
  bank: { '18-24': 8, '25-34': 25, '35-44': 28, '45-54': 24, '55+': 15 },
  government: { '18-24': 10, '25-34': 22, '35-44': 26, '45-54': 25, '55+': 17 },
  community_centre: { '18-24': 18, '25-34': 20, '35-44': 22, '45-54': 22, '55+': 18 }
};

const DEFAULT_DEMOGRAPHICS = { '18-24': 20, '25-34': 25, '35-44': 22, '45-54': 18, '55+': 15 };

// Peak hours based on category
const CATEGORY_PEAK_HOURS = {
  airport: '6-9am, 4-8pm',
  train_station: '7-9am, 5-7pm',
  bus_station: '7-9am, 4-6pm',
  shopping_mall: '12-3pm, 5-8pm',
  hospital: '10am-2pm',
  university: '10am-2pm',
  stadium: 'Event times',
  gym: '6-8am, 5-8pm',
  supermarket: '4-7pm',
  cinema: '7-10pm',
  theatre: '7-9pm',
  office: '7-9am, 12-1pm',
  school: '7-8am, 3-4pm',
  restaurant: '12-2pm, 6-9pm',
  cafe: '7-10am, 2-4pm',
  library: '10am-6pm',
  bank: '10am-3pm',
  government: '9am-4pm',
  community_centre: '9am-8pm'
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
  supermarket: 'Quick snacks, Candy',
  cinema: 'Candy, Popcorn, Drinks',
  theatre: 'Snacks, Water, Mints',
  office: 'Coffee, Healthy snacks, Water',
  school: 'Snacks, Juice, Water',
  restaurant: 'Mints, Gum',
  cafe: 'Snacks, Pastries',
  library: 'Snacks, Coffee, Water',
  bank: 'Snacks, Water',
  government: 'Snacks, Coffee, Water',
  community_centre: 'Snacks, Sports drinks, Water'
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
    hospital: `Healthcare facilities attract visitors, staff, and patients throughout the day. Healthy snack options tend to perform particularly well here.`,
    university: `College campuses have a captive audience of students and staff. The young demographic typically drives strong demand for energy drinks, snacks, and quick meals.`,
    stadium: `Event venues see massive crowds during games and concerts. While traffic is cyclical, peak times can generate exceptional sales volume.`,
    gym: `Fitness centers attract health-conscious customers looking for protein bars, sports drinks, and water before and after workouts.`,
    supermarket: `Grocery store locations capture shoppers looking for immediate consumption items they might not want to buy in bulk.`,
    cinema: `Movie theaters generate strong impulse purchases, especially candy and drinks for those who didn't buy at the concession stand.`,
    office: `Office buildings provide a captive weekday audience of professionals looking for coffee, snacks, and quick lunch options.`,
    school: `Educational facilities serve students and staff throughout the school day. Healthy snack options often perform well due to parental expectations.`,
    restaurant: `Restaurant-adjacent locations can capture overflow traffic and those looking for quick items without sitting down.`,
    cafe: `Coffee shop areas attract a steady stream of customers throughout the day, particularly during morning and afternoon rush periods.`,
    library: `Libraries attract students and researchers who appreciate convenient snack and drink options during long study sessions.`
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
  excludeExisting = true,
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

    // Apply filters
    if (excludeExisting && location.hasExistingVendingMachine) {
      continue;
    }

    const footTrafficScore = calculateFootTrafficScore(location, enriched);
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
  const geocoded = await geocodeLocation(query);
  if (progressCallback) {
    progressCallback('Location found, generating search regions...');
  }
  const regions = deriveSearchRegions(geocoded);
  const locations = await fetchLocationsForRegions(regions, progressCallback);
  if (!locations.length) {
    throw new Error('No locations found in this area. Try searching a larger city or different location.');
  }
  const ranked = rankLocations(locations, options);
  if (!ranked.length) {
    throw new Error('No suitable locations met the selected filters.');
  }
  return {
    center: geocoded,
    results: ranked
  };
}

