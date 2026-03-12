const VERSION = 'v16.0';
const DEFAULT_CENTER = [46.6, -87.4];
const DEFAULT_ZOOM = 6;
const DETAIL_ZOOM = 7;
const STATE_PADDING_FACTOR = 0.18;

const CATEGORY_STYLES = {
  modern: { color: '#2a7fff', fillColor: '#2a7fff', radius: 5 },
  rustic: { color: '#a46a24', fillColor: '#a46a24', radius: 5 },
  boondocking: { color: '#3f8c53', fillColor: '#3f8c53', radius: 5 },
  dispersed: { color: '#3f8c53', fillColor: '#3f8c53', radius: 5 },
  trailhead: { color: '#9b59b6', fillColor: '#9b59b6', radius: 5 },
  default: { color: '#d4d4d4', fillColor: '#d4d4d4', radius: 5 }
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
const trailLayer = L.layerGroup().addTo(map);

const els = {
  menuToggle: document.getElementById('menuToggle'),
  menuPanel: document.getElementById('menuPanel'),
  closeMenu: document.getElementById('closeMenu'),
  statusText: document.getElementById('statusText'),
  countsGrid: document.getElementById('countsGrid'),
  toggleStateSummaries: document.getElementById('toggleStateSummaries'),
  toggleSitePoints: document.getElementById('toggleSitePoints'),
  toggleTrails: document.getElementById('toggleTrails'),
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
  stateBBoxes: new Map()
};

function normalizeCategory(rawCategory = '') {
  const value = String(rawCategory).trim().toLowerCase();
  if (!value) return 'default';
  if (value.includes('boondock') || value.includes('dispersed')) return 'boondocking';
  if (value.includes('rustic')) return 'rustic';
  if (value.includes('modern')) return 'modern';
  if (value.includes('trailhead')) return 'trailhead';
  return value;
}

function getLatLng(raw) {
  if (Array.isArray(raw?.coordinates) && raw.coordinates.length >= 2) {
    const [lng, lat] = raw.coordinates;
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [Number(lat), Number(lng)];
  }
  const lat = Number(raw.lat ?? raw.latitude ?? raw.y);
  const lng = Number(raw.lng ?? raw.lon ?? raw.longitude ?? raw.x);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
  return null;
}

function normalizeSite(raw, idx) {
  const latlng = getLatLng(raw);
  if (!latlng) return null;

  const state = raw.state || raw.stateAbbr || raw.state_abbr || raw.region || raw.province || raw.admin1 || 'Unknown';
  const category = normalizeCategory(raw.category || raw.type || raw.layer || raw.kind);
  const website = raw.website || raw.url || raw.link || raw.official_url || '';
  const navigateUrl = `https://www.google.com/maps?q=${latlng[0]},${latlng[1]}`;

  return {
    id: raw.id || `site-${idx}`,
    name: raw.name || raw.title || raw.site || raw.label || `Untitled site ${idx + 1}`,
    state: String(state).trim() || 'Unknown',
    category,
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

async function loadData() {
  const sitesRaw = await loadFirstAvailable([
    'data/sites.json',
    'data/site-data.json',
    'data/campgrounds.json',
    'sites.json'
  ]);

  const trailRaw = await loadFirstAvailable([
    'data/trails.geojson',
    'trails.geojson'
  ]);

  const siteArray = Array.isArray(sitesRaw)
    ? sitesRaw
    : Array.isArray(sitesRaw?.sites)
      ? sitesRaw.sites
      : Array.isArray(sitesRaw?.features)
        ? sitesRaw.features.map((f) => ({
            ...(f.properties || {}),
            coordinates: f.geometry?.coordinates
          }))
        : [];

  model.sites = siteArray.map(normalizeSite).filter(Boolean);
  model.trails = trailRaw;
  buildStateGroups();
  drawEverything();

  const msg = model.sites.length
    ? `Loaded ${model.sites.length} campsites and ${countTrailFeatures()} trail overlay(s).`
    : 'No campsite file was found. The build is ready, but keep your existing sites.json in place.';
  els.statusText.textContent = msg;
}

function countTrailFeatures() {
  return Array.isArray(model.trails?.features) ? model.trails.features.length : 0;
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

function popupHtmlForSite(site) {
  const parts = [];
  if (site.access) parts.push(`<div><strong>Access:</strong> ${escapeHtml(site.access)}</div>`);
  if (site.cost) parts.push(`<div><strong>Cost:</strong> ${escapeHtml(site.cost)}</div>`);
  if (site.showers) parts.push(`<div><strong>Showers:</strong> ${escapeHtml(site.showers)}</div>`);
  if (site.description) parts.push(`<div>${escapeHtml(site.description)}</div>`);

  return `
    <div class="popup-content">
      <div class="popup-title">${escapeHtml(site.name)}</div>
      <div class="popup-meta">${escapeHtml(site.state)} · ${escapeHtml(site.category)}</div>
      ${parts.join('')}
      <div class="popup-actions">
        <a href="${site.navigateUrl}" target="_blank" rel="noopener noreferrer">Navigate</a>
        ${site.website ? `<a href="${escapeAttribute(site.website)}" target="_blank" rel="noopener noreferrer">Website</a>` : ''}
      </div>
    </div>
  `;
}

function popupHtmlForState(state, sites) {
  const counts = countByCategory(sites);
  return `
    <div class="popup-content">
      <div class="popup-title">${escapeHtml(state)}</div>
      <div class="popup-meta">${sites.length} campsite point${sites.length === 1 ? '' : 's'} in this state</div>
      <div>Modern: ${counts.modern || 0}</div>
      <div>Rustic: ${counts.rustic || 0}</div>
      <div>Boondocking: ${counts.boondocking || 0}</div>
      <div class="popup-actions">
        <button type="button" data-zoom-state="${escapeAttribute(state)}">Zoom to state</button>
      </div>
    </div>
  `;
}

function countByCategory(items) {
  return items.reduce((acc, item) => {
    const cat = item.category || 'default';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});
}

function drawSites() {
  siteLayer.clearLayers();
  if (!els.toggleSitePoints.checked || !shouldShowSiteDetails()) return;

  const visibleBounds = map.getBounds().pad(0.2);
  let visibleSites = 0;
  const visibleCategories = { modern: 0, rustic: 0, boondocking: 0, other: 0 };

  for (const site of model.sites) {
    const ll = L.latLng(site.latlng[0], site.latlng[1]);
    if (!visibleBounds.contains(ll)) continue;
    const style = CATEGORY_STYLES[site.category] || CATEGORY_STYLES.default;
    L.circleMarker(ll, {
      radius: style.radius,
      color: style.color,
      fillColor: style.fillColor,
      fillOpacity: 0.9,
      weight: 1
    }).bindPopup(popupHtmlForSite(site)).addTo(siteLayer);

    visibleSites += 1;
    if (site.category in visibleCategories) visibleCategories[site.category] += 1;
    else visibleCategories.other += 1;
  }

  return { visibleSites, visibleCategories };
}

function drawStateSummaries() {
  stateLayer.clearLayers();
  if (!els.toggleStateSummaries.checked || shouldShowSiteDetails()) return;

  for (const [state, sites] of model.stateGroups.entries()) {
    const lat = sites.reduce((sum, s) => sum + s.latlng[0], 0) / sites.length;
    const lng = sites.reduce((sum, s) => sum + s.latlng[1], 0) / sites.length;

    const marker = L.circleMarker([lat, lng], {
      radius: 12,
      color: '#7f4dff',
      fillColor: '#7f4dff',
      fillOpacity: 0.85,
      weight: 1
    }).bindPopup(popupHtmlForState(state, sites));

    marker.addTo(stateLayer);

    const label = L.marker([lat, lng], {
      interactive: false,
      icon: L.divIcon({
        className: 'state-summary-label',
        html: `${escapeHtml(state)} · ${sites.length}`
      })
    });
    label.addTo(stateLayer);
  }
}

function drawTrails() {
  trailLayer.clearLayers();
  if (!els.toggleTrails.checked || !model.trails?.features) return;

  const geoJson = L.geoJSON(model.trails, {
    style: () => ({
      color: '#ff7a00',
      weight: 3,
      opacity: 0.9
    }),
    onEachFeature: (feature, layer) => {
      const p = feature.properties || {};
      const url = p.url ? `<div><a href="${escapeAttribute(p.url)}" target="_blank" rel="noopener noreferrer">More info</a></div>` : '';
      layer.bindPopup(`
        <div class="popup-content">
          <div class="popup-title">${escapeHtml(p.name || 'Trail')}</div>
          <div class="popup-meta">${escapeHtml(p.note || 'Trail overlay')}</div>
          ${url}
        </div>
      `);
    }
  });
  geoJson.addTo(trailLayer);
}

function updateCounts(siteDrawInfo) {
  const mode = shouldShowSiteDetails() ? 'individual sites' : 'state summaries';
  const focusedState = focusedOnSingleState();
  const summaryCounts = {
    modern: 0,
    rustic: 0,
    boondocking: 0,
    other: 0,
    trails: countTrailFeatures()
  };

  if (siteDrawInfo?.visibleCategories) {
    Object.assign(summaryCounts, siteDrawInfo.visibleCategories, { trails: countTrailFeatures() });
  }

  els.countsGrid.innerHTML = `
    <div class="count-card"><strong>${mode}</strong><span>${focusedState ? `Focused on ${escapeHtml(focusedState)}` : 'Zoom changes when points break out'}</span></div>
    <div class="count-card"><strong>${siteDrawInfo?.visibleSites ?? model.sites.length}</strong><span>${shouldShowSiteDetails() ? 'Visible site points' : 'Total sites in data file'}</span></div>
    <div class="count-card"><strong>${summaryCounts.modern || 0}</strong><span>Modern visible</span></div>
    <div class="count-card"><strong>${summaryCounts.rustic || 0}</strong><span>Rustic visible</span></div>
    <div class="count-card"><strong>${summaryCounts.boondocking || 0}</strong><span>Boondocking visible</span></div>
    <div class="count-card"><strong>${summaryCounts.trails || 0}</strong><span>Trail overlays</span></div>
  `;
}

function drawEverything() {
  const siteDrawInfo = drawSites();
  drawStateSummaries();
  drawTrails();
  updateCounts(siteDrawInfo);
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
[els.toggleStateSummaries, els.toggleSitePoints, els.toggleTrails].forEach((el) => {
  el.addEventListener('change', drawEverything);
});

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
  drawEverything();
});
