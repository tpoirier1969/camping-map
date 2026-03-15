const VERSION = 'v20.3.4';
const SITE_DATA_URLS = ['data/sites.json', 'data/site-data.json', 'data/campgrounds.json', 'sites.json'];
const EXTRA_SITE_DATA_URLS = ['data/sites-additions-v18.5.json', 'data/sites-additions-v18.7.json', 'data/sites-additions-v18.8.json', 'data/sites-additions-v18.9.json', 'data/sites-additions-v19.0.json', 'data/sites-additions-v20.3.json'];
const TRAIL_GEOJSON_URLS = [];
const TRAIL_VECTOR_MANIFEST_URLS = [];
const DEFAULT_CENTER = [-87.4, 46.6];
const DEFAULT_ZOOM = 6;
const DETAIL_ZOOM = 6.2;
const MID_SYMBOL_MIN_ZOOM = 5.0;
const SUMMARY_STATE_ONLY_ZOOM = 5.0;
const TRAIL_MAJOR_MIN_ZOOM = 10;
const TRAIL_ALL_MIN_ZOOM = 12;
const TRAIL_LABEL_MIN_ZOOM = 12;
const STATE_PADDING_FACTOR = 0.18;
const LONG_PRESS_MS = 700;
const STORAGE_KEYS = {
  apiKey: 'campingMap.maptilerApiKey',
  basemap: 'campingMap.basemap',
  terrain: 'campingMap.terrain',
  tilt: 'campingMap.pitch',
  thunderforestApiKey: 'campingMap.thunderforestApiKey'
};
const STATE_CENTERS = {
  MI: [-85.55, 44.65],
  WI: [-89.95, 44.85],
  MN: [-94.8, 46.15],
  IL: [-89.25, 40.1],
  IN: [-86.13, 39.89],
  OH: [-82.8, 40.42],
  IA: [-93.5, 42.08],
  MO: [-92.6, 38.46],
  AR: [-92.45, 34.89],
  AL: [-86.9, 32.32],
  OR: [-120.55, 43.8],
  WA: [-120.74, 47.38],
  TN: [-86.58, 35.52],
  MS: [-89.68, 32.35],
  LA: [-91.96, 31.24],
  KS: [-98.48, 39.01],
  OK: [-97.51, 35.57],
  SD: [-100.23, 44.3],
  NE: [-99.9, 41.49],
  ME: [-69.45, 45.25],
  NH: [-71.57, 43.19],
  DE: [-75.51, 39.15],
  MD: [-76.64, 39.05],
  PA: [-77.19, 41.2],
  NY: [-75.5, 43.0],
  FL: [-81.52, 27.66],
  GA: [-82.9, 32.16],
  SC: [-80.95, 33.84],
  NC: [-79.02, 35.76],
  VA: [-78.66, 37.43],
  KY: [-84.27, 37.84],
  TX: [-99.9, 31.97],
  CA: [-119.42, 36.78],
  AZ: [-111.09, 34.05],
  NM: [-105.87, 34.52],
  CO: [-105.78, 39.55],
  UT: [-111.09, 39.32],
  NV: [-116.42, 38.8],
  ID: [-114.74, 44.07],
  MT: [-110.36, 46.88],
  WY: [-107.29, 43.08],
  ND: [-100.78, 47.55],
  VT: [-72.58, 44.56],
  MA: [-71.38, 42.41],
  CT: [-72.76, 41.6],
  RI: [-71.48, 41.58],
  NJ: [-74.41, 40.06],
  WV: [-80.45, 38.6],
  AK: [-152.4, 64.2],
  HI: [-157.86, 21.31],
  DC: [-77.04, 38.91]
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
  tfApiKeyInput: document.getElementById('tfApiKeyInput'),
  saveTfKeyBtn: document.getElementById('saveTfKeyBtn'),
  clearTfKeyBtn: document.getElementById('clearTfKeyBtn'),
  keySection: document.getElementById('keySection'),
  revealKeySectionBtn: document.getElementById('revealKeySectionBtn'),
  basemapSelect: document.getElementById('basemapSelect'),
  toggleTerrain: document.getElementById('toggleTerrain'),
  togglePitch: document.getElementById('togglePitch'),
  toggleAddMode: document.getElementById('toggleAddMode'),
  zoomReadout: document.getElementById('zoomReadout'),
  searchInput: document.getElementById('searchInput'),
  searchBtn: document.getElementById('searchBtn'),
  searchStatus: document.getElementById('searchStatus'),
  searchResults: document.getElementById('searchResults'),
  loadingOverlay: document.getElementById('loadingOverlay'),
  loadingText: document.getElementById('loadingText'),
  dataStats: document.getElementById('dataStats')
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
  },
  searchAbortController: null,
  locateMarker: null,
  locateWatchId: null
};
