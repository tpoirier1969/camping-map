function popupHtmlForSite(props) {
  const parts = [];
  if (props.access) parts.push(`<div><strong>Access:</strong> ${escapeHtml(props.access)}</div>`);
  if (props.cost) parts.push(`<div><strong>Cost:</strong> ${escapeHtml(props.cost)}</div>`);
  if (props.showers) parts.push(`<div><strong>Showers:</strong> ${escapeHtml(props.showers)}</div>`);
  if (props.description) parts.push(`<div>${escapeHtml(props.description)}</div>`);
  return `<div class="popup-content"><div class="popup-title">${escapeHtml(props.name)}</div><div class="popup-meta">${escapeHtml(props.state)} · ${escapeHtml(props.layerLabel)}</div>${parts.join('')}<div class="popup-actions"><a href="${escapeAttribute(props.navigateUrl)}" target="_blank" rel="noopener noreferrer">Navigate</a>${props.website ? `<a href="${escapeAttribute(props.website)}" target="_blank" rel="noopener noreferrer">Website</a>` : ''}</div></div>`;
}

function popupHtmlForState(props) {
  return `<div class="popup-content"><div class="popup-title">${escapeHtml(props.state || 'State')}</div><div>Total campgrounds: ${props.campgrounds || 0}</div><div>Boondocking sites: ${props.boondocking || 0}</div><div>Info / reference: ${props.info || 0}</div><div class="popup-actions"><button type="button" id="zoomStateBtn">Zoom to state</button></div></div>`;
}

function popupHtmlForDraft(feature) {
  const [lng, lat] = feature.geometry.coordinates;
  const snippet = JSON.stringify({ name: 'New site', category: 'boondocking', state: '', lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), notes: '' }, null, 2);
  return `<div class="popup-content"><div class="popup-title">Draft site pin</div><div class="popup-meta">${lat.toFixed(6)}, ${lng.toFixed(6)}</div><div>Copy this into your dataset:</div><pre style="white-space:pre-wrap;max-width:280px;">${escapeHtml(snippet)}</pre><div class="popup-actions"><button type="button" id="copyDraftBtn">Copy JSON</button></div></div>`;
}

function attachPopupHandlers() {
  if (!model.map || model.popupHandlersBound) return;
  model.popupHandlersBound = true;
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
  const order = ['state-summary-circles', 'state-summary-labels', 'sites-circles', 'draft-circle', 'draft-label'];
  for (const id of order) {
    if (model.map.getLayer(id)) {
      try { model.map.moveLayer(id); } catch {}
    }
  }
}


function styleSupportsTextLayers() {
  const style = model.map?.getStyle?.();
  if (!style) return false;
  if (style.glyphs) return true;
  return (style.layers || []).some((layer) => layer.type === 'symbol' && layer.layout && layer.layout['text-field']);
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

  addLayerIfMissing({
    id: 'state-summary-circles', type: 'circle', source: 'state-summaries',
    paint: {
      'circle-radius': stateCircleRadiusExpression(),
      'circle-color': BUILTIN_BUCKETS.state_summary.color,
      'circle-opacity': 0.92,
      'circle-pitch-alignment': 'viewport',
      'circle-pitch-scale': 'viewport',
      'circle-emissive-strength': 1,
      'circle-stroke-color': '#121212',
      'circle-stroke-width': 1.4
    }
  }, beforeId);

  if (styleSupportsTextLayers()) {
    addLayerIfMissing({
      id: 'state-summary-labels', type: 'symbol', source: 'state-summaries',
      layout: { 'text-field': ['get', 'summaryLabel'], 'text-size': 11.5, 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'], 'text-offset': [0, 0], 'text-justify': 'center', 'text-anchor': 'center', 'text-line-height': 1.15 },
      paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.85)', 'text-halo-width': 1.8 }
    }, beforeId);
  }

  addLayerIfMissing({
    id: 'sites-circles', type: 'circle', source: 'sites',
    paint: {
      'circle-radius': ['*', ['coalesce', ['get', 'radius'], 11], ['case', ['<=', ['zoom'], 5], 0.72, ['<=', ['zoom'], 8.5], 0.88, 1]],
      'circle-color': ['get', 'color'],
      'circle-opacity': 0.96,
      'circle-pitch-alignment': 'viewport',
      'circle-pitch-scale': 'viewport',
      'circle-emissive-strength': 1,
      'circle-stroke-color': '#101010',
      'circle-stroke-width': 1.2
    }
  }, beforeId);

  addLayerIfMissing({
    id: 'draft-circle', type: 'circle', source: 'draft-site',
    paint: {
      'circle-radius': 11,
      'circle-color': BUILTIN_BUCKETS.draft.color,
      'circle-opacity': 0.9,
      'circle-stroke-color': '#111',
      'circle-stroke-width': 1.6
    }
  }, beforeId);

  moveOverlayLayersToTop();
}

function attachCursorStates() {
  if (model.cursorHandlersBound || !model.map) return;
  model.cursorHandlersBound = true;
  ['sites-circles', 'state-summary-circles', 'draft-circle'].forEach((layerId) => {
    if (!model.map.getLayer(layerId)) return;
    model.map.on('mouseenter', layerId, () => { model.map.getCanvas().style.cursor = 'pointer'; });
    model.map.on('mouseleave', layerId, () => { model.map.getCanvas().style.cursor = ''; });
  });
}

function sourceDataForSites() {
  return buildSiteGeoJson();
}

function setLayerVisibility(layerId, visible) {
  if (!model.map.getLayer(layerId)) return;
  model.map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
}

function siteMarkerSizeForZoom(zoom) {
  if (zoom <= 8.5) return 26;
  return 30;
}

function siteMarkerStrokeForZoom(zoom) {
  return zoom <= 8.5 ? '0.9' : '1.0';
}

function clearDomMarkers() {
  for (const marker of model.domMarkers) marker.remove();
  model.domMarkers = [];
}

function clearSummaryDomMarkers() {
  for (const marker of model.summaryDomMarkers) marker.remove();
  model.summaryDomMarkers = [];
}

function renderSummaryMarkers() {
  clearSummaryDomMarkers();
}

function renderDirectSiteMarkers() {
  clearDomMarkers();
  if (!model.map || !shouldShowSiteDetails() || !els.toggleSitePoints?.checked) return;
  const zoom = model.map.getZoom();
  const bounds = model.map.getBounds();
  const markerSize = siteMarkerSizeForZoom(zoom);
  const strokeScale = siteMarkerStrokeForZoom(zoom);
  const visibleSites = enabledSites().filter((site) => bounds.contains(site.lngLat)).slice(0, 500);
  for (const site of visibleSites) {
    const def = model.layerDefs.get(site.layerKey) || BUILTIN_BUCKETS.other;
    const el = document.createElement('div');
    el.className = 'site-dom-marker symbol-marker';
    el.style.width = `${markerSize}px`;
    el.style.height = `${markerSize}px`;
    el.innerHTML = markerPreviewHtml(site.bucket, def.color || hashColor(site.layerKey), markerSize).replace(/stroke-width="([0-9.]+)"/g, (_, value) => `stroke-width="${Number(value) * Number(strokeScale)}"`);
    el.addEventListener('click', () => {
      new maptilersdk.Popup({ closeButton: true, maxWidth: '340px' })
        .setLngLat(site.lngLat)
        .setHTML(popupHtmlForSite(site.feature.properties))
        .addTo(model.map);
    });
    const marker = new maptilersdk.Marker({ element: el, anchor: 'center' }).setLngLat(site.lngLat).addTo(model.map);
    model.domMarkers.push(marker);
  }
}

function updateCounts() {
  if (!els.countsGrid) return;
  const totals = new Map();
  for (const site of enabledSites()) {
    const label = model.layerDefs.get(site.layerKey)?.label || site.layerLabel;
    totals.set(label, (totals.get(label) || 0) + 1);
  }
  const ordered = [...totals.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  els.countsGrid.innerHTML = ordered.map(([label, count]) => `<div class="count-card"><strong>${count}</strong><span>${escapeHtml(label)}</span></div>`).join('');
}

function updateOverlays() {
  if (!model.map || !model.styleReady) return;
  const summarySource = model.map.getSource('state-summaries');
  const siteSource = model.map.getSource('sites');
  const draftSource = model.map.getSource('draft-site');
  if (summarySource?.setData) summarySource.setData(buildStateSummaryGeoJson());
  if (siteSource?.setData) siteSource.setData(sourceDataForSites());
  if (draftSource?.setData) draftSource.setData(model.draftFeature ? { type: 'FeatureCollection', features: [model.draftFeature] } : { type: 'FeatureCollection', features: [] });

  const showSiteDetails = shouldShowSiteDetails() && els.toggleSitePoints?.checked;
  const showSummaries = !showSiteDetails && els.toggleStateSummaries?.checked;
  setLayerVisibility('sites-circles', showSiteDetails);
  setLayerVisibility('state-summary-circles', showSummaries);
  setLayerVisibility('state-summary-labels', showSummaries);
  setLayerVisibility('draft-circle', Boolean(model.draftFeature));

  if (showSiteDetails) renderDirectSiteMarkers(); else clearDomMarkers();
  if (showSummaries) renderSummaryMarkers(); else clearSummaryDomMarkers();
  updateCounts();
  refreshStatusText();
  if (model.sites.length) setLoadingState(false);
}

function setDraftAt(lngLat) {
  model.draftFeature = { type: 'Feature', properties: { name: 'Draft site' }, geometry: { type: 'Point', coordinates: [lngLat.lng, lngLat.lat] } };
  updateOverlays();
  new maptilersdk.Popup({ closeButton: true, maxWidth: '360px' }).setLngLat([lngLat.lng, lngLat.lat]).setHTML(popupHtmlForDraft(model.draftFeature)).addTo(model.map);
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

  beginStyleReadyWatch(() => handleStyleReadyAfterBuild({ context: 'init' }));
  model.map.on('moveend', () => { updateZoomReadout(); updateOverlays(); });
  model.map.on('zoom', updateZoomReadout);
  model.map.on('zoomend', () => { updateZoomReadout(); updateOverlays(); });
  model.map.on('idle', () => { updateZoomReadout(); if (shouldShowSiteDetails()) renderDirectSiteMarkers(); });
  model.map.on('error', (event) => {
    console.error('Map error', event?.error || event);
    setLoadingState(false);
  });

  model.map.on('click', (event) => {
    if (!model.addMode) return;
    setDraftAt(event.lngLat);
    model.addMode = false;
    if (els.toggleAddMode) els.toggleAddMode.checked = false;
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
  setLoadingState(true, 'Loading data…');
  window.setTimeout(() => { if (model.sites.length || model.styleReady) setLoadingState(false); }, 6000);
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
    if (els.statusText) els.statusText.textContent = 'Map loaded, but campsite data is still not coming in. Check your data file path and network.';
    setLoadingState(false);
  });
}

main().catch((error) => {
  console.error(error);
  if (els.statusText) els.statusText.textContent = 'Something tripped during load. The build may still be partly usable, but check your data files and the browser console.';
  setLoadingState(false);
});
