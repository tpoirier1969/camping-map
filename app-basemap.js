function getSavedApiKey() {
  return (localStorage.getItem(STORAGE_KEYS.apiKey) || DEFAULT_API_KEYS.maptiler || '').trim();
}

function getSavedThunderforestKey() {
  return (localStorage.getItem(STORAGE_KEYS.thunderforestApiKey) || DEFAULT_API_KEYS.thunderforest || '').trim();
}

function loadManualDraftQueue() {
  const raw = (localStorage.getItem(STORAGE_KEYS.manualDraftQueue) || '').trim();
  if (!raw) return [];
  return raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);
}

function saveManualDraftQueue() {
  localStorage.setItem(STORAGE_KEYS.manualDraftQueue, model.manualDraftQueue.join('\n'));
}


function ensureBasemapOptions() {
  if (!els.basemapSelect) return;
  const wanted = [
    ['outdoor', 'Outdoor'],
    ['satellite', 'Satellite Hybrid'],
    ['topo', 'Topo'],
    ['tf_outdoors', 'Thunderforest Outdoors - Disabled'],
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
  return BUILTIN_BUCKETS[fallback] ? fallback : 'other';
}


function deriveCampgroundType(raw = {}) {
  const direct = cleanLabel(getFieldAny(raw, ['campgroundType','campground_type','facilityClass','facility_class','development','development_level','camp_style','style','amenities']) || '').toLowerCase();
  const text = [
    direct,
    cleanLabel(getFieldAny(raw, ['categoryLabel','sourceFolder','layerLabel','layer_name','layerName','layer','group','collection','type','kind','classification']) || '').toLowerCase(),
    cleanLabel(getFieldAny(raw, ['description','notes','summary','reviewSummary']) || '').toLowerCase()
  ].filter(Boolean).join(' | ');
  if (!text) return '';
  if (text.includes('rustic') || text.includes('primitive')) return 'rustic';
  if (text.includes('modern')) return 'modern';
  return '';
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
  return { key: bucket ? `${makeSlug(bucket)}-sites` : 'other-sites', label: bucket ? `${titleCase(bucket)} Sites` : 'Other Campsites', bucket: bucket || 'other' };
}

function bucketSymbol(bucket) {
  switch (bucket) {
    case 'federal':
    case 'national_forest':
      return 'federal-arrowhead';
    case 'state':
      return 'state-flag';
    case 'state_local':
      return 'flag';
    case 'local':
      return 'picnic-table';
    case 'boondocking':
      return 'tree';
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
  const federalBrown = '#5a3724';
  const federalText = '#f4ead2';
  switch (symbol) {
    case 'tree':
      return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6 18 24h8L15 39h10l-6 11h26l-6-11h10L38 24h8L32 6Z" fill="${fill}" stroke="${dark}" stroke-width="2.6" stroke-linejoin="round"/><path d="M32 49v9" stroke="${dark}" stroke-width="4" stroke-linecap="round"/></svg>`;
    case 'arrowhead':
      return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6c-9 8-15 21-13 37 5 2 9 6 13 15 4-9 8-13 13-15 2-16-4-29-13-37Z" fill="${fill}" stroke="${dark}" stroke-width="2.6" stroke-linejoin="round"/><path d="M24 25c3 1 5 3 8 6 3-3 5-5 8-6" fill="none" stroke="${light}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M27 35h10" stroke="${light}" stroke-width="3" stroke-linecap="round"/></svg>`;
    case 'federal-arrowhead':
      return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 5.5 50 12.5v17.2c0 13.5-8.2 22.5-18 28.8-9.8-6.3-18-15.3-18-28.8V12.5L32 5.5Z" fill="${federalBrown}" stroke="${dark}" stroke-width="2.6" stroke-linejoin="round"/><path d="M22 22h20" stroke="${federalText}" stroke-width="3.2" stroke-linecap="round"/><path d="M21 29h22" stroke="${federalText}" stroke-width="3.2" stroke-linecap="round"/><path d="M24 36h16" stroke="${federalText}" stroke-width="3.2" stroke-linecap="round"/></svg>`;
    case 'tent':
      return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M9 49 28 18c1.7-2.8 5.7-2.8 7.4 0L55 49H9Z" fill="${fill}" stroke="${dark}" stroke-width="2.8" stroke-linejoin="round"/><path d="M32 18v31" stroke="${light}" stroke-width="3.2" stroke-linecap="round"/><path d="M19 49 32 29l13 20" fill="none" stroke="${light}" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 49h36" stroke="${dark}" stroke-width="2.4" stroke-linecap="round"/></svg>`;
    case 'state-flag':
    case 'flag':
      return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 9v46" stroke="${dark}" stroke-width="4.4" stroke-linecap="round"/><path d="M20 12h24l-6.5 8 6.5 8H20Z" fill="${fill}" stroke="${dark}" stroke-width="2.6" stroke-linejoin="round"/><path d="M24 18h12" stroke="${light}" stroke-width="2.8" stroke-linecap="round"/><path d="M24 24h10" stroke="${light}" stroke-width="2.8" stroke-linecap="round"/><path d="M16 54h12" stroke="${dark}" stroke-width="3.4" stroke-linecap="round"/></svg>`;
    case 'campfire':
      return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M27 13c5 7 4 12 1 16-5 5-6 9-6 13 0 8 5 13 10 13s10-5 10-13c0-5-2-10-8-16 2 6-1 9-3 10 0-7-1-14-4-23Z" fill="${fill}" stroke="${dark}" stroke-width="2.6" stroke-linejoin="round"/><path d="M18 49h28" stroke="${dark}" stroke-width="3.2" stroke-linecap="round"/><path d="M22 54 31 45M42 54 33 45" stroke="${light}" stroke-width="3.2" stroke-linecap="round"/></svg>`;
    case 'sign':
      return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M31 11v42" stroke="${dark}" stroke-width="4.4" stroke-linecap="round"/><path d="M18 18h23l5 4-5 4H18Z" fill="${fill}" stroke="${dark}" stroke-width="2.7" stroke-linejoin="round"/><path d="M14 31h19l5 4-5 4H14Z" fill="${light}" stroke="${dark}" stroke-width="2.5" stroke-linejoin="round"/><path d="M25 53h12" stroke="${dark}" stroke-width="3.5" stroke-linecap="round"/></svg>`;
    case 'shower':
      return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 12v40" stroke="${dark}" stroke-width="4" stroke-linecap="round"/><path d="M14 14h18c7 0 13 6 13 13v2" fill="none" stroke="${dark}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M45 29h7" stroke="${dark}" stroke-width="4" stroke-linecap="round"/><path d="M46 34c1.2 2.6 2.2 5.4 3 8.2M51 34c0.8 2.5 1.4 5.1 1.8 7.8M56 34c0.2 1.8 0.2 3.8 0 5.8" fill="none" stroke="${light}" stroke-width="2.8" stroke-linecap="round"/><path d="M22 17h14v30H22z" fill="${fill}" stroke="${dark}" stroke-width="2.8" stroke-linejoin="round"/><circle cx="29" cy="31" r="3.6" fill="${light}" stroke="${dark}" stroke-width="2.2"/><path d="M29 35v9m0 0-4 6m4-6 4 6m-4-11-4 3m4-3 4 3" fill="none" stroke="${dark}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case 'pin':
      return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 9c10 0 18 8 18 18 0 11-10 18-18 28-8-10-18-17-18-28 0-10 8-18 18-18Z" fill="${fill}" stroke="${dark}" stroke-width="2.8" stroke-linejoin="round"/><circle cx="32" cy="27" r="6.5" fill="${light}" stroke="${dark}" stroke-width="2.2"/></svg>`;
    case 'camper':
      return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 26h34c5 0 10 4 12 9l2 5v8H8Z" fill="${fill}" stroke="${dark}" stroke-width="2.6" stroke-linejoin="round"/><circle cx="22" cy="48" r="5" fill="${light}" stroke="${dark}" stroke-width="2.6"/><circle cx="45" cy="48" r="5" fill="${light}" stroke="${dark}" stroke-width="2.6"/><path d="M15 31h16v10H15Z" fill="${light}" stroke="${dark}" stroke-width="2.2"/><path d="M35 31h8" stroke="${dark}" stroke-width="2.2" stroke-linecap="round"/></svg>`;
    case 'picnic-table':
      return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 24h28" stroke="${dark}" stroke-width="4" stroke-linecap="round"/><path d="M16 28h32v6H16Z" fill="${fill}" stroke="${dark}" stroke-width="2.4" stroke-linejoin="round"/><path d="M12 36h18v5H12Z" fill="${light}" stroke="${dark}" stroke-width="2.2" stroke-linejoin="round"/><path d="M34 36h18v5H34Z" fill="${light}" stroke="${dark}" stroke-width="2.2" stroke-linejoin="round"/><path d="M24 34l-4 14m20-14 4 14m-14-7-5 12m14-12 5 12" fill="none" stroke="${dark}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case 'info':
      return `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="22" fill="${fill}" stroke="${dark}" stroke-width="2.6"/><path d="M32 27v17" stroke="${light}" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="19.5" r="3.2" fill="${light}"/></svg>`;
    case 'trail':
      return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 54V18m28 36V18" stroke="${dark}" stroke-width="4" stroke-linecap="round"/><path d="M18 19h17l11 8H29Z" fill="${fill}" stroke="${dark}" stroke-width="3" stroke-linejoin="round"/></svg>`;
    default:
      return `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="18" fill="${fill}" stroke="${dark}" stroke-width="2.6"/></svg>`;
  }
}


function facilityBadgeHtml(campgroundType = '', size = 18) {
  const type = String(campgroundType || '').toLowerCase();
  if (!type) return '';
  const symbol = type === 'rustic' ? 'tent' : type === 'modern' ? 'shower' : '';
  if (!symbol) return '';
  return `<span class="facility-badge facility-badge-${escapeAttribute(type)}" style="--facility-badge-size:${size}px">${symbolSvg(symbol, type === 'rustic' ? '#c9853d' : '#5d8fbf')}</span>`;
}

function markerPreviewHtml(bucket, color, size = 18, campgroundType = '') {
  const symbol = bucketSymbol(bucket);
  const badge = facilityBadgeHtml(campgroundType, Math.max(12, Math.round(size * 0.54)));
  return `<span class="symbol-preview-wrap">` +
    `<span class="symbol-preview" style="--preview-size:${size}px;--preview-color:${escapeAttribute(color || '#666')}">${symbolSvg(symbol, escapeAttribute(color || '#666'))}</span>` +
    badge +
    `</span>`;
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

function uniqueSitesForSummary(sites = []) {
  const seen = new Set();
  const unique = [];
  for (const site of sites) {
    const lat = Number(site?.lngLat?.[1]);
    const lng = Number(site?.lngLat?.[0]);
    const key = site?.id
      || `${String(site?.name || '').trim().toLowerCase()}|${Number.isFinite(lat) ? lat.toFixed(5) : ''}|${Number.isFinite(lng) ? lng.toFixed(5) : ''}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(site);
  }
  return unique;
}

function summarizeSitesForState(sites = []) {
  const unique = uniqueSitesForSummary(sites);
  const summary = { campgrounds: 0, boondocking: 0, info: 0, total: unique.length };
  for (const site of unique) {
    if (isBoondockingSite(site)) summary.boondocking += 1;
    else if (isInfoSite(site)) summary.info += 1;
    else if (isCampgroundSite(site)) summary.campgrounds += 1;
  }
  return summary;
}

function stateSummaryLabel(props = {}) {
  const state = props.state || '??';
  return `C ${props.campgrounds || 0} · B ${props.boondocking || 0} · I ${props.info || 0}`;
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
  const categoryHint = [
    rawCategory,
    getFieldAny(source, ['categoryLabel','sourceFolder','layerLabel','layer_name','layerName','layer','group','collection']) || '',
    getFieldAny(source, ['owner','ownership','manager','agency','system','landManager']) || ''
  ].filter(Boolean).join(' ');
  const category = normalizeCategory(categoryHint);
  const layerInfo = deriveLayerInfo(source, category);
  const website = getFieldAny(source, ['website','url','link','official_url','officialUrl']) || '';
  const campgroundType = deriveCampgroundType(source);
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
    campgroundType,
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
        campgroundType,
        navigateUrl: `https://www.google.com/maps?q=${lngLat[1]},${lngLat[0]}`,
        access,
        cost,
        showers
      },
      geometry: { type: 'Point', coordinates: lngLat }
    }
  };
}

async function fetchJsonWithTimeout(url, timeoutMs = 12000) {
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
  const inline = window.CAMPING_INLINE || null;
  if (target === 'sites' && inline && inline.sites) {
    model.dataLoad[`${target}Attempted`] = [{ url: 'inline-data', ok: true, status: 200, reason: '' }];
    model.dataLoad[`${target}Url`] = 'inline-data';
    model.dataLoad[`${target}Error`] = '';
    refreshStatusText();
    return inline.sites;
  }
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

function normalizeFeatureCollection(raw) {
  if (!raw) return { type: 'FeatureCollection', features: [] };
  if (raw.type === 'FeatureCollection' && Array.isArray(raw.features)) return raw;
  if (raw.type === 'Feature' && raw.geometry) return { type: 'FeatureCollection', features: [raw] };
  if (Array.isArray(raw?.features)) return { type: 'FeatureCollection', features: raw.features };
  if (Array.isArray(raw)) return { type: 'FeatureCollection', features: raw.filter((feature) => feature && feature.type === 'Feature' && feature.geometry) };
  return { type: 'FeatureCollection', features: [] };
}

function normalizeBoondockingZoneFeatures(raw) {
  const fc = normalizeFeatureCollection(raw);
  const features = fc.features
    .filter((feature) => feature?.geometry && ['Polygon', 'MultiPolygon'].includes(feature.geometry.type))
    .map((feature, index) => ({
      type: 'Feature',
      properties: { ...(feature.properties || {}), zoneId: feature.properties?.zoneId || `zone-${index + 1}` },
      geometry: feature.geometry
    }));
  return { type: 'FeatureCollection', features };
}


function tagBoondockingZoneFeatures(raw, source) {
  const fc = normalizeFeatureCollection(raw);
  return {
    type: 'FeatureCollection',
    features: (fc.features || []).map((feature, index) => ({
      type: 'Feature',
      properties: {
        ...(feature.properties || {}),
        name: feature.properties?.name || source.zoneLabel,
        manager: feature.properties?.manager || source.manager || source.label,
        kind: feature.properties?.kind || source.kind || 'Public land ownership area',
        rule: feature.properties?.rule || source.rule || '',
        notes: feature.properties?.notes || source.notes || '',
        website: feature.properties?.website || source.website || '',
        zoneSourceKey: source.key,
        zoneSourceLabel: source.label,
        zoneLabel: source.zoneLabel,
        zoneId: `${source.key}-${index + 1}`
      },
      geometry: feature.geometry
    }))
  };
}

function featureCollectionFrom(features = []) {
  return { type: 'FeatureCollection', features: features.filter(Boolean) };
}

function arcgisEnvelopeFromBbox(bbox) {
  return {
    xmin: bbox[0],
    ymin: bbox[1],
    xmax: bbox[2],
    ymax: bbox[3],
    spatialReference: { wkid: 4326 }
  };
}

function bboxOverlaps(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function featureBbox(feature) {
  try {
    return window.turf?.bbox(feature) || null;
  } catch {
    return null;
  }
}

function safeSimplify(feature, tolerance = 0.00008) {
  try {
    return window.turf?.simplify ? window.turf.simplify(feature, { tolerance, highQuality: true, mutate: false }) : feature;
  } catch {
    return feature;
  }
}

function differencePolygons(baseFeature, eraseFeature) {
  if (!baseFeature || !eraseFeature || !window.turf?.difference) return baseFeature;
  try {
    return window.turf.difference(baseFeature, eraseFeature);
  } catch {
    try {
      return window.turf.difference(window.turf.featureCollection([baseFeature, eraseFeature]));
    } catch {
      return baseFeature;
    }
  }
}

function pointInOwnership(pointFeature, ownershipFc) {
  if (!pointFeature?.geometry || pointFeature.geometry.type !== 'Point' || !window.turf?.booleanPointInPolygon) return true;
  const pointBox = featureBbox(pointFeature);
  return (ownershipFc.features || []).some((poly) => {
    const polyBox = featureBbox(poly);
    if (pointBox && polyBox && !bboxOverlaps(pointBox, polyBox)) return false;
    try {
      return window.turf.booleanPointInPolygon(pointFeature, poly, { ignoreBoundary: false });
    } catch {
      return false;
    }
  });
}

async function fetchArcGisGeoJsonPaged(serviceUrl, options = {}) {
  const attempts = [];
  const features = [];
  const pageSize = Number(options.resultRecordCount) || 1000;
  let offset = 0;
  let keepGoing = true;
  while (keepGoing) {
    const params = new URLSearchParams();
    params.set('where', options.where || '1=1');
    params.set('outFields', options.outFields || '*');
    params.set('returnGeometry', String(options.returnGeometry !== false));
    params.set('outSR', String(options.outSR || 4326));
    params.set('f', 'geojson');
    params.set('resultOffset', String(offset));
    params.set('resultRecordCount', String(pageSize));
    if (options.orderByFields) params.set('orderByFields', options.orderByFields);
    if (options.geometry) {
      params.set('geometry', JSON.stringify(options.geometry));
      params.set('geometryType', options.geometryType || 'esriGeometryEnvelope');
      params.set('inSR', String(options.inSR || 4326));
      params.set('spatialRel', options.spatialRel || 'esriSpatialRelIntersects');
    }
    const url = `${serviceUrl.replace(/\/$/, '')}/query?${params.toString()}`;
    const result = await fetchJsonWithTimeout(url, options.timeoutMs || 15000);
    attempts.push({ url, ok: result.ok, status: result.status, reason: result.reason || '' });
    if (!result.ok) break;
    const fc = normalizeFeatureCollection(result.json);
    const page = fc.features || [];
    features.push(...page);
    if (!page.length || page.length < pageSize) keepGoing = false;
    offset += page.length;
    if (offset > 50000) keepGoing = false;
  }
  return { fc: featureCollectionFrom(features), attempts };
}

function siteIsDevelopedCampground(site) {
  const bucket = String(site?.bucket || '').toLowerCase();
  if (!bucket || ['boondocking', 'info', 'trailhead', 'draft', 'other'].includes(bucket)) return false;
  return ['federal', 'state', 'local', 'private', 'national_forest', 'state_local'].includes(bucket);
}

function buildExclusionMasksFromKnownSites(ownershipFc, source) {
  if (!window.turf?.buffer || !Array.isArray(model.sites)) return [];
  const miles = Number(source?.developedRecSetbackMiles) > 0 ? Number(source.developedRecSetbackMiles) : (source?.key === 'ottawa_nf' ? 0.12 : 0);
  if (!miles) return [];
  const masks = [];
  for (const site of model.sites) {
    if (!siteIsDevelopedCampground(site)) continue;
    const coords = site?.lngLat;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const point = { type: 'Feature', properties: { siteId: site.id || '', name: site.name || '' }, geometry: { type: 'Point', coordinates: coords } };
    if (!pointInOwnership(point, ownershipFc)) continue;
    try {
      const buffered = window.turf.buffer(point, miles, { units: 'miles' });
      if (buffered?.geometry) masks.push(safeSimplify(buffered, 0.00005));
    } catch {
      // ignore bad buffers
    }
  }
  return masks;
}

function buildExclusionMasksFromPoints(pointsFc, miles = 0) {
  if (!miles || !window.turf?.buffer) return [];
  const masks = [];
  for (const feature of normalizeFeatureCollection(pointsFc).features) {
    if (feature?.geometry?.type !== 'Point') continue;
    try {
      const buffered = window.turf.buffer(feature, miles, { units: 'miles' });
      if (buffered?.geometry) masks.push(safeSimplify(buffered, 0.00005));
    } catch {
      // keep going
    }
  }
  return masks;
}

function applyExclusionMasksToOwnership(ownershipFc, masks = []) {
  const cleaned = [];
  const maskEntries = masks
    .filter((feature) => feature?.geometry)
    .map((feature) => ({ feature, bbox: featureBbox(feature) }));
  for (const base of normalizeBoondockingZoneFeatures(ownershipFc).features) {
    let current = safeSimplify(base, 0.00002);
    let currentBox = featureBbox(current);
    for (const maskEntry of maskEntries) {
      if (!current) break;
      if (currentBox && maskEntry.bbox && !bboxOverlaps(currentBox, maskEntry.bbox)) continue;
      const next = differencePolygons(current, maskEntry.feature);
      current = next || null;
      currentBox = current ? featureBbox(current) : null;
    }
    if (!current?.geometry) continue;
    try {
      const area = window.turf?.area ? window.turf.area(current) : 1;
      if (area >= 6000) cleaned.push(current);
    } catch {
      cleaned.push(current);
    }
  }
  return featureCollectionFrom(cleaned);
}

async function fetchOwnershipZonesForSource(source, envelope = null) {
  const query = source.ownershipQuery || {};
  const result = await fetchArcGisGeoJsonPaged(query.serviceUrl, {
    where: query.where || '1=1',
    outFields: query.outFields || '*',
    outSR: 4326,
    geometry: envelope || null,
    geometryType: envelope ? 'esriGeometryEnvelope' : undefined,
    inSR: envelope ? 4326 : undefined,
    spatialRel: envelope ? 'esriSpatialRelIntersects' : undefined,
    resultRecordCount: query.resultRecordCount || 300,
    timeoutMs: 12000
  });
  return result;
}

async function fetchLakeMasksForOwnership(ownershipFc) {
  if (!window.turf?.bbox) return { fc: featureCollectionFrom([]), attempts: [] };
  const bbox = window.turf.bbox(ownershipFc);
  return fetchArcGisGeoJsonPaged(ARCGIS_WATERBODY_SERVICE_URL, {
    where: '(areasqkm IS NULL OR areasqkm >= 0.005)',
    outFields: 'OBJECTID,featuretype,featuretypelabel,areasqkm,gnisidlabel',
    geometry: arcgisEnvelopeFromBbox(bbox),
    geometryType: 'esriGeometryEnvelope',
    inSR: 4326,
    outSR: 4326,
    resultRecordCount: 1200,
    timeoutMs: 16000
  });
}

async function fetchDevelopedRecreationSitesForOwnership(ownershipFc) {
  if (!window.turf?.bbox) return { fc: featureCollectionFrom([]), attempts: [] };
  const bbox = window.turf.bbox(ownershipFc);
  const result = await fetchArcGisGeoJsonPaged(ARCGIS_RECREATION_SITE_SERVICE_URL, {
    where: "SITE_SUBTYPE <> '' AND RECAREA_STATUS <> 'Archived' AND (DEVELOPMENT_STATUS IS NULL OR UPPER(DEVELOPMENT_STATUS) NOT LIKE '%ARCHIVED%')",
    outFields: 'OBJECTID,SITE_NAME,SITE_SUBTYPE,DEVELOPMENT_STATUS,DEVELOPMENT_SCALE,RECAREA_NAME,RECAREA_STATUS',
    geometry: arcgisEnvelopeFromBbox(bbox),
    geometryType: 'esriGeometryEnvelope',
    inSR: 4326,
    outSR: 4326,
    resultRecordCount: 1200,
    timeoutMs: 16000
  });
  const filtered = normalizeFeatureCollection(result.fc).features.filter((feature) => pointInOwnership(feature, ownershipFc));
  return { fc: featureCollectionFrom(filtered), attempts: result.attempts };
}

async function buildBoondockingZonesForSource(source, envelope = null) {
  const ownershipResult = await fetchOwnershipZonesForSource(source, envelope);
  let ownershipFc = normalizeBoondockingZoneFeatures(ownershipResult.fc);
  const attempts = [...ownershipResult.attempts.map((entry) => ({ ...entry, label: `${source.label} ownership` }))];
  if (!ownershipFc.features.length) {
    return { fc: featureCollectionFrom([]), attempts };
  }

  const exclusionMasks = [];
  if (source.subtractLakePolygons) {
    const lakeResult = await fetchLakeMasksForOwnership(ownershipFc);
    attempts.push(...lakeResult.attempts.map((entry) => ({ ...entry, label: `${source.label} lake cutouts` })));
    exclusionMasks.push(...normalizeFeatureCollection(lakeResult.fc).features.map((feature) => safeSimplify(feature, 0.00003)));
  }

  if (source.developedRecSetbackMiles > 0) {
    const recResult = await fetchDevelopedRecreationSitesForOwnership(ownershipFc);
    attempts.push(...recResult.attempts.map((entry) => ({ ...entry, label: `${source.label} developed recreation sites` })));
    exclusionMasks.push(...buildExclusionMasksFromPoints(recResult.fc, source.developedRecSetbackMiles));
  }

  exclusionMasks.push(...buildExclusionMasksFromKnownSites(ownershipFc, source));

  if (exclusionMasks.length) {
    ownershipFc = applyExclusionMasksToOwnership(ownershipFc, exclusionMasks);
  }

  return { fc: tagBoondockingZoneFeatures(ownershipFc, source), attempts };
}

function loadCachedBoondockingZones() {
  if (model.boondockingZoneCacheLoaded) return model.boondockingZonesRaw;
  model.boondockingZoneCacheLoaded = true;
  try {
    const cached = localStorage.getItem(STORAGE_KEYS.boondockingZoneCache);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    const fc = normalizeBoondockingZoneFeatures(parsed);
    if (!fc.features.length) return null;
    model.boondockingZonesRaw = fc;
    model.boondockingZones = fc;
    return fc;
  } catch {
    return null;
  }
}

function saveCachedBoondockingZones(fc) {
  try {
    localStorage.setItem(STORAGE_KEYS.boondockingZoneCache, JSON.stringify(normalizeBoondockingZoneFeatures(fc)));
  } catch {
    // ignore storage failures
  }
}

function sourceRelevantToBounds(source, boundsArray) {
  return !Array.isArray(source?.viewBbox) || bboxOverlaps(source.viewBbox, boundsArray);
}

function expandedViewportEnvelope(pad = 0.18) {
  const bounds = model.map?.getBounds?.();
  if (!bounds) return null;
  const west = bounds.getWest();
  const south = bounds.getSouth();
  const east = bounds.getEast();
  const north = bounds.getNorth();
  const dx = Math.max(0.05, (east - west) * pad);
  const dy = Math.max(0.05, (north - south) * pad);
  return arcgisEnvelopeFromBbox([west - dx, south - dy, east + dx, north + dy]);
}

function viewportKeyForEnvelope(envelope) {
  if (!envelope) return '';
  const round = (n) => Number(n).toFixed(2);
  return [round(envelope.xmin), round(envelope.ymin), round(envelope.xmax), round(envelope.ymax)].join('|');
}

function mergeBoondockingZoneFeatures(existingRaw, incomingRaw) {
  const existing = normalizeBoondockingZoneFeatures(existingRaw).features;
  const incoming = normalizeBoondockingZoneFeatures(incomingRaw).features;
  const seen = new Set();
  const merged = [];
  for (const feature of [...existing, ...incoming]) {
    const box = featureBbox(feature) || [];
    const key = `${feature.properties?.zoneSourceKey || ''}|${feature.properties?.zoneId || ''}|${box.map((n) => Number(n).toFixed(4)).join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(feature);
  }
  return featureCollectionFrom(merged);
}

async function refreshBoondockingZonesForViewport(force = false) {
  if (!model.map || !els.toggleBoondockingZones?.checked) return rebuildBoondockingZonesFromRaw();
  if (Number(model.map.getZoom?.() || 0) < 7) return rebuildBoondockingZonesFromRaw();
  if (model.boondockingZoneRefreshInFlight && !force) return rebuildBoondockingZonesFromRaw();
  const envelope = expandedViewportEnvelope();
  const viewportKey = viewportKeyForEnvelope(envelope);
  if (!force && viewportKey && viewportKey === model.boondockingZoneViewportKey) return rebuildBoondockingZonesFromRaw();
  model.boondockingZoneViewportKey = viewportKey;
  model.boondockingZoneRefreshInFlight = true;
  const attempts = [];
  const loadedFeatures = [];
  const boundsArray = envelope ? [envelope.xmin, envelope.ymin, envelope.xmax, envelope.ymax] : null;
  for (const source of BOONDOCKING_ZONE_SOURCES) {
    if (boundsArray && !sourceRelevantToBounds(source, boundsArray)) continue;
    try {
      const result = await buildBoondockingZonesForSource(source, envelope);
      attempts.push(...result.attempts);
      loadedFeatures.push(...normalizeFeatureCollection(result.fc).features);
    } catch (error) {
      attempts.push({ url: source.ownershipQuery?.serviceUrl || '', ok: false, status: 0, reason: String(error), label: source.label });
    }
  }
  model.dataLoad.boondockingZonesAttempted = attempts;
  model.boondockingZonesRaw = mergeBoondockingZoneFeatures(model.boondockingZonesRaw, { type: 'FeatureCollection', features: loadedFeatures });
  saveCachedBoondockingZones(model.boondockingZonesRaw);
  model.boondockingZoneRefreshInFlight = false;
  return rebuildBoondockingZonesFromRaw();
}

function scheduleBoondockingZoneRefresh(force = false) {
  if (!model.map) return;
  window.clearTimeout(model.boondockingZoneRefreshTimer);
  model.boondockingZoneRefreshTimer = window.setTimeout(() => {
    refreshBoondockingZonesForViewport(force).catch((error) => {
      console.warn('Boondocking zone viewport refresh failed', error);
      model.boondockingZoneRefreshInFlight = false;
    });
  }, force ? 50 : 450);
}

function rebuildBoondockingZonesFromRaw() {
  model.boondockingZones = normalizeBoondockingZoneFeatures(model.boondockingZonesRaw);
  if (model.map && model.styleReady) updateOverlays();
  return model.boondockingZones;
}

async function loadBoondockingZoneData() {
  const inline = window.CAMPING_INLINE || null;
  const inlineZones = inline && inline.boondockingZones ? inline.boondockingZones : null;
  const localZones = inlineZones || await loadFirstAvailable(['data/boondocking-zones.geojson'], 'boondockingZonesLocal');
  if (inlineZones) {
    model.dataLoad.boondockingZonesLocalAttempted = [{ url: 'inline-data', ok: true, status: 200, reason: '' }];
    model.dataLoad.boondockingZonesLocalUrl = 'inline-data';
    model.dataLoad.boondockingZonesLocalError = '';
  }
  const localFc = normalizeBoondockingZoneFeatures(localZones);
  if (localFc.features.length) {
    model.boondockingZonesRaw = localFc;
    saveCachedBoondockingZones(localFc);
    return rebuildBoondockingZonesFromRaw();
  }
  loadCachedBoondockingZones();
  model.dataLoad.boondockingZonesAttempted = model.dataLoad.boondockingZonesAttempted || [];
  return rebuildBoondockingZonesFromRaw();
}

async function loadAllAvailableSiteArrays(urls, target = 'siteExtras') {
  const results = await Promise.all(urls.map((url) => fetchJsonWithTimeout(url, 3500)));
  const loaded = [];
  const attempts = [];
  for (const result of results) {
    attempts.push({ url: result.url, ok: result.ok, status: result.status, reason: result.reason || '' });
    if (result.ok) loaded.push({ url: result.url, json: result.json });
  }
  model.dataLoad[`${target}Attempted`] = attempts;
  model.dataLoad[`${target}Loaded`] = loaded.map((entry) => entry.url);
  return loaded;
}

async function loadData() {
  model.dataLoad.loadingSites = true;
  model.dataLoad.loadingTrails = true;
  model.dataLoad.loadingSiteExtras = EXTRA_SITE_DATA_URLS.length > 0;
  setLoadingState?.(true, 'Loading campsite data…');
  model.dataLoad.sitesAttempted = [];
  model.dataLoad.trailsAttempted = [];
  model.dataLoad.sitesError = '';
  model.dataLoad.trailsError = '';
  model.boondockingZones = { type: 'FeatureCollection', features: [] };
  refreshStatusText();

  const trailPromise = loadTrailData().finally(() => {
    model.dataLoad.loadingTrails = false;
    refreshStatusText();
  });

  await loadBoondockingZoneData().catch((error) => {
    console.error('Boondocking zone load failed', error);
    model.boondockingZones = { type: 'FeatureCollection', features: [] };
    if (model.map && model.styleReady) updateOverlays();
    return model.boondockingZones;
  });

  const sitesRaw = await loadFirstAvailable(SITE_DATA_URLS, 'sites').finally(() => {
    model.dataLoad.loadingSites = false;
    refreshStatusText();
  });

  const baseSitesRaw = normalizeSiteArray(sitesRaw);
  model.sites = baseSitesRaw.map(normalizeSite).filter(Boolean);
  rebuildBoondockingZonesFromRaw();

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
  setLoadingState?.(false);

  loadAllAvailableSiteArrays(EXTRA_SITE_DATA_URLS, 'siteExtras')
    .then((extraSiteArrays) => {
      const mergedSitesRaw = [
        ...baseSitesRaw,
        ...extraSiteArrays.flatMap((entry) => normalizeSiteArray(entry.json))
      ];
      model.sites = mergedSitesRaw.map(normalizeSite).filter(Boolean);
      rebuildBoondockingZonesFromRaw();
      model.dataLoad.loadingSiteExtras = false;
      buildLayerDefinitions();
      buildStateGroups();
      renderLayerControls();
      renderLegend();
      renderSummaryLegendKey();
      syncTrailUi();
      if (model.map && model.styleReady) updateOverlays();
      refreshStatusText();
    })
    .catch((error) => {
      console.error(error);
      model.dataLoad.loadingSiteExtras = false;
      refreshStatusText();
    });

  await trailPromise;
}


