import { generateFinancialSummary } from '../../lib/financialModel.js';
import { showToast } from './notifications.js';

let currentLocation = null;
let currentFinancialData = null;

/**
 * Initialize ROI Calculator UI
 */
export function initROICalculator () {
  const calculatorToggle = document.getElementById('roiCalculatorToggle');
  const calculatorPanel = document.getElementById('roiCalculatorPanel');
  const calculateBtn = document.getElementById('calculateROIBtn');
  const resetBtn = document.getElementById('resetROIBtn');

  if (calculatorToggle) {
    calculatorToggle.addEventListener('click', () => {
      calculatorPanel?.classList.toggle('hidden');
    });
  }

  if (calculateBtn) {
    calculateBtn.addEventListener('click', handleCalculate);
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', handleReset);
  }

  // Auto-calculate when inputs change (debounced)
  const inputs = calculatorPanel?.querySelectorAll('input[type="number"]');
  if (inputs) {
    let debounceTimer;
    inputs.forEach(input => {
      input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if (currentLocation) {
            handleCalculate();
          }
        }, 500);
      });
    });
  }
}

/**
 * Update calculator with location data
 */
export function updateCalculatorForLocation (location) {
  currentLocation = location;
  if (!location) return;

  // Set default values based on location
  const revenueEstimates = generateFinancialSummary(location, {
    machineCost: 5000,
    monthlyLease: 200,
    monthlyOperating: 150,
    productMargin: 0.40
  }).revenueEstimates;

  // Update input placeholders/suggestions
  const avgRevenueInput = document.getElementById('roiAvgRevenue');
  if (avgRevenueInput && !avgRevenueInput.value) {
    avgRevenueInput.placeholder = `~$${revenueEstimates.realistic.toLocaleString()}/month`;
  }

  // Auto-calculate if panel is visible
  const calculatorPanel = document.getElementById('roiCalculatorPanel');
  if (calculatorPanel && !calculatorPanel.classList.contains('hidden')) {
    handleCalculate();
  }
}

/**
 * Handle calculate button click
 */
function handleCalculate () {
  if (!currentLocation) {
    showToast('Please select a location first', 'error');
    return;
  }

  const inputs = getFinancialInputs();
  if (!validateInputs(inputs)) {
    return;
  }

  try {
    const financialData = generateFinancialSummary(currentLocation, inputs);
    currentFinancialData = financialData;
    renderResults(financialData);
    showToast('ROI calculated successfully', 'success');
  } catch (error) {
    console.error('ROI calculation error:', error);
    showToast('Error calculating ROI. Please check your inputs.', 'error');
  }
}

/**
 * Get financial inputs from form
 */
function getFinancialInputs () {
  return {
    machineCost: parseFloat(document.getElementById('roiMachineCost')?.value) || 5000,
    monthlyLease: parseFloat(document.getElementById('roiMonthlyLease')?.value) || 200,
    monthlyOperating: parseFloat(document.getElementById('roiMonthlyOperating')?.value) || 150,
    productMargin: parseFloat(document.getElementById('roiProductMargin')?.value) / 100 || 0.40,
    conversionRate: parseFloat(document.getElementById('roiConversionRate')?.value) / 100 || 0.02,
    avgTransactionValue: parseFloat(document.getElementById('roiAvgTransaction')?.value) || 2.50,
    projectionMonths: parseInt(document.getElementById('roiProjectionMonths')?.value) || 60
  };
}

/**
 * Validate inputs
 */
function validateInputs (inputs) {
  if (inputs.machineCost <= 0) {
    showToast('Machine cost must be greater than 0', 'error');
    return false;
  }
  if (inputs.productMargin <= 0 || inputs.productMargin >= 1) {
    showToast('Product margin must be between 0% and 100%', 'error');
    return false;
  }
  if (inputs.conversionRate <= 0 || inputs.conversionRate > 1) {
    showToast('Conversion rate must be between 0% and 100%', 'error');
    return false;
  }
  return true;
}

/**
 * Render calculation results
 */
function renderResults (data) {
  // Revenue estimates
  updateElement('roiRevenueConservative', formatCurrency(data.revenueEstimates.conservative));
  updateElement('roiRevenueRealistic', formatCurrency(data.revenueEstimates.realistic));
  updateElement('roiRevenueOptimistic', formatCurrency(data.revenueEstimates.optimistic));

  // Payback period
  const paybackText = data.paybackPeriod
    ? `${data.paybackPeriod} months`
    : 'Never (does not break even)';
  updateElement('roiPaybackPeriod', paybackText);

  // Break-even
  updateElement('roiBreakEven', formatCurrency(data.breakEven));

  // NPV
  updateElement('roiNPV1Year', formatCurrency(data.npv.oneYear));
  updateElement('roiNPV3Year', formatCurrency(data.npv.threeYear));
  updateElement('roiNPV5Year', formatCurrency(data.npv.fiveYear));

  // IRR
  updateElement('roiIRR1Year', formatPercent(data.irr.oneYear));
  updateElement('roiIRR3Year', formatPercent(data.irr.threeYear));
  updateElement('roiIRR5Year', formatPercent(data.irr.fiveYear));

  // Summary
  updateElement('roiTotalRevenue5Year', formatCurrency(data.summary.totalRevenue5Year));
  updateElement('roiTotalProfit5Year', formatCurrency(data.summary.totalProfit5Year));
  updateElement('roiAvgMonthlyProfit', formatCurrency(data.summary.avgMonthlyProfit));

  // Render cash flow chart
  renderCashFlowChart(data.projections);

  // Render projections table
  renderProjectionsTable(data.projections);
}

/**
 * Render cash flow chart
 */
function renderCashFlowChart (projections) {
  const chartContainer = document.getElementById('roiCashFlowChart');
  if (!chartContainer) return;

  // Simple bar chart using CSS
  const maxValue = Math.max(...projections.map(p => Math.abs(p.netCashFlow)));
  const chartHeight = 200;

  chartContainer.innerHTML = projections.slice(0, 12).map((projection, index) => {
    const height = (Math.abs(projection.netCashFlow) / maxValue) * chartHeight;
    const isPositive = projection.netCashFlow >= 0;
    return `
      <div class="cash-flow-bar" style="height: ${height}px; background: ${isPositive ? '#10b981' : '#ef4444'};" 
           title="Month ${projection.month}: ${formatCurrency(projection.netCashFlow)}">
      </div>
    `;
  }).join('');
}

/**
 * Render projections table
 */
function renderProjectionsTable (projections) {
  const tableContainer = document.getElementById('roiProjectionsTable');
  if (!tableContainer) return;

  const tableHTML = `
    <table class="projections-table">
      <thead>
        <tr>
          <th>Month</th>
          <th>Revenue</th>
          <th>Gross Profit</th>
          <th>Expenses</th>
          <th>Net Cash Flow</th>
          <th>Cumulative</th>
        </tr>
      </thead>
      <tbody>
        ${projections.slice(0, 12).map(p => `
          <tr>
            <td>${p.month}</td>
            <td>${formatCurrency(p.revenue)}</td>
            <td>${formatCurrency(p.grossProfit)}</td>
            <td>${formatCurrency(p.expenses)}</td>
            <td class="${p.netCashFlow >= 0 ? 'positive' : 'negative'}">${formatCurrency(p.netCashFlow)}</td>
            <td class="${p.cumulativeCashFlow >= 0 ? 'positive' : 'negative'}">${formatCurrency(p.cumulativeCashFlow)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  tableContainer.innerHTML = tableHTML;
}

/**
 * Handle reset button
 */
function handleReset () {
  const inputs = document.querySelectorAll('#roiCalculatorPanel input[type="number"]');
  inputs.forEach(input => {
    input.value = '';
  });
  currentFinancialData = null;
  const resultsSection = document.getElementById('roiResultsSection');
  if (resultsSection) {
    resultsSection.innerHTML = '<p class="text-muted">Enter values and click Calculate to see results.</p>';
  }
}

/**
 * Helper functions
 */
function updateElement (id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function formatCurrency (amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

function formatPercent (value) {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Export financial data
 */
export function exportFinancialData () {
  if (!currentFinancialData) {
    showToast('No financial data to export', 'error');
    return;
  }

  const data = {
    location: currentLocation,
    financialSummary: currentFinancialData,
    timestamp: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `roi-analysis-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}













