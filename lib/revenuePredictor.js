/**
 * AI-Powered Revenue Prediction Engine
 * Predicts monthly/annual revenue based on location metrics and industry benchmarks
 */

// Industry benchmarks for vending machine revenue by location type
const REVENUE_BENCHMARKS = {
  airport: { monthly: 8000, annual: 96000, conversionRate: 0.035 },
  hospital: { monthly: 4500, annual: 54000, conversionRate: 0.025 },
  university: { monthly: 3500, annual: 42000, conversionRate: 0.030 },
  shopping_mall: { monthly: 3000, annual: 36000, conversionRate: 0.020 },
  gym: { monthly: 2500, annual: 30000, conversionRate: 0.028 },
  office: { monthly: 2000, annual: 24000, conversionRate: 0.015 },
  school: { monthly: 1800, annual: 21600, conversionRate: 0.022 },
  train_station: { monthly: 4000, annual: 48000, conversionRate: 0.030 },
  bus_station: { monthly: 2200, annual: 26400, conversionRate: 0.025 },
  supermarket: { monthly: 2800, annual: 33600, conversionRate: 0.018 },
  cinema: { monthly: 3200, annual: 38400, conversionRate: 0.025 },
  stadium: { monthly: 6000, annual: 72000, conversionRate: 0.040 }
};

const DEFAULT_BENCHMARK = { monthly: 2000, annual: 24000, conversionRate: 0.020 };

/**
 * Predict revenue for a location
 * @param {Object} location - Location object with metrics
 * @returns {Object} Revenue predictions with ranges
 */
export function predictRevenue (location) {
  const {
    footTrafficScore = 50,
    estimatedVisitors = 1000,
    category = 'other',
    overallScore = 50,
    nearbyHighTraffic = 0
  } = location;

  // Get base benchmark for category
  const benchmark = REVENUE_BENCHMARKS[category] || DEFAULT_BENCHMARK;

  // Calculate base revenue from benchmark
  let baseMonthly = benchmark.monthly;
  let baseAnnual = benchmark.annual;

  // Adjust based on foot traffic score (0-100 scale)
  const trafficMultiplier = footTrafficScore / 100;
  baseMonthly *= (0.5 + trafficMultiplier * 0.5); // Scale between 50% and 100% of benchmark
  baseAnnual = baseMonthly * 12;

  // Adjust based on overall score
  const scoreMultiplier = overallScore / 100;
  baseMonthly *= (0.7 + scoreMultiplier * 0.3); // Scale between 70% and 100%
  baseAnnual = baseMonthly * 12;

  // Adjust based on nearby anchors (bonus for clustering)
  const anchorBonus = Math.min(nearbyHighTraffic * 0.05, 0.20); // Up to 20% bonus
  baseMonthly *= (1 + anchorBonus);
  baseAnnual = baseMonthly * 12;

  // Calculate ranges
  const conservative = {
    monthly: Math.round(baseMonthly * 0.75),
    annual: Math.round(baseAnnual * 0.75),
    description: 'Conservative estimate (75% of base)'
  };

  const realistic = {
    monthly: Math.round(baseMonthly),
    annual: Math.round(baseAnnual),
    description: 'Realistic estimate based on industry benchmarks'
  };

  const optimistic = {
    monthly: Math.round(baseMonthly * 1.25),
    annual: Math.round(baseAnnual * 1.25),
    description: 'Optimistic estimate (125% of base)'
  };

  // Calculate payback period (assuming $5000 machine cost, 40% margin)
  const avgMonthlyRevenue = realistic.monthly;
  const monthlyProfit = avgMonthlyRevenue * 0.40; // 40% margin
  const machineCost = 5000; // Default
  const paybackMonths = Math.ceil(machineCost / monthlyProfit);

  // Break-even analysis
  const monthlyFixedCosts = 350; // Lease + operating
  const breakEvenRevenue = Math.ceil(monthlyFixedCosts / 0.40);

  return {
    conservative,
    realistic,
    optimistic,
    paybackPeriod: {
      months: paybackMonths,
      years: (paybackMonths / 12).toFixed(1)
    },
    breakEven: {
      monthlyRevenue: breakEvenRevenue,
      description: `Need ${breakEvenRevenue.toLocaleString()} monthly revenue to break even`
    },
    confidence: calculateConfidence(location),
    factors: getRevenueFactors(location, benchmark)
  };
}

/**
 * Calculate prediction confidence (0-100)
 */
function calculateConfidence (location) {
  let confidence = 50; // Base confidence

  // Higher confidence for known location types
  if (REVENUE_BENCHMARKS[location.category]) {
    confidence += 20;
  }

  // Higher confidence with more data points
  if (location.footTrafficScore >= 70) confidence += 15;
  if (location.overallScore >= 70) confidence += 10;
  if (location.estimatedVisitors >= 2000) confidence += 5;

  return Math.min(100, confidence);
}

/**
 * Get factors affecting revenue
 */
function getRevenueFactors (location, benchmark) {
  const factors = [];

  if (location.footTrafficScore >= 80) {
    factors.push({ type: 'positive', text: 'High foot traffic score' });
  } else if (location.footTrafficScore < 50) {
    factors.push({ type: 'negative', text: 'Lower foot traffic' });
  }

  if (location.nearbyHighTraffic >= 3) {
    factors.push({ type: 'positive', text: 'Multiple anchor businesses nearby' });
  }

  if (location.hasExistingVendingMachine) {
    factors.push({ type: 'negative', text: 'Existing competition may reduce sales' });
  } else {
    factors.push({ type: 'positive', text: 'No existing competition (first-mover advantage)' });
  }

  if (REVENUE_BENCHMARKS[location.category]) {
    factors.push({ type: 'positive', text: `Strong category benchmark (${location.category})` });
  }

  if (location.overallScore >= 80) {
    factors.push({ type: 'positive', text: 'Excellent overall location score' });
  }

  return factors;
}

/**
 * Predict seasonal adjustments
 */
export function predictSeasonalRevenue (baseRevenue, category) {
  // Seasonal multipliers by category
  const seasonalPatterns = {
    airport: { q1: 0.95, q2: 1.05, q3: 1.10, q4: 0.90 }, // Summer travel peak
    university: { q1: 0.85, q2: 0.70, q3: 0.50, q4: 0.95 }, // Summer break
    school: { q1: 0.90, q2: 0.75, q3: 0.40, q4: 1.00 }, // Summer break
    gym: { q1: 1.20, q2: 1.10, q3: 0.90, q4: 0.80 }, // New Year resolutions
    shopping_mall: { q1: 0.90, q2: 0.95, q3: 0.95, q4: 1.20 }, // Holiday shopping
    stadium: { q1: 0.80, q2: 1.00, q3: 1.30, q4: 0.90 } // Sports season dependent
  };

  const pattern = seasonalPatterns[category] || { q1: 1.0, q2: 1.0, q3: 1.0, q4: 1.0 };

  return {
    quarterly: {
      q1: Math.round(baseRevenue * pattern.q1),
      q2: Math.round(baseRevenue * pattern.q2),
      q3: Math.round(baseRevenue * pattern.q3),
      q4: Math.round(baseRevenue * pattern.q4)
    },
    annual: Math.round(baseRevenue * 12 * (pattern.q1 + pattern.q2 + pattern.q3 + pattern.q4) / 4)
  };
}













