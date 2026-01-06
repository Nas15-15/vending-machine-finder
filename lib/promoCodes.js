const PROMO_CODES = {
  'DSA74@A#': {
    type: 'full_access',
    label: 'Unlimited Access',
    description: 'Unlocks lifetime access on this device.',
    successMessage: 'Promo code accepted! You now have full access.',
    showOnPromoPage: false
  },
  FREESEARCH: {
    type: 'free_search',
    label: 'Extra Free Search',
    description: 'Adds one additional complimentary scan.',
    bonusSearches: 1,
    successMessage: 'Extra free search added to your account.',
    showOnPromoPage: true
  },
  '1DAY': {
    type: 'day_access',
    label: '24 Hour Access Pass',
    description: 'Enjoy full access for 24 hours.',
    durationHours: 24,
    successMessage: 'Unlocked pro access for the next 24 hours.',
    showOnPromoPage: true
  }
};

export function getPromoDetails (code = '') {
  if (!code) return null;
  return PROMO_CODES[code.toUpperCase()] || null;
}

export function listPromoCodes ({ includeHidden = false } = {}) {
  return Object.entries(PROMO_CODES)
    .filter(([, details]) => includeHidden || details.showOnPromoPage)
    .map(([code, details]) => ({
      code,
      ...details
    }));
}

