export class TileProcessor {
  constructor(detectionEngine) {
    this.engine = detectionEngine;
  }

  /**
   * Processes a geographical area, optionally tiling it, and returns merged detections.
   * 
   * @param {Object} bounds - {nw: {lat, lng}, se: {lat, lng}}
   * @param {number} zoom - Current map zoom level
   * @param {Object} rect - Selection rect {x, y, w, h}
   * @param {Object} mapEngine - MapEngine instance
   * @param {Function} progressCallback - Called with string status updates
   * @returns {Promise<Array>} Array of unified detections
   */
  async processArea(bounds, zoom, rect, mapEngine, progressCallback = () => {}) {
    progressCallback('Initializing detection engine...');
    await this.engine.init();

    progressCallback('Capturing satellite imagery...');
    
    // Auto-switch to satellite for better image analysis
    const prevLayer = mapEngine.currentLayerName;
    if (prevLayer !== 'satellite') {
      progressCallback('Switching to satellite view...');
      mapEngine.setLayer('satellite');
      document.querySelectorAll('.layer-opt').forEach(b => {
        b.classList.toggle('active', b.dataset.layer === 'satellite');
      });
      // Wait for satellite tiles to load
      await this._waitForTiles(mapEngine, 3500);
    }

    let base64Image;
    try {
      base64Image = await this._captureFromDOM(rect, mapEngine);
      console.log('[Strategos] DOM capture succeeded');
    } catch (domErr) {
      console.warn('[Strategos] DOM capture failed:', domErr.message, '— trying tile fetch');
      progressCallback('Fetching tiles directly...');
      base64Image = await this._captureByFetchingTiles(rect, bounds, zoom, mapEngine);
      console.log('[Strategos] Tile fetch capture succeeded');
    }
    
    progressCallback('Analyzing area with AI...');
    
    const tileParams = {
      imageData: base64Image,
      bounds: bounds,
      zoom: zoom
    };

    const detections = await this.engine.analyzeTile(tileParams);

    progressCallback('Merging detections (NMS)...');
    const merged = this._applyNMS(detections);

    return merged;
  }

  _waitForTiles(mapEngine, maxWait = 3000) {
    return new Promise(resolve => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      if (mapEngine.currentTile) {
        mapEngine.currentTile.once('load', () => {
          setTimeout(finish, 400);
        });
      }
      setTimeout(finish, maxWait);
    });
  }

  async _captureFromDOM(rect, mapEngine) {
    const map = mapEngine.map;
    const canvas = document.createElement('canvas');
    const outputW = Math.round(rect.w);
    const outputH = Math.round(rect.h);
    canvas.width = outputW;
    canvas.height = outputH;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, outputW, outputH);

    const container = map.getContainer();
    const containerRect = container.getBoundingClientRect();

    const tileImages = container.querySelectorAll('img.leaflet-tile');
    let drawnCount = 0;

    for (const tile of tileImages) {
      if (!tile.complete || tile.naturalWidth === 0) continue;

      const tileBCR = tile.getBoundingClientRect();

      const drawX = tileBCR.left - containerRect.left - rect.x;
      const drawY = tileBCR.top - containerRect.top - rect.y;

      if (drawX + tileBCR.width < 0 || drawY + tileBCR.height < 0 ||
          drawX > outputW || drawY > outputH) continue;

      try {
        ctx.drawImage(tile, drawX, drawY, tileBCR.width, tileBCR.height);
        drawnCount++;
      } catch (e) {
        console.warn('[Strategos] Skipped tile (CORS):', e.message);
      }
    }

    if (drawnCount === 0) {
      throw new Error('No tiles could be drawn from DOM. They may not be loaded yet.');
    }

    try {
      const data = canvas.toDataURL('image/jpeg', 0.85);
      return data.split(',')[1];
    } catch (e) {
      throw new Error('Canvas tainted by cross-origin tiles: ' + e.message);
    }
  }

  async _captureByFetchingTiles(rect, bounds, zoom, mapEngine) {
    const tileSize = 256;
    const nwPx = this._latLngToPixel(bounds.nw.lat, bounds.nw.lng, zoom);
    const sePx = this._latLngToPixel(bounds.se.lat, bounds.se.lng, zoom);

    const pxWidth = sePx.x - nwPx.x;
    const pxHeight = sePx.y - nwPx.y;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(Math.abs(pxWidth)) || Math.round(rect.w);
    canvas.height = Math.round(Math.abs(pxHeight)) || Math.round(rect.h);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const tileX1 = Math.floor(nwPx.x / tileSize);
    const tileY1 = Math.floor(nwPx.y / tileSize);
    const tileX2 = Math.floor(sePx.x / tileSize);
    const tileY2 = Math.floor(sePx.y / tileSize);

    const layerCfg = mapEngine.tiles[mapEngine.currentLayerName];
    if (!layerCfg) throw new Error('No tile layer active');

    const promises = [];
    for (let tx = tileX1; tx <= tileX2; tx++) {
      for (let ty = tileY1; ty <= tileY2; ty++) {
        const drawX = tx * tileSize - nwPx.x;
        const drawY = ty * tileSize - nwPx.y;

        const subdomains = ['a', 'b', 'c'];
        const s = subdomains[Math.abs(tx + ty) % subdomains.length];
        let url = layerCfg.url
          .replace('{s}', s)
          .replace('{z}', String(zoom))
          .replace('{x}', String(tx))
          .replace('{y}', String(ty))
          .replace('{r}', '');

        promises.push(
          this._loadImage(url)
            .then(img => { ctx.drawImage(img, drawX, drawY, tileSize, tileSize); })
            .catch(() => {})
        );
      }
    }

    await Promise.all(promises);
    return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
  }

  _latLngToPixel(lat, lng, zoom) {
    const scale = Math.pow(2, zoom) * 256;
    const x = (lng + 180) / 360 * scale;
    const sinLat = Math.sin(lat * Math.PI / 180);
    const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
    return { x, y };
  }

  _loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load: ' + url));
      img.src = url;
    });
  }

  _applyNMS(detections, iouThreshold = 0.5) {
    const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
    const keep = [];

    for (let i = 0; i < sorted.length; i++) {
      let shouldKeep = true;
      for (let j = 0; j < keep.length; j++) {
        if (sorted[i].class === keep[j].class) {
          const iou = this._calculateIoU(sorted[i].box, keep[j].box);
          if (iou > iouThreshold) {
            shouldKeep = false;
            break;
          }
        }
      }
      if (shouldKeep) {
        keep.push(sorted[i]);
      }
    }
    return keep;
  }

  _calculateIoU(boxA, boxB) {
    if (!boxA || !boxB) return 0;
    
    const yA = Math.max(boxA[0], boxB[0]);
    const xA = Math.max(boxA[1], boxB[1]);
    const yB = Math.min(boxA[2], boxB[2]);
    const xB = Math.min(boxA[3], boxB[3]);

    const interArea = Math.max(0, yB - yA) * Math.max(0, xB - xA);
    if (interArea === 0) return 0;

    const boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1]);
    const boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1]);

    const iou = interArea / (boxAArea + boxBArea - interArea);
    return iou;
  }
}
