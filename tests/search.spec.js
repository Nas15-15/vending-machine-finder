import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runSearch } from '../lib/searchService.js';

// Mock fetch for API calls
global.fetch = vi.fn();

describe('Search Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should validate search query', async () => {
    await expect(runSearch('')).rejects.toThrow('Location query required');
    await expect(runSearch(null)).rejects.toThrow('Location query required');
  });

  it('should handle geocoding errors', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => []
    });

    await expect(runSearch('nonexistentlocation12345')).rejects.toThrow('Location not found');
  });

  it('should handle Overpass API errors', async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{
          lat: '40.7128',
          lon: '-74.0060',
          display_name: 'New York, NY',
          type: 'city',
          boundingbox: ['40.4774', '40.9176', '-74.2591', '-73.7004']
        }]
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500
      });

    await expect(runSearch('New York')).rejects.toThrow();
  });
});



















