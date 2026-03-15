function buildLayerDefinitions() {
  model.layerDefs.clear();
  model.layerState.clear();
  for (const site of model.sites) {
    if (!model.layerDefs.has(site.layerKey)) {
      const bucketStyle = BUILTIN_BUCKETS[site.bucket] || BUILTIN_BUCKETS.other;
      model.layerDefs.set(site.layerKey, {
        key: site.layerKey,
        label: site.layerLabel,
        bucket: site.bucket,
        color: bucketStyle.color || hashColor(site.layerKey),
        radius: bucketStyle.radius || 8
      });
      model.layerState.set(site.layerKey, true);
    }
  }
  const sorted = [...model.layerDefs.values()].sort((a, b) => a.label.localeCompare(b.label));
  model.layerDefs = new Map(sorted.map((def) => [def.key, def]));
}

function michiganRegionKeyForLngLat(lngLat) {
  const lat = Number(lngLat?.[1]);
  const lng = Number(lngLat?.[0]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'MI';
  return lat >= 45.85 ? 'MI_UP' : 'MI_LP';
}

function summaryRegionKeyForSite(site) {
  const state = summaryStateForSite(site);
  if (state === 'MI') return michiganRegionKeyForLngLat(site?.lngLat);
  return state;
}

function summaryRegionLabel(regionKey) {
  switch (regionKey) {
    case 'MI_UP': return 'Michigan (U.P.)';
    case 'MI_LP': return 'Michigan (Lower)';
    default: return regionKey;
  }
}

function buildStateGroups() {
  model.stateGroups.clear();
  model.stateBBoxes.clear();
  model.stateSummaryByState.clear();
  for (const site of model.sites) {
    const summaryState = summaryRegionKeyForSite(site);
    if (!model.stateGroups.has(summaryState)) model.stateGroups.set(summaryState, []);
    model.stateGroups.get(summaryState).push(site);
  }
  for (const [state, sites] of model.stateGroups.entries()) {
    const lngs = sites.map((s) => s.lngLat[0]);
    const lats = sites.map((s) => s.lngLat[1]);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs), minLat = Math.min(...lats), maxLat = Math.max(...lats);
    model.stateBBoxes.set(state, [[minLng, minLat], [maxLng, maxLat]]);
    const centroid = getStateAnchorCoordinates(state, sites);
    const counts = summarizeSitesForState(sites);
    model.stateSummaryByState.set(state, {
      type: 'Feature',
      properties: { state, stateLabel: summaryRegionLabel(state), count: sites.length, campgrounds: counts.campgrounds, boondocking: counts.boondocking, info: counts.info, summaryLabel: stateSummaryLabel({ state: summaryRegionLabel(state), ...counts }) },
      geometry: { type: 'Point', coordinates: centroid }
    });
  }
}

function getStateAnchorCoordinates(state, sites = []) {
  const fixed = STATE_CENTERS[state];
  if (fixed) return fixed;
  if (!sites.length) return DEFAULT_CENTER;
  const lngs = sites.map((s) => s.lngLat[0]);
  const lats = sites.map((s) => s.lngLat[1]);
  return [(Math.min(...lngs) + Math.max(...lngs)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];
}

function offsetSummaryCoordinates(center, index, total, zoom = DEFAULT_ZOOM) {
  if (total <= 1) return center;
  const radius = zoom <= 5 ? 0.32 : 0.22;
  const patterns = {
    2: [[-0.18, 0], [0.18, 0]],
    3: [[0, 0.18], [-0.18, -0.08], [0.18, -0.08]],
    4: [[-0.18, 0.12], [0.18, 0.12], [-0.18, -0.12], [0.18, -0.12]]
  };
  const pattern = patterns[total] || patterns[4];
  const [dx, dy] = pattern[index % pattern.length];
  return [center[0] + dx * radius, center[1] + dy * radius];
}

function renderLayerControls() {
  if (!model.layerDefs.size) {
    els.layerToggleList.innerHTML = '<p>No campsite layers detected yet. If you expected them, the status line now tells you which site-data URLs were tried.</p>';
    return;
  }
  els.layerToggleList.innerHTML = '';
  for (const def of model.layerDefs.values()) {
    const row = document.createElement('label');
    row.className = 'switch-row';
    row.innerHTML = `<input type="checkbox" data-layer-key="${escapeAttribute(def.key)}" checked>
      ${markerPreviewHtml(def.bucket, def.color, 26)}
      <span>${escapeHtml(def.label)}</span>`;
    els.layerToggleList.appendChild(row);
  }
  els.layerToggleList.querySelectorAll('input[data-layer-key]').forEach((input) => {
    input.addEventListener('change', () => {
      model.layerState.set(input.dataset.layerKey, input.checked);
      updateOverlays();
    });
  });
}


function renderLegend() {
  if (els.legendList) els.legendList.innerHTML = '';
}

function renderSummaryLegendKey() {
  const host = document.getElementById('summaryLegendKey');
  if (!host) return;
  host.innerHTML = `
    <div class="summary-key-item"><span class="summary-key-circle" style="background:${BUILTIN_BUCKETS.state.color}">C</span><span>Campgrounds total</span></div>
    <div class="summary-key-item"><span class="summary-key-circle" style="background:${BUILTIN_BUCKETS.boondocking.color}">B</span><span>Boondocking total</span></div>
    <div class="summary-key-item"><span class="summary-key-circle" style="background:${BUILTIN_BUCKETS.info.color}">I</span><span>Info / reference total</span></div>`;
}


function syncTrailUi() {
  const hasTrails = trailSourceLoaded();
  if (els.trailSection) els.trailSection.hidden = true;
  if (els.trailStatusText) els.trailStatusText.textContent = 'Trail overlay removed from this build.';
}

function getPaddedBounds(bounds, factor = STATE_PADDING_FACTOR) {
  const [[minLng, minLat], [maxLng, maxLat]] = bounds;
  const latPad = (maxLat - minLat || 0.25) * factor;
  const lngPad = (maxLng - minLng || 0.25) * factor;
  return [[minLng - lngPad, minLat - latPad], [maxLng + lngPad, maxLat + latPad]];
}

function boundsContainBounds(outer, inner) {
  return outer[0][0] <= inner[0][0] && outer[0][1] <= inner[0][1] && outer[1][0] >= inner[1][0] && outer[1][1] >= inner[1][1];
}

function focusedOnSingleState() {
  if (!model.map) return null;
  const b = model.map.getBounds();
  const viewBounds = [[b.getWest(), b.getSouth()], [b.getEast(), b.getNorth()]];
  for (const [state, bounds] of model.stateBBoxes.entries()) {
    if (boundsContainBounds(getPaddedBounds(bounds), viewBounds)) return state;
  }
  return null;
}

function visibleStatesInViewport() {
  if (!model.map) return [];
  const bounds = model.map.getBounds();
  const states = new Set();
  for (const site of enabledSites()) {
    if (bounds.contains(site.lngLat)) states.add(summaryRegionKeyForSite(site));
  }
  return [...states];
}

function shouldShowSiteDetails() {
  if (!model.map) return false;
  const zoom = model.map.getZoom();
  return zoom >= 6.2;
}

function enabledSites() {
  return model.sites.filter((site) => model.layerState.get(site.layerKey) !== false);
}

function buildSiteGeoJson() {
  return { type: 'FeatureCollection', features: enabledSites().map((site) => site.feature) };
}


function desiredSummaryCountForState(sites = []) {
  const zoom = Number(model.map?.getZoom?.() ?? DEFAULT_ZOOM);
  if (zoom < 6.2) return 1;
  if (sites.length >= 160) return 4;
  if (sites.length >= 70) return 3;
  if (sites.length >= 18) return 2;
  return 1;
}

function splitSitesByAxis(sites = [], pieces = 1) {
  if (pieces <= 1 || sites.length <= 1) return [sites];
  const lngs = sites.map((s) => s.lngLat[0]);
  const lats = sites.map((s) => s.lngLat[1]);
  const lngSpread = Math.max(...lngs) - Math.min(...lngs);
  const latSpread = Math.max(...lats) - Math.min(...lats);
  const axis = lngSpread >= latSpread ? 0 : 1;
  const sorted = [...sites].sort((a, b) => a.lngLat[axis] - b.lngLat[axis]);
  const chunkSize = Math.ceil(sorted.length / pieces);
  const groups = [];
  for (let i = 0; i < sorted.length; i += chunkSize) groups.push(sorted.slice(i, i + chunkSize));
  return groups.filter(Boolean).filter((g) => g.length);
}

function summaryGroupsForState(sites = []) {
  const zoom = Number(model.map?.getZoom?.() ?? DEFAULT_ZOOM);
  const desired = desiredSummaryCountForState(sites);
  if (!sites.length) return [];
  if (desired <= 1 || sites.length < desired * 3) return [sites];

  const coarseCellSize = zoom <= 5 ? 5.2 : 2.4;
  const grouped = new Map();
  for (const site of sites) {
    const [lng, lat] = site.lngLat;
    const key = `${Math.floor((lng + 180) / coarseCellSize)}:${Math.floor((lat + 90) / coarseCellSize)}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(site);
  }

  let groups = [...grouped.values()].filter((g) => g.length).sort((a, b) => b.length - a.length);

  if (groups.length > desired) {
    const primary = groups.slice(0, desired - 1);
    const remainder = groups.slice(desired - 1).flat();
    groups = remainder.length ? [...primary, remainder] : primary;
  }

  if (groups.length < desired) groups = splitSitesByAxis(sites, desired);
  if (!groups.length) groups = [sites];
  return groups;
}


function buildStateSummaryGeoJson() {
  const byState = new Map();
  for (const site of enabledSites()) {
    const state = summaryRegionKeyForSite(site);
    if (!byState.has(state)) byState.set(state, []);
    byState.get(state).push(site);
  }
  const features = [];
  for (const [state, rawSites] of byState.entries()) {
    const sites = uniqueSitesForSummary(rawSites);
    const groups = summaryGroupsForState(sites);
    groups.forEach((group, idx) => {
      const uniqueGroup = uniqueSitesForSummary(group);
      const counts = summarizeSitesForState(uniqueGroup);
      const baseCenter = getStateAnchorCoordinates(state, uniqueGroup);
      const coordinates = offsetSummaryCoordinates(baseCenter, idx, groups.length, Number(model.map?.getZoom?.() ?? DEFAULT_ZOOM));
      features.push({
        type: 'Feature',
        properties: {
          state,
          stateLabel: summaryRegionLabel(state),
          clusterIndex: idx + 1,
          count: uniqueGroup.length,
          campgrounds: counts.campgrounds,
          boondocking: counts.boondocking,
          info: counts.info,
          summaryLabel: stateSummaryLabel({ state: summaryRegionLabel(state), ...counts })
        },
        geometry: { type: 'Point', coordinates }
      });
    });
  }
  return { type: 'FeatureCollection', features };
}


function buildTrailLabelGeoJson() {
  if (!model.trails?.features?.length) return { type: 'FeatureCollection', features: [] };
  const feats = model.trails.features.flatMap((f, idx) => {
    const geom = f.geometry;
    if (!geom) return [];
    const name = f.properties?.name || f.properties?.title || `Trail ${idx + 1}`;
    if (geom.type === 'LineString' && geom.coordinates.length) {
      const mid = geom.coordinates[Math.floor(geom.coordinates.length / 2)];
      return [{ type: 'Feature', properties: { name }, geometry: { type: 'Point', coordinates: mid } }];
    }
    if (geom.type === 'MultiLineString' && geom.coordinates.length && geom.coordinates[0].length) {
      const line = geom.coordinates[0];
      const mid = line[Math.floor(line.length / 2)];
      return [{ type: 'Feature', properties: { name }, geometry: { type: 'Point', coordinates: mid } }];
    }
    return [];
  });
  return { type: 'FeatureCollection', features: feats };
}

function stateCircleRadiusExpression() {
  const sizeByCount = ['interpolate', ['linear'], ['+', ['get', 'campgrounds'], ['get', 'boondocking'], ['get', 'info']], 1, 18, 10, 22, 25, 26, 50, 30, 100, 34];
  return ['*', sizeByCount, ['case', ['<=', ['zoom'], 3], 0.9, ['<=', ['zoom'], 5], 0.8, ['<=', ['zoom'], 8], 0.92, 1]];
}
