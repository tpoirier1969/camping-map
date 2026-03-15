const VERSION = 'v20.1';
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
const STATE_CENTERS = {
  MI: [-85.6024, 44.3148],
  WI: [-89.6165, 44.6243],
  MN: [-94.6859, 46.7296],
  IL: [-89.3985, 40.6331],
  IN: [-86.1349, 39.8942],
  OH: [-82.7937, 40.4173],
  IA: [-93.5000, 42.0751],
  MO: [-92.6038, 38.4561],
  AR: [-92.4479, 34.8938],
  AL: [-86.9023, 32.3182],
  OR: [-120.5542, 43.8041],
  WA: [-120.7401, 47.3817],
  TN: [-86.5804, 35.5175],
  MS: [-89.6812, 32.3547],
  LA: [-91.9623, 31.2448],
  KS: [-98.4842, 39.0119],
  OK: [-97.5085, 35.5653],
  SD: [-100.2263, 44.2998],
  NE: [-99.9018, 41.4925],
  ME: [-69.4455, 45.2538],
  NH: [-71.5724, 43.1939],
  DE: [-75.5071, 39.1453],
  MD: [-76.6413, 39.0458],
  PA: [-77.1945, 41.2033],
  NY: [-75.4999, 43.0000],
  FL: [-81.5158, 27.6648],
  GA: [-82.9001, 32.1574],
  SC: [-80.9450, 33.8361],
  NC: [-79.0193, 35.7596],
  VA: [-78.6569, 37.4316],
  KY: [-84.2700, 37.8393],
  TX: [-99.9018, 31.9686],
  CA: [-119.4179, 36.7783],
  AZ: [-111.0937, 34.0489],
  NM: [-105.8701, 34.5199],
  CO: [-105.7821, 39.5501],
  UT: [-111.0937, 39.3210],
  NV: [-116.4194, 38.8026],
  ID: [-114.7420, 44.0682],
  MT: [-110.3626, 46.8797],
  WY: [-107.2903, 43.0760],
  ND: [-100.7837, 47.5515],
  VT: [-72.5778, 44.5588],
  MA: [-71.3824, 42.4072],
  CT: [-72.7554, 41.6032],
  RI: [-71.4774, 41.5801],
  NJ: [-74.4057, 40.0583],
  WV: [-80.4549, 38.5976],
  AK: [-152.4044, 64.2008],
  HI: [-157.8583, 21.3069],
  DC: [-77.0369, 38.9072]
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
  zoomReadout: document.getElementById('zoomReadout'),
  searchInput: document.getElementById('searchInput'),
  searchBtn: document.getElementById('searchBtn'),
  searchStatus: document.getElementById('searchStatus'),
  searchResults: document.getElementById('searchResults')
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
  searchAbortController: null
};
