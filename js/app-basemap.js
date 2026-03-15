
function beginStyleReadyWatch(onReady) {
  if (!model.map) return () => {};
  const map = model.map;
  const seq = ++model.styleSequence;
  let finished = false;
  let pollId = null;
  let timeoutId = null;

  const cleanup = () => {
    if (pollId) window.clearInterval(pollId);
    if (timeoutId) window.clearTimeout(timeoutId);
    map.off('style.load', handleStyleLoad);
    map.off('styledata', handleStyleData);
    map.off('idle', handleIdle);
    map.off('load', handleLoad);
    map.off('error', handleError);
  };

  const finish = () => {
    if (finished || seq !== model.styleSequence) return;
    finished = true;
    cleanup();
    onReady();
  };

  const styleLooksReady = () => {
    try {
      if (typeof map.isStyleLoaded === 'function' && map.isStyleLoaded()) return true;
    } catch {}
    try {
      const style = map.getStyle?.();
      return Boolean(style && style.layers && style.sources);
    } catch {}
    return false;
  };

  const handleStyleLoad = () => finish();
  const handleStyleData = () => { if (styleLooksReady()) finish(); };
  const handleIdle = () => { if (styleLooksReady()) finish(); };
  const handleLoad = () => { if (styleLooksReady()) finish(); };
  const handleError = () => { if (styleLooksReady()) finish(); };

  map.on('style.load', handleStyleLoad);
  map.on('styledata', handleStyleData);
  map.on('idle', handleIdle);
  map.on('load', handleLoad);
  map.on('error', handleError);

  queueMicrotask(() => { if (styleLooksReady()) finish(); });
  pollId = window.setInterval(() => { if (styleLooksReady()) finish(); }, 120);
  timeoutId = window.setTimeout(() => finish(), 5000);

  return cleanup;
}

function handleStyleReadyAfterBuild({ center, zoom, pitch, bearing, context = 'rebuild' } = {}) {
  model.styleReady = true;
  try {
    if (model.hasApiKey && model.terrainEnabled && ['satellite','topo','outdoor'].includes(model.mapStyleMode)) {
      try { model.map.enableTerrain(model.terrainExaggeration || 1.5); } catch {}
    }
    applyOverlaySourcesAndLayers();
    attachPopupHandlers();
    if (context === 'init') attachCursorStates();
    if (center && Number.isFinite(zoom)) model.map.jumpTo({ center, zoom, pitch, bearing });
    setRotationInteractions();
    applyPitch();
    updateOverlays();
    scheduleMarkerRefresh();
    refreshBasemapUiState();
    refreshStatusText();
    updateZoomReadout();
  } catch (error) {
    console.error(context === 'init' ? 'Overlay setup failed' : 'Rebuild overlay setup failed', error);
    if (els.statusText) els.statusText.textContent = context === 'init'
      ? 'Map style loaded, but an overlay step failed. The map should still be usable.'
      : 'Basemap changed, but an overlay step failed. The map should still be usable.';
  } finally {
    setLoadingState(false);
  }
}

function buildMapTilerStyleUrl(styleId) {
  const key = getSavedApiKey();
  if (!key) return null;
  return `https://api.maptiler.com/maps/${styleId}/style.json?key=${encodeURIComponent(key)}`;
}

function buildThunderforestRasterStyle(styleId) {
  const key = getSavedThunderforestKey();
  if (!key) return null;
  return {
    version: 8,
    sources: {
      thunderforest: {
        type: 'raster',
        tiles: [`https://tile.thunderforest.com/${styleId}/{z}/{x}/{y}.png?apikey=${encodeURIComponent(key)}`],
        tileSize: 256,
        attribution: '&copy; Thunderforest, &copy; OpenStreetMap contributors'
      }
    },
    layers: [{ id: `tf-${styleId}`, type: 'raster', source: 'thunderforest' }]
  };
}

function buildOsmFallbackStyle() {
  return {
    version: 8,
    sources: {
      osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' }
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
  };
}

function mapStyleForMode() {
  if (model.hasApiKey) {
    if (model.mapStyleMode === 'satellite') return buildMapTilerStyleUrl('hybrid');
    if (model.mapStyleMode === 'topo') return buildMapTilerStyleUrl('topo-v2');
    if (model.mapStyleMode === 'outdoor') return buildMapTilerStyleUrl('outdoor-v2');
  }
  if (model.mapStyleMode === 'tf_outdoors') return buildThunderforestRasterStyle('outdoors') || buildOsmFallbackStyle();
  return buildOsmFallbackStyle();
}

function refreshBasemapUiState() {
  if (!els.basemapSelect) return;
  const hasKey = Boolean(getSavedApiKey());
  const hasThunderforestKey = Boolean(getSavedThunderforestKey());
  model.hasApiKey = hasKey;

  [...els.basemapSelect.options].forEach((opt) => {
    if (opt.value === 'osm') {
      opt.disabled = false;
      opt.textContent = 'OpenStreetMap fallback';
      return;
    }
    if (opt.value === 'tf_outdoors') {
      opt.disabled = !hasThunderforestKey;
      opt.textContent = hasThunderforestKey ? 'Thunderforest Outdoors' : 'Thunderforest Outdoors - Disabled';
      return;
    }
    opt.disabled = !hasKey;
    if (opt.value === 'satellite') opt.textContent = hasKey ? 'Satellite Hybrid' : 'Satellite Hybrid (key required)';
    else if (opt.value === 'outdoor') opt.textContent = hasKey ? 'Outdoor' : 'Outdoor (key required)';
    else if (opt.value === 'topo') opt.textContent = hasKey ? 'Topo' : 'Topo (key required)';
  });

  const validModes = ['outdoor','satellite','topo','tf_outdoors','osm'];
  const current = validModes.includes(els.basemapSelect.value)
    ? els.basemapSelect.value
    : (validModes.includes(model.mapStyleMode) ? model.mapStyleMode : (hasKey ? 'outdoor' : 'osm'));
  const wantsMapTiler = ['satellite','topo','outdoor'].includes(current);
  const wantsThunderforest = current === 'tf_outdoors';
  if ((wantsMapTiler && !hasKey) || (wantsThunderforest && !hasThunderforestKey)) {
    els.basemapSelect.value = 'osm';
    model.mapStyleMode = 'osm';
    localStorage.setItem(STORAGE_KEYS.basemap, 'osm');
  } else if (els.basemapSelect.value !== current || model.mapStyleMode !== current) {
    els.basemapSelect.value = current;
    model.mapStyleMode = current;
    localStorage.setItem(STORAGE_KEYS.basemap, current);
  }

  const terrainCapable = hasKey && ['satellite','topo','outdoor'].includes(els.basemapSelect.value);
  if (els.toggleTerrain) els.toggleTerrain.disabled = !terrainCapable;
  if (els.terrainExaggerationSlider) els.terrainExaggerationSlider.disabled = !terrainCapable;
  if (els.togglePitch) els.togglePitch.disabled = !terrainCapable;
}

function setRotationInteractions() {
  if (!model.map) return;
  try { model.map.dragRotate?.enable(); } catch {}
  try { model.map.touchZoomRotate?.enable(); } catch {}
  try { model.map.touchZoomRotate?.enableRotation(); } catch {}
  try { model.map.touchPitch?.enable(); } catch {}
}

function updateTerrainExaggerationUi() {
  if (els.terrainExaggerationSlider) els.terrainExaggerationSlider.value = String(model.terrainExaggeration || 1.5);
  if (els.terrainExaggerationValue) els.terrainExaggerationValue.textContent = `${Number(model.terrainExaggeration || 1.5).toFixed(2)}×`;
}

function applyTerrainExaggeration() {
  updateTerrainExaggerationUi();
  if (!model.map || !model.hasApiKey || !model.terrainEnabled) return;
  if (!['satellite','topo','outdoor'].includes(model.mapStyleMode)) return;
  try {
    if (typeof model.map.setTerrainExaggeration === 'function') {
      model.map.setTerrainExaggeration(model.terrainExaggeration || 1.5);
      return;
    }
  } catch {}
}

function applyPitch() {
  if (!model.map) return;
  const wants3dView = model.hasApiKey && model.terrainEnabled && model.tiltEnabled && ['satellite','topo','outdoor'].includes(model.mapStyleMode);
  const currentBearing = Number.isFinite(model.map.getBearing?.()) ? model.map.getBearing() : 0;
  model.map.easeTo({ pitch: wants3dView ? 65 : 0, bearing: currentBearing, duration: 400 });
  setRotationInteractions();
}

function scheduleMarkerRefresh() {
  if (!model.map) return;
  window.setTimeout(() => { try { updateOverlays(); } catch {} }, 0);
  window.setTimeout(() => { try { updateOverlays(); } catch {} }, 180);
  window.setTimeout(() => { try { updateOverlays(); } catch {} }, 700);
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
  if (model.hasApiKey) maptilersdk.config.apiKey = getSavedApiKey();
  setLoadingState(true, 'Rebuilding map style…');
  beginStyleReadyWatch(() => handleStyleReadyAfterBuild({ center, zoom, pitch, bearing, context: 'rebuild' }));
  try {
    model.map.setStyle(mapStyleForMode());
  } catch (error) {
    console.error('setStyle failed', error);
    if (els.statusText) els.statusText.textContent = 'Basemap style change failed.';
    setLoadingState(false);
  }
}
