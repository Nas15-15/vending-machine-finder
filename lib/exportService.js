/**
 * Export service for location data
 * Supports JSON, CSV, and PDF formats
 */

/**
 * Export locations to JSON
 */
export function exportToJSON (locations, metadata = {}) {
  const data = {
    ...metadata,
    locations,
    exportedAt: new Date().toISOString(),
    version: '1.0'
  };

  return {
    data: JSON.stringify(data, null, 2),
    filename: `vending-locations-${Date.now()}.json`,
    mimeType: 'application/json'
  };
}

/**
 * Export locations to CSV
 */
export function exportToCSV (locations) {
  if (locations.length === 0) {
    return {
      data: '',
      filename: 'vending-locations.csv',
      mimeType: 'text/csv'
    };
  }

  const headers = [
    'Name',
    'Category',
    'Address',
    'Overall Score',
    'Foot Traffic Score',
    'Daily Visitors',
    'Distance (m)',
    'Nearby Anchors',
    'Has Competition',
    'Latitude',
    'Longitude',
    'Peak Hours',
    'Best Products'
  ];

  const rows = locations.map(location => [
    location.name || location.displayCategory || '',
    location.displayCategory || location.category || '',
    location.address || '',
    location.overallScore || 0,
    location.footTrafficScore || 0,
    location.estimatedVisitors || 0,
    location.distance || 0,
    location.nearbyHighTraffic || 0,
    location.hasExistingVendingMachine ? 'Yes' : 'No',
    location.lat || '',
    location.lon || '',
    location.peakHours || '',
    location.bestProducts || ''
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => {
      // Escape commas and quotes in CSV
      const cellStr = String(cell || '');
      if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
        return `"${cellStr.replace(/"/g, '""')}"`;
      }
      return cellStr;
    }).join(','))
  ].join('\n');

  return {
    data: csvContent,
    filename: `vending-locations-${Date.now()}.csv`,
    mimeType: 'text/csv'
  };
}

/**
 * Generate PDF content (HTML format that can be converted to PDF)
 */
export function generatePDFContent (locations, options = {}) {
  const {
    title = 'Vending Machine Location Report',
    includeMap = false,
    includeCharts = false
  } = options;

  const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 40px;
            color: #1e293b;
            line-height: 1.6;
        }
        h1 {
            color: #1e40af;
            border-bottom: 3px solid #3b82f6;
            padding-bottom: 10px;
            margin-bottom: 30px;
        }
        .metadata {
            background: #f1f5f9;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 30px;
        }
        .metadata p {
            margin: 5px 0;
            color: #475569;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        th {
            background: #1e40af;
            color: white;
            padding: 12px;
            text-align: left;
            font-weight: 600;
        }
        td {
            padding: 10px 12px;
            border-bottom: 1px solid #e2e8f0;
        }
        tr:nth-child(even) {
            background: #f8fafc;
        }
        .score-high {
            color: #16a34a;
            font-weight: 600;
        }
        .score-medium {
            color: #f59e0b;
            font-weight: 600;
        }
        .score-low {
            color: #dc2626;
            font-weight: 600;
        }
        .location-card {
            page-break-inside: avoid;
            margin: 20px 0;
            padding: 15px;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            background: white;
        }
        .location-header {
            display: flex;
            justify-content: space-between;
            align-items: start;
            margin-bottom: 10px;
        }
        .location-name {
            font-size: 1.2em;
            font-weight: 700;
            color: #1e293b;
        }
        .location-category {
            background: #3b82f6;
            color: white;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 0.85em;
            font-weight: 600;
        }
        .location-details {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
            margin-top: 15px;
        }
        .detail-item {
            font-size: 0.9em;
        }
        .detail-label {
            color: #64748b;
            font-weight: 600;
        }
        .detail-value {
            color: #1e293b;
        }
        @media print {
            body {
                margin: 20px;
            }
            .location-card {
                page-break-inside: avoid;
            }
        }
    </style>
</head>
<body>
    <h1>${title}</h1>
    
    <div class="metadata">
        <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>Total Locations:</strong> ${locations.length}</p>
        ${options.searchQuery ? `<p><strong>Search Query:</strong> ${options.searchQuery}</p>` : ''}
    </div>

    ${locations.map((location, index) => `
        <div class="location-card">
            <div class="location-header">
                <div>
                    <div class="location-name">#${index + 1} - ${location.name || location.displayCategory || 'Location'}</div>
                    <p style="color: #64748b; margin: 5px 0;">${location.address || 'Address unavailable'}</p>
                </div>
                <span class="location-category">${location.displayCategory || location.category || 'Location'}</span>
            </div>
            
            <div class="location-details">
                <div class="detail-item">
                    <span class="detail-label">Overall Score:</span>
                    <span class="detail-value score-${getScoreClass(location.overallScore)}">${location.overallScore || 0}/100</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Foot Traffic Score:</span>
                    <span class="detail-value score-${getScoreClass(location.footTrafficScore)}">${location.footTrafficScore || 0}/100</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Daily Visitors:</span>
                    <span class="detail-value">${formatNumber(location.estimatedVisitors || 0)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Distance:</span>
                    <span class="detail-value">${formatDistance(location.distance || 0)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Nearby Anchors:</span>
                    <span class="detail-value">${location.nearbyHighTraffic || 0}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Competition:</span>
                    <span class="detail-value">${location.hasExistingVendingMachine ? 'Yes' : 'No'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Peak Hours:</span>
                    <span class="detail-value">${location.peakHours || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Best Products:</span>
                    <span class="detail-value">${location.bestProducts || 'N/A'}</span>
                </div>
            </div>
            
            ${location.description ? `<p style="margin-top: 15px; color: #475569; font-size: 0.9em;">${location.description}</p>` : ''}
        </div>
    `).join('')}

    <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #e2e8f0; text-align: center; color: #64748b; font-size: 0.85em;">
        <p>Generated by Vending Machine Location Finder</p>
        <p>Report ID: ${Date.now()}</p>
    </div>
</body>
</html>
  `;

  return {
    data: html,
    filename: `vending-locations-report-${Date.now()}.html`,
    mimeType: 'text/html'
  };
}

/**
 * Download file
 */
export function downloadFile (data, filename, mimeType) {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Helper functions
 */
function getScoreClass (score) {
  if (score >= 80) return 'high';
  if (score >= 60) return 'medium';
  return 'low';
}

function formatNumber (num) {
  return new Intl.NumberFormat('en-US').format(num);
}

function formatDistance (meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}













