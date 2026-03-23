const VERSION = 'v20.5.9.5';
const DEFAULT_API_KEYS = {
  maptiler: '',
  thunderforest: ''
};
const SITE_DATA_URLS = ['data/sites.json'];
const EXTRA_SITE_DATA_URLS = [];
const TRAIL_GEOJSON_URLS = [];
const TRAIL_VECTOR_MANIFEST_URLS = [];

const BOONDOCKING_ZONE_SOURCES = [
  {
    key: 'ottawa_nf',
    label: 'Ottawa National Forest ownership',
    zoneLabel: 'Ottawa National Forest boondocking zone',
    manager: 'USDA Forest Service',
    kind: 'Public land ownership with lake cutouts',
    rule: 'General dispersed camping area on Ottawa NF public land. Do not camp in developed campgrounds or on roads or trails.',
    notes: 'Built from official Forest Service ownership polygons with lake polygons removed. Use site judgment near roads, trails, and developed areas.',
    website: 'https://www.fs.usda.gov/r09/ottawa/recreation/camping-cabins',
    ownershipQuery: {
      serviceUrl: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_BasicOwnership_01/MapServer/0',
      where: "OWNERCLASSIFICATION = 'USDA FOREST SERVICE' AND FORESTNAME = 'Ottawa National Forest'",
      outFields: 'OBJECTID,FORESTNAME,OWNERCLASSIFICATION'
    },
    subtractLakePolygons: true,
    developedRecSetbackMiles: 0,
    viewBbox: [-90.2, 45.55, -87.7, 47.45]
  },

  {
    key: 'hiawatha_nf',
    label: 'Hiawatha National Forest ownership',
    zoneLabel: 'Hiawatha National Forest boondocking zone',
    manager: 'USDA Forest Service',
    kind: 'Public land ownership with lake cutouts',
    rule: 'Use only on Hiawatha National Forest public land and follow posted closures or area-specific restrictions. Wilderness and shoreline restrictions may apply in some areas.',
    notes: 'Built from official Forest Service ownership polygons with lake polygons removed. This improves the broad opportunity layer for the central and eastern U.P. without pulling in private inholdings.',
    website: 'https://www.fs.usda.gov/r09/hiawatha/recreation/camping-cabins',
    ownershipQuery: {
      serviceUrl: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_BasicOwnership_01/MapServer/0',
      where: "OWNERCLASSIFICATION = 'USDA FOREST SERVICE' AND FORESTNAME = 'Hiawatha National Forest'",
      outFields: 'OBJECTID,FORESTNAME,OWNERCLASSIFICATION'
    },
    subtractLakePolygons: true,
    developedRecSetbackMiles: 0,
    viewBbox: [-87.7, 45.4, -84.2, 47.2]
  },
  {
    key: 'chequamegon_nicolet_nf',
    label: 'Chequamegon-Nicolet National Forest ownership',
    zoneLabel: 'Chequamegon-Nicolet boondocking zone',
    manager: 'USDA Forest Service',
    kind: 'Public land minus 0.25-mile developed-site setback',
    rule: 'Dispersed camping not allowed within 0.25 mile of a developed recreation site on the Chequamegon-Nicolet National Forest.',
    notes: 'Built from official USFS ownership polygons, then trimmed by a quarter-mile setback around developed recreation sites and by lake polygons.',
    website: 'https://www.fs.usda.gov/sites/nfs/files/r09/chequamegon-nicolet/publication/alerts/09-13-25-02_ClosureOrder.pdf',
    ownershipQuery: {
      serviceUrl: 'https://dnrmaps.wi.gov/arcgis/rest/services/LF_DML/LF_DNR_MGD_Federal_WTM_Ext/MapServer/10',
      where: "(UPPER(NAME_ORIG) LIKE '%CHEQUAMEGON%' OR UPPER(NAME_ORIG) LIKE '%NICOLET%' OR UPPER(NAME1) LIKE '%CHEQUAMEGON%' OR UPPER(NAME1) LIKE '%NICOLET%')",
      outFields: 'OBJECTID,NAME_ORIG,NAME1'
    },
    subtractLakePolygons: true,
    developedRecSetbackMiles: 0.25,
    viewBbox: [-91.9, 44.9, -87.7, 46.9]
  }
];
const ARCGIS_RECREATION_SITE_SERVICE_URL = 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_InfraRecreationSites_01/MapServer/0';
const ARCGIS_WATERBODY_SERVICE_URL = 'https://hydro.nationalmap.gov/arcgis/rest/services/3DHP_all/FeatureServer/60';
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
  boondockingZoneCache: 'campingMap.boondockingZoneCache',
  basemap: 'campingMap.basemap',
  terrain: 'campingMap.terrain',
  tilt: 'campingMap.pitch',
  thunderforestApiKey: 'campingMap.thunderforestApiKey',
  manualDraftQueue: 'campingMap.manualDraftQueue',
  terrainExaggeration: 'campingMap.terrainExaggeration'
};
const STATE_CENTERS = {
  MI: [-85.55, 44.65],
  MI_UP: [-86.7, 46.45],
  MI_LP: [-84.9, 44.65],
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
  boondocking: { label: 'Boondocking / dispersed', color: '#3ea84a', radius: 15 },
  private: { label: 'Private campgrounds', color: '#55b9ff', radius: 15 },
  federal: { label: 'Federal campgrounds', color: '#8b4e24', radius: 15 },
  state: { label: 'State campgrounds', color: '#8fcf63', radius: 15 },
  local: { label: 'Local campgrounds', color: '#d96a16', radius: 15 },
  national_forest: { label: 'National forest campgrounds', color: '#8b4e24', radius: 15 },
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
  toggleBoondockingZones: document.getElementById('toggleBoondockingZones'),
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
  manageApisBtn: document.getElementById('manageApisBtn'),
  apiModal: document.getElementById('apiModal'),
  closeApiModalBtn: document.getElementById('closeApiModalBtn'),
  keySection: document.getElementById('keySection'),
  basemapSelect: document.getElementById('basemapSelect'),
  toggleTerrain: document.getElementById('toggleTerrain'),
  terrainExaggerationSlider: document.getElementById('terrainExaggerationSlider'),
  terrainExaggerationValue: document.getElementById('terrainExaggerationValue'),
  togglePitch: document.getElementById('togglePitch'),
  toggleAddMode: document.getElementById('toggleAddMode'),
  zoomReadout: document.getElementById('zoomReadout'),
  searchInput: document.getElementById('searchInput'),
  searchBtn: document.getElementById('searchBtn'),
  searchStatus: document.getElementById('searchStatus'),
  searchResults: document.getElementById('searchResults'),
  loadingOverlay: document.getElementById('loadingOverlay'),
  loadingText: document.getElementById('loadingText'),
  dataStats: document.getElementById('dataStats'),
  draftQueueText: document.getElementById('draftQueueText'),
  draftQueueStatus: document.getElementById('draftQueueStatus'),
  copyDraftQueueBtn: document.getElementById('copyDraftQueueBtn'),
  downloadDraftQueueBtn: document.getElementById('downloadDraftQueueBtn'),
  clearDraftQueueBtn: document.getElementById('clearDraftQueueBtn')
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
  mapStyleMode: localStorage.getItem(STORAGE_KEYS.basemap) || 'osm',
  terrainEnabled: localStorage.getItem(STORAGE_KEYS.terrain) === 'true',
  terrainExaggeration: (() => { const raw = Number(localStorage.getItem(STORAGE_KEYS.terrainExaggeration)); return Number.isFinite(raw) && raw >= 1 && raw <= 3 ? raw : 1.5; })(),
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
  locateWatchId: null,
  styleSequence: 0,
  popupHandlersBound: false,
  cursorHandlersBound: false,
  activePopup: null,
  manualDraftQueue: [],
  boondockingZones: null,
  boondockingZonesRaw: null,
  boondockingZoneCacheLoaded: false,
  boondockingZoneRefreshTimer: null,
  boondockingZoneRefreshInFlight: false,
  boondockingZoneViewportKey: '',
  boondockingZoneError: ''
};
