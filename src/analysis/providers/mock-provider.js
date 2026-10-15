import { BaseProvider } from './base-provider.js';

export class MockProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'Mock Provider';
  }

  async analyze({ bounds }) {
    // Simulate network delay
    await new Promise(r => setTimeout(r, 1200));

    const detections = [];
    const count = 10 + Math.floor(Math.random() * 20); // 10 to 30 objects

    const classes = ['Building', 'Vehicle', 'Road', 'Tree', 'Water'];

    const latDiff = bounds.nw.lat - bounds.se.lat;
    const lngDiff = bounds.se.lng - bounds.nw.lng;

    for (let i = 0; i < count; i++) {
      const cls = classes[Math.floor(Math.random() * classes.length)];
      
      // Random center within bounds
      const lat = bounds.se.lat + Math.random() * latDiff;
      const lng = bounds.nw.lng + Math.random() * lngDiff;

      // Random size relative to bounds
      const sizeLat = latDiff * (0.05 + Math.random() * 0.1);
      const sizeLng = lngDiff * (0.05 + Math.random() * 0.1);

      const nLat = lat + sizeLat / 2;
      const sLat = lat - sizeLat / 2;
      const wLng = lng - sizeLng / 2;
      const eLng = lng + sizeLng / 2;

      // Ensure within bounds
      const box = [
        Math.min(bounds.nw.lat, Math.max(bounds.se.lat, sLat)), // ymin
        Math.max(bounds.nw.lng, Math.min(bounds.se.lng, wLng)), // xmin
        Math.min(bounds.nw.lat, Math.max(bounds.se.lat, nLat)), // ymax
        Math.max(bounds.nw.lng, Math.min(bounds.se.lng, eLng))  // xmax
      ];

      // Convert to normalized 0-1000 for output format compatibility
      const ymin = 1000 - ((box[0] - bounds.se.lat) / latDiff) * 1000;
      const xmin = ((box[1] - bounds.nw.lng) / lngDiff) * 1000;
      const ymax = 1000 - ((box[2] - bounds.se.lat) / latDiff) * 1000;
      const xmax = ((box[3] - bounds.nw.lng) / lngDiff) * 1000;

      // Ensure proper ordering
      const normYmin = Math.min(ymin, ymax);
      const normYmax = Math.max(ymin, ymax);
      const normXmin = Math.min(xmin, xmax);
      const normXmax = Math.max(xmin, xmax);

      detections.push({
        id: `mock_${Math.random().toString(36).substr(2, 9)}`,
        class: cls,
        confidence: 0.5 + Math.random() * 0.49, // 0.50 to 0.99
        box: [normYmin, normXmin, normYmax, normXmax],
        center: [lat, lng],
        attributes: {
          description: `Simulated ${cls} detection`,
          condition: Math.random() > 0.5 ? 'maintained' : 'unknown'
        }
      });
    }

    return detections;
  }
}
