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
    const rawText = await response.text();
    try {
      const json = JSON.parse(rawText);
      return { ok: true, url, status: response.status, json };
    } catch (error) {
      return { ok: false, url, status: response.status, reason: `Bad JSON: ${error?.message || 'parse failed'}` };
    }
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
  const results = await Promise.all(urls.map((url) => fetchJsonWithTimeout(url, 3000)));
  const attempts = results.map((result) => ({ url: result.url, ok: result.ok, status: result.status, reason: result.reason || '' }));
  const loaded = results.filter((result) => result.ok).map((result) => ({ url: result.url, json: result.json }));
  model.dataLoad[`${target}Attempted`] = attempts;
  model.dataLoad[`${target}Loaded`] = loaded.map((entry) => entry.url);
  refreshStatusText();
  return loaded;
}

async function loadData() {
  model.dataLoad.loadingSites = true;
  model.dataLoad.loadingTrails = true;
  setLoadingState?.(true, 'Loading campsite data…');
  model.dataLoad.sitesAttempted = [];
  model.dataLoad.trailsAttempted = [];
  model.dataLoad.sitesError = '';
  model.dataLoad.trailsError = '';
  refreshStatusText();

  try {
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
    return model.sites;
  } catch (error) {
    console.error('loadData failed', error);
    if (els.statusText) {
      els.statusText.textContent = `Data load failed. ${error?.message || 'Unknown error'}`;
    }
    throw error;
  } finally {
    model.dataLoad.loadingSites = false;
    model.dataLoad.loadingTrails = false;
    refreshStatusText();
    setLoadingState?.(false);
  }
}


