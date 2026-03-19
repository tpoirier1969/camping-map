(function () {
  const DATA = window.CAMPSITE_DATA;
  const versionEl = document.getElementById('versionText');
  const countsEl = document.getElementById('countsText');
  const baseSelect = document.getElementById('baseLayerSelect');
  const terrainSlider = document.getElementById('terrainSlider');
  const terrainValue = document.getElementById('terrainValue');
  const showCampgrounds = document.getElementById('showCampgrounds');
  const showOpportunities = document.getElementById('showOpportunities');

  versionEl.textContent = `${DATA.version} • ${DATA.generatedOn}`;

  const groupedPoints = buildGroupedPoints([...DATA.sites, ...DATA.opportunityAreas]);
  updateCounts();

  const style = makeStyle('hybrid');

  const map = new maplibregl.Map({
    container: 'map',
    style,
    center: DATA.center,
    zoom: DATA.zoom,
    pitch: 55,
    bearing: 0,
    hash: false,
    attributionControl: true
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'imperial' }), 'bottom-right');

  let activeMarkers = [];
  let spiderLegIds = [];
  let spiderMarkers = [];
  let openPopup = null;

  map.on('load', () => {
    ensureTerrain();
    renderMarkers();
  });

  map.on('style.load', () => {
    ensureTerrain();
    renderMarkers();
  });

  map.on('click', () => clearSpiderfy());
  map.on('moveend', () => renderMarkers());
  map.on('zoomend', () => renderMarkers());
  map.on('pitchend', () => renderMarkers());

  baseSelect.addEventListener('change', () => {
    clearSpiderfy();
    map.setStyle(makeStyle(baseSelect.value));
  });

  terrainSlider.addEventListener('input', () => {
    terrainValue.textContent = `${Number(terrainSlider.value).toFixed(2)}x`;
    ensureTerrain();
  });
  terrainValue.textContent = `${Number(terrainSlider.value).toFixed(2)}x`;

  showCampgrounds.addEventListener('change', () => {
    clearSpiderfy();
    renderMarkers();
    updateCounts();
  });

  showOpportunities.addEventListener('change', () => {
    clearSpiderfy();
    renderMarkers();
    updateCounts();
  });

  function updateCounts() {
    const campgroundCount = DATA.sites.length;
    const opportunityCount = DATA.opportunityAreas.length;
    countsEl.textContent = `${campgroundCount} campsite markers • ${opportunityCount} opportunity markers`;
  }

  function buildGroupedPoints(allPoints) {
    const groups = new Map();
    allPoints.forEach((item) => {
      const key = `${item.lat.toFixed(6)},${item.lng.toFixed(6)}`;
      if (!groups.has(key)) {
        groups.set(key, { key, lat: item.lat, lng: item.lng, items: [] });
      }
      groups.get(key).items.push(item);
    });
    return Array.from(groups.values());
  }

  function shouldShow(item) {
    if (item.kind === 'campground' && !showCampgrounds.checked) return false;
    if (item.kind === 'opportunity' && !showOpportunities.checked) return false;
    return true;
  }

  function getVisibleGroups() {
    return groupedPoints
      .map((group) => ({ ...group, items: group.items.filter(shouldShow) }))
      .filter((group) => group.items.length > 0);
  }

  function renderMarkers() {
    activeMarkers.forEach((marker) => marker.remove());
    activeMarkers = [];

    const bounds = map.getBounds();
    const visible = getVisibleGroups();

    visible.forEach((group) => {
      if (!bounds.contains([group.lng, group.lat])) return;
      const markerEl = document.createElement('button');
      markerEl.type = 'button';
      markerEl.className = buildMarkerClass(group.items);
      markerEl.setAttribute('aria-label', group.items.map((i) => i.name).join(', '));

      if (group.items.length > 1) {
        const badge = document.createElement('span');
        badge.className = 'marker-count';
        badge.textContent = String(group.items.length);
        markerEl.appendChild(badge);
      }

      markerEl.addEventListener('click', (event) => {
        event.stopPropagation();
        if (group.items.length === 1) {
          clearSpiderfy();
          openSinglePopup(group.items[0]);
        } else {
          spiderfyGroup(group);
        }
      });

      const marker = new maplibregl.Marker({ element: markerEl, anchor: 'center' })
        .setLngLat([group.lng, group.lat])
        .addTo(map);
      activeMarkers.push(marker);
    });
  }

  function buildMarkerClass(items) {
    const kinds = new Set(items.map((i) => i.kind));
    const categories = new Set(items.map((i) => i.category));

    let cls = 'site-marker';
    if (kinds.size > 1) return `${cls} mixed`;
    const first = items[0];
    if (first.kind === 'opportunity') return `${cls} opportunity`;
    if (categories.has('boondocking')) return `${cls} boondocking`;
    if (categories.has('modern')) return `${cls} modern`;
    return `${cls} rustic`;
  }

  function openSinglePopup(item) {
    if (openPopup) openPopup.remove();
    openPopup = new maplibregl.Popup({ offset: 14, closeButton: true, maxWidth: '360px' })
      .setLngLat([item.lng, item.lat])
      .setHTML(renderPopupHtml(item))
      .addTo(map);
  }

  function spiderfyGroup(group) {
    clearSpiderfy();
    if (group.items.length < 2) return;

    const centerPoint = map.project([group.lng, group.lat]);
    const radius = Math.max(38, 18 + (group.items.length * 6));
    const featureCollection = { type: 'FeatureCollection', features: [] };

    group.items.forEach((item, index) => {
      const angle = ((Math.PI * 2) / group.items.length) * index - (Math.PI / 2);
      const targetPoint = {
        x: centerPoint.x + (Math.cos(angle) * radius),
        y: centerPoint.y + (Math.sin(angle) * radius)
      };
      const targetLngLat = map.unproject(targetPoint);

      const legId = `spider-leg-${Date.now()}-${index}`;
      spiderLegIds.push(legId);
      featureCollection.features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [group.lng, group.lat],
            [targetLngLat.lng, targetLngLat.lat]
          ]
        },
        properties: { id: legId }
      });

      const el = document.createElement('button');
      el.type = 'button';
      el.className = buildSpiderMarkerClass(item);
      el.textContent = '';
      el.setAttribute('aria-label', item.name);
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        openSinglePopup(item);
      });

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([targetLngLat.lng, targetLngLat.lat])
        .addTo(map);
      spiderMarkers.push(marker);
    });

    addSpiderLegs(featureCollection);
  }

  function addSpiderLegs(fc) {
    const sourceId = 'spider-legs';
    const layerId = 'spider-legs-layer';

    if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    map.addSource(sourceId, {
      type: 'geojson',
      data: fc
    });

    map.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': '#1d2733',
        'line-width': 2,
        'line-dasharray': [1.25, 1.25]
      }
    });
  }

  function buildSpiderMarkerClass(item) {
    const classes = ['spider-marker'];
    if (item.kind === 'opportunity') classes.push('opportunity');
    else if (item.category === 'boondocking') classes.push('boondocking');
    else if (item.category === 'modern') classes.push('modern');
    else classes.push('rustic');
    return classes.join(' ');
  }

  function clearSpiderfy() {
    spiderMarkers.forEach((marker) => marker.remove());
    spiderMarkers = [];
    if (map.getLayer('spider-legs-layer')) map.removeLayer('spider-legs-layer');
    if (map.getSource('spider-legs')) map.removeSource('spider-legs');
  }

  function renderPopupHtml(item) {
    return `
      <div class="popup-card">
        <h3>${escapeHtml(item.name)}</h3>
        <div class="popup-meta">${escapeHtml(labelFor(item))}</div>
        <div class="popup-row"><strong>Fee:</strong> ${escapeHtml(item.fee || '—')}</div>
        <div class="popup-row"><strong>Access:</strong> ${escapeHtml(item.access || '—')}</div>
        <div class="popup-row"><strong>Coordinates:</strong> ${Number(item.lat).toFixed(6)}, ${Number(item.lng).toFixed(6)}</div>
        <div class="popup-row"><strong>Notes:</strong> ${escapeHtml(item.notes || '—')}</div>
        <div class="popup-row"><strong>Source:</strong> <a href="${item.sourceUrl}" target="_blank" rel="noopener">${escapeHtml(item.source)}</a></div>
      </div>
    `;
  }

  function labelFor(item) {
    if (item.kind === 'opportunity') return 'Opportunity area marker';
    if (item.category === 'boondocking') return `${titleCase(item.owner)} boondocking / dispersed`;
    return `${titleCase(item.owner)} ${titleCase(item.category)} campground`;
  }

  function titleCase(value) {
    return String(value || '')
      .split(/\s+/)
      .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
      .join(' ');
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function ensureTerrain() {
    if (!map.getSource('terrain-dem')) {
      map.addSource('terrain-dem', {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        tileSize: 256,
        encoding: 'terrarium',
        maxzoom: 14
      });
    }
    map.setTerrain({ source: 'terrain-dem', exaggeration: Number(terrainSlider.value) });
  }

  function makeStyle(base) {
    const rasterSources = {
      streets: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors'
      },
      hybridImagery: {
        type: 'raster',
        tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        attribution: 'Esri, Maxar, Earthstar Geographics'
      },
      hybridLabels: {
        type: 'raster',
        tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        attribution: 'Esri'
      },
      mobileAtlas: {
        type: 'raster',
        tiles: ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        attribution: 'USGS'
      },
      topo: {
        type: 'raster',
        tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        attribution: 'Esri'
      }
    };

    const layerMap = {
      streets: [{ id: 'streets', source: 'streets' }],
      hybrid: [
        { id: 'hybrid-imagery', source: 'hybridImagery' },
        { id: 'hybrid-labels', source: 'hybridLabels' }
      ],
      mobileAtlas: [{ id: 'mobile-atlas', source: 'mobileAtlas' }],
      topo: [{ id: 'topo', source: 'topo' }]
    };

    const sources = {};
    const layers = [];

    layerMap[base].forEach((entry) => {
      sources[entry.source] = rasterSources[entry.source];
      layers.push({
        id: entry.id,
        type: 'raster',
        source: entry.source,
        minzoom: 0,
        maxzoom: 22
      });
    });

    return {
      version: 8,
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      sources,
      layers
    };
  }
})();
