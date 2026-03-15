function buildMapTilerStyleUrl(styleId) {
  const key = getSavedApiKey();
  if (!key) return null;
  return `https://api.maptiler.com/maps/${styleId}/style.json?key=${encodeURIComponent(key)}`;
}

function mapStyleForMode() {
  if (model.hasApiKey) {
    if (model.mapStyleMode === 'satellite') return buildMapTilerStyleUrl('satellite');
    if (model.mapStyleMode === 'topo') return buildMapTilerStyleUrl('topo-v2');
    if (model.mapStyleMode === 'outdoor') return buildMapTilerStyleUrl('outdoor-v2');
  }
  return {
    version: 8,
    sources: {
      osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' }
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
  };
}

function refreshBasemapUiState() {
  if (!els.basemapSelect) return;
  const hasKey = Boolean(getSavedApiKey());
  model.hasApiKey = hasKey;
  [...els.basemapSelect.options].forEach((opt) => {
    if (opt.value === 'osm') {
      opt.disabled = false;
      opt.textContent = 'OpenStreetMap fallback';
      return;
    }
    opt.disabled = !hasKey;
    const plain = opt.textContent.replace(/ \(key required\)$/,'').replace(/ \(unavailable\)$/,'');
    opt.textContent = hasKey ? plain : `${plain} (key required)`;
  });
  if (!hasKey && els.basemapSelect.value !== 'osm') {
    els.basemapSelect.value = 'osm';
    model.mapStyleMode = 'osm';
    localStorage.setItem(STORAGE_KEYS.basemap, 'osm');
  }
  if (els.toggleTerrain) els.toggleTerrain.disabled = !hasKey || els.basemapSelect.value === 'osm';
  if (els.togglePitch) els.togglePitch.disabled = !hasKey || !model.terrainEnabled || els.basemapSelect.value === 'osm';
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
  const wants3dView = model.hasApiKey && model.terrainEnabled && model.tiltEnabled && model.mapStyleMode !== 'osm';
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
  model.map.setStyle(mapStyleForMode());
  model.map.once('style.load', () => {
    try {
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
      refreshBasemapUiState();
      refreshStatusText();
      updateZoomReadout();
    } catch (error) {
      console.error('Map style rebuild failed', error);
      if (els.statusText) els.statusText.textContent = `Map style rebuilt, but overlay setup failed: ${error?.message || error}`;
    } finally {
      setLoadingState(false);
    }
  });
}
