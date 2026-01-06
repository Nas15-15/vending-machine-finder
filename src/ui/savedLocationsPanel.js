import { 
  getSavedLocations, 
  saveLocation, 
  removeSavedLocation, 
  updateSavedLocation,
  getFolders,
  isLocationSaved,
  getSavedLocationByCoords
} from '../../lib/savedLocations.js';
import { showToast } from './notifications.js';

let currentLocation = null;

/**
 * Initialize saved locations panel
 */
export function initSavedLocationsPanel () {
  const saveToggle = document.getElementById('saveLocationToggle');
  const savePanel = document.getElementById('saveLocationPanel');
  const saveBtn = document.getElementById('saveLocationBtn');
  const cancelSaveBtn = document.getElementById('cancelSaveBtn');

  if (saveToggle) {
    saveToggle.addEventListener('click', () => {
      savePanel?.classList.toggle('hidden');
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', handleSaveLocation);
  }

  if (cancelSaveBtn) {
    cancelSaveBtn.addEventListener('click', () => {
      savePanel?.classList.add('hidden');
    });
  }

  // Load folders for dropdown
  updateFolderOptions();
}

/**
 * Update panel for current location
 */
export function updateSavedPanelForLocation (location) {
  currentLocation = location;
  if (!location) return;

  const savePanel = document.getElementById('saveLocationPanel');
  const saveStatus = document.getElementById('saveLocationStatus');
  const saveToggle = document.getElementById('saveLocationToggle');

  const isSaved = isLocationSaved(location);
  const savedData = isSaved ? getSavedLocationByCoords(location) : null;

  if (saveStatus) {
    if (isSaved) {
      saveStatus.innerHTML = `
        <span class="saved-indicator">✓ Saved</span>
        <button id="removeSavedBtn" class="remove-saved-btn" type="button">Remove</button>
      `;
      const removeBtn = document.getElementById('removeSavedBtn');
      if (removeBtn) {
        removeBtn.addEventListener('click', () => handleRemoveLocation(savedData.id));
      }
    } else {
      saveStatus.innerHTML = '<span class="not-saved-indicator">Not saved</span>';
    }
  }

  if (savedData) {
    // Populate form with saved data
    const folderSelect = document.getElementById('saveLocationFolder');
    const notesTextarea = document.getElementById('saveLocationNotes');
    const tagsInput = document.getElementById('saveLocationTags');

    if (folderSelect) folderSelect.value = savedData.folder || 'default';
    if (notesTextarea) notesTextarea.value = savedData.notes || '';
    if (tagsInput) tagsInput.value = savedData.tags?.join(', ') || '';
  } else {
    // Reset form
    const folderSelect = document.getElementById('saveLocationFolder');
    const notesTextarea = document.getElementById('saveLocationNotes');
    const tagsInput = document.getElementById('saveLocationTags');

    if (folderSelect) folderSelect.value = 'default';
    if (notesTextarea) notesTextarea.value = '';
    if (tagsInput) tagsInput.value = '';
  }
}

/**
 * Handle save location
 */
function handleSaveLocation () {
  if (!currentLocation) {
    showToast('No location selected', 'error');
    return;
  }

  const folderSelect = document.getElementById('saveLocationFolder');
  const notesTextarea = document.getElementById('saveLocationNotes');
  const tagsInput = document.getElementById('saveLocationTags');

  const folder = folderSelect?.value || 'default';
  const notes = notesTextarea?.value || '';
  const tags = tagsInput?.value.split(',').map(t => t.trim()).filter(Boolean) || [];

  const isSaved = isLocationSaved(currentLocation);
  const savedData = isSaved ? getSavedLocationByCoords(currentLocation) : null;

  if (isSaved && savedData) {
    // Update existing
    updateSavedLocation(savedData.id, { folder, notes, tags });
    showToast('Location updated', 'success');
  } else {
    // Save new
    saveLocation(currentLocation, folder, notes, tags);
    showToast('Location saved', 'success');
  }

  updateSavedPanelForLocation(currentLocation);
  updateFolderOptions();
}

/**
 * Handle remove location
 */
function handleRemoveLocation (locationId) {
  if (confirm('Remove this location from saved locations?')) {
    removeSavedLocation(locationId);
    showToast('Location removed', 'success');
    updateSavedPanelForLocation(currentLocation);
  }
}

/**
 * Update folder dropdown options
 */
function updateFolderOptions () {
  const folderSelect = document.getElementById('saveLocationFolder');
  if (!folderSelect) return;

  const folders = getFolders();
  const currentValue = folderSelect.value;

  // Clear existing options except default
  folderSelect.innerHTML = '<option value="default">Default</option>';

  // Add other folders
  folders.filter(f => f !== 'default').forEach(folder => {
    const option = document.createElement('option');
    option.value = folder;
    option.textContent = folder;
    folderSelect.appendChild(option);
  });

  // Restore selection
  if (currentValue) {
    folderSelect.value = currentValue;
  }
}

/**
 * Get saved locations count
 */
export function getSavedCount () {
  return getSavedLocations().length;
}













