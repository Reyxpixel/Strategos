import { MapEngine } from './map-engine.js';

export class UIController {
  constructor(mapEngine, toolManager, intelPanel, areaAnalyzer) {
    this.me = mapEngine;
    this.tools = toolManager;
    this.intel = intelPanel;
    this.analyzer = areaAnalyzer;
  }

  init() {
    this._layers();
    this._tools();
    this._mapControls();
    this._mapEvents();
    this._toolEvents();
    this._analyzerEvents();
    this._search();
    this._keys();
    this._clears();
    this._settings();
    this._clock();
    this._updateView();
    this._updateScale();
  }

  // ---- Layers ----
  _layers() {
    const btns = document.querySelectorAll('.layer-opt');
    btns.forEach(b => b.addEventListener('click', () => {
      this.me.setLayer(b.dataset.layer);
      btns.forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    }));
    this.me.on('layerchange', d => {
      document.getElementById('sb-layer').textContent = d.displayName;
    });
  }

  // ---- Tools ----
  _tools() {
    const btns = document.querySelectorAll('.tool-opt:not(.tool-primary)');
    btns.forEach(b => b.addEventListener('click', () => {
      const t = b.dataset.tool;
      if (t === 'grid') { b.classList.toggle('active'); this.tools.activate(t); return; }
      const was = b.classList.contains('active');
      btns.forEach(x => { if (x.dataset.tool !== 'grid') x.classList.remove('active'); });
      if (was) { this.tools.deactivate(); } else { b.classList.add('active'); this.tools.activate(t); }
    }));

    // Area analyze button
    document.getElementById('btn-analyze-area').addEventListener('click', () => {
      const btn = document.getElementById('btn-analyze-area');
      if (this.analyzer.active) {
        this.analyzer.deactivate();
        btn.classList.remove('active');
      } else {
        // Deactivate other tools
        this.tools.deactivate();
        btns.forEach(x => { if (x.dataset.tool !== 'grid') x.classList.remove('active'); });
        this.analyzer.activate();
        btn.classList.add('active');
      }
    });
  }

  // ---- Map Controls ----
  _mapControls() {
    document.getElementById('btn-zoom-in').addEventListener('click', () => this.me.zoomIn());
    document.getElementById('btn-zoom-out').addEventListener('click', () => this.me.zoomOut());
    document.getElementById('btn-recenter').addEventListener('click', () => this.me.flyTo([30, 10], 3));
  }

  // ---- Map Events ----
  _mapEvents() {
    this.me.on('mousemove', e => {
      document.getElementById('cursor-lat').textContent = e.latlng.lat.toFixed(5);
      document.getElementById('cursor-lng').textContent = e.latlng.lng.toFixed(5);
    });

    this.me.on('viewchange', () => {
      document.getElementById('zoom-level').textContent = this.me.getZoom();
      this._updateView();
      this._updateScale();
      this._updateObjects();
    });

    this.me.on('contextmenu', e => this.tools.identify(e.latlng));
    this.me.on('markerchange', () => { this._renderMarkers(); this._updateObjects(); });

    document.getElementById('zoom-level').textContent = this.me.getZoom();
  }

  // ---- Tool Events ----
  _toolEvents() {
    const badge = document.getElementById('tool-badge');
    const bname = document.getElementById('tool-badge-name');
    const names = { measure:'DISTANCE', area:'AREA', marker:'MARKER', identify:'IDENTIFY', radius:'RADIUS' };

    this.tools.on('activate', t => {
      badge.classList.remove('hidden');
      bname.textContent = names[t] || t.toUpperCase();
      this._status(`${names[t] || t} — click on map`);
    });
    this.tools.on('deactivate', () => {
      badge.classList.add('hidden');
      this._status('Ready');
      document.querySelectorAll('.tool-opt:not(.tool-primary)').forEach(b => {
        if (b.dataset.tool !== 'grid') b.classList.remove('active');
      });
    });
    this.tools.on('measurement', () => { this._renderMeasurements(); this._updateObjects(); });
    this.tools.on('measureclear', () => { this._renderMeasurements(); this._updateObjects(); });
    this.tools.on('intel', d => this.intel.addReport(d));
    this.tools.on('status', m => this._status(m));
    this.tools.on('grid', on => { this._status(on ? 'Grid on' : 'Grid off'); this._updateObjects(); });
  }

  // ---- Analyzer Events ----
  _analyzerEvents() {
    const badge = document.getElementById('tool-badge');
    const bname = document.getElementById('tool-badge-name');
    const btn = document.getElementById('btn-analyze-area');

    this.analyzer.on('activate', () => {
      badge.classList.remove('hidden');
      bname.textContent = 'AREA ANALYSIS';
      this._status('Draw a rectangle on the map');
      if (this.me.clearIntelOverlays) this.me.clearIntelOverlays();
    });
    this.analyzer.on('deactivate', () => {
      badge.classList.add('hidden');
      btn.classList.remove('active');
      this._status('Ready');
    });
    this.analyzer.on('loading', on => {
      if (on) this.intel.showLoading();
    });
    this.analyzer.on('result', data => {
      this.intel.showAnalysis(data);
      if (this.me.drawIntelOverlays) this.me.drawIntelOverlays(data, this.analyzer.lastBounds);
    });
    this.analyzer.on('error', msg => {
      this.intel.showError(msg);
      this._status('Analysis failed');
    });
    this.analyzer.on('status', m => this._status(m));
  }

  // ---- Search ----
  _search() {
    const input = document.getElementById('search-input');
    const go = () => {
      const q = input.value.trim();
      if (!q) return;
      // Coordinates?
      const cm = q.match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/);
      if (cm) {
        const lat = parseFloat(cm[1]), lng = parseFloat(cm[2]);
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          this.me.flyTo([lat, lng], 17);
          this.tools.identify({ lat, lng });
          return;
        }
      }
      this._geocode(q);
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });

    // Focus shortcut
    document.addEventListener('keydown', e => {
      if (e.key === '/' && e.target.tagName !== 'INPUT') {
        e.preventDefault();
        input.focus();
      }
    });
  }

  async _geocode(q) {
    this._status(`Searching: ${q}...`);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&addressdetails=1`, {
        headers: { 'Accept-Language':'en', 'User-Agent':'Strategos/2.0' }
      });
      const data = await r.json();
      if (!data.length) { this._status('No results'); return; }
      const d = data[0];
      const lat = parseFloat(d.lat), lng = parseFloat(d.lon);
      // Use bounding box for zoom if available
      if (d.boundingbox) {
        const bb = d.boundingbox.map(Number);
        this.me.map.flyToBounds([[bb[0], bb[2]], [bb[1], bb[3]]], { duration: 1.2, maxZoom: 18 });
      } else {
        this.me.flyTo([lat, lng], 17);
      }
      this.tools.identify({ lat, lng });
      this._status(`Found: ${(d.display_name || '').split(',')[0]}`);
    } catch { this._status('Search failed'); }
  }

  // ---- Keyboard ----
  _keys() {
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        this.tools.deactivate();
        this.analyzer.deactivate();
        document.getElementById('btn-analyze-area').classList.remove('active');
        if (this.me.clearIntelOverlays) this.me.clearIntelOverlays();
      }
      if (e.target.tagName === 'INPUT') return;
      switch (e.key) {
        case '1': this._clickTool('measure'); break;
        case '2': this._clickTool('area'); break;
        case '3': this._clickTool('marker'); break;
        case '4': this._clickTool('identify'); break;
        case '5': this._clickTool('radius'); break;
        case '6': this._clickTool('grid'); break;
      }
    });
  }

  _clickTool(name) {
    const b = document.querySelector(`[data-tool="${name}"]`);
    if (b) b.click();
  }

  // ---- Clears ----
  _clears() {
    document.getElementById('clear-markers').addEventListener('click', () => {
      this.me.clearMarkers();
      this._status('Markers cleared');
    });
    document.getElementById('clear-measurements').addEventListener('click', () => {
      this.tools.clearMeasurements();
      this._status('Measurements cleared');
    });
  }

  // ---- Settings ----
  _settings() {
    const modal = document.getElementById('settings-modal');
    const input = document.getElementById('api-key-input');
    const modelInput = document.getElementById('api-model-input');
    const status = document.getElementById('api-key-status');

    document.getElementById('btn-settings').addEventListener('click', () => {
      modal.classList.remove('hidden');
      const key = localStorage.getItem('strategos_cv_api_key') || '';
      const model = localStorage.getItem('strategos_cv_model') || 'aerial-vehicles-and-buildings/1';
      input.value = key;
      modelInput.value = model;
      status.textContent = key ? '✓ Settings saved' : '';
      status.style.color = key ? 'var(--green)' : '';
    });

    document.getElementById('settings-close').addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

    document.getElementById('save-api-key').addEventListener('click', () => {
      const key = input.value.trim();
      const model = modelInput.value.trim();
      if (!key) { status.textContent = 'Key cannot be empty'; status.style.color = 'var(--red)'; return; }
      localStorage.setItem('strategos_cv_api_key', key);
      localStorage.setItem('strategos_cv_model', model);
      status.textContent = '✓ Settings saved';
      status.style.color = 'var(--green)';
    });
  }

  // ---- Render Markers ----
  _renderMarkers() {
    const el = document.getElementById('markers-list');
    const ms = this.me.markers;
    if (!ms.length) { el.innerHTML = '<div class="empty-hint">No markers placed</div>'; return; }
    el.innerHTML = ms.map(m => `
      <div class="list-item" data-mid="${m.id}">
        <span class="list-item-label">${m.label}</span>
        <span class="list-item-value">${m.latlng.lat.toFixed(4)}, ${m.latlng.lng.toFixed(4)}</span>
        <button class="list-item-delete" data-did="${m.id}">×</button>
      </div>`).join('');

    el.querySelectorAll('.list-item').forEach(item => {
      item.addEventListener('click', e => {
        if (e.target.classList.contains('list-item-delete')) return;
        const mk = ms.find(m => m.id === item.dataset.mid);
        if (mk) { this.me.flyTo(mk.latlng, 17); mk.marker.openPopup(); }
      });
    });
    el.querySelectorAll('.list-item-delete').forEach(b => {
      b.addEventListener('click', e => { e.stopPropagation(); this.me.removeMarker(b.dataset.did); });
    });
  }

  // ---- Render Measurements ----
  _renderMeasurements() {
    const el = document.getElementById('measurements-list');
    const ms = this.tools.measurements;
    if (!ms.length) { el.innerHTML = '<div class="empty-hint">No measurements</div>'; return; }
    el.innerHTML = ms.map(m => {
      if (m.type === 'distance') return `<div class="meas-item"><div class="meas-type">Distance</div><div class="meas-val">${this.tools._fmtDist(m.value)}</div><div class="meas-sub">${m.segments} seg · ${m.bearing?.toFixed(0) || '—'}°</div></div>`;
      if (m.type === 'area') return `<div class="meas-item"><div class="meas-type">Area</div><div class="meas-val">${this.tools.fmtArea(m.value)}</div><div class="meas-sub">${m.vertices}v · P: ${this.tools._fmtDist(m.perimeter)}</div></div>`;
      if (m.type === 'radius') return `<div class="meas-item"><div class="meas-type">Radius</div><div class="meas-val">${this.tools._fmtDist(m.value)}</div><div class="meas-sub">A: ${m.areaKm2.toFixed(3)} km²</div></div>`;
      return '';
    }).join('');
  }

  // ---- View Data ----
  _updateView() {
    const c = this.me.getCenter(), b = this.me.getBounds(), s = this.me.getSize(), z = this.me.getZoom();
    document.getElementById('v-center').textContent = `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`;
    document.getElementById('v-ne').textContent = `${b.getNorthEast().lat.toFixed(3)}, ${b.getNorthEast().lng.toFixed(3)}`;
    document.getElementById('v-sw').textContent = `${b.getSouthWest().lat.toFixed(3)}, ${b.getSouthWest().lng.toFixed(3)}`;
    document.getElementById('v-viewport').textContent = `${s.x}×${s.y}`;
    const mpp = 40075016.686 * Math.cos(c.lat*Math.PI/180) / Math.pow(2, z+8);
    document.getElementById('v-scale').textContent = mpp > 1000 ? `${(mpp/1000).toFixed(1)} km/px` : `${mpp.toFixed(1)} m/px`;
  }

  _updateScale() {
    const c = this.me.getCenter(), z = this.me.getZoom();
    const mpp = 40075016.686 * Math.cos(c.lat*Math.PI/180) / Math.pow(2, z+8);
    const m = mpp * 50;
    document.getElementById('scale-text').textContent = m > 1000 ? `${(m/1000).toFixed(1)} km` : `${m.toFixed(0)} m`;
  }

  _updateObjects() {
    document.getElementById('sb-objects').textContent = this.me.objectCount();
  }

  _status(m) { document.getElementById('sb-status').textContent = m; }

  _clock() {
    const el = document.getElementById('time-display');
    const dateEl = document.getElementById('sb-date');
    const tick = () => {
      const now = new Date();
      el.textContent = now.toLocaleTimeString('en-US', { hour12:false });
      dateEl.textContent = now.toLocaleDateString('en-US', { year:'numeric', month:'short', day:'2-digit' });
    };
    tick(); setInterval(tick, 1000);
  }
}
