import L from 'leaflet';

const markers = [];
let mapInstance = null;

export function initMap () {
  const container = document.getElementById('mapContainer');
  if (!container) return null;
  if (mapInstance) {
    mapInstance.remove();
  }
  mapInstance = L.map('mapContainer').setView([39.8283, -98.5795], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(mapInstance);
  return mapInstance;
}

export function focusMap () {
  if (!mapInstance) return;
  const bounds = markers.map((marker) => marker.getLatLng());
  if (!bounds.length) return;
  mapInstance.fitBounds(bounds, { padding: [32, 32] });
}

function clearMarkers () {
  markers.splice(0).forEach((marker) => marker.remove());
}

function buildPopupContent (location) {
  const title = location.name || location.displayCategory || location.category;
  const address = location.address || 'Address unavailable';
  return `
    <div class="map-popup">
      <strong>${title}</strong><br/>
      <span>${address}</span><br/>
      <span>Score: ${location.overallScore}/100</span>
    </div>
  `;
}

export function renderMarkers (locations = [], onSelect = () => {}) {
  if (!mapInstance) return;
  clearMarkers();
  locations.forEach((location, index) => {
    const marker = L.marker([location.lat, location.lon]);
    marker.addTo(mapInstance).bindPopup(buildPopupContent(location));
    marker.on('click', () => onSelect(index));
    markers.push(marker);
  });
  focusMap();
}




















