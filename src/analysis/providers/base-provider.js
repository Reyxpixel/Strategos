/**
 * Base interface for Detection Providers.
 * All backend implementations (YOLO, Grounding DINO, Roboflow, Azure, etc.)
 * must extend this class and implement the analyze method.
 */
export class BaseProvider {
  constructor(config = {}) {
    this.config = config;
    this.name = 'Base Provider';
  }

  /**
   * Initializes the provider (e.g., loading models, authenticating).
   */
  async init() {}

  /**
   * Analyze a specific image/tile.
   * 
   * @param {Object} params
   * @param {string} params.imageData - Base64 encoded image data or image URL.
   * @param {Object} params.bounds - Geographical bounds of the image {nw: {lat, lng}, se: {lat, lng}}
   * @param {number} params.zoom - Zoom level of the tile.
   * 
   * @returns {Promise<Array>} Array of unified detection objects:
   * {
   *   id: string,
   *   class: string,          // e.g., 'building', 'vehicle', 'tree'
   *   confidence: number,     // 0.0 to 1.0
   *   box: [ymin, xmin, ymax, xmax], // normalized 0-1000 or lat/lng box
   *   polygon: [[lat, lng], [lat, lng], ...], // Optional
   *   center: [lat, lng],     // Derived or explicit center
   *   attributes: Object      // Optional metadata (color, condition, etc.)
   * }
   */
  async analyze(params) {
    throw new Error('Method "analyze" must be implemented by the provider.');
  }
}
