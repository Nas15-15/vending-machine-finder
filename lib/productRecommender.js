/**
 * AI-Powered Product Recommendation Engine
 * Recommends products based on demographics, location type, and trends
 */

// Product categories with profit margins
const PRODUCT_CATEGORIES = {
  snacks: { margin: 0.45, avgPrice: 1.50, popularity: 'high' },
  drinks: { margin: 0.50, avgPrice: 2.00, popularity: 'high' },
  coffee: { margin: 0.60, avgPrice: 2.50, popularity: 'high' },
  healthy: { margin: 0.40, avgPrice: 3.00, popularity: 'medium' },
  protein: { margin: 0.50, avgPrice: 3.50, popularity: 'medium' },
  candy: { margin: 0.55, avgPrice: 1.25, popularity: 'high' },
  water: { margin: 0.35, avgPrice: 1.50, popularity: 'high' },
  energy: { margin: 0.55, avgPrice: 3.00, popularity: 'medium' }
};

// Location type to product mapping
const LOCATION_PRODUCTS = {
  airport: ['snacks', 'drinks', 'water', 'healthy', 'coffee'],
  hospital: ['healthy', 'water', 'coffee', 'snacks'],
  university: ['energy', 'coffee', 'snacks', 'protein', 'drinks'],
  shopping_mall: ['candy', 'snacks', 'drinks', 'coffee'],
  gym: ['protein', 'water', 'energy', 'healthy'],
  office: ['coffee', 'healthy', 'snacks', 'water'],
  school: ['snacks', 'juice', 'water', 'candy'],
  train_station: ['coffee', 'snacks', 'water'],
  bus_station: ['snacks', 'drinks', 'water'],
  supermarket: ['snacks', 'candy'],
  cinema: ['candy', 'popcorn', 'drinks'],
  stadium: ['energy', 'snacks', 'water']
};

// Demographics to product preferences
const DEMOGRAPHIC_PRODUCTS = {
  '18-24': ['energy', 'snacks', 'protein', 'drinks'],
  '25-34': ['coffee', 'healthy', 'protein', 'snacks'],
  '35-44': ['coffee', 'healthy', 'water', 'snacks'],
  '45-54': ['coffee', 'healthy', 'water'],
  '55+': ['coffee', 'water', 'healthy']
};

/**
 * Recommend products for a location
 * @param {Object} location - Location object with demographics and category
 * @returns {Array} Recommended products with details
 */
export function recommendProducts (location) {
  const {
    category = 'other',
    demographics = {},
    estimatedVisitors = 1000
  } = location;

  const recommendations = [];
  const productScores = new Map();

  // Base recommendations from location type
  const locationProducts = LOCATION_PRODUCTS[category] || ['snacks', 'drinks'];
  locationProducts.forEach(product => {
    productScores.set(product, (productScores.get(product) || 0) + 10);
  });

  // Demographics-based recommendations
  const ageGroups = Object.keys(demographics);
  ageGroups.forEach(age => {
    const percent = demographics[age] || 0;
    const preferredProducts = DEMOGRAPHIC_PRODUCTS[age] || [];
    preferredProducts.forEach(product => {
      const score = productScores.get(product) || 0;
      productScores.set(product, score + (percent / 10)); // Weight by demographic percentage
    });
  });

  // Convert to recommendations array
  const sortedProducts = Array.from(productScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6); // Top 6 products

  sortedProducts.forEach(([productKey, score]) => {
    const productInfo = PRODUCT_CATEGORIES[productKey];
    if (productInfo) {
      // Calculate potential revenue
      const conversionRate = 0.02; // 2% of visitors
      const dailySales = Math.round(estimatedVisitors * conversionRate * (score / 100));
      const dailyRevenue = dailySales * productInfo.avgPrice;
      const monthlyRevenue = dailyRevenue * 30;
      const monthlyProfit = monthlyRevenue * productInfo.margin;

      recommendations.push({
        category: productKey,
        name: formatProductName(productKey),
        score: Math.round(score),
        margin: productInfo.margin,
        avgPrice: productInfo.avgPrice,
        popularity: productInfo.popularity,
        estimatedDailySales: dailySales,
        estimatedMonthlyRevenue: Math.round(monthlyRevenue),
        estimatedMonthlyProfit: Math.round(monthlyProfit),
        recommendation: getRecommendationText(productKey, score, location)
      });
    }
  });

  return recommendations;
}

/**
 * Get seasonal product recommendations
 */
export function getSeasonalProducts (location, season = getCurrentSeason()) {
  const baseRecommendations = recommendProducts(location);
  const seasonalAdjustments = {
    spring: { healthy: 1.2, water: 1.1 },
    summer: { water: 1.5, healthy: 1.3, drinks: 1.2 },
    fall: { coffee: 1.3, snacks: 1.1 },
    winter: { coffee: 1.4, hot_drinks: 1.2, snacks: 1.1 }
  };

  const adjustments = seasonalAdjustments[season] || {};
  
  return baseRecommendations.map(rec => {
    const multiplier = adjustments[rec.category] || 1.0;
    return {
      ...rec,
      estimatedMonthlyRevenue: Math.round(rec.estimatedMonthlyRevenue * multiplier),
      estimatedMonthlyProfit: Math.round(rec.estimatedMonthlyProfit * multiplier),
      seasonalBoost: multiplier > 1.0 ? `${((multiplier - 1) * 100).toFixed(0)}% boost in ${season}` : null
    };
  });
}

/**
 * Get best product mix for maximum profit
 */
export function getOptimalProductMix (location, maxSlots = 20) {
  const recommendations = recommendProducts(location);
  
  // Sort by profit potential
  const sortedByProfit = recommendations.sort((a, b) => 
    b.estimatedMonthlyProfit - a.estimatedMonthlyProfit
  );

  // Allocate slots based on profit and popularity
  const allocation = [];
  let remainingSlots = maxSlots;

  sortedByProfit.forEach(product => {
    const slots = Math.min(
      Math.ceil(product.estimatedMonthlyProfit / 100), // Allocate based on profit
      remainingSlots
    );
    if (slots > 0) {
      allocation.push({
        ...product,
        recommendedSlots: slots,
        totalMonthlyProfit: product.estimatedMonthlyProfit * slots
      });
      remainingSlots -= slots;
    }
  });

  const totalMonthlyProfit = allocation.reduce((sum, item) => sum + item.totalMonthlyProfit, 0);
  const totalMonthlyRevenue = allocation.reduce((sum, item) => 
    sum + (item.estimatedMonthlyRevenue * item.recommendedSlots), 0
  );

  return {
    mix: allocation,
    summary: {
      totalSlots: maxSlots,
      usedSlots: maxSlots - remainingSlots,
      totalMonthlyRevenue: Math.round(totalMonthlyRevenue),
      totalMonthlyProfit: Math.round(totalMonthlyProfit),
      profitMargin: ((totalMonthlyProfit / totalMonthlyRevenue) * 100).toFixed(1)
    }
  };
}

/**
 * Helper functions
 */
function formatProductName (key) {
  const names = {
    snacks: 'Snacks & Chips',
    drinks: 'Soft Drinks',
    coffee: 'Coffee & Hot Beverages',
    healthy: 'Healthy Snacks',
    protein: 'Protein Bars',
    candy: 'Candy & Sweets',
    water: 'Bottled Water',
    energy: 'Energy Drinks'
  };
  return names[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

function getRecommendationText (productKey, score, location) {
  if (score >= 15) {
    return `Highly recommended - Strong match for ${location.category || 'this location'}`;
  } else if (score >= 10) {
    return `Recommended - Good fit for target demographics`;
  } else {
    return `Consider - Moderate potential`;
  }
}

function getCurrentSeason () {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}













