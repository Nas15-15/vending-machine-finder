import { describe, it, expect } from 'vitest';
import { getPromoDetails, listPromoCodes } from '../lib/promoCodes.js';

describe('promo code helpers', () => {
  it('retrieves promo details case-insensitively', () => {
    const details = getPromoDetails('freesearch');
    expect(details).toBeTruthy();
    expect(details.type).toBe('free_search');
  });

  it('lists only public promos by default', () => {
    const codes = listPromoCodes();
    expect(codes.every(code => code.showOnPromoPage)).toBe(true);
  });

  it('includes hidden promos when requested', () => {
    const codes = listPromoCodes({ includeHidden: true });
    expect(codes.some(code => code.code === 'DSA74@A#')).toBe(true);
  });
});




















