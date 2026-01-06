import { exportToJSON, exportToCSV, generatePDFContent, downloadFile } from '../../lib/exportService.js';
import { showToast } from './notifications.js';

let currentLocations = [];

/**
 * Initialize export panel
 */
export function initExportPanel () {
  const exportToggle = document.getElementById('exportToggle');
  const exportPanel = document.getElementById('exportPanel');
  const exportJSONBtn = document.getElementById('exportJSONBtn');
  const exportCSVBtn = document.getElementById('exportCSVBtn');
  const exportPDFBtn = document.getElementById('exportPDFBtn');

  if (exportToggle) {
    exportToggle.addEventListener('click', () => {
      exportPanel?.classList.toggle('hidden');
    });
  }

  if (exportJSONBtn) {
    exportJSONBtn.addEventListener('click', () => handleExport('json'));
  }

  if (exportCSVBtn) {
    exportCSVBtn.addEventListener('click', () => handleExport('csv'));
  }

  if (exportPDFBtn) {
    exportPDFBtn.addEventListener('click', () => handleExport('pdf'));
  }
}

/**
 * Set locations for export
 */
export function setExportLocations (locations) {
  currentLocations = locations;
}

/**
 * Handle export
 */
function handleExport (format) {
  if (currentLocations.length === 0) {
    showToast('No locations to export', 'error');
    return;
  }

  try {
    let result;

    switch (format) {
      case 'json':
        result = exportToJSON(currentLocations, {
          searchQuery: getSearchQuery(),
          exportedAt: new Date().toISOString()
        });
        downloadFile(result.data, result.filename, result.mimeType);
        showToast('Exported to JSON', 'success');
        break;

      case 'csv':
        result = exportToCSV(currentLocations);
        downloadFile(result.data, result.filename, result.mimeType);
        showToast('Exported to CSV', 'success');
        break;

      case 'pdf':
        result = generatePDFContent(currentLocations, {
          title: 'Vending Machine Location Report',
          searchQuery: getSearchQuery()
        });
        downloadFile(result.data, result.filename, result.mimeType);
        showToast('Exported to HTML (open in browser and print to PDF)', 'success');
        break;

      default:
        showToast('Unknown export format', 'error');
    }
  } catch (error) {
    console.error('Export error:', error);
    showToast('Export failed. Please try again.', 'error');
  }
}

/**
 * Get current search query
 */
function getSearchQuery () {
  const input = document.getElementById('locationInput');
  return input?.value || 'Unknown';
}













