import { MockProvider } from './providers/mock-provider.js';
import { RoboflowProvider } from './providers/roboflow-provider.js';

export class DetectionEngine {
  constructor(config = {}) {
    this.providers = {
      'mock': new MockProvider(config),
      'roboflow': new RoboflowProvider(config)
    };
    
    // Default provider
    this.currentProviderId = config.provider || 'roboflow';
  }

  setProvider(providerId) {
    if (!this.providers[providerId]) {
      throw new Error(`Provider ${providerId} not found`);
    }
    this.currentProviderId = providerId;
  }

  get provider() {
    return this.providers[this.currentProviderId];
  }

  /**
   * Initializes the active provider.
   */
  async init() {
    await this.provider.init();
  }

  /**
   * Delegates tile analysis to the active provider.
   * 
   * @param {Object} params - parameters containing imageData, bounds, zoom.
   * @returns {Promise<Array>} Array of unified detection objects.
   */
  async analyzeTile(params) {
    return this.provider.analyze(params);
  }
}
