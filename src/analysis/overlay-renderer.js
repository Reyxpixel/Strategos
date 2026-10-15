import L from 'leaflet';

export class OverlayRenderer {
  constructor(mapEngine) {
    this.map = mapEngine.map;
    
    this.layerGroup = L.layerGroup().addTo(this.map);
    this.control = null;
    this.categoryLayers = {};

    this.colors = {
      'Building': '#3b82f6', // blue
      'Vehicle': '#ef4444',  // red
      'Road': '#f59e0b',     // amber
      'Tree': '#22c55e',     // green
      'Water': '#06b6d4',    // cyan
      'default': '#a855f7'   // purple
    };
  }

  /**
   * Render unified detections on the map.
   * @param {Array} detections 
   * @param {Object} bounds - original lat/lng bounds for scaling
   */
  render(detections, bounds) {
    this.clear();

    const layerMapping = {};

    detections.forEach(det => {
      const cls = det.class || 'Unknown';
      if (!layerMapping[cls]) {
        layerMapping[cls] = L.layerGroup();
        this.categoryLayers[cls] = layerMapping[cls];
      }

      const color = this.colors[cls] || this.colors['default'];
      let shape;

      // Use polygon if available, else fallback to bounding box
      if (det.polygon && det.polygon.length > 2) {
        shape = L.polygon(det.polygon, {
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.15,
          className: `overlay-polygon overlay-${cls.toLowerCase()}`
        });
      } else if (det.box) {
        // Box is normalized 0-1000, convert to lat/lng based on bounds
        const llBounds = this._mapBoxToLatLng(det.box, bounds);
        shape = L.rectangle(llBounds, {
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.15,
          className: `overlay-box overlay-${cls.toLowerCase()}`
        });
      } else {
        return; // Skip if no shape data
      }

      // Add popup
      const popupContent = `
        <div style="font-family: var(--font-stack);">
          <strong style="color: ${color}; font-size: 1.1em;">${cls}</strong><br/>
          <div style="margin-top: 4px; font-size: 0.9em; color: var(--text-2);">
            Confidence: ${(det.confidence * 100).toFixed(1)}%<br/>
            ${det.attributes?.description ? `Desc: ${det.attributes.description}<br/>` : ''}
            ${det.attributes?.condition ? `Cond: ${det.attributes.condition}` : ''}
          </div>
        </div>
      `;
      shape.bindPopup(popupContent);
      
      layerMapping[cls].addLayer(shape);
    });

    // Add all layers to map
    Object.values(this.categoryLayers).forEach(layer => layer.addTo(this.layerGroup));

    // Create Leaflet layers control for toggling
    if (Object.keys(this.categoryLayers).length > 0) {
      this.control = L.control.layers(null, this.categoryLayers, {
        position: 'topright',
        collapsed: false
      }).addTo(this.map);
    }
  }

  clear() {
    this.layerGroup.clearLayers();
    this.categoryLayers = {};
    if (this.control) {
      this.map.removeControl(this.control);
      this.control = null;
    }
  }

  _mapBoxToLatLng(box, bounds) {
    const [ymin, xmin, ymax, xmax] = box;
    
    const latDiff = bounds.nw.lat - bounds.se.lat; // positive (north to south)
    const lngDiff = bounds.se.lng - bounds.nw.lng; // positive (west to east)

    // ymin=0 is top (nw.lat), ymax=1000 is bottom (se.lat)
    const nLat = bounds.nw.lat - (ymin / 1000) * latDiff;
    const sLat = bounds.nw.lat - (ymax / 1000) * latDiff;
    
    // xmin=0 is left (nw.lng), xmax=1000 is right (se.lng)
    const wLng = bounds.nw.lng + (xmin / 1000) * lngDiff;
    const eLng = bounds.nw.lng + (xmax / 1000) * lngDiff;

    return [[nLat, wLng], [sLat, eLng]];
  }
}
