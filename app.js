
const MAP_CENTER = [44.8, -89.5];
const MAP_ZOOM = 6;

const state = {
  map: null,
  clusterGroup: null,
  allSites: [],
  visibleLayers: new Set([
    'Boondocking',
    'State / County / Town Campgrounds',
    'Federal Lands',
    'Private Campgrounds',
    'Info / Reference'
  ]),
  selectedSite: null,
  movingSiteId: null,
  deferredPrompt: null,
  userMovedSheet: false,
};

const STORAGE_KEY = 'camping-map-edits-v1';
const SHEET_POSITION_KEY = 'camping-map-sheet-position-v1';

const LAYER_STYLE = {
  'Boondocking': { color: '#355e3b', label: 'Boondocking', chipText: '#fffdf7', clusterClass: 'cluster-boondocking' },
  'State / County / Town Campgrounds': { color: '#b9965b', label: 'State / County / Town', chipText: '#fffaf2', clusterClass: 'cluster-public' },
  'Federal Lands': { color: '#d07a2d', label: 'Federal Lands', chipText: '#fffaf2', clusterClass: 'cluster-federal' },
  'Private Campgrounds': { color: '#7c5533', label: 'Private Campgrounds', chipText: '#fffaf2', clusterClass: 'cluster-private' },
  'Info / Reference': { color: '#d1b93a', label: 'Info / Reference', chipText: '#3b3206', clusterClass: 'cluster-info' },
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  initMap();
  initUI();
  await loadSites();
  registerServiceWorker();
  initFloatingSheet();
}

function initMap() {
  state.map = L.map('map', {
    zoomControl: false,
    preferCanvas: true,
  }).setView(MAP_CENTER, MAP_ZOOM);

  L.control.zoom({ position: 'bottomright' }).addTo(state.map);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(state.map);

  state.clusterGroup = L.markerClusterGroup({
    maxClusterRadius: (zoom) => {
      if (window.innerWidth <= 700) return zoom >= 9 ? 24 : 34;
      return zoom >= 9 ? 28 : 40;
    },
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    removeOutsideVisibleBounds: true,
    chunkedLoading: true,
    disableClusteringAtZoom: 11,
    iconCreateFunction: createClusterIcon,
  });

  state.map.addLayer(state.clusterGroup);
  state.map.on('click', onMapClick);
  document.getElementById('recenterBtn').addEventListener('click', () => {
    state.map.setView(MAP_CENTER, MAP_ZOOM);
  });
}

function initUI() {
  document.getElementById('searchInput').addEventListener('input', renderSites);
  document.getElementById('closeSheetBtn').addEventListener('click', clearSelection);
  document.getElementById('moveSiteBtn').addEventListener('click', startMoveMode);
  document.getElementById('copyCoordsBtn').addEventListener('click', copyCoords);
  document.getElementById('addSiteBtn').addEventListener('click', openAddSiteDialog);
  document.getElementById('manageEditsBtn').addEventListener('click', () => document.getElementById('editsDialog').showModal());
  document.getElementById('closeEditsBtn').addEventListener('click', () => document.getElementById('editsDialog').close());
  document.getElementById('cancelAddSiteBtn').addEventListener('click', closeAddSiteDialog);
  document.getElementById('cancelAddSiteTopBtn').addEventListener('click', closeAddSiteDialog);
  document.getElementById('addSiteForm').addEventListener('submit', handleAddSiteSubmit);
  document.getElementById('exportBtn').addEventListener('click', exportEdits);
  document.getElementById('importInput').addEventListener('change', importEdits);
  document.getElementById('locateBtn').addEventListener('click', locateMe);
  document.getElementById('dockSheetBtn').addEventListener('click', resetSheetPosition);

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredPrompt = e;
    document.getElementById('installBtn').classList.remove('hidden');
  });

  document.getElementById('installBtn').addEventListener('click', async () => {
    if (!state.deferredPrompt) return;
    state.deferredPrompt.prompt();
    await state.deferredPrompt.userChoice;
    state.deferredPrompt = null;
    document.getElementById('installBtn').classList.add('hidden');
  });

  renderLayerChips();
}

function renderLayerChips() {
  const chipWrap = document.getElementById('layerChips');
  chipWrap.innerHTML = '';
  Object.keys(LAYER_STYLE).forEach((layer) => {
    const btn = document.createElement('button');
    btn.className = 'chip active';
    btn.textContent = LAYER_STYLE[layer].label;
    btn.dataset.layer = layer;
    btn.style.background = LAYER_STYLE[layer].color;
    btn.style.borderColor = LAYER_STYLE[layer].color;
    btn.style.color = LAYER_STYLE[layer].chipText;
    btn.addEventListener('click', () => {
      if (state.visibleLayers.has(layer)) state.visibleLayers.delete(layer);
      else state.visibleLayers.add(layer);
      btn.classList.toggle('active', state.visibleLayers.has(layer));
      renderSites();
    });
    chipWrap.appendChild(btn);
  });
}

async function loadSites() {
  const baseSites = await fetch('data/sites.json').then(r => r.json());
  const edits = getStoredEdits();

  const mergedMap = new Map();
  for (const site of baseSites) mergedMap.set(site.id, { ...site, isUserAdded: false });

  for (const [id, value] of Object.entries(edits.overrides || {})) {
    if (mergedMap.has(id)) mergedMap.set(id, { ...mergedMap.get(id), ...value, isEdited: true });
  }
  for (const site of edits.additions || []) {
    mergedMap.set(site.id, { ...site, isUserAdded: true, isEdited: true });
  }

  state.allSites = Array.from(mergedMap.values());
  renderSites();
}

function renderSites() {
  const query = document.getElementById('searchInput').value.trim().toLowerCase();
  state.clusterGroup.clearLayers();

  const visible = state.allSites.filter(site => {
    const layerOk = state.visibleLayers.has(site.layer);
    const text = `${site.name} ${site.layer} ${site.sourceFolder} ${site.descriptionText || ''}`.toLowerCase();
    const queryOk = !query || text.includes(query);
    return layerOk && queryOk;
  });

  visible.forEach(site => {
    const style = LAYER_STYLE[site.layer] || { color: '#355e3b' };
    const marker = L.circleMarker([site.lat, site.lng], {
      radius: 8,
      color: '#efe6d2',
      weight: 2,
      fillColor: style.color,
      fillOpacity: 0.95,
      className: 'site-marker'
    });

    marker.siteLayer = site.layer;
    marker.on('click', () => selectSite(site, marker));

    marker.bindPopup(`
      <div class="popup-title">${escapeHtml(site.name)}</div>
      <div class="popup-meta">${escapeHtml(site.layer)} · ${escapeHtml(site.sourceFolder || '')}</div>
      <div>${truncate(escapeHtml(site.descriptionText || 'No description yet.'), 150)}</div>
      <div class="popup-actions">
        <button onclick="window.__campingMap.selectById('${site.id}')">Details</button>
        <button onclick="window.__campingMap.moveById('${site.id}')">Move</button>
      </div>
    `);

    state.clusterGroup.addLayer(marker);
    site.__marker = marker;
  });
}

function createClusterIcon(cluster) {
  const counts = {};
  for (const marker of cluster.getAllChildMarkers()) {
    const key = marker.siteLayer || 'Boondocking';
    counts[key] = (counts[key] || 0) + 1;
  }
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Boondocking';
  const style = LAYER_STYLE[dominant] || LAYER_STYLE['Boondocking'];
  const count = cluster.getChildCount();
  const sizeClass = count < 10 ? 'marker-cluster-small' : count < 50 ? 'marker-cluster-medium' : 'marker-cluster-large';
  return L.divIcon({
    html: `<div><span>${count}</span></div>`,
    className: `marker-cluster ${sizeClass} ${style.clusterClass}`,
    iconSize: L.point(40, 40)
  });
}

function selectSite(site, marker = null) {
  state.selectedSite = site;
  const title = document.getElementById('detailTitle');
  const meta = document.getElementById('detailMeta');
  const body = document.getElementById('detailBody');
  const moveBtn = document.getElementById('moveSiteBtn');
  const copyBtn = document.getElementById('copyCoordsBtn');

  title.textContent = site.name;
  meta.innerHTML = [
    pill(site.layer),
    pill(site.sourceFolder || 'Imported'),
    pill(`${site.lat.toFixed(5)}, ${site.lng.toFixed(5)}`),
    site.isEdited ? pill('Edited') : '',
    site.isUserAdded ? pill('User added') : '',
  ].join('');

  body.innerHTML = site.descriptionHtml?.trim()
    ? sanitizeDescription(site.descriptionHtml)
    : `<p>${escapeHtml(site.descriptionText || 'No description yet.')}</p>`;

  moveBtn.disabled = false;
  copyBtn.disabled = false;

  if (marker) marker.openPopup();
  else if (site.__marker) site.__marker.openPopup();

  if (!state.userMovedSheet) resetSheetPosition();
}

function clearSelection() {
  state.selectedSite = null;
  state.movingSiteId = null;
  document.getElementById('detailTitle').textContent = 'Pick a marker';
  document.getElementById('detailMeta').innerHTML = '';
  document.getElementById('detailBody').innerHTML = '<p>Tap a marker to see details, move a bad pin, or add a new site.</p>';
  document.getElementById('moveSiteBtn').disabled = true;
  document.getElementById('copyCoordsBtn').disabled = true;
}

function startMoveMode() {
  if (!state.selectedSite) return;
  state.movingSiteId = state.selectedSite.id;
  document.getElementById('detailBody').innerHTML = `
    <p><strong>Move mode is armed.</strong></p>
    <p>Tap the correct location on the map. The base data stays intact; your fix is stored as a local override.</p>
  `;
}

function onMapClick(e) {
  if (!state.movingSiteId) return;
  const site = state.allSites.find(s => s.id === state.movingSiteId);
  if (!site) return;
  saveOverride(site.id, { lat: e.latlng.lat, lng: e.latlng.lng });
  site.lat = e.latlng.lat;
  site.lng = e.latlng.lng;
  site.isEdited = true;
  state.movingSiteId = null;
  renderSites();
  selectSite(site);
}

function copyCoords() {
  if (!state.selectedSite) return;
  const text = `${state.selectedSite.lat.toFixed(6)}, ${state.selectedSite.lng.toFixed(6)}`;
  navigator.clipboard?.writeText(text);
}

function openAddSiteDialog() {
  document.getElementById('addSiteDialog').showModal();
}

function closeAddSiteDialog() {
  document.getElementById('addSiteDialog').close();
}

function handleAddSiteSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const fd = new FormData(form);
  const lat = Number(fd.get('lat'));
  const lng = Number(fd.get('lng'));
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    window.alert('Those coordinates were not valid.');
    return;
  }
  const newSite = {
    id: `user-${Date.now()}`,
    name: String(fd.get('name') || '').trim(),
    layer: String(fd.get('layer') || 'Boondocking'),
    sourceFolder: 'User added',
    lat,
    lng,
    descriptionHtml: '',
    descriptionText: String(fd.get('note') || '').trim(),
  };
  saveAddition(newSite);
  state.allSites.push({ ...newSite, isUserAdded: true, isEdited: true });
  renderSites();
  const added = state.allSites[state.allSites.length - 1];
  selectSite(added);
  state.map.setView([lat, lng], 11);
  form.reset();
  form.elements.layer.value = 'Boondocking';
  closeAddSiteDialog();
}

function getStoredEdits() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { overrides: {}, additions: [] };
  } catch {
    return { overrides: {}, additions: [] };
  }
}

function setStoredEdits(edits) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(edits));
}

function saveOverride(id, patch) {
  const edits = getStoredEdits();
  edits.overrides ||= {};
  edits.overrides[id] = { ...(edits.overrides[id] || {}), ...patch };
  setStoredEdits(edits);
}

function saveAddition(site) {
  const edits = getStoredEdits();
  edits.additions ||= [];
  edits.additions.push(site);
  setStoredEdits(edits);
}

function exportEdits() {
  const data = getStoredEdits();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'camping-map-edits.json';
  a.click();
  URL.revokeObjectURL(url);
}

async function importEdits(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const data = JSON.parse(await file.text());
  setStoredEdits(data);
  await loadSites();
  e.target.value = '';
  document.getElementById('editsDialog').close();
}

function locateMe() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition((pos) => {
    const { latitude, longitude } = pos.coords;
    state.map.setView([latitude, longitude], 10);
    L.circleMarker([latitude, longitude], {
      radius: 8, color: '#17311f', fillColor: '#d9c59b', fillOpacity: 1, weight: 3
    }).addTo(state.map).bindPopup('You are here-ish.').openPopup();
  });
}

function pill(text) {
  return `<span class="meta-pill">${escapeHtml(text)}</span>`;
}

function sanitizeDescription(htmlString) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = htmlString;

  wrapper.querySelectorAll('script, iframe, style').forEach(el => el.remove());
  wrapper.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(attr => {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) el.removeAttribute(attr.name);
    });
    if (el.tagName === 'IMG') {
      el.style.maxWidth = '100%';
      el.style.borderRadius = '12px';
      el.style.height = 'auto';
      el.loading = 'lazy';
    }
    if (el.tagName === 'A') {
      el.target = '_blank';
      el.rel = 'noopener noreferrer';
    }
  });
  return wrapper.innerHTML;
}

function truncate(str, max) {
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[m]));
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

function initFloatingSheet() {
  const sheet = document.getElementById('detailSheet');
  const handle = document.getElementById('sheetDragHandle');
  const panel = document.querySelector('.map-panel');

  restoreSheetPosition();
  constrainSheetToPanel();
  window.addEventListener('resize', constrainSheetToPanel);
  window.addEventListener('orientationchange', () => setTimeout(constrainSheetToPanel, 100));

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;

  const startDrag = (clientX, clientY) => {
    dragging = true;
    state.userMovedSheet = true;
    const rect = sheet.getBoundingClientRect();
    const parentRect = panel.getBoundingClientRect();
    originLeft = rect.left - parentRect.left;
    originTop = rect.top - parentRect.top;
    startX = clientX;
    startY = clientY;
  };

  const moveDrag = (clientX, clientY) => {
    if (!dragging) return;
    const dx = clientX - startX;
    const dy = clientY - startY;
    positionSheet(originLeft + dx, originTop + dy);
  };

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    saveSheetPosition();
  };

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startDrag(e.clientX, e.clientY);
  });
  window.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY));
  window.addEventListener('mouseup', endDrag);

  handle.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    if (!t) return;
    startDrag(t.clientX, t.clientY);
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (!t) return;
    moveDrag(t.clientX, t.clientY);
  }, { passive: true });
  window.addEventListener('touchend', endDrag);

  function positionSheet(left, top) {
    const parentRect = panel.getBoundingClientRect();
    const rect = sheet.getBoundingClientRect();
    const maxLeft = Math.max(0, parentRect.width - rect.width - 8);
    const maxTop = Math.max(0, parentRect.height - rect.height - 8);
    const clampedLeft = Math.min(Math.max(8, left), maxLeft);
    const clampedTop = Math.min(Math.max(8, top), maxTop);
    sheet.style.left = `${clampedLeft}px`;
    sheet.style.top = `${clampedTop}px`;
    sheet.style.right = 'auto';
    sheet.style.bottom = 'auto';
  }
}

function saveSheetPosition() {
  const sheet = document.getElementById('detailSheet');
  const left = parseFloat(sheet.style.left);
  const top = parseFloat(sheet.style.top);
  if (!Number.isFinite(left) || !Number.isFinite(top)) return;
  localStorage.setItem(SHEET_POSITION_KEY, JSON.stringify({ left, top }));
}

function restoreSheetPosition() {
  const saved = localStorage.getItem(SHEET_POSITION_KEY);
  if (!saved) return;
  try {
    const { left, top } = JSON.parse(saved);
    if (Number.isFinite(left) && Number.isFinite(top)) {
      state.userMovedSheet = true;
      document.getElementById('detailSheet').style.left = `${left}px`;
      document.getElementById('detailSheet').style.top = `${top}px`;
      document.getElementById('detailSheet').style.right = 'auto';
      document.getElementById('detailSheet').style.bottom = 'auto';
    }
  } catch {}
}

function constrainSheetToPanel() {
  const sheet = document.getElementById('detailSheet');
  const panel = document.querySelector('.map-panel');
  const panelRect = panel.getBoundingClientRect();
  const rect = sheet.getBoundingClientRect();

  if (!state.userMovedSheet) {
    resetSheetPosition();
    return;
  }

  let left = parseFloat(sheet.style.left);
  let top = parseFloat(sheet.style.top);
  if (!Number.isFinite(left)) left = panelRect.width - rect.width - 16;
  if (!Number.isFinite(top)) top = 16;

  const maxLeft = Math.max(8, panelRect.width - rect.width - 8);
  const maxTop = Math.max(8, panelRect.height - rect.height - 8);

  left = Math.min(Math.max(8, left), maxLeft);
  top = Math.min(Math.max(8, top), maxTop);

  sheet.style.left = `${left}px`;
  sheet.style.top = `${top}px`;
  sheet.style.right = 'auto';
  sheet.style.bottom = 'auto';
  saveSheetPosition();
}

function resetSheetPosition() {
  const sheet = document.getElementById('detailSheet');
  state.userMovedSheet = false;
  localStorage.removeItem(SHEET_POSITION_KEY);
  sheet.style.left = '';
  sheet.style.top = '';
  sheet.style.right = '';
  sheet.style.bottom = '';
}

window.__campingMap = {
  selectById(id) {
    const site = state.allSites.find(s => s.id === id);
    if (site) selectSite(site);
  },
  moveById(id) {
    const site = state.allSites.find(s => s.id === id);
    if (site) {
      selectSite(site);
      startMoveMode();
    }
  }
};
