export class IntelPanel {
  constructor() {
    this.feedEl = document.getElementById('intel-feed');
    this.analysisEl = document.getElementById('analysis-results');
    this.reports = [];
  }

  addReport(intel) {
    this.reports.unshift(intel);
    if (this.reports.length > 15) this.reports = this.reports.slice(0, 15);
    this._renderFeed();
  }

  showLoading() {
    this.analysisEl.innerHTML = `
      <div class="analysis-loading">
        <div class="analysis-spinner"></div>
        <div class="analysis-loading-text">Analyzing satellite imagery...<br>This may take 10-20 seconds</div>
      </div>`;
  }

  showAnalysis(data) {
    const sections = [];

    // Summary
    if (data.summary) {
      sections.push(`<div class="ac-summary">${this._esc(data.summary)}${data.terrain_type ? ` <strong style="color:var(--accent)">[${data.terrain_type}]</strong>` : ''}${data.confidence ? ` <span style="color:var(--text-3)">· Confidence: ${data.confidence}</span>` : ''}</div>`);
    }

    // Vegetation
    if (data.vegetation?.length) {
      sections.push(this._section('VEGETATION', data.vegetation.length,
        data.vegetation.map(v =>
          `<div class="ac-item"><strong>${v.type}</strong>${v.approximate_count ? ` — ~${v.approximate_count}` : ''}${v.density ? ` (${v.density})` : ''}<br>${this._esc(v.description)}</div>`
        ).join('')
      ));
    }

    // Buildings
    if (data.buildings?.length) {
      sections.push(this._section('STRUCTURES', data.buildings.length,
        data.buildings.map(b => {
          const roof = b.rooftop_features?.length ? `<br><span style="color:var(--amber);font-weight:600">Rooftop: ${b.rooftop_features.join(', ')}</span>` : '';
          return `<div class="ac-item"><strong>${b.type}</strong>${b.estimated_floors ? ` · ${b.estimated_floors}F` : ''}${b.condition ? ` · ${b.condition}` : ''}<br>${this._esc(b.description)}${roof}</div>`;
        }).join('')
      ));
    }

    // Vehicles
    if (data.vehicles?.length) {
      sections.push(this._section('VEHICLES', data.vehicles.length,
        data.vehicles.map(v =>
          `<div class="ac-item"><strong>${v.color || ''} ${v.type}</strong>${v.possible_make_model && v.possible_make_model !== 'unidentifiable' ? ` — ${v.possible_make_model}` : ''} · ${v.parked_or_moving || 'unknown'}<br>${this._esc(v.location_description || '')}</div>`
        ).join('')
      ));
    }

    // Roads
    if (data.roads_and_paths?.length) {
      sections.push(this._section('ROADS / PATHS', data.roads_and_paths.length,
        data.roads_and_paths.map(r =>
          `<div class="ac-item"><strong>${r.type}</strong>${r.estimated_lanes ? ` · ${r.estimated_lanes} lane${r.estimated_lanes>1?'s':''}` : ''}${r.surface ? ` · ${r.surface}` : ''}<br>${this._esc(r.description)}</div>`
        ).join('')
      ));
    }

    // Water
    if (data.water_features?.length) {
      sections.push(this._section('WATER', data.water_features.length,
        data.water_features.map(w =>
          `<div class="ac-item"><strong>${w.type}</strong><br>${this._esc(w.description)}</div>`
        ).join('')
      ));
    }

    // Infrastructure
    if (data.infrastructure?.length) {
      sections.push(this._section('INFRASTRUCTURE', data.infrastructure.length,
        data.infrastructure.map(i =>
          `<div class="ac-item"><strong>${i.type}</strong><br>${this._esc(i.description)}</div>`
        ).join('')
      ));
    }

    // Notable
    if (data.notable_observations?.length) {
      sections.push(this._section('NOTABLE', data.notable_observations.length,
        data.notable_observations.map(n =>
          `<div class="ac-item">${this._esc(n.description)}</div>`
        ).join('')
      ));
    }

    this.analysisEl.innerHTML = sections.join('') || '<div class="empty-hint">No features detected</div>';

    // Bind toggle
    this.analysisEl.querySelectorAll('.analysis-card-header').forEach(h => {
      h.addEventListener('click', () => {
        const body = h.nextElementSibling;
        const chev = h.querySelector('.ac-chevron');
        body.classList.toggle('open');
        chev.classList.toggle('open');
      });
    });
  }

  showError(msg) {
    this.analysisEl.innerHTML = `<div class="analysis-error">${this._esc(msg)}</div>`;
  }

  _section(title, count, body) {
    return `
      <div class="analysis-card">
        <div class="analysis-card-header">
          <span class="ac-title">${title} <span class="ac-count">${count}</span></span>
          <span class="ac-chevron">▾</span>
        </div>
        <div class="analysis-card-body">${body}</div>
      </div>`;
  }

  _renderFeed() {
    if (!this.reports.length) {
      this.feedEl.innerHTML = '<div class="empty-hint">Click map or use Identify tool</div>';
      return;
    }
    this.feedEl.innerHTML = this.reports.map(r => this._renderIntel(r)).join('');
  }

  _renderIntel(r) {
    const t = new Date(r.ts).toLocaleTimeString('en-US', { hour12:false });
    const a = r.address || {};
    const short = (r.name || '').split(',')[0];

    const cells = [
      { k:'Lat', v:r.latlng.lat.toFixed(6) },
      { k:'Lng', v:r.latlng.lng.toFixed(6) },
    ];

    const rows = [];
    if (a.road) rows.push(['Street', a.road]);
    if (a.suburb || a.neighbourhood) rows.push(['Area', a.suburb || a.neighbourhood]);
    if (a.city || a.town || a.village) rows.push(['City', a.city || a.town || a.village]);
    if (a.state) rows.push(['Region', a.state]);
    if (a.country) rows.push(['Country', a.country]);

    return `
      <div class="intel-card">
        <div class="intel-card-header">
          <span class="intel-title">${this._esc(short)}</span>
          <span class="intel-time">${t}</span>
        </div>
        <div class="intel-grid">
          ${cells.map(c => `<div class="ig-cell"><span class="ig-k">${c.k}</span><span class="ig-v">${c.v}</span></div>`).join('')}
        </div>
        ${rows.length ? `<div class="intel-rows">${rows.map(([k,v]) => `<div class="intel-row"><span class="ir-k">${k}</span><span class="ir-v">${this._esc(v)}</span></div>`).join('')}</div>` : ''}
      </div>`;
  }

  _esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}
