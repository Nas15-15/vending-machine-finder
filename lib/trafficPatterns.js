/**
 * Time-Based Traffic Pattern Analysis
 * Analyzes hourly, daily, and seasonal traffic patterns
 */

// Hourly patterns by location category
const HOURLY_PATTERNS = {
  airport: {
    pattern: [0.3, 0.2, 0.2, 0.3, 0.5, 0.7, 0.9, 1.0, 0.9, 0.8, 0.7, 0.7, 0.8, 0.9, 0.9, 1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.3],
    peakHours: [7, 8, 16, 17]
  },
  hospital: {
    pattern: [0.4, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 0.95, 0.9, 0.85, 0.85, 0.9, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45],
    peakHours: [10, 11, 12, 13]
  },
  university: {
    pattern: [0.2, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.0, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.6, 0.5, 0.4, 0.3, 0.3, 0.2, 0.2],
    peakHours: [10, 11, 12, 13, 14]
  },
  gym: {
    pattern: [0.3, 0.4, 0.6, 0.7, 0.8, 0.9, 1.0, 0.8, 0.6, 0.5, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 0.95, 0.9, 0.85, 0.7, 0.5, 0.4, 0.3, 0.3],
    peakHours: [6, 7, 17, 18, 19]
  },
  office: {
    pattern: [0.2, 0.3, 0.5, 0.7, 0.9, 1.0, 0.95, 0.9, 0.8, 0.7, 0.6, 0.7, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2],
    peakHours: [7, 8, 12, 13]
  },
  shopping_mall: {
    pattern: [0.2, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 1.0, 1.0, 0.95, 0.9, 0.95, 1.0, 0.95, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4],
    peakHours: [12, 13, 14, 17, 18, 19]
  }
};

// Day-of-week patterns
const DAY_OF_WEEK_PATTERNS = {
  airport: { weekday: 1.0, weekend: 1.1 }, // Slightly busier on weekends
  hospital: { weekday: 1.0, weekend: 0.9 }, // Less busy on weekends
  university: { weekday: 1.0, weekend: 0.3 }, // Much less busy on weekends
  gym: { weekday: 1.0, weekend: 0.8 }, // Slightly less busy on weekends
  office: { weekday: 1.0, weekend: 0.2 }, // Much less busy on weekends
  shopping_mall: { weekday: 0.9, weekend: 1.2 } // Much busier on weekends
};

/**
 * Get hourly traffic pattern for a location
 */
export function getHourlyPattern (location) {
  const category = location.category || 'other';
  const pattern = HOURLY_PATTERNS[category] || {
    pattern: Array(24).fill(0.5),
    peakHours: [10, 11, 12, 13, 14]
  };

  const baseVisitors = location.estimatedVisitors || 1000;
  
  return {
    hourly: pattern.pattern.map((multiplier, hour) => ({
      hour,
      time: formatHour(hour),
      multiplier,
      estimatedVisitors: Math.round(baseVisitors * multiplier / 24), // Distribute daily visitors
      isPeak: pattern.peakHours.includes(hour)
    })),
    peakHours: pattern.peakHours.map(h => formatHour(h)),
    summary: {
      busiestHour: pattern.pattern.indexOf(Math.max(...pattern.pattern)),
      quietestHour: pattern.pattern.indexOf(Math.min(...pattern.pattern)),
      avgMultiplier: pattern.pattern.reduce((a, b) => a + b, 0) / 24
    }
  };
}

/**
 * Get day-of-week pattern
 */
export function getDayOfWeekPattern (location) {
  const category = location.category || 'other';
  const pattern = DAY_OF_WEEK_PATTERNS[category] || { weekday: 1.0, weekend: 1.0 };

  const baseVisitors = location.estimatedVisitors || 1000;

  return {
    monday: Math.round(baseVisitors * pattern.weekday),
    tuesday: Math.round(baseVisitors * pattern.weekday),
    wednesday: Math.round(baseVisitors * pattern.weekday),
    thursday: Math.round(baseVisitors * pattern.weekday),
    friday: Math.round(baseVisitors * pattern.weekday),
    saturday: Math.round(baseVisitors * pattern.weekend),
    sunday: Math.round(baseVisitors * pattern.weekend),
    weekdayAvg: Math.round(baseVisitors * pattern.weekday),
    weekendAvg: Math.round(baseVisitors * pattern.weekend)
  };
}

/**
 * Get seasonal adjustments
 */
export function getSeasonalAdjustments (location) {
  const category = location.category || 'other';
  const baseVisitors = location.estimatedVisitors || 1000;

  const seasonalMultipliers = {
    airport: { spring: 1.0, summer: 1.2, fall: 1.0, winter: 0.9 },
    hospital: { spring: 1.0, summer: 0.95, fall: 1.0, winter: 1.05 },
    university: { spring: 1.0, summer: 0.3, fall: 1.1, winter: 0.9 },
    gym: { spring: 1.2, summer: 1.0, fall: 1.0, winter: 0.9 },
    office: { spring: 1.0, summer: 0.95, fall: 1.0, winter: 0.95 },
    shopping_mall: { spring: 0.95, summer: 0.9, fall: 1.0, winter: 1.2 }
  };

  const multipliers = seasonalMultipliers[category] || { spring: 1.0, summer: 1.0, fall: 1.0, winter: 1.0 };

  return {
    spring: Math.round(baseVisitors * multipliers.spring),
    summer: Math.round(baseVisitors * multipliers.summer),
    fall: Math.round(baseVisitors * multipliers.fall),
    winter: Math.round(baseVisitors * multipliers.winter),
    multipliers
  };
}

/**
 * Get peak hours analysis
 */
export function getPeakHoursAnalysis (location) {
  const hourly = getHourlyPattern(location);
  const peakHours = hourly.hourly.filter(h => h.isPeak);
  const offPeakHours = hourly.hourly.filter(h => !h.isPeak);

  const peakAvg = peakHours.reduce((sum, h) => sum + h.estimatedVisitors, 0) / peakHours.length;
  const offPeakAvg = offPeakHours.reduce((sum, h) => sum + h.estimatedVisitors, 0) / offPeakHours.length;

  return {
    peakHours: peakHours.map(h => h.time),
    peakTraffic: Math.round(peakAvg),
    offPeakTraffic: Math.round(offPeakAvg),
    peakRatio: (peakAvg / offPeakAvg).toFixed(1),
    recommendation: peakAvg > offPeakAvg * 1.5 
      ? 'Consider restocking during peak hours for maximum sales'
      : 'Traffic is relatively consistent throughout the day'
  };
}

/**
 * Helper function to format hour
 */
function formatHour (hour) {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:00 ${period}`;
}













