const VERSION = 'v19.4';
const SITE_DATA_URLS = ['data/sites.json', 'data/site-data.json', 'data/campgrounds.json', 'sites.json'];
const EXTRA_SITE_DATA_URLS = ['data/sites-additions-v18.5.json', 'data/sites-additions-v18.7.json', 'data/sites-additions-v18.8.json', 'data/sites-additions-v18.9.json', 'data/sites-additions-v19.0.json'];
const TRAIL_GEOJSON_URLS = [];
const TRAIL_VECTOR_MANIFEST_URLS = [];
const DEFAULT_CENTER = [-87.4, 46.6];
const DEFAULT_ZOOM = 6;
const DETAIL_ZOOM = 5.2;
const TRAIL_MAJOR_MIN_ZOOM = 10;
const TRAIL_ALL_MIN_ZOOM = 12;
const TRAIL_LABEL_MIN_ZOOM = 12;
const STATE_PADDING_FACTOR = 0.18;
const LONG_PRESS_MS = 700;
const STORAGE_KEYS = {
  apiKey: 'campingMap.maptilerApiKey',
  basemap: 'campingMap.basemap',
  terrain: 'campingMap.terrain',
  tilt: 'campingMap.pitch'
};
const BUILTIN_BUCKETS = {
  modern: { label: 'Modern', color: '#8fcf63', radius: 15 },
  rustic: { label: 'Rustic', color: '#8fcf63', radius: 15 },
  boondocking: { label: 'Boondocking / dispersed', color: '#3ea84a', radius: 15 },
  private: { label: 'Private campgrounds', color: '#55b9ff', radius: 15 },
  federal: { label: 'Federal campgrounds', color: '#8b4e24', radius: 15 },
  state: { label: 'State campgrounds', color: '#8fcf63', radius: 15 },
  local: { label: 'Local campgrounds', color: '#d96a16', radius: 15 },
  national_forest: { label: 'National forest campgrounds', color: '#8b4e24', radius: 15 },
  state_federal_modern: { label: 'State / federal modern campgrounds', color: '#8fcf63', radius: 15 },
  state_federal_rustic: { label: 'State / federal rustic campgrounds', color: '#8fcf63', radius: 15 },
  state_local: { label: 'State / local campgrounds', color: '#d96a16', radius: 15 },
  trailhead: { label: 'Trailheads', color: '#d1b24a', radius: 15 },
  info: { label: 'Info / reference', color: '#e0c43c', radius: 15 },
  other: { label: 'Other campsites', color: '#8f8a72', radius: 15 },
  state_summary: { label: 'State summary', color: '#5b4127', radius: 26 },
  trail: { label: 'Trail', color: '#c56c1d', radius: 0 },
  draft: { label: 'Draft site', color: '#d3a343', radius: 11 }
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
  keySection: document.getElementById('keySection'),
  revealKeySectionBtn: document.getElementById('revealKeySectionBtn'),
  basemapSelect: document.getElementById('basemapSelect'),
  toggleTerrain: document.getElementById('toggleTerrain'),
  togglePitch: document.getElementById('togglePitch'),
  toggleAddMode: document.getElementById('toggleAddMode'),
  zoomReadout: document.getElementById('zoomReadout')
};
els.versionTag.textContent = VERSION;
if (els.toggleStateSummaries) els.toggleStateSummaries.checked = true;

const model = {
  map: null,
  sites: [],
  trails: null,
  trailSourceMode: 'none',
  trailVectorConfig: null,
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
  domMarkers: [],
  summaryDomMarkers: [],
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


function ensureBasemapOptions() {
  if (!els.basemapSelect) return;
  const wanted = [
    ['outdoor', 'Outdoor'],
    ['satellite', 'Satellite'],
    ['topo', 'Topo'],
    ['osm', 'OpenStreetMap fallback']
  ];
  for (const [value, label] of wanted) {
    if (![...els.basemapSelect.options].some((opt) => opt.value === value)) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      els.basemapSelect.appendChild(opt);
    }
  }
}

function classifyTrailCategory(input = {}) {
  const values = listAllValues(input).join(' ').toLowerCase();
  const primaryName = String(input.name || input.title || '').toLowerCase();
  if (values.includes('north country trail') || values.includes('iron ore heritage trail') || values.includes('long-distance') || values.includes('long distance') || values.includes('regional trail') || values.includes('rail trail') || values.includes('heritage trail') || /\bnct\b/.test(values)) return 'long_distance';
  if (values.includes('private')) return 'private';
  if (values.includes('county') || values.includes('municipal') || values.includes('city') || values.includes('township') || values.includes('local park')) return 'local';
  if (values.includes('national park') || values.includes('national lakeshore') || values.includes('national forest') || values.includes('federal') || values.includes('usfs') || values.includes('nps') || values.includes('corps of engineers')) return 'federal';
  if (values.includes('state park') || values.includes('state recreation area') || values.includes('dnr') || values.includes('michigan state park') || values.includes('state trail') || values.includes('state forest')) return 'state';
  if (values.includes('boondock') || values.includes('dispersed')) return 'boondocking';
  if (values.includes('conservancy') || values.includes('nature conservancy') || values.includes('audubon') || values.includes('sanctuary')) return 'local';
  if (primaryName.includes('north country trail') || primaryName.includes('iron ore heritage trail')) return 'long_distance';
  return 'state';
}

function trailColorForCategory(category) {
  switch (category) {
    case 'long_distance': return '#ff7a00';
    case 'federal': return BUILTIN_BUCKETS.federal.color;
    case 'state': return BUILTIN_BUCKETS.state.color;
    case 'local': return BUILTIN_BUCKETS.local.color;
    case 'private': return BUILTIN_BUCKETS.private.color;
    case 'boondocking': return BUILTIN_BUCKETS.boondocking.color;
    default: return '#c5d2cc';
  }
}

function trailWidthForCategory(category) {
  return category === 'long_distance' ? 4.2 : 2.4;
}

function normalizeTrailFeature(feature, idx = 0) {
  const normalized = { ...feature, properties: { ...(feature.properties || {}) } };
  const category = classifyTrailCategory(normalized.properties);
  normalized.properties.id = normalized.properties.id || `trail-${idx + 1}`;
  normalized.properties.name = normalized.properties.name || normalized.properties.title || `Trail ${idx + 1}`;
  normalized.properties.trailCategory = normalized.properties.trailCategory || category;
  normalized.properties.color = normalized.properties.color || trailColorForCategory(normalized.properties.trailCategory);
  normalized.properties.lineWidth = Number.isFinite(Number(normalized.properties.lineWidth)) ? Number(normalized.properties.lineWidth) : trailWidthForCategory(normalized.properties.trailCategory);
  return normalized;
}

async function loadTrailData() {
  model.trails = null;
  model.trailSourceMode = 'none';
  model.trailVectorConfig = null;
}


function trailSourceLoaded() {
  return false;
}


function trailSourceLayerName() {
  return model.trailVectorConfig?.sourceLayer || 'trails';
}

function trailLineSourceDef() {
  if (model.trailSourceMode === 'vector' && model.trailVectorConfig?.tiles?.length) {
    return {
      type: 'vector',
      tiles: model.trailVectorConfig.tiles,
      minzoom: model.trailVectorConfig.minzoom ?? 0,
      maxzoom: model.trailVectorConfig.maxzoom ?? 14
    };
  }
  return { type: 'geojson', data: model.trails || { type: 'FeatureCollection', features: [] } };
}

function trailLinePaint() {
  return {
    'line-color': ['coalesce', ['get', 'color'], ['match', ['get', 'trailCategory'], 'long_distance', '#ff7a00', 'federal', '#1f8a70', 'state', '#2a7fff', 'local', '#8e5bd6', 'private', '#cf4f7d', 'boondocking', '#3f8c53', '#c5d2cc']],
    'line-width': ['interpolate', ['linear'], ['zoom'], 10, ['coalesce', ['get', 'lineWidth'], 2], 14, ['*', ['coalesce', ['get', 'lineWidth'], 2], 1.2]],
    'line-opacity': 0.88
  };
}

function trailLabelLayout() {
  return {
    visibility: 'none',
    'symbol-placement': 'line',
    'text-field': ['coalesce', ['get', 'name'], ['get', 'title'], 'Trail'],
    'text-size': 12,
    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
    'symbol-spacing': 450
  };
}

function trailLabelPaint() {
  return {
    'text-color': '#ffffff',
    'text-halo-color': 'rgba(0,0,0,0.85)',
    'text-halo-width': 1.8
  };
}

function trailMajorFilter() {
  return ['==', ['get', 'trailCategory'], 'long_distance'];
}

function trailPopupHtml(properties = {}) {
  const title = properties.name || properties.title || 'Trail';
  const categoryLabel = String(properties.trailCategory || '').replace(/_/g, ' ');
  const desc = properties.note || properties.description || properties.manager || properties.owner || '';
  return `<div class="popup-content"><div class="popup-title">${escapeHtml(title)}</div><div class="popup-meta">${escapeHtml(categoryLabel || 'Trail overlay')}</div>${desc ? `<div>${escapeHtml(desc)}</div>` : ''}${properties.url ? `<div style="margin-top:8px;"><a href="${escapeAttribute(properties.url)}" target="_blank" rel="noopener noreferrer">More info</a></div>` : ''}</div>`;
}

function markerShapeForBucket(bucket) {
  switch (bucket) {
    case 'modern':
    case 'state_federal_modern':
      return 'circle';
    case 'rustic':
    case 'state_federal_rustic':
      return 'rounded-square';
    case 'boondocking':
      return 'diamond';
    case 'national_forest':
      return 'hexagon';
    case 'private':
      return 'pill';
    case 'state_local':
      return 'octagon';
    case 'trailhead':
      return 'triangle';
    default:
      return 'circle';
  }
}

function applyMarkerShape(el, bucket) {
  const shape = markerShapeForBucket(bucket);
  el.style.borderRadius = '50%';
  el.style.clipPath = 'none';
  el.style.transform = 'none';
  if (shape === 'rounded-square') {
    el.style.borderRadius = '26%';
  } else if (shape === 'diamond') {
    el.style.borderRadius = '18%';
    el.style.transform = 'rotate(45deg)';
  } else if (shape === 'hexagon') {
    el.style.clipPath = 'polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0 50%)';
  } else if (shape === 'pill') {
    el.style.borderRadius = '999px';
    const currentWidth = parseFloat(el.style.width || '20');
    el.style.width = `${Math.round(currentWidth * 1.1)}px`;
  } else if (shape === 'octagon') {
    el.style.clipPath = 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)';
  } else if (shape === 'triangle') {
    el.style.clipPath = 'polygon(50% 4%, 96% 88%, 4% 88%)';
    el.style.borderRadius = '0';
  }
  return shape;
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
  const direct = normalizeStateText(getFieldAny(raw, ['state','state_name','stateName','stateAbbr','state_abbr','st','province','province_name','provinceAbbr','region','admin1','stateProvince','State','STATE']));
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
  if (value.includes('info') || value.includes('reference')) return 'info';
  if (value.includes('trailhead') || value.includes('hike in')) return 'trailhead';
  if (value.includes('private') && value.includes('camp')) return 'private';
  if ((value.includes('federal') || value.includes('national park') || value.includes('national forest') || value.includes('forest service') || value.includes('nps') || value.includes('usfs')) && value.includes('camp')) return 'federal';
  if ((value.includes('state') || value.includes('dnr')) && value.includes('camp')) return 'state';
  if ((value.includes('county') || value.includes('local') || value.includes('municipal') || value.includes('city') || value.includes('town')) && value.includes('camp')) return 'local';
  if (value.includes('national forest')) return 'national_forest';
  if (value.includes('public')) return 'state_local';
  if (value.includes('rustic')) return 'rustic';
  if (value.includes('modern')) return 'modern';
  if (value.includes('private')) return 'private';
  return makeSlug(value) || 'other';
}

function categoryFromText(text, fallback = 'other') {
  const value = String(text || '').toLowerCase();
  if (value.includes('boondock') || value.includes('dispersed')) return 'boondocking';
  if (value.includes('info') || value.includes('reference')) return 'info';
  if (value.includes('trailhead') || value.includes('hike in')) return 'trailhead';
  if (value.includes('private') && value.includes('camp')) return 'private';
  if ((value.includes('federal') || value.includes('national park') || value.includes('national forest') || value.includes('forest service') || value.includes('nps') || value.includes('usfs')) && value.includes('camp')) return 'federal';
  if ((value.includes('state') || value.includes('dnr')) && value.includes('camp')) return 'state';
  if ((value.includes('county') || value.includes('local') || value.includes('municipal') || value.includes('city') || value.includes('town')) && value.includes('camp')) return 'local';
  if (value.includes('national forest')) return 'national_forest';
  if (value.includes('public')) return 'state_local';
  if (value.includes('private')) return 'private';
  if (value.includes('rustic')) return 'rustic';
  if (value.includes('modern')) return 'modern';
  return BUILTIN_BUCKETS[fallback] ? fallback : 'other';
}

function deriveLayerInfo(raw, category) {
  const layerish = raw.layerLabel || raw.layer_name || raw.layerName || raw.layer || raw.mapLayer || raw.group || raw.collection || '';
  const ownerText = cleanLabel(raw.owner || raw.ownership || raw.manager || raw.agency || raw.system || raw.landManager || '').toLowerCase();
  const typeText = cleanLabel(raw.type || raw.kind || raw.category || raw.classification || '').toLowerCase();
  const combined = `${layerish} ${ownerText} ${typeText}`.trim();

  const bucket = categoryFromText(combined, category);
  if (layerish) {
    let label = titleCase(layerish);
    if (bucket === 'state') label = 'State Campgrounds';
    if (bucket === 'federal' || bucket === 'national_forest') label = 'Federal Campgrounds';
    if (bucket === 'local' || bucket === 'state_local') label = 'Local Campgrounds';
    if (bucket === 'private') label = 'Private Campgrounds';
    if (bucket === 'info') label = 'Info / Reference';
    if (bucket === 'trailhead') label = 'Trailheads';
    return { key: makeSlug(label) || `layer-${bucket || category}`, label, bucket };
  }
  if (bucket === 'private') return { key: 'private-campgrounds', label: 'Private Campgrounds', bucket: 'private' };
  if (bucket === 'federal' || bucket === 'national_forest') return { key: 'federal-campgrounds', label: 'Federal Campgrounds', bucket: 'federal' };
  if (bucket === 'state') return { key: 'state-campgrounds', label: 'State Campgrounds', bucket: 'state' };
  if (bucket === 'local' || bucket === 'state_local') return { key: 'local-campgrounds', label: 'Local Campgrounds', bucket: 'local' };
  if (bucket === 'boondocking') return { key: 'boondocking', label: 'Boondocking', bucket: 'boondocking' };
  if (bucket === 'info') return { key: 'info-reference', label: 'Info / Reference', bucket: 'info' };
  if (bucket === 'trailhead') return { key: 'trailheads', label: 'Trailheads', bucket: 'trailhead' };
  if (bucket === 'rustic') return { key: 'rustic-campgrounds', label: 'Rustic Campgrounds', bucket: 'rustic' };
  if (bucket === 'modern') return { key: 'modern-campgrounds', label: 'Modern Campgrounds', bucket: 'modern' };
  return { key: bucket ? `${makeSlug(bucket)}-sites` : 'other-sites', label: bucket ? `${titleCase(bucket)} Sites` : 'Other Campsites', bucket: bucket || 'other' };
}

function bucketSymbol(bucket) {
  switch (bucket) {
    case 'boondocking':
    case 'national_forest':
      return 'tree';
    case 'federal':
      return 'arrowhead';
    case 'state':
    case 'modern':
    case 'rustic':
      return 'tent';
    case 'local':
    case 'state_local':
      return 'campfire';
    case 'private':
      return 'camper';
    case 'info':
      return 'info';
    case 'trailhead':
      return 'trail';
    default:
      return 'tent';
  }
}

function symbolSvg(symbol, color = 'currentColor') {
  const fill = color;
  const dark = '#2b1d12';
  const light = '#fff3d8';
  switch (symbol) {
    case 'tree':
      return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6 18 24h8L15 39h10l-6 11h26l-6-11h10L38 24h8L32 6Z" fill="${fill}" stroke="${dark}" stroke-width="2.6" stroke-linejoin="round"/><path d="M32 49v9" stroke="${dark}" stroke-width="4" stroke-linecap="round"/></svg>`;
    case 'arrowhead':
      return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6c-9 8-15 21-13 37 5 2 9 6 13 15 4-9 8-13 13-15 2-16-4-29-13-37Z" fill="${fill}" stroke="${dark}" stroke-width="2.6" stroke-linejoin="round"/><path d="M24 25c3 1 5 3 8 6 3-3 5-5 8-6" fill="none" stroke="${light}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M27 35h10" stroke="${light}" stroke-width="3" stroke-linecap="round"/></svg>`;
    case 'tent':
      return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 48 32 14l22 34H10Z" fill="${fill}" stroke="${dark}" stroke-width="2.6" stroke-linejoin="round"/><path d="M32 14v34" stroke="${light}" stroke-width="3" stroke-linecap="round"/><path d="M20 48 32 31l12 17" fill="none" stroke="${light}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case 'campfire':
      return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M27 13c5 7 4 12 1 16-5 5-6 9-6 13 0 8 5 13 10 13s10-5 10-13c0-5-2-10-8-16 2 6-1 9-3 10 0-7-1-14-4-23Z" fill="${fill}" stroke="${dark}" stroke-width="2.6" stroke-linejoin="round"/><path d="M18 49h28" stroke="${dark}" stroke-width="3.2" stroke-linecap="round"/><path d="M22 54 31 45M42 54 33 45" stroke="${light}" stroke-width="3.2" stroke-linecap="round"/></svg>`;
    case 'camper':
      return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 26h34c5 0 10 4 12 9l2 5v8H8Z" fill="${fill}" stroke="${dark}" stroke-width="2.6" stroke-linejoin="round"/><circle cx="22" cy="48" r="5" fill="${light}" stroke="${dark}" stroke-width="2.6"/><circle cx="45" cy="48" r="5" fill="${light}" stroke="${dark}" stroke-width="2.6"/><path d="M15 31h16v10H15Z" fill="${light}" stroke="${dark}" stroke-width="2.2"/><path d="M35 31h8" stroke="${dark}" stroke-width="2.2" stroke-linecap="round"/></svg>`;
    case 'info':
      return `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="22" fill="${fill}" stroke="${dark}" stroke-width="2.6"/><path d="M32 27v17" stroke="${light}" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="19.5" r="3.2" fill="${light}"/></svg>`;
    case 'trail':
      return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 54V18m28 36V18" stroke="${dark}" stroke-width="4" stroke-linecap="round"/><path d="M18 19h17l11 8H29Z" fill="${fill}" stroke="${dark}" stroke-width="3" stroke-linejoin="round"/></svg>`;
    default:
      return `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="18" fill="${fill}" stroke="${dark}" stroke-width="2.6"/></svg>`;
  }
}

function markerPreviewHtml(bucket, color, size = 18) {
  const symbol = bucketSymbol(bucket);
  return `<span class="symbol-preview" style="--preview-size:${size}px;--preview-color:${escapeAttribute(color || '#666')}">${symbolSvg(symbol, escapeAttribute(color || '#666'))}</span>`;
}


function summaryStateForSite(site) {
  const current = normalizeStateText(site?.state || '');
  if (current) return current;
  const raw = site?.raw || {};
  const fromText = deriveState(raw, site?.lngLat);
  return normalizeStateText(fromText) || approximateStateFromLngLat(site?.lngLat) || 'Unknown';
}

function isInfoSite(site) {
  const text = `${site?.category || ''} ${site?.bucket || ''} ${site?.layerLabel || ''}`.toLowerCase();
  return text.includes('info') || text.includes('reference');
}

function isBoondockingSite(site) {
  const text = `${site?.category || ''} ${site?.bucket || ''} ${site?.layerLabel || ''}`.toLowerCase();
  return text.includes('boondock') || text.includes('dispersed');
}

function isCampgroundSite(site) {
  if (isBoondockingSite(site) || isInfoSite(site)) return false;
  const text = `${site?.category || ''} ${site?.bucket || ''} ${site?.layerLabel || ''}`.toLowerCase();
  if (text.includes('trailhead')) return false;
  return true;
}

function summarizeSitesForState(sites = []) {
  const summary = { campgrounds: 0, boondocking: 0, info: 0, total: sites.length };
  for (const site of sites) {
    if (isBoondockingSite(site)) summary.boondocking += 1;
    else if (isInfoSite(site)) summary.info += 1;
    else if (isCampgroundSite(site)) summary.campgrounds += 1;
  }
  return summary;
}

function stateSummaryLabel(props = {}) {
  const state = props.state || '??';
  return `${state} C ${props.campgrounds || 0} · B ${props.boondocking || 0} · I ${props.info || 0}`;
}

function normalizeLngLatPair(a, b) {
  const n1 = Number(a);
  const n2 = Number(b);
  if (!Number.isFinite(n1) || !Number.isFinite(n2)) return null;
  // Standard [lng, lat]
  if (Math.abs(n1) <= 180 && Math.abs(n2) <= 90) return [n1, n2];
  // Swapped [lat, lng]
  if (Math.abs(n2) <= 180 && Math.abs(n1) <= 90) return [n2, n1];
  return null;
}

function getLatLng(raw) {
  const directPairs = [
    raw?.coordinates,
    raw?.geometry?.coordinates,
    [raw.lng ?? raw.lon ?? raw.longitude ?? raw.x, raw.lat ?? raw.latitude ?? raw.y],
    [raw.latLng?.lng, raw.latLng?.lat],
    [raw.location?.lng, raw.location?.lat],
    [raw.location?.lon, raw.location?.lat],
    [raw.coords?.lng, raw.coords?.lat],
    [raw.coords?.lon, raw.coords?.lat],
    [raw.longitude, raw.latitude],
    [raw.latitude, raw.longitude],
    [getFieldAny(raw, ['lngLat','lng_lat','latLng','lat_lng']), null]
  ];

  for (const pair of directPairs) {
    if (!pair) continue;
    if (Array.isArray(pair) && pair.length >= 2) {
      const normalized = normalizeLngLatPair(pair[0], pair[1]);
      if (normalized) return normalized;
    }
  }

  const embedded = getFieldAny(raw, ['coordinates','coord','coords','lngLat','lng_lat','latLng','lat_lng']);
  if (typeof embedded === 'string') {
    const nums = embedded.match(/-?\d+(?:\.\d+)?/g) || [];
    if (nums.length >= 2) {
      const normalized = normalizeLngLatPair(nums[0], nums[1]);
      if (normalized) return normalized;
    }
  }

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
    model.dataLoad[`${target}Attempted`] = [...attempts, { url, ok: false, status: 'trying', reason: 'Trying…' }];
    refreshStatusText();
    const result = await fetchJsonWithTimeout(url, 3500);
    attempts.push({ url: result.url, ok: result.ok, status: result.status, reason: result.reason || '' });
    model.dataLoad[`${target}Attempted`] = [...attempts];
    if (result.ok) {
      model.dataLoad[`${target}Url`] = result.url;
      model.dataLoad[`${target}Error`] = '';
      refreshStatusText();
      return result.json;
    }
    refreshStatusText();
  }
  model.dataLoad[`${target}Url`] = '';
  const failureSummary = attempts.length
    ? attempts.map((attempt) => `${attempt.url}: ${attempt.reason || attempt.status || 'failed'}`).join(' | ')
    : 'No URLs attempted';
  model.dataLoad[`${target}Error`] = failureSummary;
  refreshStatusText();
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

async function loadAllAvailableSiteArrays(urls, target = 'siteExtras') {
  const loaded = [];
  for (const url of urls) {
    const result = await fetchJsonWithTimeout(url, 3500);
    if (result.ok) loaded.push({ url: result.url, json: result.json });
  }
  model.dataLoad[`${target}Loaded`] = loaded.map((entry) => entry.url);
  return loaded;
}

async function loadData() {
  model.dataLoad.loadingSites = true;
  model.dataLoad.loadingTrails = true;
  model.dataLoad.sitesAttempted = [];
  model.dataLoad.trailsAttempted = [];
  model.dataLoad.sitesError = '';
  model.dataLoad.trailsError = '';
  refreshStatusText();

  const [sitesRaw, extraSiteArrays] = await Promise.all([
    loadFirstAvailable(SITE_DATA_URLS, 'sites').finally(() => {
      model.dataLoad.loadingSites = false;
      refreshStatusText();
    }),
    loadAllAvailableSiteArrays(EXTRA_SITE_DATA_URLS, 'siteExtras'),
    loadTrailData().finally(() => {
      model.dataLoad.loadingTrails = false;
      refreshStatusText();
    })
  ]).then((results) => [results[0], results[1]]);

  const mergedSitesRaw = [
    ...normalizeSiteArray(sitesRaw),
    ...extraSiteArrays.flatMap((entry) => normalizeSiteArray(entry.json))
  ];

  model.sites = mergedSitesRaw.map(normalizeSite).filter(Boolean);

  buildLayerDefinitions();
  buildStateGroups();
  renderLayerControls();
  renderLegend();
  renderSummaryLegendKey();
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
    const summaryState = summaryStateForSite(site);
    if (!model.stateGroups.has(summaryState)) model.stateGroups.set(summaryState, []);
    model.stateGroups.get(summaryState).push(site);
  }
  for (const [state, sites] of model.stateGroups.entries()) {
    const lngs = sites.map((s) => s.lngLat[0]);
    const lats = sites.map((s) => s.lngLat[1]);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs), minLat = Math.min(...lats), maxLat = Math.max(...lats);
    model.stateBBoxes.set(state, [[minLng, minLat], [maxLng, maxLat]]);
    const centroid = [lngs.reduce((a,b)=>a+b,0)/lngs.length, lats.reduce((a,b)=>a+b,0)/lats.length];
    const counts = summarizeSitesForState(sites);
    model.stateSummaryByState.set(state, {
      type: 'Feature',
      properties: { state, count: sites.length, campgrounds: counts.campgrounds, boondocking: counts.boondocking, info: counts.info, summaryLabel: stateSummaryLabel({ state, ...counts }) },
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
      ${markerPreviewHtml(def.bucket, def.color, 26)}
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
  if (els.legendList) els.legendList.innerHTML = '';
}

function renderSummaryLegendKey() {
  const host = document.getElementById('summaryLegendKey');
  if (!host) return;
  host.innerHTML = `
    <div class="summary-key-item"><span class="summary-key-circle" style="background:${BUILTIN_BUCKETS.state.color}">C</span><span>Campgrounds total</span></div>
    <div class="summary-key-item"><span class="summary-key-circle" style="background:${BUILTIN_BUCKETS.boondocking.color}">B</span><span>Boondocking total</span></div>
    <div class="summary-key-item"><span class="summary-key-circle" style="background:${BUILTIN_BUCKETS.info.color}">I</span><span>Info / reference total</span></div>`;
}


function syncTrailUi() {
  const hasTrails = trailSourceLoaded();
  if (els.trailSection) els.trailSection.hidden = true;
  if (els.trailStatusText) els.trailStatusText.textContent = 'Trail overlay removed from this build.';
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
    if (bounds.contains(site.lngLat)) states.add(summaryStateForSite(site));
  }
  return [...states];
}

function shouldShowSiteDetails() {
  if (!model.map) return false;
  const zoom = model.map.getZoom();
  return zoom >= 6.2;
}

function enabledSites() {
  return model.sites.filter((site) => model.layerState.get(site.layerKey) !== false);
}

function buildSiteGeoJson() {
  return { type: 'FeatureCollection', features: enabledSites().map((site) => site.feature) };
}


function desiredSummaryCountForState(sites = []) {
  const zoom = Number(model.map?.getZoom?.() ?? DEFAULT_ZOOM);
  if (zoom <= 6) return 1;
  if (sites.length >= 160) return 4;
  if (sites.length >= 70) return 3;
  if (sites.length >= 18) return 2;
  return 1;
}

function splitSitesByAxis(sites = [], pieces = 1) {
  if (pieces <= 1 || sites.length <= 1) return [sites];
  const lngs = sites.map((s) => s.lngLat[0]);
  const lats = sites.map((s) => s.lngLat[1]);
  const lngSpread = Math.max(...lngs) - Math.min(...lngs);
  const latSpread = Math.max(...lats) - Math.min(...lats);
  const axis = lngSpread >= latSpread ? 0 : 1;
  const sorted = [...sites].sort((a, b) => a.lngLat[axis] - b.lngLat[axis]);
  const chunkSize = Math.ceil(sorted.length / pieces);
  const groups = [];
  for (let i = 0; i < sorted.length; i += chunkSize) groups.push(sorted.slice(i, i + chunkSize));
  return groups.filter(Boolean).filter((g) => g.length);
}

function summaryGroupsForState(sites = []) {
  const zoom = Number(model.map?.getZoom?.() ?? DEFAULT_ZOOM);
  const desired = desiredSummaryCountForState(sites);
  if (!sites.length) return [];
  if (desired <= 1 || sites.length < desired * 3) return [sites];

  const coarseCellSize = zoom <= 5 ? 5.2 : 2.4;
  const grouped = new Map();
  for (const site of sites) {
    const [lng, lat] = site.lngLat;
    const key = `${Math.floor((lng + 180) / coarseCellSize)}:${Math.floor((lat + 90) / coarseCellSize)}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(site);
  }

  let groups = [...grouped.values()].filter((g) => g.length).sort((a, b) => b.length - a.length);

  if (groups.length > desired) {
    const primary = groups.slice(0, desired - 1);
    const remainder = groups.slice(desired - 1).flat();
    groups = remainder.length ? [...primary, remainder] : primary;
  }

  if (groups.length < desired) groups = splitSitesByAxis(sites, desired);
  if (!groups.length) groups = [sites];
  return groups;
}


function buildStateSummaryGeoJson() {
  const byState = new Map();
  for (const site of enabledSites()) {
    const state = summaryStateForSite(site);
    if (!byState.has(state)) byState.set(state, []);
    byState.get(state).push(site);
  }
  const features = [];
  for (const [state, sites] of byState.entries()) {
    const groups = summaryGroupsForState(sites);
    groups.forEach((group, idx) => {
      const counts = summarizeSitesForState(group);
      let coordinates;
      if (groups.length === 1) {
        const bbox = model.stateBBoxes.get(state);
        coordinates = bbox
          ? [(bbox[0][0] + bbox[1][0]) / 2, (bbox[0][1] + bbox[1][1]) / 2]
          : [group.reduce((a, s) => a + s.lngLat[0], 0) / group.length, group.reduce((a, s) => a + s.lngLat[1], 0) / group.length];
      } else {
        coordinates = [group.reduce((a, s) => a + s.lngLat[0], 0) / group.length, group.reduce((a, s) => a + s.lngLat[1], 0) / group.length];
      }
      features.push({
        type: 'Feature',
        properties: {
          state,
          clusterIndex: idx + 1,
          count: group.length,
          campgrounds: counts.campgrounds,
          boondocking: counts.boondocking,
          info: counts.info,
          summaryLabel: stateSummaryLabel({ state, ...counts })
        },
        geometry: { type: 'Point', coordinates }
      });
    });
  }
  return { type: 'FeatureCollection', features };
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
  const sizeByCount = ['interpolate', ['linear'], ['+', ['get', 'campgrounds'], ['get', 'boondocking'], ['get', 'info']], 1, 18, 10, 22, 25, 26, 50, 30, 100, 34];
  return ['*', sizeByCount, ['case', ['<=', ['zoom'], 3], 0.9, ['<=', ['zoom'], 5], 0.8, ['<=', ['zoom'], 8], 0.92, 1]];
}

function mapStyleForMode() {
  if (model.mapStyleMode === 'satellite' && model.hasApiKey) return maptilersdk.MapStyle.SATELLITE;
  if (model.mapStyleMode === 'topo' && model.hasApiKey) return maptilersdk.MapStyle.TOPO;
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
  const sites = enabledSites().filter((s) => summaryStateForSite(s) === props.state);
  const counts = summarizeSitesForState(sites);
  return `<div class="popup-content"><div class="popup-title">${escapeHtml(props.state)}</div><div class="popup-meta">${props.count} enabled point${props.count === 1 ? '' : 's'} in this state</div><div>Total campgrounds: ${counts.campgrounds}</div><div>Boondocking sites: ${counts.boondocking}</div><div>Info / reference: ${counts.info}</div><div class="popup-actions"><button type="button" id="zoomStateBtn">Zoom to state</button></div></div>`;
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

  ['trails-major', 'trails-all'].forEach((layerId) => {
    model.map.on('click', layerId, (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const coords = event.lngLat;
      new maptilersdk.Popup({ closeButton: true, maxWidth: '320px' })
        .setLngLat([coords.lng, coords.lat])
        .setHTML(trailPopupHtml(feature.properties || {}))
        .addTo(model.map);
    });
  });
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
  const order = ['trails-major', 'trails-all', 'state-summary-circles', 'state-summary-labels', 'sites-circles', 'draft-circle', 'draft-label', 'trails-labels'];
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
  if (trailSourceLoaded()) {
    ensureSource('trails', trailLineSourceDef());
    if (model.trailSourceMode === 'geojson') ensureSource('trail-labels', { type: 'geojson', data: buildTrailLabelGeoJson() });
  }

  addLayerIfMissing({
    id: 'trails-major',
    type: 'line',
    source: 'trails',
    ...(model.trailSourceMode === 'vector' ? { 'source-layer': trailSourceLayerName() } : {}),
    layout: { visibility: 'none', 'line-join': 'round', 'line-cap': 'round' },
    filter: trailMajorFilter(),
    paint: trailLinePaint()
  }, beforeId);
  addLayerIfMissing({
    id: 'trails-all',
    type: 'line',
    source: 'trails',
    ...(model.trailSourceMode === 'vector' ? { 'source-layer': trailSourceLayerName() } : {}),
    layout: { visibility: 'none', 'line-join': 'round', 'line-cap': 'round' },
    paint: trailLinePaint()
  }, beforeId);
  addLayerIfMissing({
    id: 'trails-labels',
    type: 'symbol',
    source: model.trailSourceMode === 'vector' ? 'trails' : 'trail-labels',
    ...(model.trailSourceMode === 'vector' ? { 'source-layer': trailSourceLayerName() } : {}),
    layout: trailLabelLayout(),
    paint: trailLabelPaint()
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
    layout: { 'text-field': ['get', 'summaryLabel'], 'text-size': 11.5, 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'], 'text-offset': [0, 0], 'text-justify': 'center', 'text-anchor': 'center', 'text-line-height': 1.15 },
    paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.85)', 'text-halo-width': 1.8 }
  });

  addLayerIfMissing({
    id: 'sites-circles', type: 'circle', source: 'sites',
    paint: {
      'circle-radius': ['*', ['coalesce', ['get', 'radius'], 11], ['case', ['<=', ['zoom'], 5], 0.72, ['<=', ['zoom'], 8], 0.88, 1]],
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
  ['sites-circles', 'state-summary-circles', 'trails-major', 'trails-all', 'draft-circle'].forEach((layerId) => {
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
  if (trailsSource?.setData && model.trailSourceMode === 'geojson' && model.trails?.features?.length) trailsSource.setData(model.trails);
  const trailLabelsSource = model.map.getSource('trail-labels');
  if (trailLabelsSource?.setData && model.trailSourceMode === 'geojson' && model.trails?.features?.length) trailLabelsSource.setData(buildTrailLabelGeoJson());

  const showDetails = shouldShowSiteDetails();
  setLayerVisibility('sites-circles', false);
  setLayerVisibility('state-summary-circles', false);
  setLayerVisibility('state-summary-labels', false);
  const showTrails = false;
  const zoom = model.map.getZoom();
  setLayerVisibility('trails-major', showTrails && zoom >= TRAIL_MAJOR_MIN_ZOOM);
  setLayerVisibility('trails-all', showTrails && zoom >= TRAIL_ALL_MIN_ZOOM);
  setLayerVisibility('trails-labels', showTrails && zoom >= TRAIL_LABEL_MIN_ZOOM);
  setLayerVisibility('draft-circle', Boolean(model.draftFeature));
  setLayerVisibility('draft-label', Boolean(model.draftFeature));
  renderDirectSiteMarkers();
  renderSummaryMarkers();
  updateCounts();
}

function setLayerVisibility(layerId, visible) {
  if (model.map.getLayer(layerId)) model.map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
}

function siteMarkerSizeForZoom(zoom) {
  if (zoom < 6.2) return 0;
  if (zoom <= 8.5) return 24;
  return 31;
}

function siteMarkerStrokeForZoom(zoom) {
  if (zoom <= 8.5) return 2.2;
  return 2.8;
}

function clearDomMarkers() {
  for (const marker of model.domMarkers) {
    try { marker.remove(); } catch {}
  }
  model.domMarkers = [];
}

function clearSummaryDomMarkers() {
  for (const marker of model.summaryDomMarkers) {
    try { marker.remove(); } catch {}
  }
  model.summaryDomMarkers = [];
}

function summaryBadgeHtml(bucketKey, color, count) {
  return `<div class="summary-badge summary-badge-${bucketKey}"><div class="summary-badge-icon">${markerPreviewHtml(bucketKey, color, 15)}</div><div class="summary-badge-count">${count || 0}</div></div>`;
}

function summaryMarkerHtml(counts = {}) {
  return `
    <div class="summary-marker-cluster">
      <div class="summary-marker-top">${summaryBadgeHtml('state', BUILTIN_BUCKETS.state.color, counts.campgrounds || 0)}</div>
      <div class="summary-marker-bottom">
        ${summaryBadgeHtml('boondocking', BUILTIN_BUCKETS.boondocking.color, counts.boondocking || 0)}
        ${summaryBadgeHtml('info', BUILTIN_BUCKETS.info.color, counts.info || 0)}
      </div>
    </div>`;
}

function renderSummaryMarkers() {
  clearSummaryDomMarkers();
  if (!model.map || shouldShowSiteDetails() || !els.toggleStateSummaries.checked) return;
  const fc = buildStateSummaryGeoJson();
  for (const feature of fc.features) {
    const props = feature.properties || {};
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'summary-dom-marker';
    el.setAttribute('aria-label', `${props.state || 'State'} summary`);
    el.innerHTML = summaryMarkerHtml(props);
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const bounds = model.stateBBoxes.get(props.state);
      if (bounds) model.map.fitBounds(getPaddedBounds(bounds, 0.12), { padding: 28, duration: 600 });
    });
    const marker = new maptilersdk.Marker({ element: el, anchor: 'center' })
      .setLngLat(feature.geometry.coordinates)
      .addTo(model.map);
    model.summaryDomMarkers.push(marker);
  }
}

function renderDirectSiteMarkers() {
  clearDomMarkers();
  clearSummaryDomMarkers();
  if (!model.map || !shouldShowSiteDetails() || !els.toggleSitePoints.checked) return;
  let bounds = null;
  try { bounds = model.map.getBounds(); } catch {}
  const visibleSites = enabledSites()
    .filter((site) => Array.isArray(site.lngLat) && site.lngLat.length >= 2 && (!bounds || bounds.contains(site.lngLat)))
    .slice(0, 1200);

  const zoom = model.map.getZoom();
  const markerSize = siteMarkerSizeForZoom(zoom);
  const markerStroke = Math.max(2, siteMarkerStrokeForZoom(zoom) - 0.4);

  for (const site of visibleSites) {
    const def = model.layerDefs.get(site.layerKey) || BUILTIN_BUCKETS.other;
    const bucket = def.bucket || site.bucket || site.category;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'site-dom-marker symbol-marker';
    el.setAttribute('aria-label', site.name || 'Campsite');
    el.style.width = `${markerSize}px`;
    el.style.height = `${markerSize}px`;
    el.style.borderRadius = '0';
    el.style.border = '0';
    el.style.background = 'transparent';
    el.style.boxShadow = 'none';
    el.style.padding = '0';
    el.style.color = def.color || '#ff2d55';
    el.style.filter = 'drop-shadow(0 0 1px rgba(255,248,232,0.35)) drop-shadow(0 1px 2px rgba(0,0,0,0.45))';
    el.style.margin = '0';
    el.style.cursor = 'pointer';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.overflow = 'visible';
    el.innerHTML = symbolSvg(bucketSymbol(bucket), def.color || '#ff2d55');

    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      new maptilersdk.Popup({ closeButton: true, maxWidth: '340px' })
        .setLngLat(site.lngLat)
        .setHTML(popupHtmlForSite({
          ...site,
          layerLabel: def.label || site.layerLabel || site.layerKey
        }))
        .addTo(model.map);
    });

    const marker = new maptilersdk.Marker({ element: el, anchor: 'center' })
      .setLngLat(site.lngLat)
      .addTo(model.map);
    model.domMarkers.push(marker);
  }
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
  const grouped = new Set(enabledSites().map((s) => summaryStateForSite(s)));
  const cards = [...model.layerDefs.values()].slice(0, 8).map((def) => `<div class="count-card"><strong>${visibleByLayer[def.key] || 0}</strong><span>${escapeHtml(def.label)}</span></div>`).join('');
  const siteSource = model.map.getSource('sites');
  const summarySource = model.map.getSource('state-summaries');
  const debugCards = `
    <div class="count-card"><strong>${model.sites.length}</strong><span>Loaded campsite records</span></div>
    <div class="count-card"><strong>${model.layerDefs.size}</strong><span>Detected campsite layers</span></div>
    <div class="count-card"><strong>${siteSource ? 'yes' : 'no'}</strong><span>Sites source on map</span></div>
    <div class="count-card"><strong>${summarySource ? 'yes' : 'no'}</strong><span>State summary source on map</span></div>`;
  els.countsGrid.innerHTML = `<div class="count-card"><strong>${mode}</strong><span>${focusedState ? `Focused on ${escapeHtml(focusedState)}` : 'Never fewer than a few summary points per state when zoomed out where data density supports it'}</span></div><div class="count-card"><strong>${visibleSites}</strong><span>${shouldShowSiteDetails() ? 'Visible site points' : 'Visible site points hidden while summarized'}</span></div><div class="count-card"><strong>${shouldShowSiteDetails() ? 0 : grouped.size}</strong><span>Visible state summaries</span></div><div class="count-card"><strong>${enabledSites().length}</strong><span>Enabled sites total</span></div>${debugCards}${cards}`;
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
  if (els.keySection) {
    els.keySection.hidden = false;
    els.keySection.classList.toggle('is-collapsed', model.hasApiKey);
  }
  if (els.revealKeySectionBtn) {
    els.revealKeySectionBtn.hidden = !model.hasApiKey;
    els.revealKeySectionBtn.textContent = model.hasApiKey ? 'Map key saved — manage' : 'Map key';
  }
}

function describeAttempts(attempts) {
  if (!attempts?.length) return 'No URLs tried yet.';
  return attempts.map((attempt) => `${attempt.url} → ${attempt.ok ? 'OK' : (attempt.reason || attempt.status || 'failed')}`).join(' | ');
}

function refreshStatusText() {
  const siteMsg = model.dataLoad.loadingSites
    ? `Loading campsite data… trying ${SITE_DATA_URLS.join(', ')}`
    : model.sites.length
      ? `Loaded ${model.sites.length} campsites across ${model.layerDefs.size} detected layer${model.layerDefs.size === 1 ? '' : 's'} from ${model.dataLoad.sitesUrl || 'an unknown file'}${(model.dataLoad.siteExtrasLoaded || []).length ? ` + ${(model.dataLoad.siteExtrasLoaded || []).length} additions file${(model.dataLoad.siteExtrasLoaded || []).length === 1 ? '' : 's'}` : ''}.`
      : `No campsite records loaded. Tried: ${describeAttempts(model.dataLoad.sitesAttempted)}`;

  const trailMsg = '';

  const basemapLabel = model.mapStyleMode === 'satellite'
    ? 'Satellite'
    : model.mapStyleMode === 'topo'
      ? 'Topo'
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
  els.revealKeySectionBtn?.addEventListener('click', () => {
    if (els.keySection) {
      const willShow = els.keySection.classList.contains('is-collapsed');
      els.keySection.classList.toggle('is-collapsed', !willShow);
      if (willShow) els.apiKeyInput?.focus();
    }
  });
  els.toggleStateSummaries.addEventListener('change', updateOverlays);
  els.toggleSitePoints.addEventListener('change', updateOverlays);
  els.toggleTrails?.addEventListener('change', updateOverlays);
  els.toggleAddMode.addEventListener('change', () => { model.addMode = els.toggleAddMode.checked; });
  if (els.basemapSelect && !els.basemapSelect.querySelector('option[value="topo"]')) {
    const opt = document.createElement('option');
    opt.value = 'topo';
    opt.textContent = 'Topo';
    els.basemapSelect.insertBefore(opt, els.basemapSelect.querySelector('option[value="osm"]') || null);
  }
  els.basemapSelect.value = ['outdoor','satellite','topo','osm'].includes(model.mapStyleMode) ? model.mapStyleMode : 'outdoor';
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

function scheduleMarkerRefresh() {
  if (!model.map) return;
  window.setTimeout(() => { try { updateOverlays(); } catch {} }, 0);
  window.setTimeout(() => { try { updateOverlays(); } catch {} }, 250);
  window.setTimeout(() => { try { updateOverlays(); } catch {} }, 900);
}

async function rebuildMapStyle() {
  if (!model.map) return;
  const center = model.map.getCenter();
  const zoom = model.map.getZoom();
  const pitch = model.map.getPitch();
  const bearing = model.map.getBearing();
  model.styleReady = false;
  clearDomMarkers();
  clearSummaryDomMarkers();
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
    scheduleMarkerRefresh();
    refreshStatusText();
    updateZoomReadout();
  });
}

function updateZoomReadout() {
  if (!els.zoomReadout || !model.map) return;
  els.zoomReadout.textContent = `Zoom: ${model.map.getZoom().toFixed(1)}`;
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
    scheduleMarkerRefresh();
    refreshStatusText();
    updateZoomReadout();
  });
  model.map.on('moveend', () => { updateZoomReadout(); updateOverlays(); });
  model.map.on('zoom', updateZoomReadout);
  model.map.on('zoomend', () => { updateZoomReadout(); updateOverlays(); });
  model.map.on('idle', () => { updateZoomReadout(); if (shouldShowSiteDetails()) renderDirectSiteMarkers(); });

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
    forceOverlayRefresh: updateOverlays,
    trailSourceLoaded,
    trailSourceMode: () => model.trailSourceMode
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
