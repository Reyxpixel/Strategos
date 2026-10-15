import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export class MapEngine {
  constructor(containerId) {
    this.containerId = containerId;
    this.map = null;
    this.currentTile = null;
    this.currentLayerName = 'streets';
    this.markers = [];
    this.measureLayers = [];
    this.gridLayer = null;
    this._cbs = {};

    this.tiles = {
      streets: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        name: 'OpenStreetMap',
        opts: { maxNativeZoom: 19, maxZoom: 22, crossOrigin: true }
      },
      satellite: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        name: 'ESRI Satellite',
        opts: { maxNativeZoom: 19, maxZoom: 22, crossOrigin: true }
      },
      terrain: {
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        name: 'OpenTopoMap',
        opts: { maxNativeZoom: 17, maxZoom: 22, crossOrigin: true }
      },
      dark: {
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        name: 'CartoDB Dark',
        opts: { maxNativeZoom: 19, maxZoom: 22, crossOrigin: true }
      }
    };

    this._init();
  }

  _init() {
    this.map = L.map(this.containerId, {
      center: [30, 10],
      zoom: 3,
      minZoom: 2,
      maxZoom: 22,
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
      wheelPxPerZoomLevel: 80,
      zoomSnap: 0.5,
      zoomDelta: 0.5,
    });

    this.setLayer('streets');

    this.map.on('mousemove', e => this.emit('mousemove', e));
    this.map.on('click', e => this.emit('click', e));
    
    this.intelLayer = L.layerGroup().addTo(this.map);
    this.map.on('zoomend', () => this.emit('viewchange'));
    this.map.on('moveend', () => this.emit('viewchange'));
    this.map.on('contextmenu', e => { e.originalEvent.preventDefault(); this.emit('contextmenu', e); });
  }

  setLayer(name) {
    const cfg = this.tiles[name];
    if (!cfg) return;
    if (this.currentTile) this.map.removeLayer(this.currentTile);
    this.currentTile = L.tileLayer(cfg.url, cfg.opts).addTo(this.map);
    this.currentLayerName = name;
    this.emit('layerchange', { name, displayName: cfg.name });
  }

  addMarker(latlng, label) {
    const id = 'MKR-' + String(this.markers.length + 1).padStart(3, '0');
    const icon = L.divIcon({
      className: 'custom-marker',
      html: '<div class="marker-pin"></div>',
      iconSize: [20, 20], iconAnchor: [10, 20], popupAnchor: [0, -20]
    });
    const m = L.marker(latlng, { icon, draggable: true }).addTo(this.map);
    m.bindPopup(this._markerPopup(id, latlng), { maxWidth: 240 });
    const data = { id, marker: m, latlng, label: label || id, ts: Date.now() };
    this.markers.push(data);
    m.on('dragend', e => {
      data.latlng = e.target.getLatLng();
      m.setPopupContent(this._markerPopup(id, data.latlng));
      this.emit('markerchange');
    });
    this.emit('markerchange');
    return data;
  }

  _markerPopup(id, ll) {
    return `<div class="popup-title">${id}</div>
      <div class="popup-row"><span class="popup-label">Lat</span><span class="popup-value">${ll.lat.toFixed(6)}</span></div>
      <div class="popup-row"><span class="popup-label">Lng</span><span class="popup-value">${ll.lng.toFixed(6)}</span></div>
      <div class="popup-row"><span class="popup-label">DMS</span><span class="popup-value">${this.toDMS(ll)}</span></div>
      <div class="popup-row"><span class="popup-label">MGRS</span><span class="popup-value">${this.toMGRS(ll)}</span></div>`;
  }

  removeMarker(id) {
    const i = this.markers.findIndex(m => m.id === id);
    if (i >= 0) { this.map.removeLayer(this.markers[i].marker); this.markers.splice(i, 1); this.emit('markerchange'); }
  }

  clearMarkers() {
    this.markers.forEach(m => this.map.removeLayer(m.marker));
    this.markers = [];
    this.emit('markerchange');
  }

  addMeasureLayer(l) { l.addTo(this.map); this.measureLayers.push(l); }
  clearMeasureLayers() { this.measureLayers.forEach(l => this.map.removeLayer(l)); this.measureLayers = []; }

  toggleGrid() {
    if (this.gridLayer) { this.map.removeLayer(this.gridLayer); this.gridLayer = null; return false; }
    this.gridLayer = L.layerGroup().addTo(this.map);
    this._drawGrid();
    this.map.on('moveend zoomend', () => { if (this.gridLayer) this._drawGrid(); });
    return true;
  }

  _drawGrid() {
    if (!this.gridLayer) return;
    this.gridLayer.clearLayers();
    const b = this.map.getBounds(); const z = this.map.getZoom();
    let sp = z <= 3 ? 30 : z <= 5 ? 10 : z <= 7 ? 5 : z <= 9 ? 1 : z <= 12 ? 0.5 : z <= 14 ? 0.1 : 0.05;
    const s = Math.floor(b.getSouth()/sp)*sp, n = Math.ceil(b.getNorth()/sp)*sp;
    const w = Math.floor(b.getWest()/sp)*sp, e = Math.ceil(b.getEast()/sp)*sp;
    for (let lat = s; lat <= n; lat += sp) {
      L.polyline([[lat, w-10],[lat, e+10]], {color:'rgba(255,255,255,0.06)',weight:0.5,interactive:false}).addTo(this.gridLayer);
    }
    for (let lng = w; lng <= e; lng += sp) {
      L.polyline([[s-10, lng],[n+10, lng]], {color:'rgba(255,255,255,0.06)',weight:0.5,interactive:false}).addTo(this.gridLayer);
    }
  }

  toDMS(ll) {
    const f = (v, p, n) => { const a=Math.abs(v); const d=Math.floor(a); const m=Math.floor((a-d)*60); const s=((a-d-m/60)*3600).toFixed(1); return `${d}°${m}'${s}"${v>=0?p:n}`; };
    return `${f(ll.lat,'N','S')} ${f(ll.lng,'E','W')}`;
  }

  toMGRS(ll) {
    if (ll.lat < -80 || ll.lat > 84) return 'POLAR';
    const zn = Math.floor((ll.lng+180)/6)+1;
    const bands = 'CDEFGHJKLMNPQRSTUVWX';
    let bi = Math.floor((ll.lat+80)/8); if (bi>19) bi=19;
    const e = Math.round(((ll.lng+180)%6)/6*100000);
    const n = Math.round((ll.lat-Math.floor(ll.lat/8)*8)/8*100000);
    return `${zn}${bands[bi]} ${String(e).padStart(5,'0').slice(0,5)} ${String(Math.abs(n)).padStart(5,'0').slice(0,5)}`;
  }

  flyTo(ll, z) { this.map.flyTo(ll, z || 16, { duration: 1.2 }); }
  zoomIn() { this.map.zoomIn(); }
  zoomOut() { this.map.zoomOut(); }
  getCenter() { return this.map.getCenter(); }
  getZoom() { return this.map.getZoom(); }
  getBounds() { return this.map.getBounds(); }
  getSize() { return this.map.getSize(); }
  objectCount() { return this.markers.length + this.measureLayers.length + (this.gridLayer ? 1 : 0); }

  on(ev, cb) { (this._cbs[ev] = this._cbs[ev] || []).push(cb); }
  emit(ev, d) { (this._cbs[ev] || []).forEach(cb => cb(d)); }

  static distance(a, b) {
    const R = 6371e3;
    const p1 = a.lat*Math.PI/180, p2 = b.lat*Math.PI/180;
    const dp = (b.lat-a.lat)*Math.PI/180, dl = (b.lng-a.lng)*Math.PI/180;
    const x = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
  }

  static bearing(a, b) {
    const p1=a.lat*Math.PI/180, p2=b.lat*Math.PI/180, dl=(b.lng-a.lng)*Math.PI/180;
    const y = Math.sin(dl)*Math.cos(p2);
    const x = Math.cos(p1)*Math.sin(p2) - Math.sin(p1)*Math.cos(p2)*Math.cos(dl);
    return ((Math.atan2(y,x)*180/Math.PI)+360)%360;
  }

  static polyArea(pts) {
    if (pts.length < 3) return 0;
    const R = 6371e3; let a = 0;
    for (let i=0; i<pts.length; i++) {
      const j = (i+1)%pts.length;
      a += (pts[j].lng-pts[i].lng)*Math.PI/180 * (2+Math.sin(pts[i].lat*Math.PI/180)+Math.sin(pts[j].lat*Math.PI/180));
    }
    return Math.abs(a*R*R/2);
  }

  // ---- Intelligence Overlays ----
  clearIntelOverlays() {
    // Deprecated: Overlays are now managed directly by OverlayRenderer
  }

  drawIntelOverlays(data, bounds) {
    // Deprecated: Overlays are now managed directly by OverlayRenderer
  }
}
