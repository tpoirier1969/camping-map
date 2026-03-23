function popupHtmlForSite(props) {
  const parts = [];
  if (props.campgroundType) parts.push(`<div><strong>Type:</strong> ${escapeHtml(titleCase(props.campgroundType))}</div>`);
  if (props.access) parts.push(`<div><strong>Access:</strong> ${escapeHtml(props.access)}</div>`);
  if (props.cost) parts.push(`<div><strong>Cost:</strong> ${escapeHtml(props.cost)}</div>`);
  if (props.showers) parts.push(`<div><strong>Showers:</strong> ${escapeHtml(props.showers)}</div>`);
  if (props.description) parts.push(`<div>${escapeHtml(props.description)}</div>`);
  return `<div class="popup-content"><div class="popup-title">${escapeHtml(props.name)}</div><div class="popup-meta">${escapeHtml(props.state)} · ${escapeHtml(props.layerLabel)}${props.campgroundType ? ` · ${escapeHtml(titleCase(props.campgroundType))}` : ''}</div>${parts.join('')}<div class="popup-actions"><a href="${escapeAttribute(props.navigateUrl)}" target="_blank" rel="noopener noreferrer">Navigate</a>${props.website ? `<a href="${escapeAttribute(props.website)}" target="_blank" rel="noopener noreferrer">Website</a>` : ''}</div></div>`;
}

function popupHtmlForState(props) {
  return `<div class="popup-content"><div class="popup-title">${escapeHtml(props.state || 'State')}</div><div>Total campgrounds: ${props.campgrounds || 0}</div><div>Boondocking sites: ${props.boondocking || 0}</div><div>Info / reference: ${props.info || 0}</div><div class="popup-actions"><button type="button" id="zoomStateBtn">Zoom to state</button></div></div>`;
}

function popupHtmlForZone(props = {}) {
  return `<div class="popup-content"><div class="popup-title">${escapeHtml(props.name || 'Boondocking zone')}</div><div class="popup-meta">${escapeHtml(props.manager || 'Public land')} · ${escapeHtml(props.kind || 'Broad dispersed-camping area')}</div><div>${escapeHtml(props.rule || '')}</div>${props.notes ? `<div style="margin-top:8px;">${escapeHtml(props.notes)}</div>` : ''}${props.website ? `<div class="popup-actions"><a href="${escapeAttribute(props.website)}" target="_blank" rel="noopener noreferrer">Source</a></div>` : ''}</div>`;
}

function popupHtmlForDraft(feature) {
  const [lng, lat] = feature.geometry.coordinates;
  return `<div class="popup-content">
    <div class="popup-title">Draft site pin</div>
    <div class="popup-meta">${lat.toFixed(6)}, ${lng.toFixed(6)}</div>
    <div class="draft-form-grid">
      <input id="draftNameInput" type="text" placeholder="Site name">
      <select id="draftCategorySelect">
        <option value="boondocking">Boondocking</option>
        <option value="state">State campground</option>
        <option value="federal">Federal campground</option>
        <option value="private">Private campground</option>
        <option value="local">Local campground</option>
        <option value="info">Info / reference</option>
      </select>
      <input id="draftStateInput" type="text" placeholder="State (example: MI)">
      <input id="draftWebsiteInput" type="text" placeholder="Website URL">
      <input id="draftAmenitiesInput" type="text" placeholder="Amenities (comma separated)">
      <textarea id="draftNotesInput" placeholder="Notes"></textarea>
    </div>
    <div class="popup-actions">
      <button type="button" id="appendDraftBtn">Append to queue</button>
      <button type="button" id="copyDraftBtn">Copy JSON</button>
    </div>
  </div>`;
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
    openDraftPopup(feature.geometry.coordinates, feature);
  });

  ['boondocking-zones-fill','boondocking-zones-outline'].forEach((layerId) => {
    model.map.on('click', layerId, (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const lngLat = event.lngLat ? [event.lngLat.lng, event.lngLat.lat] : (feature.geometry.type === 'Polygon' ? feature.geometry.coordinates[0][0] : DEFAULT_CENTER);
      openSitePopup(lngLat, popupHtmlForZone(feature.properties || {}));
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
  const order = ['boondocking-zones-fill','boondocking-zones-outline','state-summary-circles', 'state-summary-labels', 'draft-circle', 'draft-label', 'sites-circles'];
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
  ensureSource('boondocking-zones', { type: 'geojson', data: model.boondockingZones || { type: 'FeatureCollection', features: [] } });

  addLayerIfMissing({
    id: 'boondocking-zones-fill', type: 'fill', source: 'boondocking-zones',
    paint: {
      'fill-color': ['coalesce', ['get', 'fill'], '#49a35a'],
      'fill-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.16, 8, 0.12, 12, 0.06]
    }
  }, beforeId);

  addLayerIfMissing({
    id: 'boondocking-zones-outline', type: 'line', source: 'boondocking-zones',
    paint: {
      'line-color': ['coalesce', ['get', 'stroke'], '#2e6c3b'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.4, 10, 2.2],
      'line-opacity': 0.9
    }
  }, beforeId);

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

  if (model.map.getLayer('state-summary-labels')) {
    try { model.map.removeLayer('state-summary-labels'); } catch {}
  }

  addLayerIfMissing({
    id: 'sites-circles', type: 'circle', source: 'sites',
    paint: {
      'circle-radius': ['*', ['coalesce', ['get', 'radius'], 11], ['case', ['<', ['zoom'], 8], 0.95, ['<', ['zoom'], 10], 1.1, 1.2]],
      'circle-color': ['get', 'color'],
      'circle-opacity': 0.96,
      'circle-pitch-alignment': 'viewport',
      'circle-pitch-scale': 'viewport',
      'circle-emissive-strength': 1,
      'circle-stroke-color': '#101010',
      'circle-stroke-width': ['case', ['<', ['zoom'], 8], 1.5, ['<', ['zoom'], 10], 1.8, 2.1]
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
  if (zoom < 8) return 38;
  if (zoom < 10) return 52;
  if (zoom < 12) return 56;
  return 60;
}

function siteMarkerStrokeForZoom(zoom) {
  return zoom < 8 ? '1.1' : (zoom < 10 ? '1.35' : '1.5');
}

function clearDomMarkers() {
  for (const marker of model.domMarkers) marker.remove();
  model.domMarkers = [];
}

function clearSummaryDomMarkers() {
  for (const marker of model.summaryDomMarkers) {
    try { marker.remove(); } catch {}
  }
  model.summaryDomMarkers = [];
}

function summaryBadgeHtml(bucketKey, color, count) {
  return `<span class="summary-badge summary-badge-${bucketKey}"><span class="summary-badge-icon">${markerPreviewHtml(bucketKey, color, 14)}</span><span class="summary-badge-count">${count || 0}</span></span>`;
}

function summaryMarkerHtml(counts = {}) {
  return `<span class="summary-marker-cluster">
    <span class="summary-marker-top">${summaryBadgeHtml('state', BUILTIN_BUCKETS.state.color, counts.campgrounds || 0)}</span>
    <span class="summary-marker-bottom">${summaryBadgeHtml('boondocking', BUILTIN_BUCKETS.boondocking.color, counts.boondocking || 0)}${summaryBadgeHtml('info', BUILTIN_BUCKETS.info.color, counts.info || 0)}</span>
  </span>`;
}

function renderSummaryMarkers() {
  clearSummaryDomMarkers();
  const summariesEnabled = els.toggleStateSummaries ? els.toggleStateSummaries.checked : true;
  if (!model.map || shouldShowSiteDetails() || !summariesEnabled) return;
  const fc = buildStateSummaryGeoJson();
  for (const feature of fc.features) {
    const props = feature.properties || {};
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'summary-dom-marker';
    el.setAttribute('aria-label', `${props.stateLabel || props.state || 'State'} summary`);
    el.innerHTML = summaryMarkerHtml(props);
    el.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const bounds = model.stateBBoxes.get(props.state);
      if (bounds) model.map.fitBounds(bounds, { padding: 32, duration: 650 });
    });
    const marker = new maptilersdk.Marker({ element: el, anchor: 'center' })
      .setLngLat(feature.geometry.coordinates)
      .addTo(model.map);
    model.summaryDomMarkers.push(marker);
  }
}


function buildDraftRecordFromPopup(feature, rootEl) {
  const [lng, lat] = feature.geometry.coordinates;
  const amenitiesRaw = rootEl.querySelector('#draftAmenitiesInput')?.value || '';
  return {
    name: (rootEl.querySelector('#draftNameInput')?.value || 'New site').trim(),
    category: (rootEl.querySelector('#draftCategorySelect')?.value || 'boondocking').trim(),
    state: (rootEl.querySelector('#draftStateInput')?.value || '').trim(),
    website: (rootEl.querySelector('#draftWebsiteInput')?.value || '').trim(),
    amenities: amenitiesRaw.split(',').map((v) => v.trim()).filter(Boolean),
    notes: (rootEl.querySelector('#draftNotesInput')?.value || '').trim(),
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6))
  };
}

async function copyDraftRecord(record, btn) {
  const text = JSON.stringify(record);
  try {
    await navigator.clipboard.writeText(text);
    if (btn) btn.textContent = 'Copied';
    refreshDraftQueueUi('Draft JSON copied.');
  } catch (error) {
    console.error(error);
    if (btn) btn.textContent = 'Copy failed';
    refreshDraftQueueUi('Copy failed on this device.');
  }
}

function appendDraftRecord(record) {
  model.manualDraftQueue.push(JSON.stringify(record));
  saveManualDraftQueue();
  refreshDraftQueueUi('Draft appended to queue.');
  model.draftFeature = null;
  updateOverlays();
  closeActivePopup();
}

function openDraftPopup(lngLat, feature) {
  closeActivePopup();
  const popup = new maptilersdk.Popup({ closeButton: true, maxWidth: '360px' })
    .setLngLat(lngLat)
    .setHTML(popupHtmlForDraft(feature))
    .addTo(model.map);
  popup.on('open', () => {
    const rootEl = popup.getElement();
    const appendBtn = rootEl.querySelector('#appendDraftBtn');
    const copyBtn = rootEl.querySelector('#copyDraftBtn');
    appendBtn?.addEventListener('click', () => {
      const record = buildDraftRecordFromPopup(feature, rootEl);
      appendDraftRecord(record);
    });
    copyBtn?.addEventListener('click', () => {
      const record = buildDraftRecordFromPopup(feature, rootEl);
      copyDraftRecord(record, copyBtn);
    });
  });
  popup.on('close', () => {
    if (model.activePopup === popup) model.activePopup = null;
  });
  model.activePopup = popup;
}

function closeActivePopup() {
  if (!model.activePopup) return;
  try { model.activePopup.remove(); } catch {}
  model.activePopup = null;
}

function openSitePopup(lngLat, html) {
  closeActivePopup();
  const popup = new maptilersdk.Popup({ closeButton: true, maxWidth: '340px' })
    .setLngLat(lngLat)
    .setHTML(html)
    .addTo(model.map);
  popup.on('close', () => {
    if (model.activePopup === popup) model.activePopup = null;
  });
  model.activePopup = popup;
}


function clusterSitesByScreenPosition(sites = [], thresholdPx = 28) {
  if (!model.map || !sites.length) return sites.map((site) => ({ site, displayLngLat: site.lngLat }));
  const projected = sites.map((site) => ({
    site,
    point: model.map.project(site.lngLat),
    sortKey: `${String(site.layerLabel || '')}|${String(site.name || '')}`.toLowerCase()
  })).sort((a, b) => (a.point.y - b.point.y) || (a.point.x - b.point.x) || a.sortKey.localeCompare(b.sortKey));
  const groups = [];
  const thresholdSq = thresholdPx * thresholdPx;
  for (const item of projected) {
    let matched = null;
    for (const group of groups) {
      const dx = item.point.x - group.center.x;
      const dy = item.point.y - group.center.y;
      if ((dx * dx) + (dy * dy) <= thresholdSq) {
        matched = group;
        break;
      }
    }
    if (!matched) {
      matched = { items: [], center: { x: item.point.x, y: item.point.y } };
      groups.push(matched);
    }
    matched.items.push(item);
    const count = matched.items.length;
    matched.center = {
      x: matched.items.reduce((sum, entry) => sum + entry.point.x, 0) / count,
      y: matched.items.reduce((sum, entry) => sum + entry.point.y, 0) / count
    };
  }

  const placements = [];
  for (const group of groups) {
    const ordered = [...group.items].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    if (ordered.length === 1) {
      placements.push({ site: ordered[0].site, displayLngLat: ordered[0].site.lngLat });
      continue;
    }
    const baseRadius = Math.max(30, thresholdPx * 1.28);
    for (let idx = 0; idx < ordered.length; idx += 1) {
      const ring = Math.floor(idx / 8);
      const posInRing = idx % 8;
      const countInRing = Math.min(8, ordered.length - (ring * 8));
      const angle = (-Math.PI / 2) + ((Math.PI * 2) * (posInRing / countInRing));
      const radius = baseRadius + (ring * (thresholdPx * 1.05));
      const displaced = {
        x: group.center.x + Math.cos(angle) * radius,
        y: group.center.y + Math.sin(angle) * radius
      };
      const lngLat = model.map.unproject(displaced);
      placements.push({ site: ordered[idx].site, displayLngLat: [lngLat.lng, lngLat.lat], groupSize: ordered.length, clusterIndex: idx + 1 });
    }
  }
  return placements;
}

function renderDirectSiteMarkers() {
  clearDomMarkers();
  const sitePointsEnabled = els.toggleSitePoints ? els.toggleSitePoints.checked : true;
  if (!model.map || !shouldShowSiteDetails() || !sitePointsEnabled) return;
  const zoom = model.map.getZoom();
  const bounds = model.map.getBounds();
  const markerSize = siteMarkerSizeForZoom(zoom);
  const visualSize = Math.max(24, markerSize - 12);
  const strokeScale = siteMarkerStrokeForZoom(zoom);
  const visibleSites = enabledSites().filter((site) => bounds.contains(site.lngLat)).slice(0, 1200);
  const placedSites = clusterSitesByScreenPosition(visibleSites, Math.max(42, markerSize * 1.35));
  for (const placed of placedSites) {
    const site = placed.site;
    const def = model.layerDefs.get(site.layerKey) || BUILTIN_BUCKETS.other;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'site-dom-marker symbol-marker';
    el.setAttribute('aria-label', site.name || 'Campsite');
    if (placed.groupSize > 1) el.setAttribute('title', `${site.name} (${placed.clusterIndex}/${placed.groupSize})`);
    el.style.width = `${markerSize}px`;
    el.style.height = `${markerSize}px`;
    el.innerHTML = `<span class="site-marker-hit" style="width:${markerSize}px;height:${markerSize}px">${markerPreviewHtml(site.bucket, def.color || hashColor(site.layerKey), visualSize, site.campgroundType).replace(/stroke-width="([0-9.]+)"/g, (_, value) => `stroke-width="${Number(value) * Number(strokeScale)}"`)}</span>`;
    el.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      openSitePopup(placed.displayLngLat, popupHtmlForSite(site.feature.properties));
    });
    const marker = new maptilersdk.Marker({ element: el, anchor: 'center' }).setLngLat(placed.displayLngLat).addTo(model.map);
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
  const zoneSource = model.map.getSource('boondocking-zones');
  if (summarySource?.setData) summarySource.setData(buildStateSummaryGeoJson());
  if (siteSource?.setData) siteSource.setData(sourceDataForSites());
  if (draftSource?.setData) draftSource.setData(model.draftFeature ? { type: 'FeatureCollection', features: [model.draftFeature] } : { type: 'FeatureCollection', features: [] });
  if (zoneSource?.setData) zoneSource.setData(model.boondockingZones || { type: 'FeatureCollection', features: [] });

  const sitePointsEnabled = els.toggleSitePoints ? els.toggleSitePoints.checked : true;
  const summariesEnabled = els.toggleStateSummaries ? els.toggleStateSummaries.checked : true;
  const showSiteDetails = shouldShowSiteDetails() && sitePointsEnabled;
  const showSummaries = !showSiteDetails && summariesEnabled;
  setLayerVisibility('sites-circles', showSiteDetails);
  setLayerVisibility('state-summary-circles', false);
  setLayerVisibility('state-summary-labels', false);
  setLayerVisibility('draft-circle', Boolean(model.draftFeature));
  const zonesEnabled = els.toggleBoondockingZones ? els.toggleBoondockingZones.checked : true;
  setLayerVisibility('boondocking-zones-fill', zonesEnabled);
  setLayerVisibility('boondocking-zones-outline', zonesEnabled);
  if (zonesEnabled && typeof scheduleBoondockingZoneRefresh === 'function') scheduleBoondockingZoneRefresh(false);

  if (showSiteDetails) renderDirectSiteMarkers(); else clearDomMarkers();
  if (showSummaries) renderSummaryMarkers(); else clearSummaryDomMarkers();
  updateCounts();
  refreshStatusText();
  if (model.sites.length) setLoadingState(false);
}

function setDraftAt(lngLat) {
  model.draftFeature = { type: 'Feature', properties: { name: 'Draft site' }, geometry: { type: 'Point', coordinates: [lngLat.lng, lngLat.lat] } };
  updateOverlays();
  openDraftPopup([lngLat.lng, lngLat.lat], model.draftFeature);
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
  model.map.on('idle', () => { updateZoomReadout(); if (shouldShowSiteDetails()) renderDirectSiteMarkers(); if (els.toggleBoondockingZones?.checked && typeof scheduleBoondockingZoneRefresh === 'function') scheduleBoondockingZoneRefresh(false); });
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
