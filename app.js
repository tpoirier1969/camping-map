const VERSION = 'v17.2';
const DEFAULT_CENTER = [46.6, -87.4];
const DEFAULT_ZOOM = 6;
const DETAIL_ZOOM = 7;
const STATE_PADDING_FACTOR = 0.18;
const LONG_PRESS_MS = 700;
const BUILTIN_BUCKETS = {
  modern: { label: 'Modern', color: '#2a7fff', radius: 8 },
  rustic: { label: 'Rustic', color: '#a46a24', radius: 8 },
  boondocking: { label: 'Boondocking / dispersed', color: '#3f8c53', radius: 8 },
  private: { label: 'Private campgrounds', color: '#cf4f7d', radius: 8 },
  national_forest: { label: 'National forest campgrounds', color: '#1f8a70', radius: 8 },
  state_federal_modern: { label: 'State / federal modern campgrounds', color: '#2a7fff', radius: 8 },
  state_federal_rustic: { label: 'State / federal rustic campgrounds', color: '#a46a24', radius: 8 },
  trailhead: { label: 'Trailheads', color: '#8e5bd6', radius: 8 },
  other: { label: 'Other campsites', color: '#949494', radius: 8 },
  state_summary: { label: 'State summary', color: '#7f4dff', radius: 14 },
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
const draftLayer = L.layerGroup().addTo(map);

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
  layerState: new Map(),
  addMode: false,
  draftMarker: null,
  longPressTimer: null,
  touchStartLatLng: null,
  touchMoved: false,
  startStatusText: 'Loading map data…'
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

  model.sites = normalizeSiteArray(sitesRaw).map(normalizeSite).filter(Boolean);
  model.trails = null;

  buildLayerDefinitions();
  buildStateGroups();
  renderLayerControls();
  renderLegend();
  syncTrailUi();
  ensureAddSiteUi();
  drawEverything();

  const siteMsg = model.sites.length
    ? `Loaded ${model.sites.length} campsites across ${model.layerDefs.size} visible layer${model.layerDefs.size === 1 ? '' : 's'}.`
    : 'No campsite file was found. Keep your existing sites.json in place.';

  model.startStatusText = `${siteMsg} Trail layer removed.`;
  setStatus(model.startStatusText);
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
        radius: bucketStyle.radius || 8,
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
  els.trailSection.hidden = true;
  if (trailLayer && map.hasLayer(trailLayer)) map.removeLayer(trailLayer);
}

function ensureAddSiteUi() {
  if (document.getElementById('addSiteActions')) return;

  const displaySection = els.toggleStateSummaries.closest('.panel-section');
  if (!displaySection) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'panel-section';
  wrapper.id = 'addSiteActions';
  wrapper.innerHTML = `
    <h2>Add a site</h2>
    <p id="addSiteHint">Phone-friendly: tap <strong>Start add mode</strong>, then tap the map where the site belongs. You can also long-press the map.</p>
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
      <button type="button" id="startAddSiteBtn" class="ghost-button">Start add mode</button>
      <button type="button" id="cancelAddSiteBtn" class="ghost-button" hidden>Cancel add mode</button>
      <button type="button" id="clearDraftSiteBtn" class="ghost-button" hidden>Clear draft pin</button>
    </div>
  `;
  displaySection.insertAdjacentElement('afterend', wrapper);

  wrapper.querySelector('#startAddSiteBtn').addEventListener('click', startAddMode);
  wrapper.querySelector('#cancelAddSiteBtn').addEventListener('click', cancelAddMode);
  wrapper.querySelector('#clearDraftSiteBtn').addEventListener('click', clearDraftMarker);
}

function setStatus(message) {
  els.statusText.textContent = message;
}

function refreshAddUi() {
  const startBtn = document.getElementById('startAddSiteBtn');
  const cancelBtn = document.getElementById('cancelAddSiteBtn');
  const clearBtn = document.getElementById('clearDraftSiteBtn');
  const hint = document.getElementById('addSiteHint');

  if (!startBtn || !cancelBtn || !clearBtn || !hint) return;

  startBtn.hidden = model.addMode;
  cancelBtn.hidden = !model.addMode;
  clearBtn.hidden = !model.draftMarker;

  if (model.addMode) {
    hint.innerHTML = 'Add mode is armed. Tap the map once to drop the new site.';
  } else if (model.draftMarker) {
    hint.innerHTML = 'Draft pin placed. Open the pin popup to copy the JSON snippet.';
  } else {
    hint.innerHTML = 'Phone-friendly: tap <strong>Start add mode</strong>, then tap the map where the site belongs. You can also long-press the map.';
  }
}

function startAddMode() {
  model.addMode = true;
  setStatus('Add mode ready. Tap the map where the new site belongs.');
  refreshAddUi();
}

function cancelAddMode() {
  model.addMode = false;
  setStatus(model.startStatusText);
  refreshAddUi();
}

function clearDraftMarker() {
  draftLayer.clearLayers();
  model.draftMarker = null;
  setStatus(model.addMode ? 'Add mode ready. Tap the map where the new site belongs.' : model.startStatusText);
  refreshAddUi();
}

function getLikelyLayerKey() {
  const enabled = [...model.layerDefs.values()].filter((def) => isLayerEnabled(def.key));
  return enabled[0]?.key || [...model.layerDefs.keys()][0] || 'boondocking';
}

function buildDraftPayload(latlng, overrides = {}) {
  const chosenLayerKey = overrides.layerKey || getLikelyLayerKey();
  const chosenDef = model.layerDefs.get(chosenLayerKey);
  return {
    name: overrides.name || 'New site',
    state: overrides.state || '',
    category: overrides.category || chosenDef?.bucket || 'other',
    layer: chosenDef?.label || overrides.layer || '',
    lat: Number(latlng.lat.toFixed(6)),
    lng: Number(latlng.lng.toFixed(6)),
    access: overrides.access || '',
    cost: overrides.cost || '',
    showers: overrides.showers || '',
    website: overrides.website || '',
    description: overrides.description || ''
  };
}

function popupHtmlForDraft(payload) {
  const pretty = JSON.stringify(payload, null, 2);
  const layerOptions = [...model.layerDefs.values()].map((def) => (
    `<option value="${escapeAttribute(def.key)}" ${def.label === payload.layer || def.key === payload.layer ? 'selected' : ''}>${escapeHtml(def.label)}</option>`
  )).join('');

  return `
    <div class="popup-content">
      <div class="popup-title">New site draft</div>
      <div class="popup-meta">Tap fields, then copy the snippet into your data file.</div>
      <div class="draft-form" style="display:grid; gap:8px;">
        <label><div>Name</div><input data-draft-field="name" value="${escapeAttribute(payload.name)}" style="width:100%"></label>
        <label><div>State</div><input data-draft-field="state" value="${escapeAttribute(payload.state)}" style="width:100%"></label>
        <label><div>Layer</div><select data-draft-field="layerKey" style="width:100%">${layerOptions}</select></label>
        <label><div>Category</div><input data-draft-field="category" value="${escapeAttribute(payload.category)}" style="width:100%"></label>
        <label><div>Access</div><input data-draft-field="access" value="${escapeAttribute(payload.access)}" style="width:100%"></label>
        <label><div>Cost</div><input data-draft-field="cost" value="${escapeAttribute(payload.cost)}" style="width:100%"></label>
        <label><div>Website</div><input data-draft-field="website" value="${escapeAttribute(payload.website)}" style="width:100%"></label>
        <label><div>Description</div><textarea data-draft-field="description" rows="3" style="width:100%">${escapeHtml(payload.description)}</textarea></label>
      </div>
      <div class="popup-meta">${payload.lat}, ${payload.lng}</div>
      <div class="popup-actions" style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
        <button type="button" data-copy-draft>Copy JSON</button>
        <button type="button" data-clear-draft>Remove pin</button>
      </div>
      <pre data-draft-preview style="white-space:pre-wrap; max-height:220px; overflow:auto; margin-top:10px;">${escapeHtml(pretty)}</pre>
    </div>
  `;
}

function placeDraftMarker(latlng) {
  clearDraftMarker();
  const payload = buildDraftPayload(latlng);

  const marker = L.circleMarker(latlng, {
    radius: 11,
    color: '#ffd54a',
    fillColor: '#ffd54a',
    fillOpacity: 0.9,
    weight: 3
  }).addTo(draftLayer);

  marker.draftPayload = payload;
  marker.bindPopup(popupHtmlForDraft(payload), { maxWidth: 320 }).openPopup();
  model.draftMarker = marker;
  model.addMode = false;
  setStatus(`Draft pin placed at ${payload.lat}, ${payload.lng}. Open the pin popup to copy the JSON snippet.`);
  refreshAddUi();
}

function getTouchLatLng(touch) {
  if (!touch) return null;
  const point = map.mouseEventToContainerPoint({ clientX: touch.clientX, clientY: touch.clientY });
  return map.containerPointToLatLng(point);
}

function beginLongPress(latlng) {
  clearLongPress();
  model.touchStartLatLng = latlng;
  model.touchMoved = false;
  model.longPressTimer = window.setTimeout(() => {
    model.longPressTimer = null;
    if (!model.touchMoved && model.touchStartLatLng) {
      placeDraftMarker(model.touchStartLatLng);
    }
  }, LONG_PRESS_MS);
}

function clearLongPress() {
  if (model.longPressTimer) {
    window.clearTimeout(model.longPressTimer);
    model.longPressTimer = null;
  }
}

function wireLongPressHandlers() {
  const container = map.getContainer();

  container.addEventListener('touchstart', (event) => {
    if (!event.touches || event.touches.length !== 1) {
      clearLongPress();
      return;
    }
    const latlng = getTouchLatLng(event.touches[0]);
    if (latlng) beginLongPress(latlng);
  }, { passive: true });

  container.addEventListener('touchmove', (event) => {
    if (!model.touchStartLatLng || !event.touches || !event.touches[0]) return;
    const latlng = getTouchLatLng(event.touches[0]);
    if (!latlng) return;
    if (latlng.distanceTo(model.touchStartLatLng) > 20) {
      model.touchMoved = true;
      clearLongPress();
    }
  }, { passive: true });

  ['touchend', 'touchcancel'].forEach((name) => {
    container.addEventListener(name, () => {
      clearLongPress();
      model.touchStartLatLng = null;
    }, { passive: true });
  });
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
    const style = model.layerDefs.get(site.layerKey) || { color: BUILTIN_BUCKETS.other.color, radius: 8 };
    L.circleMarker(ll, {
      radius: style.radius || 8,
      color: style.color,
      fillColor: style.color,
      fillOpacity: 0.9,
      weight: 2
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
      weight: 2
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
map.on('click', (event) => {
  if (!model.addMode) return;
  placeDraftMarker(event.latlng);
});

[els.toggleStateSummaries, els.toggleSitePoints].forEach((el) => {
  el.addEventListener('change', drawEverything);
});

if (els.toggleTrails) {
  els.toggleTrails.addEventListener('change', drawEverything);
}

map.on('popupopen', (event) => {
  const root = event.popup.getElement();
  if (!root || !model.draftMarker) return;
  const copyBtn = root.querySelector('[data-copy-draft]');
  const clearBtn = root.querySelector('[data-clear-draft]');
  const preview = root.querySelector('[data-draft-preview]');
  const fields = root.querySelectorAll('[data-draft-field]');

  const syncDraftFromFields = () => {
    if (!model.draftMarker) return;
    const updates = {};
    fields.forEach((field) => {
      updates[field.dataset.draftField] = field.value;
    });
    const payload = buildDraftPayload(model.draftMarker.getLatLng(), updates);
    model.draftMarker.draftPayload = payload;
    if (preview) preview.textContent = JSON.stringify(payload, null, 2);
  };

  fields.forEach((field) => {
    field.addEventListener('input', syncDraftFromFields);
    field.addEventListener('change', syncDraftFromFields);
  });

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const payload = model.draftMarker?.draftPayload;
      if (!payload) return;
      const text = JSON.stringify(payload, null, 2);
      try {
        await navigator.clipboard.writeText(text);
        setStatus('Draft JSON copied to clipboard.');
      } catch (err) {
        setStatus('Clipboard copy failed. Select the JSON in the popup and copy it manually.');
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearDraftMarker();
      map.closePopup();
    });
  }
});

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-zoom-state]');
  if (!button) return;
  const state = button.dataset.zoomState;
  const bounds = model.stateBBoxes.get(state);
  if (bounds) map.fitBounds(bounds.pad(0.15), { padding: [30, 30] });
});

wireLongPressHandlers();

loadData().catch((error) => {
  console.error(error);
  model.startStatusText = 'Something tripped during load. The build is usable, but check the console and make sure your data files are present.';
  setStatus(model.startStatusText);
  renderLegend();
  ensureAddSiteUi();
  refreshAddUi();
  drawEverything();
});
