/**
 * Financial modeling utilities for vending machine ROI calculations
 */

/**
 * Calculate monthly revenue estimate based on location metrics
 * @param {Object} location - Location object with foot traffic and demographics
 * @param {Object} config - Configuration for revenue calculation
 * @returns {Object} Revenue estimates (conservative, realistic, optimistic)
 */
export function estimateMonthlyRevenue (location, config = {}) {
  const {
    footTrafficScore = 50,
    estimatedVisitors = 1000,
    category = 'other'
  } = location;

  const {
    conversionRate = 0.02, // 2% of visitors make a purchase
    avgTransactionValue = 2.50, // Average sale amount
    operatingDaysPerMonth = 30
  } = config;

  // Category-specific adjustments
  const categoryMultipliers = {
    airport: { conservative: 1.2, realistic: 1.5, optimistic: 1.8 },
    hospital: { conservative: 1.1, realistic: 1.3, optimistic: 1.6 },
    university: { conservative: 1.3, realistic: 1.6, optimistic: 2.0 },
    shopping_mall: { conservative: 1.0, realistic: 1.2, optimistic: 1.5 },
    gym: { conservative: 1.1, realistic: 1.4, optimistic: 1.7 },
    office: { conservative: 0.9, realistic: 1.1, optimistic: 1.3 },
    school: { conservative: 0.8, realistic: 1.0, optimistic: 1.2 }
  };

  const multipliers = categoryMultipliers[category] || { conservative: 1.0, realistic: 1.1, optimistic: 1.3 };

  // Base calculation
  const dailyTransactions = estimatedVisitors * conversionRate;
  const baseMonthlyRevenue = dailyTransactions * avgTransactionValue * operatingDaysPerMonth;

  return {
    conservative: Math.round(baseMonthlyRevenue * multipliers.conservative),
    realistic: Math.round(baseMonthlyRevenue * multipliers.realistic),
    optimistic: Math.round(baseMonthlyRevenue * multipliers.optimistic)
  };
}

/**
 * Calculate Net Present Value (NPV)
 * @param {Array<number>} cashFlows - Array of cash flows (year 0, year 1, year 2, etc.)
 * @param {number} discountRate - Annual discount rate (e.g., 0.10 for 10%)
 * @returns {number} NPV
 */
export function calculateNPV (cashFlows, discountRate = 0.10) {
  return cashFlows.reduce((npv, cashFlow, year) => {
    return npv + cashFlow / Math.pow(1 + discountRate, year);
  }, 0);
}

/**
 * Calculate Internal Rate of Return (IRR)
 * Uses Newton-Raphson method for approximation
 * @param {Array<number>} cashFlows - Array of cash flows
 * @param {number} initialGuess - Initial guess for IRR (default 0.1)
 * @param {number} maxIterations - Maximum iterations
 * @returns {number} IRR as decimal (e.g., 0.15 for 15%)
 */
export function calculateIRR (cashFlows, initialGuess = 0.1, maxIterations = 100) {
  let rate = initialGuess;
  const tolerance = 0.0001;

  for (let i = 0; i < maxIterations; i++) {
    let npv = 0;
    let npvDerivative = 0;

    cashFlows.forEach((cashFlow, year) => {
      const denominator = Math.pow(1 + rate, year);
      npv += cashFlow / denominator;
      if (year > 0) {
        npvDerivative -= (year * cashFlow) / (denominator * (1 + rate));
      }
    });

    if (Math.abs(npv) < tolerance) {
      return rate;
    }

    if (Math.abs(npvDerivative) < tolerance) {
      break;
    }

    rate = rate - npv / npvDerivative;
  }

  return rate;
}

/**
 * Generate cash flow projections
 * @param {Object} inputs - Financial inputs
 * @param {number} inputs.monthlyRevenue - Expected monthly revenue
 * @param {number} inputs.machineCost - Initial machine cost
 * @param {number} inputs.monthlyLease - Monthly lease/rent cost
 * @param {number} inputs.monthlyOperating - Monthly operating costs (restocking, maintenance)
 * @param {number} inputs.productMargin - Product margin percentage (0-1)
 * @param {number} inputs.months - Number of months to project
 * @returns {Array<Object>} Monthly cash flow projections
 */
export function generateCashFlowProjections (inputs) {
  const {
    monthlyRevenue = 2000,
    machineCost = 5000,
    monthlyLease = 200,
    monthlyOperating = 150,
    productMargin = 0.40, // 40% margin
    months = 60
  } = inputs;

  const projections = [];
  let cumulativeCashFlow = -machineCost; // Initial investment

  for (let month = 1; month <= months; month++) {
    const grossProfit = monthlyRevenue * productMargin;
    const totalExpenses = monthlyLease + monthlyOperating;
    const netCashFlow = grossProfit - totalExpenses;
    cumulativeCashFlow += netCashFlow;

    projections.push({
      month,
      revenue: monthlyRevenue,
      grossProfit: Math.round(grossProfit),
      expenses: totalExpenses,
      netCashFlow: Math.round(netCashFlow),
      cumulativeCashFlow: Math.round(cumulativeCashFlow)
    });
  }

  return projections;
}

/**
 * Calculate payback period
 * @param {Array<Object>} projections - Cash flow projections
 * @param {number} initialInvestment - Initial investment amount
 * @returns {number|null} Payback period in months, or null if never pays back
 */
export function calculatePaybackPeriod (projections, initialInvestment) {
  let cumulative = -initialInvestment;

  for (const projection of projections) {
    cumulative += projection.netCashFlow;
    if (cumulative >= 0) {
      return projection.month;
    }
  }

  return null; // Never pays back
}

/**
 * Calculate break-even point
 * @param {number} monthlyLease - Monthly lease cost
 * @param {number} monthlyOperating - Monthly operating costs
 * @param {number} productMargin - Product margin (0-1)
 * @returns {number} Break-even monthly revenue
 */
export function calculateBreakEven (monthlyLease, monthlyOperating, productMargin) {
  const totalFixedCosts = monthlyLease + monthlyOperating;
  if (productMargin <= 0) return Infinity;
  return Math.ceil(totalFixedCosts / productMargin);
}

/**
 * Generate financial summary
 * @param {Object} location - Location data
 * @param {Object} financialInputs - User-provided financial inputs
 * @returns {Object} Complete financial analysis
 */
export function generateFinancialSummary (location, financialInputs) {
  const revenueEstimates = estimateMonthlyRevenue(location, {
    conversionRate: financialInputs.conversionRate || 0.02,
    avgTransactionValue: financialInputs.avgTransactionValue || 2.50
  });

  const projections = generateCashFlowProjections({
    monthlyRevenue: revenueEstimates.realistic,
    machineCost: financialInputs.machineCost || 5000,
    monthlyLease: financialInputs.monthlyLease || 200,
    monthlyOperating: financialInputs.monthlyOperating || 150,
    productMargin: financialInputs.productMargin || 0.40,
    months: financialInputs.projectionMonths || 60
  });

  const paybackPeriod = calculatePaybackPeriod(projections, financialInputs.machineCost || 5000);
  const breakEven = calculateBreakEven(
    financialInputs.monthlyLease || 200,
    financialInputs.monthlyOperating || 150,
    financialInputs.productMargin || 0.40
  );

  // Calculate NPV and IRR for 1, 3, and 5 year periods
  const cashFlows1Year = [-financialInputs.machineCost || 5000, ...projections.slice(0, 12).map(p => p.netCashFlow)];
  const cashFlows3Year = [-financialInputs.machineCost || 5000, ...projections.slice(0, 36).map(p => p.netCashFlow)];
  const cashFlows5Year = [-financialInputs.machineCost || 5000, ...projections.map(p => p.netCashFlow)];

  const npv1Year = calculateNPV(cashFlows1Year, 0.10);
  const npv3Year = calculateNPV(cashFlows3Year, 0.10);
  const npv5Year = calculateNPV(cashFlows5Year, 0.10);

  const irr1Year = calculateIRR(cashFlows1Year);
  const irr3Year = calculateIRR(cashFlows3Year);
  const irr5Year = calculateIRR(cashFlows5Year);

  return {
    revenueEstimates,
    projections,
    paybackPeriod,
    breakEven,
    npv: {
      oneYear: Math.round(npv1Year),
      threeYear: Math.round(npv3Year),
      fiveYear: Math.round(npv5Year)
    },
    irr: {
      oneYear: Math.round(irr1Year * 100) / 100,
      threeYear: Math.round(irr3Year * 100) / 100,
      fiveYear: Math.round(irr5Year * 100) / 100
    },
    summary: {
      totalRevenue5Year: projections.reduce((sum, p) => sum + p.revenue, 0),
      totalProfit5Year: projections.reduce((sum, p) => sum + p.netCashFlow, 0),
      avgMonthlyProfit: Math.round(projections.slice(12).reduce((sum, p) => sum + p.netCashFlow, 0) / (projections.length - 12))
    }
  };
}













