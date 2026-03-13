const VERSION = 'v18.3';
const SITE_DATA_URLS = ['data/sites.json', 'data/site-data.json', 'data/campgrounds.json', 'sites.json'];
const TRAIL_DATA_URLS = ['data/trails.geojson', 'trails.geojson'];
const DEFAULT_CENTER = [-87.4, 46.6];
const DEFAULT_ZOOM = 6;
const DETAIL_ZOOM = 7;
const STATE_PADDING_FACTOR = 0.18;
const LONG_PRESS_MS = 700;
const STORAGE_KEYS = {
  apiKey: 'campingMap.maptilerApiKey',
  basemap: 'campingMap.basemap',
  terrain: 'campingMap.terrain',
  tilt: 'campingMap.pitch'
};
const BUILTIN_BUCKETS = {
  modern: { label: 'Modern', color: '#2a7fff', radius: 11 },
  rustic: { label: 'Rustic', color: '#a46a24', radius: 11 },
  boondocking: { label: 'Boondocking / dispersed', color: '#3f8c53', radius: 11 },
  private: { label: 'Private campgrounds', color: '#cf4f7d', radius: 11 },
  national_forest: { label: 'National forest campgrounds', color: '#1f8a70', radius: 11 },
  state_federal_modern: { label: 'State / federal modern campgrounds', color: '#2a7fff', radius: 11 },
  state_federal_rustic: { label: 'State / federal rustic campgrounds', color: '#a46a24', radius: 9 },
  trailhead: { label: 'Trailheads', color: '#8e5bd6', radius: 11 },
  other: { label: 'Other campsites', color: '#949494', radius: 11 },
  state_summary: { label: 'State summary', color: '#7f4dff', radius: 22 },
  trail: { label: 'Trail', color: '#ff7a00', radius: 0 },
  draft: { label: 'Draft site', color: '#ffd23f', radius: 11 }
};

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
  versionTag: document.getElementById('versionTag'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  saveKeyBtn: document.getElementById('saveKeyBtn'),
  clearKeyBtn: document.getElementById('clearKeyBtn'),
  basemapSelect: document.getElementById('basemapSelect'),
  toggleTerrain: document.getElementById('toggleTerrain'),
  togglePitch: document.getElementById('togglePitch'),
  toggleAddMode: document.getElementById('toggleAddMode')
};
els.versionTag.textContent = VERSION;
if (els.toggleStateSummaries) els.toggleStateSummaries.checked = true;

const model = {
  map: null,
  sites: [],
  trails: null,
  stateGroups: new Map(),
  stateBBoxes: new Map(),
  layerDefs: new Map(),
  layerState: new Map(),
  stateSummaryByState: new Map(),
  addMode: false,
  hasApiKey: false,
  styleReady: false,
  mapStyleMode: localStorage.getItem(STORAGE_KEYS.basemap) || 'outdoor',
  terrainEnabled: localStorage.getItem(STORAGE_KEYS.terrain) === 'true',
  tiltEnabled: localStorage.getItem(STORAGE_KEYS.tilt) === 'true',
  draftFeature: null,
  longPressTimer: null,
  pressStartPoint: null,
  pressMoved: false,
  dataLoad: {
    loadingSites: false,
    loadingTrails: false,
    sitesAttempted: [],
    trailsAttempted: [],
    sitesUrl: '',
    trailsUrl: '',
    sitesError: '',
    trailsError: ''
  }
};

function getSavedApiKey() {
  return (localStorage.getItem(STORAGE_KEYS.apiKey) || '').trim();
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

function cleanLabel(value) {
  return String(value || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function titleCase(value) {
  return cleanLabel(value).replace(/\b\w/g, (m) => m.toUpperCase());
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
  return `hsl(${Math.abs(hash) % 360} 60% 52%)`;
}


function listAllValues(input, depth = 0, seen = new Set()) {
  if (input == null || depth > 2) return [];
  if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') return [String(input)];
  if (seen.has(input)) return [];
  if (typeof input !== 'object') return [];
  seen.add(input);
  const values = [];
  if (Array.isArray(input)) {
    for (const item of input) values.push(...listAllValues(item, depth + 1, seen));
    return values;
  }
  for (const value of Object.values(input)) values.push(...listAllValues(value, depth + 1, seen));
  return values;
}

function getFieldAny(obj, candidates = []) {
  if (!obj || typeof obj !== 'object') return undefined;
  const directKeys = Object.keys(obj);
  const lookup = new Map(directKeys.map((key) => [key.toLowerCase().replace(/[^a-z0-9]/g, ''), key]));
  for (const candidate of candidates) {
    if (candidate in obj && obj[candidate] != null && obj[candidate] !== '') return obj[candidate];
    const match = lookup.get(String(candidate).toLowerCase().replace(/[^a-z0-9]/g, ''));
    if (match && obj[match] != null && obj[match] !== '') return obj[match];
  }
  return undefined;
}

const STATE_NAME_TO_ABBR = {
  alabama:'AL', alaska:'AK', arizona:'AZ', arkansas:'AR', california:'CA', colorado:'CO', connecticut:'CT', delaware:'DE', florida:'FL', georgia:'GA', hawaii:'HI', idaho:'ID', illinois:'IL', indiana:'IN', iowa:'IA', kansas:'KS', kentucky:'KY', louisiana:'LA', maine:'ME', maryland:'MD', massachusetts:'MA', michigan:'MI', minnesota:'MN', mississippi:'MS', missouri:'MO', montana:'MT', nebraska:'NE', nevada:'NV', 'new hampshire':'NH', 'new jersey':'NJ', 'new mexico':'NM', 'new york':'NY', 'north carolina':'NC', 'north dakota':'ND', ohio:'OH', oklahoma:'OK', oregon:'OR', pennsylvania:'PA', 'rhode island':'RI', 'south carolina':'SC', 'south dakota':'SD', tennessee:'TN', texas:'TX', utah:'UT', vermont:'VT', virginia:'VA', washington:'WA', 'west virginia':'WV', wisconsin:'WI', wyoming:'WY'
};
const STATE_ABBRS = new Set(Object.values(STATE_NAME_TO_ABBR));
const ROUGH_STATE_BOUNDS = [
  { abbr:'MI', minLng:-90.6, maxLng:-82.1, minLat:41.5, maxLat:48.5 },
  { abbr:'WI', minLng:-93.1, maxLng:-86.2, minLat:42.3, maxLat:47.4 },
  { abbr:'MN', minLng:-97.5, maxLng:-89.4, minLat:43.4, maxLat:49.5 },
  { abbr:'IL', minLng:-91.6, maxLng:-87.0, minLat:36.8, maxLat:42.6 },
  { abbr:'IN', minLng:-88.2, maxLng:-84.6, minLat:37.7, maxLat:41.9 },
  { abbr:'OH', minLng:-84.9, maxLng:-80.3, minLat:38.2, maxLat:42.4 },
  { abbr:'PA', minLng:-80.7, maxLng:-74.5, minLat:39.5, maxLat:42.6 },
  { abbr:'NY', minLng:-79.9, maxLng:-71.8, minLat:40.4, maxLat:45.2 },
  { abbr:'IA', minLng:-96.7, maxLng:-90.1, minLat:40.3, maxLat:43.6 },
  { abbr:'MO', minLng:-95.8, maxLng:-89.0, minLat:35.8, maxLat:40.8 },
  { abbr:'AR', minLng:-94.7, maxLng:-89.5, minLat:33.0, maxLat:36.7 },
  { abbr:'MS', minLng:-91.8, maxLng:-88.0, minLat:30.1, maxLat:35.1 },
  { abbr:'AL', minLng:-88.5, maxLng:-84.8, minLat:30.1, maxLat:35.1 },
  { abbr:'GA', minLng:-85.7, maxLng:-80.7, minLat:30.3, maxLat:35.1 },
  { abbr:'FL', minLng:-87.8, maxLng:-79.8, minLat:24.3, maxLat:31.2 },
  { abbr:'NC', minLng:-84.4, maxLng:-75.3, minLat:33.8, maxLat:36.8 },
  { abbr:'SC', minLng:-83.5, maxLng:-78.3, minLat:32.0, maxLat:35.3 },
  { abbr:'TN', minLng:-90.5, maxLng:-81.5, minLat:34.8, maxLat:36.9 },
  { abbr:'KY', minLng:-89.7, maxLng:-81.9, minLat:36.3, maxLat:39.3 },
  { abbr:'VA', minLng:-83.7, maxLng:-75.2, minLat:36.4, maxLat:39.6 },
  { abbr:'WV', minLng:-82.7, maxLng:-77.7, minLat:37.0, maxLat:40.7 },
  { abbr:'MD', minLng:-79.6, maxLng:-75.0, minLat:37.8, maxLat:39.8 },
  { abbr:'NJ', minLng:-75.7, maxLng:-73.8, minLat:38.9, maxLat:41.4 },
  { abbr:'DE', minLng:-75.8, maxLng:-75.0, minLat:38.4, maxLat:39.9 },
  { abbr:'CT', minLng:-73.8, maxLng:-71.7, minLat:40.9, maxLat:42.1 },
  { abbr:'RI', minLng:-71.9, maxLng:-71.1, minLat:41.1, maxLat:42.1 },
  { abbr:'MA', minLng:-73.6, maxLng:-69.8, minLat:41.2, maxLat:42.9 },
  { abbr:'VT', minLng:-73.5, maxLng:-71.4, minLat:42.7, maxLat:45.1 },
  { abbr:'NH', minLng:-72.7, maxLng:-70.6, minLat:42.7, maxLat:45.4 },
  { abbr:'ME', minLng:-71.2, maxLng:-66.8, minLat:42.9, maxLat:47.6 },
  { abbr:'ND', minLng:-104.1, maxLng:-96.4, minLat:45.9, maxLat:49.1 },
  { abbr:'SD', minLng:-104.1, maxLng:-96.3, minLat:42.5, maxLat:45.95 },
  { abbr:'NE', minLng:-104.1, maxLng:-95.2, minLat:40.0, maxLat:43.2 },
  { abbr:'KS', minLng:-102.1, maxLng:-94.6, minLat:37.0, maxLat:40.1 },
  { abbr:'OK', minLng:-103.1, maxLng:-94.4, minLat:33.6, maxLat:37.1 },
  { abbr:'TX', minLng:-106.7, maxLng:-93.4, minLat:25.6, maxLat:36.6 },
  { abbr:'NM', minLng:-109.2, maxLng:-103.0, minLat:31.2, maxLat:37.1 },
  { abbr:'CO', minLng:-109.2, maxLng:-101.9, minLat:36.9, maxLat:41.1 },
  { abbr:'WY', minLng:-111.2, maxLng:-104.0, minLat:41.0, maxLat:45.1 },
  { abbr:'MT', minLng:-116.2, maxLng:-104.0, minLat:44.2, maxLat:49.1 },
  { abbr:'ID', minLng:-117.3, maxLng:-111.0, minLat:41.9, maxLat:49.1 },
  { abbr:'UT', minLng:-114.2, maxLng:-109.0, minLat:36.9, maxLat:42.1 },
  { abbr:'AZ', minLng:-114.9, maxLng:-109.0, minLat:31.2, maxLat:37.1 },
  { abbr:'NV', minLng:-120.1, maxLng:-114.0, minLat:35.0, maxLat:42.1 },
  { abbr:'CA', minLng:-124.6, maxLng:-114.0, minLat:32.2, maxLat:42.1 },
  { abbr:'OR', minLng:-124.8, maxLng:-116.3, minLat:41.9, maxLat:46.3 },
  { abbr:'WA', minLng:-124.9, maxLng:-116.8, minLat:45.5, maxLat:49.1 },
  { abbr:'LA', minLng:-94.1, maxLng:-88.8, minLat:28.8, maxLat:33.1 }
];

function normalizeStateText(value) {
  const text = cleanLabel(value).replace(/\./g, '');
  if (!text) return '';
  const upper = text.toUpperCase();
  if (STATE_ABBRS.has(upper)) return upper;
  const lower = text.toLowerCase();
  if (STATE_NAME_TO_ABBR[lower]) return STATE_NAME_TO_ABBR[lower];
  return '';
}

function extractStateFromText(text) {
  const cleaned = String(text || '').replace(/[.,]/g, ' ');
  const direct = normalizeStateText(cleaned);
  if (direct) return direct;
  const upper = cleaned.toUpperCase();
  const abbrMatch = upper.match(/(?:^|\s)(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)(?:\s|$)/);
  if (abbrMatch) return abbrMatch[1];
  const lower = cleaned.toLowerCase();
  const names = Object.keys(STATE_NAME_TO_ABBR).sort((a, b) => b.length - a.length);
  for (const name of names) {
    if (lower.includes(name)) return STATE_NAME_TO_ABBR[name];
  }
  return '';
}

function approximateStateFromLngLat(lngLat) {
  if (!Array.isArray(lngLat) || lngLat.length < 2) return '';
  const [lng, lat] = lngLat;
  for (const state of ROUGH_STATE_BOUNDS) {
    if (lng >= state.minLng && lng <= state.maxLng && lat >= state.minLat && lat <= state.maxLat) return state.abbr;
  }
  return '';
}

function deriveState(raw, lngLat) {
  const direct = normalizeStateText(getFieldAny(raw, ['state','stateAbbr','state_abbr','st','province','provinceAbbr','region','admin1','stateProvince','State','STATE']));
  if (direct) return direct;
  const textCandidates = [
    getFieldAny(raw, ['address','location','place','cityState','city_state','mapsAddress','formatted_address']),
    getFieldAny(raw, ['description','notes','summary']),
    getFieldAny(raw, ['name','title','site','label'])
  ].filter(Boolean);
  for (const candidate of textCandidates) {
    const parsed = extractStateFromText(candidate);
    if (parsed) return parsed;
  }
  const allText = listAllValues(raw).join(' | ');
  const parsedAny = extractStateFromText(allText);
  if (parsedAny) return parsedAny;
  return approximateStateFromLngLat(lngLat) || 'Unknown';
}

function normalizeCategory(rawCategory = '') {
  const value = cleanLabel(rawCategory).toLowerCase();
  if (!value) return 'other';
  if (value.includes('boondock') || value.includes('dispersed') || value.includes('primitive')) return 'boondocking';
  if (value.includes('national forest')) return 'national_forest';
  if (value.includes('state') && value.includes('modern')) return 'state_federal_modern';
  if (value.includes('federal') && value.includes('modern')) return 'state_federal_modern';
  if (value.includes('state') && value.includes('rustic')) return 'state_federal_rustic';
  if (value.includes('federal') && value.includes('rustic')) return 'state_federal_rustic';
  if (value.includes('rustic')) return 'rustic';
  if (value.includes('modern')) return 'modern';
  if (value.includes('trailhead') || value.includes('hike in')) return 'trailhead';
  if (value.includes('private')) return 'private';
  if (value.includes('public')) return 'modern';
  return makeSlug(value) || 'other';
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

function deriveLayerInfo(raw, category) {
  const layerish = raw.layerLabel || raw.layer_name || raw.layerName || raw.layer || raw.mapLayer || raw.group || raw.collection || '';
  const ownerText = cleanLabel(raw.owner || raw.ownership || raw.manager || raw.agency || raw.system || raw.landManager || '').toLowerCase();
  const typeText = cleanLabel(raw.type || raw.kind || raw.category || raw.classification || '').toLowerCase();
  const combined = `${layerish} ${ownerText} ${typeText}`.trim();

  if (layerish) {
    return { key: makeSlug(layerish) || `layer-${category}`, label: titleCase(layerish), bucket: categoryFromText(combined, category) };
  }
  if (ownerText.includes('private')) return { key: 'private-campgrounds', label: 'Private Campgrounds', bucket: 'private' };
  if ((ownerText.includes('state') || ownerText.includes('federal') || ownerText.includes('national')) && category === 'modern') {
    return { key: 'state-federal-modern-campgrounds', label: 'State / Federal Campgrounds - Modern', bucket: 'state_federal_modern' };
  }
  if ((ownerText.includes('state') || ownerText.includes('federal') || ownerText.includes('national')) && category === 'rustic') {
    return { key: 'state-federal-rustic-campgrounds', label: 'State / Federal Campgrounds - Rustic', bucket: 'state_federal_rustic' };
  }
  if (combined.includes('national forest')) return { key: 'national-forest-campgrounds', label: 'National Forest Campgrounds', bucket: 'national_forest' };
  if (category === 'boondocking') return { key: 'boondocking', label: 'Boondocking', bucket: 'boondocking' };
  if (category === 'modern') return { key: 'modern-campgrounds', label: 'Modern Campgrounds', bucket: 'modern' };
  if (category === 'rustic') return { key: 'rustic-campgrounds', label: 'Rustic Campgrounds', bucket: 'rustic' };
  if (category === 'private') return { key: 'private-campgrounds', label: 'Private Campgrounds', bucket: 'private' };
  if (category === 'trailhead') return { key: 'trailheads', label: 'Trailheads', bucket: 'trailhead' };
  return { key: category ? `${makeSlug(category)}-sites` : 'other-sites', label: category ? `${titleCase(category)} Sites` : 'Other Campsites', bucket: categoryFromText(combined, category) };
}

function getLatLng(raw) {
  if (Array.isArray(raw?.coordinates) && raw.coordinates.length >= 2) {
    const [lng, lat] = raw.coordinates;
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [lng, lat];
  }
  if (Array.isArray(raw?.geometry?.coordinates) && raw.geometry.coordinates.length >= 2) {
    const [lng, lat] = raw.geometry.coordinates;
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [lng, lat];
  }
  const lat = Number(raw.lat ?? raw.latitude ?? raw.y);
  const lng = Number(raw.lng ?? raw.lon ?? raw.longitude ?? raw.x);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return [lng, lat];
  return null;
}

function normalizeSite(raw, idx) {
  const source = raw?.properties && typeof raw.properties === 'object' ? { ...raw.properties, geometry: raw.geometry, coordinates: raw.coordinates ?? raw.geometry?.coordinates } : raw;
  const lngLat = getLatLng(source);
  if (!lngLat) return null;
  const state = deriveState(source, lngLat);
  const rawCategory = getFieldAny(source, ['category','type','kind','layer','classification','bucket','campType','camp_type','style','accessType','ownershipType']) || '';
  const category = normalizeCategory(rawCategory || `${getFieldAny(source, ['layerLabel','layer_name','layerName','layer','group','collection']) || ''} ${getFieldAny(source, ['owner','ownership','manager','agency','system','landManager']) || ''}`);
  const layerInfo = deriveLayerInfo(source, category);
  const website = getFieldAny(source, ['website','url','link','official_url','officialUrl']) || '';
  const name = getFieldAny(source, ['name','title','site','label','campground','campgroundName']) || `Untitled site ${idx + 1}`;
  const description = getFieldAny(source, ['description','notes','summary','reviewSummary']) || '';
  const access = getFieldAny(source, ['access','road_access','roadAccess']) || '';
  const cost = getFieldAny(source, ['cost','price','fee']) || '';
  const showers = getFieldAny(source, ['showers','hasShowers']) || '';
  const id = getFieldAny(source, ['id','siteId','site_id']) || `site-${idx}`;
  return {
    id,
    name,
    state,
    category,
    layerKey: layerInfo.key,
    layerLabel: layerInfo.label,
    bucket: layerInfo.bucket,
    description,
    website,
    navigateUrl: `https://www.google.com/maps?q=${lngLat[1]},${lngLat[0]}`,
    access,
    cost,
    showers,
    raw: source,
    lngLat,
    feature: {
      type: 'Feature',
      properties: {
        id,
        name,
        state,
        category,
        layerKey: layerInfo.key,
        layerLabel: layerInfo.label,
        bucket: layerInfo.bucket,
        description,
        website,
        navigateUrl: `https://www.google.com/maps?q=${lngLat[1]},${lngLat[0]}`,
        access,
        cost,
        showers
      },
      geometry: { type: 'Point', coordinates: lngLat }
    }
  };
}

async function fetchJsonWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) {
      return { ok: false, url, status: response.status, reason: `HTTP ${response.status}` };
    }
    const json = await response.json();
    return { ok: true, url, status: response.status, json };
  } catch (error) {
    const reason = error?.name === 'AbortError' ? `Timed out after ${timeoutMs} ms` : (error?.message || 'Fetch failed');
    return { ok: false, url, status: 0, reason };
  } finally {
    window.clearTimeout(timer);
  }
}

async function loadFirstAvailable(urls, target = 'sites') {
  const attempts = [];
  for (const url of urls) {
    const result = await fetchJsonWithTimeout(url, 8000);
    attempts.push({ url: result.url, ok: result.ok, status: result.status, reason: result.reason || '' });
    if (result.ok) {
      model.dataLoad[`${target}Attempted`] = attempts;
      model.dataLoad[`${target}Url`] = result.url;
      model.dataLoad[`${target}Error`] = '';
      return result.json;
    }
  }
  model.dataLoad[`${target}Attempted`] = attempts;
  model.dataLoad[`${target}Url`] = '';
  const failureSummary = attempts.length
    ? attempts.map((attempt) => `${attempt.url}: ${attempt.reason || attempt.status || 'failed'}`).join(' | ')
    : 'No URLs attempted';
  model.dataLoad[`${target}Error`] = failureSummary;
  return null;
}

function normalizeSiteArray(sitesRaw) {
  return Array.isArray(sitesRaw)
    ? sitesRaw
    : Array.isArray(sitesRaw?.sites)
      ? sitesRaw.sites
      : Array.isArray(sitesRaw?.features)
        ? sitesRaw.features.map((feature) => ({ ...(feature.properties || {}), geometry: feature.geometry, coordinates: feature.geometry?.coordinates }))
        : [];
}

async function loadData() {
  model.dataLoad.loadingSites = true;
  model.dataLoad.loadingTrails = true;
  refreshStatusText();

  const sitesRaw = await loadFirstAvailable(SITE_DATA_URLS, 'sites');
  model.dataLoad.loadingSites = false;
  model.sites = normalizeSiteArray(sitesRaw).map(normalizeSite).filter(Boolean);

  const trailRaw = await loadFirstAvailable(TRAIL_DATA_URLS, 'trails');
  model.dataLoad.loadingTrails = false;
  model.trails = trailRaw?.features?.length ? trailRaw : null;

  buildLayerDefinitions();
  buildStateGroups();
  renderLayerControls();
  renderLegend();
  syncTrailUi();

  if (model.map && model.styleReady) {
    updateOverlays();
  }
  refreshStatusText();
}

function buildLayerDefinitions() {
  model.layerDefs.clear();
  model.layerState.clear();
  for (const site of model.sites) {
    if (!model.layerDefs.has(site.layerKey)) {
      const bucketStyle = BUILTIN_BUCKETS[site.bucket] || BUILTIN_BUCKETS.other;
      model.layerDefs.set(site.layerKey, {
        key: site.layerKey,
        label: site.layerLabel,
        bucket: site.bucket,
        color: bucketStyle.color || hashColor(site.layerKey),
        radius: bucketStyle.radius || 8
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
  model.stateSummaryByState.clear();
  for (const site of model.sites) {
    if (!model.stateGroups.has(site.state)) model.stateGroups.set(site.state, []);
    model.stateGroups.get(site.state).push(site);
  }
  for (const [state, sites] of model.stateGroups.entries()) {
    const lngs = sites.map((s) => s.lngLat[0]);
    const lats = sites.map((s) => s.lngLat[1]);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs), minLat = Math.min(...lats), maxLat = Math.max(...lats);
    model.stateBBoxes.set(state, [[minLng, minLat], [maxLng, maxLat]]);
    const centroid = [lngs.reduce((a,b)=>a+b,0)/lngs.length, lats.reduce((a,b)=>a+b,0)/lats.length];
    model.stateSummaryByState.set(state, {
      type: 'Feature',
      properties: { state, count: sites.length },
      geometry: { type: 'Point', coordinates: centroid }
    });
  }
}

function renderLayerControls() {
  if (!model.layerDefs.size) {
    els.layerToggleList.innerHTML = '<p>No campsite layers detected yet. If you expected them, the status line now tells you which site-data URLs were tried.</p>';
    return;
  }
  els.layerToggleList.innerHTML = '';
  for (const def of model.layerDefs.values()) {
    const row = document.createElement('label');
    row.className = 'switch-row';
    row.innerHTML = `<input type="checkbox" data-layer-key="${escapeAttribute(def.key)}" checked>
      <span class="legend-dot" style="background:${escapeAttribute(def.color)}"></span>
      <span>${escapeHtml(def.label)}</span>`;
    els.layerToggleList.appendChild(row);
  }
  els.layerToggleList.querySelectorAll('input[data-layer-key]').forEach((input) => {
    input.addEventListener('change', () => {
      model.layerState.set(input.dataset.layerKey, input.checked);
      updateOverlays();
    });
  });
}

function renderLegend() {
  const items = [{ type: 'dot', label: 'State summary', color: BUILTIN_BUCKETS.state_summary.color }];
  for (const def of model.layerDefs.values()) items.push({ type: 'dot', label: def.label, color: def.color });
  if (model.trails?.features?.length) items.push({ type: 'line', label: 'Trail overlay', color: BUILTIN_BUCKETS.trail.color });
  items.push({ type: 'dot', label: 'Draft site', color: BUILTIN_BUCKETS.draft.color });
  els.legendList.innerHTML = items.map((item) => `<div class="legend-item">${item.type === 'line' ? `<span class="legend-line" style="border-top-color:${escapeAttribute(item.color)}"></span>` : `<span class="legend-dot" style="background:${escapeAttribute(item.color)}"></span>`}<span>${escapeHtml(item.label)}</span></div>`).join('');
}

function syncTrailUi() {
  const hasTrails = Boolean(model.trails?.features?.length);
  els.trailSection.hidden = !hasTrails;
  els.trailStatusText.textContent = hasTrails ? 'Labeled trail overlay loaded.' : 'No trail overlay loaded.';
}

function getPaddedBounds(bounds, factor = STATE_PADDING_FACTOR) {
  const [[minLng, minLat], [maxLng, maxLat]] = bounds;
  const latPad = (maxLat - minLat || 0.25) * factor;
  const lngPad = (maxLng - minLng || 0.25) * factor;
  return [[minLng - lngPad, minLat - latPad], [maxLng + lngPad, maxLat + latPad]];
}

function boundsContainBounds(outer, inner) {
  return outer[0][0] <= inner[0][0] && outer[0][1] <= inner[0][1] && outer[1][0] >= inner[1][0] && outer[1][1] >= inner[1][1];
}

function focusedOnSingleState() {
  if (!model.map) return null;
  const b = model.map.getBounds();
  const viewBounds = [[b.getWest(), b.getSouth()], [b.getEast(), b.getNorth()]];
  for (const [state, bounds] of model.stateBBoxes.entries()) {
    if (boundsContainBounds(getPaddedBounds(bounds), viewBounds)) return state;
  }
  return null;
}

function visibleStatesInViewport() {
  if (!model.map) return [];
  const bounds = model.map.getBounds();
  const states = new Set();
  for (const site of enabledSites()) {
    if (bounds.contains(site.lngLat)) states.add(site.state);
  }
  return [...states];
}

function shouldShowSiteDetails() {
  if (!model.map) return false;
  const zoom = model.map.getZoom();
  if (zoom >= DETAIL_ZOOM) return true;
  if (Boolean(focusedOnSingleState())) return true;
  const bounds = model.map.getBounds();
  const lngSpan = Math.abs(bounds.getEast() - bounds.getWest());
  const latSpan = Math.abs(bounds.getNorth() - bounds.getSouth());
  const visibleStates = visibleStatesInViewport();
  if (visibleStates.length <= 1 && lngSpan <= 12 && latSpan <= 8) return true;
  if (visibleStates.length <= 2 && zoom >= (DETAIL_ZOOM - 0.8)) return true;
  return false;
}

function enabledSites() {
  return model.sites.filter((site) => model.layerState.get(site.layerKey) !== false);
}

function buildSiteGeoJson() {
  return { type: 'FeatureCollection', features: enabledSites().map((site) => site.feature) };
}

function buildStateSummaryGeoJson() {
  const grouped = new Map();
  for (const site of enabledSites()) {
    if (!grouped.has(site.state)) grouped.set(site.state, []);
    grouped.get(site.state).push(site);
  }
  return {
    type: 'FeatureCollection',
    features: [...grouped.entries()].map(([state, sites]) => {
      const centroid = model.stateSummaryByState.get(state)?.geometry?.coordinates || [sites[0].lngLat[0], sites[0].lngLat[1]];
      return { type: 'Feature', properties: { state, count: sites.length }, geometry: { type: 'Point', coordinates: centroid } };
    })
  };
}

function buildTrailLabelGeoJson() {
  if (!model.trails?.features?.length) return { type: 'FeatureCollection', features: [] };
  const feats = model.trails.features.flatMap((f, idx) => {
    const geom = f.geometry;
    if (!geom) return [];
    const name = f.properties?.name || f.properties?.title || `Trail ${idx + 1}`;
    if (geom.type === 'LineString' && geom.coordinates.length) {
      const mid = geom.coordinates[Math.floor(geom.coordinates.length / 2)];
      return [{ type: 'Feature', properties: { name }, geometry: { type: 'Point', coordinates: mid } }];
    }
    if (geom.type === 'MultiLineString' && geom.coordinates.length && geom.coordinates[0].length) {
      const line = geom.coordinates[0];
      const mid = line[Math.floor(line.length / 2)];
      return [{ type: 'Feature', properties: { name }, geometry: { type: 'Point', coordinates: mid } }];
    }
    return [];
  });
  return { type: 'FeatureCollection', features: feats };
}

function stateCircleRadiusExpression() {
  return ['interpolate', ['linear'], ['get', 'count'], 1, 16, 10, 20, 25, 26, 50, 32, 100, 38];
}

function mapStyleForMode() {
  if (model.mapStyleMode === 'satellite' && model.hasApiKey) return maptilersdk.MapStyle.SATELLITE;
  if (model.mapStyleMode === 'outdoor' && model.hasApiKey) return maptilersdk.MapStyle.OUTDOOR;
  return {
    version: 8,
    sources: {
      osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' }
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
  };
}

function popupHtmlForSite(props) {
  const parts = [];
  if (props.access) parts.push(`<div><strong>Access:</strong> ${escapeHtml(props.access)}</div>`);
  if (props.cost) parts.push(`<div><strong>Cost:</strong> ${escapeHtml(props.cost)}</div>`);
  if (props.showers) parts.push(`<div><strong>Showers:</strong> ${escapeHtml(props.showers)}</div>`);
  if (props.description) parts.push(`<div>${escapeHtml(props.description)}</div>`);
  return `<div class="popup-content"><div class="popup-title">${escapeHtml(props.name)}</div><div class="popup-meta">${escapeHtml(props.state)} · ${escapeHtml(props.layerLabel)}</div>${parts.join('')}<div class="popup-actions"><a href="${escapeAttribute(props.navigateUrl)}" target="_blank" rel="noopener noreferrer">Navigate</a>${props.website ? `<a href="${escapeAttribute(props.website)}" target="_blank" rel="noopener noreferrer">Website</a>` : ''}</div></div>`;
}

function popupHtmlForState(props) {
  const counts = {};
  for (const site of enabledSites().filter((s) => s.state === props.state)) counts[site.layerKey] = (counts[site.layerKey] || 0) + 1;
  const topCounts = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([layerKey,count]) => `<div>${escapeHtml(model.layerDefs.get(layerKey)?.label || layerKey)}: ${count}</div>`).join('');
  return `<div class="popup-content"><div class="popup-title">${escapeHtml(props.state)}</div><div class="popup-meta">${props.count} enabled campsite point${props.count === 1 ? '' : 's'} in this state</div>${topCounts || '<div>No enabled layers in this state.</div>'}<div class="popup-actions"><button type="button" id="zoomStateBtn">Zoom to state</button></div></div>`;
}

function popupHtmlForDraft(feature) {
  const [lng, lat] = feature.geometry.coordinates;
  const snippet = JSON.stringify({ name: 'New site', category: 'boondocking', state: '', lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), notes: '' }, null, 2);
  return `<div class="popup-content"><div class="popup-title">Draft site pin</div><div class="popup-meta">${lat.toFixed(6)}, ${lng.toFixed(6)}</div><div>Copy this into your dataset:</div><pre style="white-space:pre-wrap;max-width:280px;">${escapeHtml(snippet)}</pre><div class="popup-actions"><button type="button" id="copyDraftBtn">Copy JSON</button></div></div>`;
}

function attachPopupHandlers() {
  model.map.on('click', 'sites-circles', (event) => {
    const feature = event.features?.[0];
    if (!feature) return;
    new maptilersdk.Popup({ closeButton: true, maxWidth: '340px' })
      .setLngLat(feature.geometry.coordinates)
      .setHTML(popupHtmlForSite(feature.properties))
      .addTo(model.map);
  });

  model.map.on('click', 'state-summary-circles', (event) => {
    const feature = event.features?.[0];
    if (!feature) return;
    const popup = new maptilersdk.Popup({ closeButton: true, maxWidth: '320px' })
      .setLngLat(feature.geometry.coordinates)
      .setHTML(popupHtmlForState(feature.properties))
      .addTo(model.map);
    popup.on('open', () => {
      const btn = popup.getElement().querySelector('#zoomStateBtn');
      btn?.addEventListener('click', () => {
        const bounds = model.stateBBoxes.get(feature.properties.state);
        if (bounds) model.map.fitBounds(bounds, { padding: 40, duration: 700 });
      }, { once: true });
    });
  });

  model.map.on('click', 'draft-circle', (event) => {
    const feature = event.features?.[0];
    if (!feature) return;
    const popup = new maptilersdk.Popup({ closeButton: true, maxWidth: '360px' })
      .setLngLat(feature.geometry.coordinates)
      .setHTML(popupHtmlForDraft(feature))
      .addTo(model.map);
    popup.on('open', () => {
      const btn = popup.getElement().querySelector('#copyDraftBtn');
      btn?.addEventListener('click', async () => {
        const [lng, lat] = feature.geometry.coordinates;
        const text = JSON.stringify({ name: 'New site', category: 'boondocking', state: '', lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), notes: '' }, null, 2);
        try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; } catch { btn.textContent = 'Copy failed'; }
      }, { once: true });
    });
  });

  if (model.trails?.features?.length) {
    model.map.on('click', 'trails-line', (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const coords = event.lngLat;
      const p = feature.properties || {};
      new maptilersdk.Popup({ closeButton: true, maxWidth: '320px' })
        .setLngLat([coords.lng, coords.lat])
        .setHTML(`<div class="popup-content"><div class="popup-title">${escapeHtml(p.name || p.title || 'Trail')}</div><div class="popup-meta">${escapeHtml(p.note || p.description || 'Trail overlay')}</div>${p.url ? `<div><a href="${escapeAttribute(p.url)}" target="_blank" rel="noopener noreferrer">More info</a></div>` : ''}</div>`)
        .addTo(model.map);
    });
  }
}

function ensureSource(id, sourceDef) {
  const existing = model.map.getSource(id);
  if (!existing) {
    model.map.addSource(id, sourceDef);
    return model.map.getSource(id);
  }
  if (sourceDef.data && existing.setData) existing.setData(sourceDef.data);
  return existing;
}

function addLayerIfMissing(layerDef, beforeId) {
  if (!model.map.getLayer(layerDef.id)) model.map.addLayer(layerDef, beforeId);
}

function moveOverlayLayersToTop() {
  const order = ['trails-line', 'state-summary-circles', 'state-summary-labels', 'sites-circles', 'draft-circle', 'draft-label', 'trails-labels'];
  for (const id of order) {
    if (model.map.getLayer(id)) {
      try { model.map.moveLayer(id); } catch {}
    }
  }
}

function firstLabelLayerId() {
  const layers = model.map.getStyle()?.layers || [];
  const label = layers.find((layer) => layer.type === 'symbol' && layer.layout && layer.layout['text-field']);
  return label?.id;
}

function applyOverlaySourcesAndLayers() {
  const beforeId = firstLabelLayerId();
  ensureSource('sites', { type: 'geojson', data: buildSiteGeoJson() });
  ensureSource('state-summaries', { type: 'geojson', data: buildStateSummaryGeoJson() });
  ensureSource('draft-site', { type: 'geojson', data: model.draftFeature ? { type: 'FeatureCollection', features: [model.draftFeature] } : { type: 'FeatureCollection', features: [] } });
  if (model.trails?.features?.length) {
    ensureSource('trails', { type: 'geojson', data: model.trails });
    ensureSource('trail-labels', { type: 'geojson', data: buildTrailLabelGeoJson() });
  }

  addLayerIfMissing({
    id: 'trails-line', type: 'line', source: 'trails', layout: { visibility: 'none' }, paint: { 'line-color': BUILTIN_BUCKETS.trail.color, 'line-width': 3.5, 'line-opacity': 0.9 }
  }, beforeId);
  addLayerIfMissing({
    id: 'trails-labels', type: 'symbol', source: 'trail-labels', layout: { visibility: 'none', 'text-field': ['get', 'name'], 'text-size': 13, 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'] }, paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.85)', 'text-halo-width': 1.8 }
  });

  addLayerIfMissing({
    id: 'state-summary-circles', type: 'circle', source: 'state-summaries',
    paint: {
      'circle-radius': stateCircleRadiusExpression(),
      'circle-color': BUILTIN_BUCKETS.state_summary.color,
      'circle-opacity': 0.9,
      'circle-pitch-alignment': 'viewport',
      'circle-pitch-scale': 'viewport',
      'circle-emissive-strength': 1,
      'circle-stroke-color': '#121212',
      'circle-stroke-width': 1.4
    }
  }, beforeId);
  addLayerIfMissing({
    id: 'state-summary-labels', type: 'symbol', source: 'state-summaries',
    layout: { 'text-field': ['concat', ['get', 'state'], ' · ', ['to-string', ['get', 'count']]], 'text-size': 13, 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'], 'text-offset': [0, 0] },
    paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.85)', 'text-halo-width': 1.8 }
  });

  addLayerIfMissing({
    id: 'sites-circles', type: 'circle', source: 'sites',
    paint: {
      'circle-radius': ['coalesce', ['get', 'radius'], 11],
      'circle-color': ['get', 'color'],
      'circle-opacity': 0.96,
      'circle-pitch-alignment': 'viewport',
      'circle-pitch-scale': 'viewport',
      'circle-emissive-strength': 1,
      'circle-stroke-color': '#101010',
      'circle-stroke-width': 1.3
    }
  }, beforeId);

  addLayerIfMissing({
    id: 'draft-circle', type: 'circle', source: 'draft-site',
    paint: { 'circle-radius': BUILTIN_BUCKETS.draft.radius, 'circle-color': BUILTIN_BUCKETS.draft.color, 'circle-stroke-color': '#101010', 'circle-stroke-width': 1.3 }
  }, beforeId);
  addLayerIfMissing({
    id: 'draft-label', type: 'symbol', source: 'draft-site',
    layout: { 'text-field': 'Draft site', 'text-size': 12, 'text-offset': [0, 1.5] },
    paint: { 'text-color': '#101010', 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 }
  });

  attachCursorStates();
  moveOverlayLayersToTop();
}

function attachCursorStates() {
  ['sites-circles', 'state-summary-circles', 'trails-line', 'draft-circle'].forEach((layerId) => {
    if (!model.map.getLayer(layerId)) return;
    model.map.on('mouseenter', layerId, () => { model.map.getCanvas().style.cursor = 'pointer'; });
    model.map.on('mouseleave', layerId, () => { model.map.getCanvas().style.cursor = ''; });
  });
}

function sourceDataForSites() {
  const fc = buildSiteGeoJson();
  fc.features = fc.features.map((f) => {
    const def = model.layerDefs.get(f.properties.layerKey) || BUILTIN_BUCKETS.other;
    return { ...f, properties: { ...f.properties, color: def.color, radius: def.radius || 9 } };
  });
  return fc;
}

function updateOverlays() {
  if (!model.map || !model.styleReady) return;
  const sitesSource = model.map.getSource('sites');
  if (sitesSource?.setData) sitesSource.setData(sourceDataForSites());
  const stateSource = model.map.getSource('state-summaries');
  if (stateSource?.setData) stateSource.setData(buildStateSummaryGeoJson());
  const draftSource = model.map.getSource('draft-site');
  if (draftSource?.setData) draftSource.setData(model.draftFeature ? { type: 'FeatureCollection', features: [model.draftFeature] } : { type: 'FeatureCollection', features: [] });
  const trailsSource = model.map.getSource('trails');
  if (trailsSource?.setData && model.trails?.features?.length) trailsSource.setData(model.trails);
  const trailLabelsSource = model.map.getSource('trail-labels');
  if (trailLabelsSource?.setData && model.trails?.features?.length) trailLabelsSource.setData(buildTrailLabelGeoJson());

  const showDetails = shouldShowSiteDetails();
  const forceStateSummaries = !showDetails && enabledSites().length > 0;
  setLayerVisibility('sites-circles', els.toggleSitePoints.checked && showDetails);
  setLayerVisibility('state-summary-circles', forceStateSummaries || (els.toggleStateSummaries.checked && !showDetails));
  setLayerVisibility('state-summary-labels', !showDetails && els.toggleStateSummaries.checked);
  const showTrails = !els.trailSection.hidden && els.toggleTrails.checked;
  setLayerVisibility('trails-line', showTrails);
  setLayerVisibility('trails-labels', showTrails);
  setLayerVisibility('draft-circle', Boolean(model.draftFeature));
  setLayerVisibility('draft-label', Boolean(model.draftFeature));
  updateCounts();
}

function setLayerVisibility(layerId, visible) {
  if (model.map.getLayer(layerId)) model.map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
}

function updateCounts() {
  if (!model.map) return;
  const mode = shouldShowSiteDetails() ? 'individual sites' : 'state summaries';
  const focusedState = focusedOnSingleState();
  const visibleByLayer = {};
  let visibleSites = 0;
  const bounds = model.map.getBounds();
  for (const site of enabledSites()) {
    if (shouldShowSiteDetails() && bounds.contains(site.lngLat)) {
      visibleSites += 1;
      visibleByLayer[site.layerKey] = (visibleByLayer[site.layerKey] || 0) + 1;
    }
  }
  const grouped = new Set(enabledSites().map((s) => s.state));
  const cards = [...model.layerDefs.values()].slice(0, 8).map((def) => `<div class="count-card"><strong>${visibleByLayer[def.key] || 0}</strong><span>${escapeHtml(def.label)}</span></div>`).join('');
  const siteSource = model.map.getSource('sites');
  const summarySource = model.map.getSource('state-summaries');
  const debugCards = `
    <div class="count-card"><strong>${model.sites.length}</strong><span>Loaded campsite records</span></div>
    <div class="count-card"><strong>${model.layerDefs.size}</strong><span>Detected campsite layers</span></div>
    <div class="count-card"><strong>${siteSource ? 'yes' : 'no'}</strong><span>Sites source on map</span></div>
    <div class="count-card"><strong>${summarySource ? 'yes' : 'no'}</strong><span>State summary source on map</span></div>`;
  els.countsGrid.innerHTML = `<div class="count-card"><strong>${mode}</strong><span>${focusedState ? `Focused on ${escapeHtml(focusedState)}` : 'Never fewer than one summary point per state when zoomed out'}</span></div><div class="count-card"><strong>${visibleSites}</strong><span>${shouldShowSiteDetails() ? 'Visible site points' : 'Visible site points hidden while summarized'}</span></div><div class="count-card"><strong>${shouldShowSiteDetails() ? 0 : grouped.size}</strong><span>Visible state summaries</span></div><div class="count-card"><strong>${enabledSites().length}</strong><span>Enabled sites total</span></div>${debugCards}${cards}`;
}

function setDraftAt(lngLat) {
  model.draftFeature = { type: 'Feature', properties: { name: 'Draft site' }, geometry: { type: 'Point', coordinates: [lngLat.lng, lngLat.lat] } };
  updateOverlays();
  new maptilersdk.Popup({ closeButton: true, maxWidth: '360px' }).setLngLat([lngLat.lng, lngLat.lat]).setHTML(popupHtmlForDraft(model.draftFeature)).addTo(model.map);
}

function setApiKeyUi() {
  const key = getSavedApiKey();
  els.apiKeyInput.value = key;
  model.hasApiKey = Boolean(key);
}

function describeAttempts(attempts) {
  if (!attempts?.length) return 'No URLs tried yet.';
  return attempts.map((attempt) => `${attempt.url} → ${attempt.ok ? 'OK' : (attempt.reason || attempt.status || 'failed')}`).join(' | ');
}

function refreshStatusText() {
  const siteMsg = model.dataLoad.loadingSites
    ? `Loading campsite data… trying ${SITE_DATA_URLS.join(', ')}`
    : model.sites.length
      ? `Loaded ${model.sites.length} campsites across ${model.layerDefs.size} detected layer${model.layerDefs.size === 1 ? '' : 's'} from ${model.dataLoad.sitesUrl || 'an unknown file'}.`
      : `No campsite records loaded. Tried: ${describeAttempts(model.dataLoad.sitesAttempted)}`;

  const trailMsg = model.dataLoad.loadingTrails
    ? ' Loading trail data…'
    : model.trails?.features?.length
      ? ` Trail overlay loaded from ${model.dataLoad.trailsUrl || 'trail file'}.`
      : model.dataLoad.trailsAttempted.length
        ? ` Trail overlay missing. Tried: ${describeAttempts(model.dataLoad.trailsAttempted)}`
        : '';

  const basemapLabel = model.mapStyleMode === 'satellite'
    ? 'Satellite'
    : model.mapStyleMode === 'outdoor'
      ? 'Outdoor'
      : 'OSM fallback';

  const mapMsg = model.hasApiKey
    ? ` Basemap: ${basemapLabel}${model.terrainEnabled ? ' with 3D terrain' : ''}${model.tiltEnabled ? ' and tilt' : ''}.`
    : ' Using OpenStreetMap fallback until you add a MapTiler API key.';

  els.statusText.textContent = `${siteMsg}${mapMsg}${trailMsg}`;
}

function bindUi() {
  els.menuToggle.addEventListener('click', () => els.menuPanel.classList.toggle('is-collapsed'));
  els.closeMenu.addEventListener('click', () => els.menuPanel.classList.add('is-collapsed'));
  els.toggleStateSummaries.addEventListener('change', updateOverlays);
  els.toggleSitePoints.addEventListener('change', updateOverlays);
  els.toggleTrails?.addEventListener('change', updateOverlays);
  els.toggleAddMode.addEventListener('change', () => { model.addMode = els.toggleAddMode.checked; });
  els.basemapSelect.value = model.mapStyleMode;
  els.basemapSelect.addEventListener('change', async () => {
    model.mapStyleMode = els.basemapSelect.value;
    localStorage.setItem(STORAGE_KEYS.basemap, model.mapStyleMode);
    await rebuildMapStyle();
  });
  els.toggleTerrain.checked = model.terrainEnabled;
  els.toggleTerrain.addEventListener('change', async () => {
    model.terrainEnabled = els.toggleTerrain.checked;
    localStorage.setItem(STORAGE_KEYS.terrain, String(model.terrainEnabled));
    await rebuildMapStyle();
  });
  els.togglePitch.checked = model.tiltEnabled;
  els.togglePitch.addEventListener('change', () => {
    model.tiltEnabled = els.togglePitch.checked;
    localStorage.setItem(STORAGE_KEYS.tilt, String(model.tiltEnabled));
    applyPitch();
  });
  els.saveKeyBtn.addEventListener('click', async () => {
    localStorage.setItem(STORAGE_KEYS.apiKey, els.apiKeyInput.value.trim());
    setApiKeyUi();
    els.saveKeyBtn.disabled = true;
    const previousText = els.saveKeyBtn.textContent;
    els.saveKeyBtn.textContent = 'Saving…';
    refreshStatusText();
    await rebuildMapStyle();
    els.saveKeyBtn.textContent = 'Saved';
    window.setTimeout(() => {
      els.saveKeyBtn.textContent = previousText;
      els.saveKeyBtn.disabled = false;
    }, 900);
  });
  els.clearKeyBtn.addEventListener('click', async () => {
    localStorage.removeItem(STORAGE_KEYS.apiKey);
    setApiKeyUi();
    refreshStatusText();
    await rebuildMapStyle();
  });
}

function setRotationInteractions() {
  if (!model.map) return;
  try { model.map.dragRotate?.enable(); } catch {}
  try { model.map.touchZoomRotate?.enable(); } catch {}
  try { model.map.touchZoomRotate?.enableRotation(); } catch {}
  try { model.map.touchPitch?.enable(); } catch {}
}

function applyPitch() {
  if (!model.map) return;
  const wants3dView = model.hasApiKey && model.terrainEnabled && model.tiltEnabled;
  const currentBearing = Number.isFinite(model.map.getBearing?.()) ? model.map.getBearing() : 0;
  model.map.easeTo({ pitch: wants3dView ? 65 : 0, bearing: currentBearing, duration: 500 });
  setRotationInteractions();
}

async function rebuildMapStyle() {
  if (!model.map) return;
  const center = model.map.getCenter();
  const zoom = model.map.getZoom();
  const pitch = model.map.getPitch();
  const bearing = model.map.getBearing();
  model.styleReady = false;
  if (model.hasApiKey) {
    maptilersdk.config.apiKey = getSavedApiKey();
  }
  model.map.setStyle(mapStyleForMode());
  model.map.once('style.load', () => {
    model.styleReady = true;
    if (model.hasApiKey && model.terrainEnabled && model.mapStyleMode !== 'osm') {
      try { model.map.enableTerrain(); } catch {}
    }
    applyOverlaySourcesAndLayers();
    attachPopupHandlers();
    model.map.jumpTo({ center, zoom, pitch, bearing });
    setRotationInteractions();
    applyPitch();
    updateOverlays();
    refreshStatusText();
  });
}

function initMap() {
  setApiKeyUi();
  if (model.hasApiKey) maptilersdk.config.apiKey = getSavedApiKey();
  model.map = new maptilersdk.Map({
    container: 'map',
    style: mapStyleForMode(),
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    terrain: false,
    hash: false,
    antialias: true,
    maxPitch: 85,
    dragRotate: true,
    touchZoomRotate: true,
    touchPitch: true
  });
  model.map.addControl(new maptilersdk.NavigationControl({ visualizePitch: true }), 'bottom-right');
  model.map.addControl(new maptilersdk.ScaleControl({ unit: 'imperial' }), 'bottom-left');

  model.map.on('style.load', () => {
    model.styleReady = true;
    if (model.hasApiKey && model.terrainEnabled && model.mapStyleMode !== 'osm') {
      try { model.map.enableTerrain(); } catch {}
    }
    applyOverlaySourcesAndLayers();
    attachPopupHandlers();
    setRotationInteractions();
    applyPitch();
    updateOverlays();
    refreshStatusText();
  });
  model.map.on('moveend', updateOverlays);
  model.map.on('zoomend', updateOverlays);

  model.map.on('click', (event) => {
    if (!model.addMode) return;
    setDraftAt(event.lngLat);
    model.addMode = false;
    els.toggleAddMode.checked = false;
  });

  const canvas = () => model.map.getCanvasContainer();
  const cancelLongPress = () => {
    if (model.longPressTimer) window.clearTimeout(model.longPressTimer);
    model.longPressTimer = null;
  };
  canvas().addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) return;
    model.pressMoved = false;
    const touch = event.touches[0];
    model.pressStartPoint = { x: touch.clientX, y: touch.clientY };
    cancelLongPress();
    model.longPressTimer = window.setTimeout(() => {
      const lngLat = model.map.unproject([touch.clientX, touch.clientY]);
      setDraftAt(lngLat);
    }, LONG_PRESS_MS);
  }, { passive: true });
  canvas().addEventListener('touchmove', (event) => {
    if (!model.pressStartPoint || !event.touches.length) return;
    const touch = event.touches[0];
    const dx = touch.clientX - model.pressStartPoint.x;
    const dy = touch.clientY - model.pressStartPoint.y;
    if (Math.hypot(dx, dy) > 12) {
      model.pressMoved = true;
      cancelLongPress();
    }
  }, { passive: true });
  canvas().addEventListener('touchend', cancelLongPress, { passive: true });
  canvas().addEventListener('touchcancel', cancelLongPress, { passive: true });
}

async function main() {
  bindUi();
  initMap();
  window.campingMapDebug = {
    model,
    reloadData: loadData,
    forceOverlayRefresh: updateOverlays
  };
  refreshStatusText();
  loadData().catch((error) => {
    console.error(error);
    els.statusText.textContent = 'Map loaded, but campsite data is still not coming in. Check your data file path and network.';
  });
}

main().catch((error) => {
  console.error(error);
  els.statusText.textContent = 'Something tripped during load. The build may still be partly usable, but check your data files and the browser console.';
});
