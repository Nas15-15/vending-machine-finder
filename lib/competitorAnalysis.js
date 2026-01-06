/**
 * Competitive Intelligence Dashboard
 * Analyzes competition in the area and provides market insights
 */

/**
 * Analyze competition for a location
 */
export function analyzeCompetition (location, allLocations = []) {
  const nearbyLocations = allLocations.filter(loc => {
    if (loc === location) return false;
    const distance = calculateDistance(location.lat, location.lon, loc.lat, loc.lon);
    return distance <= 500; // Within 500 meters
  });

  const competitors = nearbyLocations.filter(loc => loc.hasExistingVendingMachine);
  const similarLocations = nearbyLocations.filter(loc => loc.category === location.category);

  // Market saturation analysis
  const saturationLevel = calculateSaturation(competitors.length, nearbyLocations.length);
  
  // Gap analysis
  const gaps = identifyGaps(location, nearbyLocations, competitors);

  // Competitive positioning
  const positioning = getCompetitivePositioning(location, competitors);

  return {
    competitorCount: competitors.length,
    nearbyLocations: nearbyLocations.length,
    similarLocations: similarLocations.length,
    saturationLevel,
    gaps,
    positioning,
    recommendations: generateCompetitiveRecommendations(location, competitors, saturationLevel)
  };
}

/**
 * Calculate market saturation
 */
function calculateSaturation (competitorCount, totalNearby) {
  if (totalNearby === 0) return { level: 'low', percentage: 0, description: 'No nearby locations' };
  
  const percentage = (competitorCount / totalNearby) * 100;
  
  if (percentage >= 70) {
    return { level: 'high', percentage: Math.round(percentage), description: 'Highly saturated market' };
  } else if (percentage >= 40) {
    return { level: 'medium', percentage: Math.round(percentage), description: 'Moderately saturated market' };
  } else {
    return { level: 'low', percentage: Math.round(percentage), description: 'Low saturation - opportunity' };
  }
}

/**
 * Identify market gaps
 */
function identifyGaps (location, nearbyLocations, competitors) {
  const gaps = [];

  // Check for category gaps
  const categories = new Set(nearbyLocations.map(loc => loc.category));
  const competitorCategories = new Set(competitors.map(c => c.category));
  const missingCategories = Array.from(categories).filter(cat => !competitorCategories.has(cat));
  
  if (missingCategories.length > 0) {
    gaps.push({
      type: 'category',
      description: `No competitors in ${missingCategories.join(', ')} categories`,
      opportunity: 'high'
    });
  }

  // Check for quality gaps
  const avgCompetitorScore = competitors.length > 0
    ? competitors.reduce((sum, c) => sum + (c.overallScore || 0), 0) / competitors.length
    : 0;
  
  if (location.overallScore > avgCompetitorScore + 10) {
    gaps.push({
      type: 'quality',
      description: `Location quality significantly higher than competitors`,
      opportunity: 'high'
    });
  }

  // Check for distance gaps
  if (competitors.length === 0) {
    gaps.push({
      type: 'distance',
      description: 'No competitors in immediate area',
      opportunity: 'very_high'
    });
  } else {
    const minDistance = Math.min(...competitors.map(c => 
      calculateDistance(location.lat, location.lon, c.lat, c.lon)
    ));
    if (minDistance > 200) {
      gaps.push({
        type: 'distance',
        description: `Nearest competitor is ${Math.round(minDistance)}m away`,
        opportunity: 'high'
      });
    }
  }

  return gaps;
}

/**
 * Get competitive positioning
 */
function getCompetitivePositioning (location, competitors) {
  if (competitors.length === 0) {
    return {
      position: 'first_mover',
      description: 'First vending machine in this area',
      advantage: 'No direct competition, can set market prices'
    };
  }

  const locationScore = location.overallScore || 0;
  const avgCompetitorScore = competitors.reduce((sum, c) => sum + (c.overallScore || 0), 0) / competitors.length;

  if (locationScore > avgCompetitorScore + 15) {
    return {
      position: 'premium',
      description: 'Superior location compared to competitors',
      advantage: 'Can command premium pricing, attract more customers'
    };
  } else if (locationScore > avgCompetitorScore) {
    return {
      position: 'competitive',
      description: 'Comparable quality to existing competitors',
      advantage: 'Need to differentiate through products or service'
    };
  } else {
    return {
      position: 'challenger',
      description: 'Lower quality location than competitors',
      advantage: 'Focus on niche products or lower prices'
    };
  }
}

/**
 * Generate competitive recommendations
 */
function generateCompetitiveRecommendations (location, competitors, saturation) {
  const recommendations = [];

  if (saturation.level === 'low') {
    recommendations.push({
      type: 'opportunity',
      priority: 'high',
      text: 'Low market saturation - excellent opportunity to enter this market'
    });
  }

  if (competitors.length === 0) {
    recommendations.push({
      type: 'strategy',
      priority: 'high',
      text: 'No existing competition - consider premium products and pricing'
    });
  } else {
    recommendations.push({
      type: 'strategy',
      priority: 'medium',
      text: `${competitors.length} competitor(s) nearby - differentiate with unique products or better service`
    });
  }

  if (location.category === 'gym' || location.category === 'hospital') {
    recommendations.push({
      type: 'product',
      priority: 'high',
      text: 'Focus on healthy options to differentiate from typical vending machines'
    });
  }

  if (location.footTrafficScore >= 80) {
    recommendations.push({
      type: 'pricing',
      priority: 'medium',
      text: 'High traffic location - can support premium pricing'
    });
  }

  return recommendations;
}

/**
 * Calculate distance between two points (Haversine formula)
 */
function calculateDistance (lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Generate market heatmap data
 */
export function generateMarketHeatmap (locations) {
  const heatmapData = locations.map(loc => ({
    lat: loc.lat,
    lon: loc.lon,
    intensity: calculateIntensity(loc, locations)
  }));

  return {
    data: heatmapData,
    maxIntensity: Math.max(...heatmapData.map(d => d.intensity)),
    minIntensity: Math.min(...heatmapData.map(d => d.intensity))
  };
}

/**
 * Calculate intensity for heatmap
 */
function calculateIntensity (location, allLocations) {
  const nearby = allLocations.filter(loc => {
    const distance = calculateDistance(location.lat, location.lon, loc.lat, loc.lon);
    return distance <= 300;
  }).length;

  const score = (location.overallScore || 0) / 100;
  const traffic = (location.footTrafficScore || 0) / 100;
  
  return (score * 0.4 + traffic * 0.4 + (nearby / 10) * 0.2) * 100;
}













