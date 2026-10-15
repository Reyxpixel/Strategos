import { DetectionEngine } from './analysis/detection-engine.js';
import { TileProcessor } from './analysis/tile-processor.js';
import { OverlayRenderer } from './analysis/overlay-renderer.js';
import { AnalysisSummarizer } from './analysis/analysis-summarizer.js';

export class AreaAnalyzer {
  constructor(mapEngine) {
    this.me = mapEngine;
    this.active = false;
    this.selecting = false;
    this.startPx = null;
    this.box = null;
    this._cbs = {};

    this.engine = new DetectionEngine({ provider: 'roboflow' });
    this.tileProcessor = new TileProcessor(this.engine);
    this.overlayRenderer = new OverlayRenderer(this.me);
    this.summarizer = new AnalysisSummarizer();

    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);
  }

  activate() {
    if (this.active) { this.deactivate(); return; }
    this.active = true;
    this.me.map.dragging.disable();
    this.me.map.doubleClickZoom.disable();
    const el = document.getElementById('map');
    el.classList.add('crosshair');
    el.addEventListener('mousedown', this._onDown);
    el.addEventListener('mousemove', this._onMove);
    el.addEventListener('mouseup', this._onUp);
    
    // Clear old overlays when starting a new selection
    this.overlayRenderer.clear();
    
    this.emit('activate');
  }

  deactivate() {
    this.active = false;
    this.selecting = false;
    this.me.map.dragging.enable();
    this.me.map.doubleClickZoom.enable();
    const el = document.getElementById('map');
    el.classList.remove('crosshair');
    el.removeEventListener('mousedown', this._onDown);
    el.removeEventListener('mousemove', this._onMove);
    el.removeEventListener('mouseup', this._onUp);
    if (this.box) { this.box.remove(); this.box = null; }
    this.emit('deactivate');
  }

  _onDown(e) {
    if (e.button !== 0) return;
    this.selecting = true;
    const rect = e.currentTarget.getBoundingClientRect();
    this.startPx = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    if (this.box) this.box.remove();
    this.box = document.createElement('div');
    this.box.className = 'area-select-box';
    e.currentTarget.appendChild(this.box);
    this._updateBox(this.startPx, this.startPx);
  }

  _onMove(e) {
    if (!this.selecting) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cur = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    this._updateBox(this.startPx, cur);
  }

  _onUp(e) {
    if (!this.selecting) return;
    this.selecting = false;
    const rect = e.currentTarget.getBoundingClientRect();
    const endPx = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    const x1 = Math.min(this.startPx.x, endPx.x);
    const y1 = Math.min(this.startPx.y, endPx.y);
    const w = Math.abs(endPx.x - this.startPx.x);
    const h = Math.abs(endPx.y - this.startPx.y);

    if (w < 40 || h < 40) {
      if (this.box) { this.box.remove(); this.box = null; }
      return;
    }

    const bounds = {
      nw: this.me.map.containerPointToLatLng([x1, y1]),
      se: this.me.map.containerPointToLatLng([x1 + w, y1 + h])
    };
    this.lastBounds = bounds;
    this._captureAndAnalyze(bounds, { x: x1, y: y1, w, h });
  }

  _updateBox(start, cur) {
    if (!this.box) return;
    const x = Math.min(start.x, cur.x);
    const y = Math.min(start.y, cur.y);
    const w = Math.abs(cur.x - start.x);
    const h = Math.abs(cur.y - start.y);
    Object.assign(this.box.style, {
      left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px'
    });
  }

  async _captureAndAnalyze(bounds, rect) {
    this.emit('loading', true);

    try {
      this.overlayRenderer.clear();
      
      const zoom = this.me.map.getZoom();

      const detections = await this.tileProcessor.processArea(
        bounds, 
        zoom,
        rect,
        this.me, // passing mapEngine to TileProcessor for tile access
        (msg) => this.emit('status', msg)
      );

      this.overlayRenderer.render(detections, bounds);

      const summaryData = this.summarizer.summarize(detections, bounds);
      
      this.emit('result', summaryData);
      this.emit('status', 'Analysis complete');

    } catch (err) {
      console.error('[Strategos] Analysis error:', err);
      this.emit('error', err.message || 'Analysis failed');
      this.emit('status', 'Analysis failed');
    }

    this.emit('loading', false);
    if (this.box) { this.box.remove(); this.box = null; }
    this.deactivate();
  }

  on(ev, cb) { (this._cbs[ev] = this._cbs[ev] || []).push(cb); }
  emit(ev, d) { (this._cbs[ev] || []).forEach(cb => cb(d)); }
}
