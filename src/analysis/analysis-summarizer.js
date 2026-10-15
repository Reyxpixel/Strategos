export class AnalysisSummarizer {
  constructor() {}

  /**
   * Generates a comprehensive summary compatible with IntelPanel.
   * @param {Array} detections - Unified detection objects.
   * @param {Object} bounds - Map bounds.
   * @returns {Object} IntelPanel compatible JSON.
   */
  summarize(detections, bounds) {
    const counts = {};
    let totalArea = 0; // Simulated relative area for now

    const result = {
      summary: '',
      terrain_type: 'mixed',
      confidence: 'high',
      buildings: [],
      vehicles: [],
      vegetation: [],
      roads_and_paths: [],
      water_features: [],
      infrastructure: [],
      notable_observations: []
    };

    detections.forEach(det => {
      const cls = det.class || 'Unknown';
      counts[cls] = (counts[cls] || 0) + 1;

      // Group into specific arrays based on class
      const lowerCls = cls.toLowerCase();
      if (lowerCls.includes('building') || lowerCls.includes('warehouse')) {
        result.buildings.push({
          type: cls,
          description: det.attributes?.description || `Detected ${cls}`,
          condition: det.attributes?.condition || 'unknown',
          box_2d: det.box // Keep the box_2d for IntelPanel backwards compatibility if needed
        });
      } else if (lowerCls.includes('vehicle') || lowerCls.includes('car') || lowerCls.includes('truck')) {
        result.vehicles.push({
          type: cls,
          parked_or_moving: 'parked',
          location_description: 'Coordinates: ' + det.center.map(c => c.toFixed(5)).join(', ')
        });
      } else if (lowerCls.includes('tree') || lowerCls.includes('forest')) {
        result.vegetation.push({
          type: cls,
          description: det.attributes?.description || 'Vegetation area'
        });
      } else if (lowerCls.includes('road')) {
        result.roads_and_paths.push({
          type: cls,
          description: 'Transport route'
        });
      } else if (lowerCls.includes('water')) {
        result.water_features.push({
          type: cls,
          description: 'Water body'
        });
      } else {
        result.infrastructure.push({
          type: cls,
          description: 'Infrastructure element'
        });
      }
    });

    // Generate smart summary string
    const summaryParts = [];
    summaryParts.push(`Area scan complete. Detected ${detections.length} objects total.`);
    
    const countArr = Object.entries(counts).map(([k, v]) => `${v} ${k}${v > 1 ? 's' : ''}`);
    if (countArr.length > 0) {
      summaryParts.push(`Key items: ${countArr.join(', ')}.`);
    }

    // Check for military/strategic relevance
    if (counts['Tank'] || counts['APC'] || counts['Helicopter'] || counts['Aircraft']) {
      result.notable_observations.push({
        description: '⚠️ High strategic relevance detected: Potential military assets identified in the area.'
      });
    }

    // Add estimated land usage note
    if (counts['Building'] > 10) {
      result.terrain_type = 'urban/suburban';
    } else if (counts['Tree'] > 10) {
      result.terrain_type = 'rural/forest';
    }

    result.notable_observations.push({
      description: `Estimated Land Usage: predominantly ${result.terrain_type}.`
    });

    result.summary = summaryParts.join(' ');

    return result;
  }
}
