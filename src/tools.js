import L from 'leaflet';
import { MapEngine } from './map-engine.js';

export class ToolManager {
  constructor(mapEngine) {
    this.me = mapEngine;
    this.active = null;
    this.state = {};
    this.measurements = [];
    this._cbs = {};
    this.me.on('click', e => this._onClick(e));
  }

  activate(tool) {
    if (this.active) this.deactivate();
    if (tool === 'grid') { const on = this.me.toggleGrid(); this.emit('grid', on); return; }
    this.active = tool;
    this.state = {};
    document.getElementById('map').classList.add('crosshair');
    this.emit('activate', tool);
  }

  deactivate() {
    if (!this.active) return;
    document.getElementById('map').classList.remove('crosshair');
    if (this.state._tmp) this.state._tmp.forEach(l => this.me.map.removeLayer(l));
    const prev = this.active;
    this.active = null; this.state = {};
    this.emit('deactivate', prev);
  }

  _onClick(e) {
    if (!this.active) return;
    const fn = { measure: '_doMeasure', area: '_doArea', marker: '_doMarker', identify: '_doIdentify', radius: '_doRadius' };
    if (fn[this.active]) this[fn[this.active]](e);
  }

  // ---- MEASURE ----
  _doMeasure(e) {
    const s = this.state;
    if (!s.pts) { s.pts = []; s._tmp = []; }
    s.pts.push(e.latlng);

    const dot = L.circleMarker(e.latlng, { radius:4, color:'#38bdf8', fillColor:'#38bdf8', fillOpacity:1, weight:1.5 }).addTo(this.me.map);
    s._tmp.push(dot);
    this.me.addMeasureLayer(dot);

    if (s.pts.length >= 2) {
      const from = s.pts[s.pts.length-2], to = s.pts[s.pts.length-1];
      const d = MapEngine.distance(from, to);
      const b = MapEngine.bearing(from, to);

      const line = L.polyline([from, to], { color:'#38bdf8', weight:1.5, dashArray:'6,4', opacity:0.7 }).addTo(this.me.map);
      s._tmp.push(line);
      this.me.addMeasureLayer(line);

      const mid = L.latLng((from.lat+to.lat)/2, (from.lng+to.lng)/2);
      const lbl = L.marker(mid, { icon: L.divIcon({
        className:'', html:`<span style="font-family:var(--mono);font-size:9px;color:#38bdf8;background:rgba(9,9,11,0.85);padding:2px 5px;border-radius:2px;white-space:nowrap;">${this._fmtDist(d)} · ${b.toFixed(0)}°</span>`,
        iconSize:[100,14], iconAnchor:[50,7]
      }), interactive:false }).addTo(this.me.map);
      s._tmp.push(lbl);
      this.me.addMeasureLayer(lbl);

      let total = 0;
      for (let i=1; i<s.pts.length; i++) total += MapEngine.distance(s.pts[i-1], s.pts[i]);

      const m = { id:'D-'+this.measurements.length, type:'distance', value:total, segments:s.pts.length-1, bearing:b, ts:Date.now() };
      // Update or push
      if (s._mid) { const idx = this.measurements.findIndex(x => x.id === s._mid); if (idx>=0) this.measurements[idx] = m; }
      else { this.measurements.push(m); s._mid = m.id; }
      this.emit('measurement', m);
    }
  }

  // ---- AREA ----
  _doArea(e) {
    const s = this.state;
    if (!s.pts) { s.pts = []; s._tmp = []; }
    s.pts.push(e.latlng);

    const dot = L.circleMarker(e.latlng, { radius:4, color:'#A78BFA', fillColor:'#A78BFA', fillOpacity:1, weight:1.5 }).addTo(this.me.map);
    s._tmp.push(dot);

    if (s._poly) this.me.map.removeLayer(s._poly);
    if (s.pts.length >= 2) {
      s._poly = L.polygon(s.pts, { color:'#A78BFA', fillColor:'rgba(139,92,246,0.08)', weight:1.2 }).addTo(this.me.map);
      s._tmp.push(s._poly);
    }

    if (s.pts.length >= 3) {
      const area = MapEngine.polyArea(s.pts);
      let perim = 0;
      for (let i=0; i<s.pts.length; i++) perim += MapEngine.distance(s.pts[i], s.pts[(i+1)%s.pts.length]);

      const m = { id:'A-'+this.measurements.length, type:'area', value:area, perimeter:perim, vertices:s.pts.length, ts:Date.now() };
      if (s._mid) { const idx = this.measurements.findIndex(x => x.id === s._mid); if (idx>=0) this.measurements[idx] = m; }
      else { this.measurements.push(m); s._mid = m.id; }
      this.emit('measurement', m);
    }
  }

  // ---- MARKER ----
  _doMarker(e) {
    this.me.addMarker(e.latlng);
    this.identify(e.latlng);
  }

  // ---- IDENTIFY ----
  _doIdentify(e) {
    this.identify(e.latlng);
    const p = L.circleMarker(e.latlng, { radius:12, color:'#8B5CF6', fillOpacity:0.1, weight:1 }).addTo(this.me.map);
    setTimeout(() => this.me.map.removeLayer(p), 1500);
  }

  // ---- RADIUS ----
  _doRadius(e) {
    const s = this.state;
    if (!s.center) {
      s.center = e.latlng; s._tmp = [];
      const dot = L.circleMarker(e.latlng, { radius:5, color:'#38bdf8', fillColor:'#38bdf8', fillOpacity:1, weight:1.5 }).addTo(this.me.map);
      s._tmp.push(dot);
      this.emit('status', 'Click to set radius');
      return;
    }

    const r = MapEngine.distance(s.center, e.latlng);
    const circle = L.circle(s.center, { radius:r, color:'#38bdf8', fillColor:'rgba(56,189,248,0.06)', weight:1.2, dashArray:'6,4' }).addTo(this.me.map);
    const line = L.polyline([s.center, e.latlng], { color:'#38bdf8', weight:1, dashArray:'4,4', opacity:0.5 }).addTo(this.me.map);
    const mid = L.latLng((s.center.lat+e.latlng.lat)/2, (s.center.lng+e.latlng.lng)/2);
    const lbl = L.marker(mid, { icon: L.divIcon({
      className:'', html:`<span style="font-family:var(--mono);font-size:9px;color:#38bdf8;background:rgba(9,9,11,0.85);padding:2px 5px;border-radius:2px;">R: ${this._fmtDist(r)}</span>`,
      iconSize:[80,14], iconAnchor:[40,7]
    }), interactive:false }).addTo(this.me.map);

    [circle,line,lbl,...s._tmp].forEach(l => this.me.addMeasureLayer(l));
    const m = { id:'R-'+this.measurements.length, type:'radius', value:r, areaKm2:Math.PI*r*r/1e6, ts:Date.now() };
    this.measurements.push(m);
    this.emit('measurement', m);
    this.deactivate();
  }

  // ---- IDENTIFY (geocode) ----
  async identify(ll) {
    this.emit('status', 'Identifying...');
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${ll.lat}&lon=${ll.lng}&zoom=18&addressdetails=1`, {
        headers: { 'Accept-Language':'en', 'User-Agent':'Strategos/2.0' }
      });
      if (!r.ok) throw new Error();
      const d = await r.json();
      this.emit('intel', {
        type:'identify', latlng:ll,
        name: d.display_name || 'Unknown',
        address: d.address || {},
        category: d.category,
        osmType: d.osm_type,
        bbox: d.boundingbox,
        ts: Date.now()
      });
      this.emit('status', `Identified: ${(d.display_name||'').split(',')[0]}`);
    } catch {
      this.emit('intel', { type:'identify', latlng:ll, name:'Offline', address:{}, category:'coordinate', ts:Date.now() });
      this.emit('status', 'Identified (limited)');
    }
  }

  clearMeasurements() {
    this.measurements = [];
    this.me.clearMeasureLayers();
    this.emit('measureclear');
  }

  _fmtDist(m) { return m < 1000 ? `${m.toFixed(0)}m` : m < 100000 ? `${(m/1000).toFixed(2)}km` : `${(m/1000).toFixed(0)}km`; }
  fmtArea(a) { return a < 1e6 ? `${a.toFixed(0)} m²` : `${(a/1e6).toFixed(3)} km²`; }

  on(ev, cb) { (this._cbs[ev] = this._cbs[ev] || []).push(cb); }
  emit(ev, d) { (this._cbs[ev] || []).forEach(cb => cb(d)); }
}
