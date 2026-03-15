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
      return;
    }
    opt.disabled = !hasKey;
    if (!hasKey) {
      const plain = opt.textContent.replace(/ \(key required\)$/,'');
      opt.textContent = `${plain} (key required)`;
    } else {
      opt.textContent = opt.textContent.replace(/ \(key required\)$/,'');
    }
  });
  if (!hasKey && els.basemapSelect.value !== 'osm') {
    els.basemapSelect.value = 'osm';
    model.mapStyleMode = 'osm';
    localStorage.setItem(STORAGE_KEYS.basemap, 'osm');
  }
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


function setSearchStatus(message = '') {
  if (els.searchStatus) els.searchStatus.textContent = message;
}

function clearSearchResults() {
  if (!els.searchResults) return;
  els.searchResults.innerHTML = '';
  els.searchResults.hidden = true;
}

function renderSearchResults(results = []) {
  if (!els.searchResults) return;
  els.searchResults.innerHTML = '';
  if (!results.length) {
    els.searchResults.hidden = true;
    return;
  }
  els.searchResults.hidden = false;
  for (const result of results.slice(0, 5)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'search-result-btn';
    const title = result.display_name || result.name || 'Search result';
    const subtitle = result.type ? `${result.type}` : '';
    btn.innerHTML = `<strong>${title}</strong>${subtitle ? `<small>${subtitle}</small>` : ''}`;
    btn.addEventListener('click', () => zoomToSearchResult(result));
    els.searchResults.appendChild(btn);
  }
}

function parseLatLngQuery(value = '') {
  const match = String(value).trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lon: lng, display_name: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, type: 'coordinates' };
}

function zoomToSearchResult(result) {
  if (!model.map || !result) return;
  const lat = Number(result.lat);
  const lon = Number(result.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  if (result.boundingbox && result.boundingbox.length === 4) {
    const [south, north, west, east] = result.boundingbox.map(Number);
    if ([south, north, west, east].every(Number.isFinite)) {
      model.map.fitBounds([[west, south], [east, north]], { padding: 48, duration: 800, maxZoom: 12 });
    } else {
      model.map.flyTo({ center: [lon, lat], zoom: 11, essential: true, speed: 0.9 });
    }
  } else {
    model.map.flyTo({ center: [lon, lat], zoom: 11, essential: true, speed: 0.9 });
  }
  setSearchStatus(`Centered on ${result.display_name || 'search result'}.`);
  clearSearchResults();
  if (els.searchInput) els.searchInput.blur();
}

async function runAreaSearch() {
  const raw = (els.searchInput?.value || '').trim();
  if (!raw) {
    setSearchStatus('Enter a place name or coordinates.');
    clearSearchResults();
    return;
  }

  const coords = parseLatLngQuery(raw);
  if (coords) {
    zoomToSearchResult(coords);
    return;
  }

  if (model.searchAbortController) model.searchAbortController.abort();
  model.searchAbortController = new AbortController();
  setSearchStatus('Searching…');
  clearSearchResults();

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(raw)}`;
    const response = await fetch(url, { signal: model.searchAbortController.signal, headers: { 'Accept': 'application/json' } });
    if (!response.ok) throw new Error(`Search failed (${response.status})`);
    const results = await response.json();
    if (!Array.isArray(results) || !results.length) {
      setSearchStatus('No matching place found.');
      clearSearchResults();
      return;
    }
    if (results.length === 1) {
      zoomToSearchResult(results[0]);
      return;
    }
    setSearchStatus('Choose a match.');
    renderSearchResults(results);
  } catch (error) {
    if (error?.name === 'AbortError') return;
    console.error(error);
    setSearchStatus('Search hit a snag. Try a more specific place name.');
    clearSearchResults();
  }
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
  refreshBasemapUiState();
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
  ensureBasemapOptions();
  els.menuToggle.addEventListener('click', () => els.menuPanel.classList.toggle('is-collapsed'));
  els.closeMenu.addEventListener('click', () => els.menuPanel.classList.add('is-collapsed'));
  els.revealKeySectionBtn?.addEventListener('click', () => {
    if (els.keySection) {
      const willShow = els.keySection.classList.contains('is-collapsed');
      els.keySection.classList.toggle('is-collapsed', !willShow);
      if (willShow) els.apiKeyInput?.focus();
    }
  });
  els.searchBtn?.addEventListener('click', runAreaSearch);
  els.searchInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runAreaSearch();
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
  refreshBasemapUiState();
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
