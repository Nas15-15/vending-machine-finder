/**
 * Saved locations management
 * Stores locations in localStorage with organization features
 */

const STORAGE_KEY = 'vendingSavedLocations';

/**
 * Get all saved locations
 */
export function getSavedLocations () {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    console.error('Failed to load saved locations:', error);
    return [];
  }
}

/**
 * Save a location
 */
export function saveLocation (location, folder = 'default', notes = '', tags = []) {
  const saved = getSavedLocations();
  const locationId = `${location.lat}_${location.lon}_${Date.now()}`;
  
  const savedLocation = {
    id: locationId,
    location,
    folder,
    notes,
    tags,
    savedAt: new Date().toISOString()
  };

  saved.push(savedLocation);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  return savedLocation;
}

/**
 * Remove a saved location
 */
export function removeSavedLocation (locationId) {
  const saved = getSavedLocations();
  const filtered = saved.filter(item => item.id !== locationId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  return filtered;
}

/**
 * Update saved location (notes, tags, folder)
 */
export function updateSavedLocation (locationId, updates) {
  const saved = getSavedLocations();
  const index = saved.findIndex(item => item.id === locationId);
  
  if (index === -1) return null;

  saved[index] = {
    ...saved[index],
    ...updates,
    updatedAt: new Date().toISOString()
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  return saved[index];
}

/**
 * Get locations by folder
 */
export function getLocationsByFolder (folder) {
  const saved = getSavedLocations();
  return saved.filter(item => item.folder === folder);
}

/**
 * Get all folders
 */
export function getFolders () {
  const saved = getSavedLocations();
  const folders = new Set(saved.map(item => item.folder));
  return Array.from(folders);
}

/**
 * Check if location is saved
 */
export function isLocationSaved (location) {
  const saved = getSavedLocations();
  return saved.some(item => 
    item.location.lat === location.lat && 
    item.location.lon === location.lon
  );
}

/**
 * Get saved location by coordinates
 */
export function getSavedLocationByCoords (location) {
  const saved = getSavedLocations();
  return saved.find(item => 
    item.location.lat === location.lat && 
    item.location.lon === location.lon
  );
}













