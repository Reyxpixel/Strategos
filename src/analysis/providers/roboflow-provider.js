import { BaseProvider } from './base-provider.js';

export class RoboflowProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'Roboflow CV Pipeline';
  }

  async init() {
    this.apiKey = localStorage.getItem('strategos_cv_api_key');
    this.modelEndpoint = localStorage.getItem('strategos_cv_model') || 'aerial-vehicles-and-buildings/1';
  }

  async analyze({ imageData, bounds }) {
    if (!this.apiKey) {
      throw new Error('No Roboflow API key configured. Open Settings (⚙) to add your Computer Vision API key.');
    }
    if (!imageData) {
      throw new Error('No image data provided to RoboflowProvider.');
    }

    // Roboflow Inference API
    const response = await fetch(
      `https://detect.roboflow.com/${this.modelEndpoint}?api_key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: imageData // Base64 string
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error('Roboflow API error: ' + (err.message || response.status));
    }

    const data = await response.json();
    
    // The image size as understood by Roboflow
    const imgWidth = data.image?.width || 1000;
    const imgHeight = data.image?.height || 1000;

    const latDiff = bounds.nw.lat - bounds.se.lat;
    const lngDiff = bounds.se.lng - bounds.nw.lng;

    const detections = (data.predictions || []).map((pred, index) => {
      // Roboflow returns x, y (center), width, height in pixels
      const pxX = pred.x;
      const pxY = pred.y;
      const pxW = pred.width;
      const pxH = pred.height;

      // Convert to normalized 0-1000 bounds
      const xmin = ((pxX - pxW / 2) / imgWidth) * 1000;
      const xmax = ((pxX + pxW / 2) / imgWidth) * 1000;
      const ymin = ((pxY - pxH / 2) / imgHeight) * 1000;
      const ymax = ((pxY + pxH / 2) / imgHeight) * 1000;

      // Center lat/lng
      const centerLat = bounds.nw.lat - (pxY / imgHeight) * latDiff;
      const centerLng = bounds.nw.lng + (pxX / imgWidth) * lngDiff;

      // Capitalize class name
      let cls = pred.class || 'Unknown';
      cls = cls.charAt(0).toUpperCase() + cls.slice(1);

      return {
        id: `rf_${Date.now()}_${index}`,
        class: cls,
        confidence: pred.confidence,
        box: [ymin, xmin, ymax, xmax],
        center: [centerLat, centerLng],
        attributes: {
          description: `Detected ${cls} via Roboflow Inference`
        }
      };
    });

    return detections;
  }
}
