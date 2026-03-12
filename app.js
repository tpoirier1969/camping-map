const VERSION = 'v17.0';
const DEFAULT_CENTER = [46.6, -87.4];
const DEFAULT_ZOOM = 6;
const DETAIL_ZOOM = 7;
const STATE_PADDING_FACTOR = 0.18;
const TRAIL_URLS = [
  'data/trails.geojson',
  'trails.geojson'
];

const BUILTIN_BUCKETS = {
  modern: { label: 'Modern', color: '#2a7fff', radius: 5 },
  rustic: { label: 'Rustic', color: '#a46a24', radius: 5 },
  boondocking: { label: 'Boondocking / dispersed', color: '#3f8c53', radius: 5 },
  private: { label: 'Private campgrounds', color: '#cf4f7d', radius: 5 },
  national_forest: { label: 'National forest campgrounds', color: '#1f8a70', radius: 5 },
  state_federal_modern: { label: 'State / federal modern campgrounds', color: '#2a7fff', radius: 5 },
  state_federal_rustic: { label: 'State / federal rustic campgrounds', color: '#a46a24', radius: 5 },
  trailhead: { label: 'Trailheads', color: '#8e5bd6', radius: 5 },
  other: { label: 'Other campsites', color: '#949494', radius: 5 },
  state_summary: { label: 'State summary', color: '#7f4dff', radius: 12 },
  trail: { label: 'Trail', color: '#ff7a00', radius: 0 }
};

const map = L.map('map', {
  zoomControl: true,
  preferCanvas: true
}).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const siteLayer = L.layerGroup().addTo(map);
const stateLayer = L.layerGroup().addTo(map);
const trailLayer = L.layerGroup();

const els = {
  menuToggle: document.getElementById('menuToggle'),
  menuPanel: document.getElementById('menuPanel'),
  closeMenu: document.getElementById('closeMenu'),
  statusText: document.getElementById('statusText'),
  countsGrid: document.getElementById('countsGrid'),
  toggleStateSummaries: document.getElementById('toggleStateSummaries'),
  toggleSitePoints: document.getElementById('toggleSitePoints'),
  toggleTrails: document.getElementById('toggleTrails'),
  trailSection: document.getElementById('trailSection'),
  trailStatusText: document.getElementById('trailStatusText'),
  layerToggleList: document.getElementById('layerToggleList'),
  legendList: document.getElementById('legendList'),
  versionTag: document.getElementById('versionTag')
};

els.versionTag.textContent = VERSION;

els.menuToggle.addEventListener('click', () => {
  els.menuPanel.classList.toggle('is-collapsed');
});

els.closeMenu.addEventListener('click', () => {
  els.menuPanel.classList.add('is-collapsed');
});

const model = {
  sites: [],
  trails: null,
  stateGroups: new Map(),
  stateBBoxes: new Map(),
  layerDefs: new Map(),
  layerState: new Map()
};

function normalizeCategory(rawCategory = '') {
  const value = String(rawCategory).trim().toLowerCase();
  if (!value) return 'other';
  if (value.includes('boondock') || value.includes('dispersed')) return 'boondocking';
  if (value.includes('rustic')) return 'rustic';
  if (value.includes('modern')) return 'modern';
  if (value.includes('trailhead')) return 'trailhead';
  if (value.includes('private')) return 'private';
  return value;
}

function getLatLng(raw) {
  if (Array.isArray(raw?.coordinates) && raw.coordinates.length >= 2) {
    const [lng, lat] = raw.coordinates;
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [Number(lat), Number(lng)];
  }

  if (Array.isArray(raw?.geometry?.coordinates) && raw.geometry.coordinates.length >= 2) {
    const [lng, lat] = raw.geometry.coordinates;
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [Number(lat), Number(lng)];
  }

  const lat = Number(raw.lat ?? raw.latitude ?? raw.y);
  const lng = Number(raw.lng ?? raw.lon ?? raw.longitude ?? raw.x);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
  return null;
}

function cleanLabel(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(value) {
  return cleanLabel(value).replace(/\b\w/g, (match) => match.toUpperCase());
}

function makeSlug(value) {
  return cleanLabel(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function hashColor(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 60% 52%)`;
}

function deriveLayerInfo(raw, category) {
  const layerish = raw.layerLabel || raw.layer_name || raw.layerName || raw.layer || raw.mapLayer || raw.group || raw.collection || '';
  const ownerText = cleanLabel(raw.owner || raw.ownership || raw.manager || raw.agency || raw.system || raw.landManager || '').toLowerCase();
  const typeText = cleanLabel(raw.type || raw.kind || raw.category || raw.classification || '').toLowerCase();
  const combined = `${layerish} ${ownerText} ${typeText}`.trim();

  if (layerish) {
    return {
      key: makeSlug(layerish) || `layer-${category}`,
      label: titleCase(layerish),
      bucket: categoryFromText(combined, category)
    };
  }

  if (ownerText.includes('private')) {
    return { key: 'private-campgrounds', label: 'Private Campgrounds', bucket: 'private' };
  }

  if ((ownerText.includes('state') || ownerText.includes('federal') || ownerText.includes('national')) && category === 'modern') {
    return { key: 'state-federal-modern-campgrounds', label: 'State / Federal Campgrounds - Modern', bucket: 'state_federal_modern' };
  }

  if ((ownerText.includes('state') || ownerText.includes('federal') || ownerText.includes('national')) && category === 'rustic') {
    return { key: 'state-federal-rustic-campgrounds', label: 'State / Federal Campgrounds - Rustic', bucket: 'state_federal_rustic' };
  }

  if (combined.includes('national forest')) {
    return { key: 'national-forest-campgrounds', label: 'National Forest Campgrounds', bucket: 'national_forest' };
  }

  if (category === 'boondocking') {
    return { key: 'boondocking', label: 'Boondocking', bucket: 'boondocking' };
  }
  if (category === 'modern') {
    return { key: 'modern-campgrounds', label: 'Modern Campgrounds', bucket: 'modern' };
  }
  if (category === 'rustic') {
    return { key: 'rustic-campgrounds', label: 'Rustic Campgrounds', bucket: 'rustic' };
  }
  if (category === 'private') {
    return { key: 'private-campgrounds', label: 'Private Campgrounds', bucket: 'private' };
  }
  if (category === 'trailhead') {
    return { key: 'trailheads', label: 'Trailheads', bucket: 'trailhead' };
  }

  return {
    key: category ? `${makeSlug(category)}-sites` : 'other-sites',
    label: category ? `${titleCase(category)} Sites` : 'Other Campsites',
    bucket: categoryFromText(combined, category)
  };
}

function categoryFromText(text, fallback = 'other') {
  const value = String(text || '').toLowerCase();
  if (value.includes('boondock') || value.includes('dispersed')) return 'boondocking';
  if (value.includes('national forest')) return 'national_forest';
  if (value.includes('state') && value.includes('modern')) return 'state_federal_modern';
  if (value.includes('federal') && value.includes('modern')) return 'state_federal_modern';
  if (value.includes('state') && value.includes('rustic')) return 'state_federal_rustic';
  if (value.includes('federal') && value.includes('rustic')) return 'state_federal_rustic';
  if (value.includes('private')) return 'private';
  if (value.includes('modern')) return 'modern';
  if (value.includes('rustic')) return 'rustic';
  if (value.includes('trailhead')) return 'trailhead';
  return BUILTIN_BUCKETS[fallback] ? fallback : 'other';
}

function normalizeSite(raw, idx) {
  const latlng = getLatLng(raw);
  if (!latlng) return null;

  const state = raw.state || raw.stateAbbr || raw.state_abbr || raw.region || raw.province || raw.admin1 || 'Unknown';
  const category = normalizeCategory(raw.category || raw.type || raw.kind || raw.layer || raw.classification);
  const layerInfo = deriveLayerInfo(raw, category);
  const website = raw.website || raw.url || raw.link || raw.official_url || '';
  const navigateUrl = `https://www.google.com/maps?q=${latlng[0]},${latlng[1]}`;

  return {
    id: raw.id || `site-${idx}`,
    name: raw.name || raw.title || raw.site || raw.label || `Untitled site ${idx + 1}`,
    state: String(state).trim() || 'Unknown',
    category,
    layerKey: layerInfo.key,
    layerLabel: layerInfo.label,
    bucket: layerInfo.bucket,
    description: raw.description || raw.notes || raw.summary || '',
    website,
    navigateUrl,
    access: raw.access || raw.road_access || '',
    cost: raw.cost || raw.price || '',
    showers: raw.showers || '',
    raw,
    latlng
  };
}

async function loadFirstAvailable(urls) {
  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) continue;
      return await response.json();
    } catch (err) {
      // Keep trying.
    }
  }
  return null;
}

function normalizeSiteArray(sitesRaw) {
  return Array.isArray(sitesRaw)
    ? sitesRaw
    : Array.isArray(sitesRaw?.sites)
      ? sitesRaw.sites
      : Array.isArray(sitesRaw?.features)
        ? sitesRaw.features.map((feature) => ({
            ...(feature.properties || {}),
            geometry: feature.geometry,
            coordinates: feature.geometry?.coordinates
          }))
        : [];
}

async function loadData() {
  const sitesRaw = await loadFirstAvailable([
    'data/sites.json',
    'data/site-data.json',
    'data/campgrounds.json',
    'sites.json'
  ]);

  const trailRaw = await loadFirstAvailable(TRAIL_URLS);

  model.sites = normalizeSiteArray(sitesRaw).map(normalizeSite).filter(Boolean);
  model.trails = trailRaw?.features?.length ? trailRaw : null;

  buildLayerDefinitions();
  buildStateGroups();
  renderLayerControls();
  renderLegend();
  syncTrailUi();
  drawEverything();

  const siteMsg = model.sites.length
    ? `Loaded ${model.sites.length} campsites across ${model.layerDefs.size} visible layer${model.layerDefs.size === 1 ? '' : 's'}.`
    : 'No campsite file was found. Keep your existing sites.json in place.';

  if (model.trails?.features?.length) {
    els.statusText.textContent = `${siteMsg} Labeled trail overlays are available.`;
  } else {
    els.statusText.textContent = `${siteMsg} Trail overlay removed from this package until accurate geometry is available.`;
  }
}

function buildLayerDefinitions() {
  model.layerDefs.clear();
  model.layerState.clear();

  for (const site of model.sites) {
    if (!model.layerDefs.has(site.layerKey)) {
      const bucketStyle = BUILTIN_BUCKETS[site.bucket] || BUILTIN_BUCKETS.other;
      const color = bucketStyle.color || hashColor(site.layerKey);
      model.layerDefs.set(site.layerKey, {
        key: site.layerKey,
        label: site.layerLabel,
        bucket: site.bucket,
        color,
        radius: bucketStyle.radius || 5,
        checked: true
      });
      model.layerState.set(site.layerKey, true);
    }
  }

  const sorted = [...model.layerDefs.values()].sort((a, b) => a.label.localeCompare(b.label));
  model.layerDefs = new Map(sorted.map((def) => [def.key, def]));
}

function buildStateGroups() {
  model.stateGroups.clear();
  model.stateBBoxes.clear();

  for (const site of model.sites) {
    if (!model.stateGroups.has(site.state)) {
      model.stateGroups.set(site.state, []);
    }
    model.stateGroups.get(site.state).push(site);
  }

  for (const [state, sites] of model.stateGroups.entries()) {
    const latitudes = sites.map((s) => s.latlng[0]);
    const longitudes = sites.map((s) => s.latlng[1]);
    const bounds = L.latLngBounds(
      [Math.min(...latitudes), Math.min(...longitudes)],
      [Math.max(...latitudes), Math.max(...longitudes)]
    );
    model.stateBBoxes.set(state, bounds);
  }
}

function renderLayerControls() {
  if (!model.layerDefs.size) {
    els.layerToggleList.innerHTML = '<p>No campsite layers were detected yet.</p>';
    return;
  }

  els.layerToggleList.innerHTML = '';
  for (const def of model.layerDefs.values()) {
    const row = document.createElement('label');
    row.className = 'switch-row';
    row.innerHTML = `
      <input type="checkbox" data-layer-key="${escapeAttribute(def.key)}" ${model.layerState.get(def.key) ? 'checked' : ''}>
      <span class="legend-dot" style="background:${escapeAttribute(def.color)}"></span>
      <span>${escapeHtml(def.label)}</span>
    `;
    els.layerToggleList.appendChild(row);
  }

  els.layerToggleList.querySelectorAll('input[data-layer-key]').forEach((input) => {
    input.addEventListener('change', () => {
      model.layerState.set(input.dataset.layerKey, input.checked);
      drawEverything();
    });
  });
}

function renderLegend() {
  const items = [];
  items.push({ type: 'dot', label: 'State summary', color: BUILTIN_BUCKETS.state_summary.color });
  for (const def of model.layerDefs.values()) {
    items.push({ type: 'dot', label: def.label, color: def.color });
  }
  if (model.trails?.features?.length) {
    items.push({ type: 'line', label: 'Trail overlay', color: BUILTIN_BUCKETS.trail.color });
  }

  els.legendList.innerHTML = items.map((item) => `
    <div class="legend-item">
      ${item.type === 'line'
        ? `<span class="legend-line" style="border-top-color:${escapeAttribute(item.color)}"></span>`
        : `<span class="legend-dot" style="background:${escapeAttribute(item.color)}"></span>`}
      <span>${escapeHtml(item.label)}</span>
    </div>
  `).join('');
}

function syncTrailUi() {
  const hasTrails = Boolean(model.trails?.features?.length);
  els.trailSection.hidden = !hasTrails;
  if (!hasTrails) {
    if (trailLayer && map.hasLayer(trailLayer)) map.removeLayer(trailLayer);
    return;
  }
  trailLayer.addTo(map);
  els.trailStatusText.textContent = 'Accurate labeled trail data loaded.';
}

function getPaddedBounds(bounds, factor = STATE_PADDING_FACTOR) {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const latPad = (ne.lat - sw.lat || 0.25) * factor;
  const lngPad = (ne.lng - sw.lng || 0.25) * factor;
  return L.latLngBounds(
    [sw.lat - latPad, sw.lng - lngPad],
    [ne.lat + latPad, ne.lng + lngPad]
  );
}

function focusedOnSingleState() {
  const viewBounds = map.getBounds();
  for (const [state, bounds] of model.stateBBoxes.entries()) {
    const padded = getPaddedBounds(bounds);
    if (padded.contains(viewBounds.getNorthWest()) && padded.contains(viewBounds.getSouthEast())) {
      return state;
    }
  }
  return null;
}

function shouldShowSiteDetails() {
  const singleState = focusedOnSingleState();
  return map.getZoom() >= DETAIL_ZOOM || Boolean(singleState);
}

function isLayerEnabled(layerKey) {
  return model.layerState.get(layerKey) !== false;
}

function getEnabledSites() {
  return model.sites.filter((site) => isLayerEnabled(site.layerKey));
}

function popupHtmlForSite(site) {
  const parts = [];
  if (site.access) parts.push(`<div><strong>Access:</strong> ${escapeHtml(site.access)}</div>`);
  if (site.cost) parts.push(`<div><strong>Cost:</strong> ${escapeHtml(site.cost)}</div>`);
  if (site.showers) parts.push(`<div><strong>Showers:</strong> ${escapeHtml(site.showers)}</div>`);
  if (site.description) parts.push(`<div>${escapeHtml(site.description)}</div>`);

  return `
    <div class="popup-content">
      <div class="popup-title">${escapeHtml(site.name)}</div>
      <div class="popup-meta">${escapeHtml(site.state)} · ${escapeHtml(site.layerLabel)}</div>
      ${parts.join('')}
      <div class="popup-actions">
        <a href="${site.navigateUrl}" target="_blank" rel="noopener noreferrer">Navigate</a>
        ${site.website ? `<a href="${escapeAttribute(site.website)}" target="_blank" rel="noopener noreferrer">Website</a>` : ''}
      </div>
    </div>
  `;
}

function popupHtmlForState(state, sites) {
  const counts = countByLayer(sites);
  const topCounts = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([layerKey, count]) => {
      const def = model.layerDefs.get(layerKey);
      return `<div>${escapeHtml(def?.label || layerKey)}: ${count}</div>`;
    })
    .join('');

  return `
    <div class="popup-content">
      <div class="popup-title">${escapeHtml(state)}</div>
      <div class="popup-meta">${sites.length} enabled campsite point${sites.length === 1 ? '' : 's'} in this state</div>
      ${topCounts || '<div>No enabled layers in this state.</div>'}
      <div class="popup-actions">
        <button type="button" data-zoom-state="${escapeAttribute(state)}">Zoom to state</button>
      </div>
    </div>
  `;
}

function countByLayer(items) {
  return items.reduce((acc, item) => {
    acc[item.layerKey] = (acc[item.layerKey] || 0) + 1;
    return acc;
  }, {});
}

function drawSites() {
  siteLayer.clearLayers();
  if (!els.toggleSitePoints.checked || !shouldShowSiteDetails()) return { visibleSites: 0, visibleByLayer: {} };

  const visibleBounds = map.getBounds().pad(0.2);
  const enabledSites = getEnabledSites();
  let visibleSites = 0;
  const visibleByLayer = {};

  for (const site of enabledSites) {
    const ll = L.latLng(site.latlng[0], site.latlng[1]);
    if (!visibleBounds.contains(ll)) continue;
    const style = model.layerDefs.get(site.layerKey) || { color: BUILTIN_BUCKETS.other.color, radius: 5 };
    L.circleMarker(ll, {
      radius: style.radius || 5,
      color: style.color,
      fillColor: style.color,
      fillOpacity: 0.9,
      weight: 1
    }).bindPopup(popupHtmlForSite(site)).addTo(siteLayer);

    visibleSites += 1;
    visibleByLayer[site.layerKey] = (visibleByLayer[site.layerKey] || 0) + 1;
  }

  return { visibleSites, visibleByLayer };
}

function drawStateSummaries() {
  stateLayer.clearLayers();
  if (!els.toggleStateSummaries.checked || shouldShowSiteDetails()) return { visibleStates: 0, representedSites: 0 };

  const enabledSites = getEnabledSites();
  const enabledStateGroups = new Map();
  for (const site of enabledSites) {
    if (!enabledStateGroups.has(site.state)) enabledStateGroups.set(site.state, []);
    enabledStateGroups.get(site.state).push(site);
  }

  let visibleStates = 0;
  let representedSites = 0;

  for (const [state, sites] of enabledStateGroups.entries()) {
    if (!sites.length) continue;
    const lat = sites.reduce((sum, s) => sum + s.latlng[0], 0) / sites.length;
    const lng = sites.reduce((sum, s) => sum + s.latlng[1], 0) / sites.length;

    const marker = L.circleMarker([lat, lng], {
      radius: BUILTIN_BUCKETS.state_summary.radius,
      color: BUILTIN_BUCKETS.state_summary.color,
      fillColor: BUILTIN_BUCKETS.state_summary.color,
      fillOpacity: 0.85,
      weight: 1
    }).bindPopup(popupHtmlForState(state, sites));

    marker.addTo(stateLayer);

    L.marker([lat, lng], {
      interactive: false,
      icon: L.divIcon({
        className: 'state-summary-label',
        html: `${escapeHtml(state)} · ${sites.length}`
      })
    }).addTo(stateLayer);

    visibleStates += 1;
    representedSites += sites.length;
  }

  return { visibleStates, representedSites };
}

function drawTrails() {
  trailLayer.clearLayers();
  if (!model.trails?.features?.length || els.trailSection.hidden || !els.toggleTrails.checked) return;

  const geoJson = L.geoJSON(model.trails, {
    style: () => ({
      color: BUILTIN_BUCKETS.trail.color,
      weight: 3,
      opacity: 0.9
    }),
    onEachFeature: (feature, layer) => {
      const p = feature.properties || {};
      const name = p.name || p.title || 'Trail';
      const note = p.note || p.description || 'Trail overlay';
      const url = p.url ? `<div><a href="${escapeAttribute(p.url)}" target="_blank" rel="noopener noreferrer">More info</a></div>` : '';
      layer.bindPopup(`
        <div class="popup-content">
          <div class="popup-title">${escapeHtml(name)}</div>
          <div class="popup-meta">${escapeHtml(note)}</div>
          ${url}
        </div>
      `);
      layer.bindTooltip(name, {
        permanent: true,
        direction: 'center',
        className: 'trail-label'
      });
    }
  });
  geoJson.addTo(trailLayer);
}

function updateCounts(siteDrawInfo, stateDrawInfo) {
  const mode = shouldShowSiteDetails() ? 'individual sites' : 'state summaries';
  const focusedState = focusedOnSingleState();
  const layerCountCards = [...model.layerDefs.values()].slice(0, 8).map((def) => {
    const visibleCount = siteDrawInfo?.visibleByLayer?.[def.key] || 0;
    return `
      <div class="count-card">
        <strong>${visibleCount}</strong>
        <span>${escapeHtml(def.label)}</span>
      </div>
    `;
  }).join('');

  els.countsGrid.innerHTML = `
    <div class="count-card"><strong>${mode}</strong><span>${focusedState ? `Focused on ${escapeHtml(focusedState)}` : 'Zoom changes when points break out'}</span></div>
    <div class="count-card"><strong>${siteDrawInfo?.visibleSites ?? 0}</strong><span>${shouldShowSiteDetails() ? 'Visible site points' : 'Visible site points hidden while summarized'}</span></div>
    <div class="count-card"><strong>${stateDrawInfo?.visibleStates ?? 0}</strong><span>Visible state summaries</span></div>
    <div class="count-card"><strong>${getEnabledSites().length}</strong><span>Enabled sites total</span></div>
    ${layerCountCards}
  `;
}

function drawEverything() {
  const siteDrawInfo = drawSites();
  const stateDrawInfo = drawStateSummaries();
  drawTrails();
  updateCounts(siteDrawInfo, stateDrawInfo);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('`', '&#96;');
}

map.on('moveend zoomend', drawEverything);
[els.toggleStateSummaries, els.toggleSitePoints].forEach((el) => {
  el.addEventListener('change', drawEverything);
});

if (els.toggleTrails) {
  els.toggleTrails.addEventListener('change', drawEverything);
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-zoom-state]');
  if (!button) return;
  const state = button.dataset.zoomState;
  const bounds = model.stateBBoxes.get(state);
  if (bounds) map.fitBounds(bounds.pad(0.15), { padding: [30, 30] });
});

loadData().catch((error) => {
  console.error(error);
  els.statusText.textContent = 'Something tripped during load. The build is usable, but check the console and make sure your data files are present.';
  renderLegend();
  drawEverything();
});
