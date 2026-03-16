
function setDraftQueueStatus(message = '') {
  if (els.draftQueueStatus) els.draftQueueStatus.textContent = message;
}

function refreshDraftQueueUi(statusMessage = '') {
  if (els.draftQueueText) els.draftQueueText.value = model.manualDraftQueue.join('\n');
  if (statusMessage) setDraftQueueStatus(statusMessage);
  else setDraftQueueStatus(model.manualDraftQueue.length ? `${model.manualDraftQueue.length} draft record${model.manualDraftQueue.length === 1 ? '' : 's'} queued.` : 'No draft records queued yet.');
}

async function copyDraftQueue() {
  const text = model.manualDraftQueue.join('\n');
  if (!text) { refreshDraftQueueUi('Nothing to copy yet.'); return; }
  try {
    await navigator.clipboard.writeText(text);
    refreshDraftQueueUi('Draft queue copied.');
  } catch (error) {
    console.error(error);
    refreshDraftQueueUi('Copy failed on this device.');
  }
}

function downloadDraftQueue() {
  const text = model.manualDraftQueue.join('\n');
  if (!text) { refreshDraftQueueUi('Nothing to download yet.'); return; }
  const blob = new Blob([text + '\n'], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `camping-site-draft-queue-${new Date().toISOString().slice(0,10)}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  refreshDraftQueueUi('Draft queue downloaded.');
}

function clearDraftQueue() {
  model.manualDraftQueue = [];
  saveManualDraftQueue();
  refreshDraftQueueUi('Draft queue cleared.');
}

function setLoadingState(isLoading, message = 'Loading data…') {
  if (els.loadingOverlay) els.loadingOverlay.hidden = !isLoading;
  if (els.loadingText && message) els.loadingText.textContent = message;
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


function openApiModal() {
  if (!els.apiModal) return;
  els.apiModal.hidden = false;
  document.body.classList.add('modal-open');
}

function closeApiModal() {
  if (!els.apiModal) return;
  els.apiModal.hidden = true;
  document.body.classList.remove('modal-open');
}

function setApiKeyUi() {
  const key = getSavedApiKey();
  const thunderforestKey = getSavedThunderforestKey();
  if (els.apiKeyInput) els.apiKeyInput.value = key;
  if (els.tfApiKeyInput) els.tfApiKeyInput.value = thunderforestKey;
  model.hasApiKey = Boolean(key);
  if (els.manageApisBtn) {
    const mt = key ? 'MapTiler saved' : 'MapTiler missing';
    const tf = thunderforestKey ? 'Thunderforest saved' : 'Thunderforest missing';
    els.manageApisBtn.textContent = `Manage APIs · ${mt} · ${tf}`;
  }
  if (els.keySection) els.keySection.hidden = false;
  refreshBasemapUiState();
}

function describeAttempts(attempts) {
  if (!attempts?.length) return 'No URLs tried yet.';
  return attempts.map((attempt) => `${attempt.url} → ${attempt.ok ? 'OK' : (attempt.reason || attempt.status || 'failed')}`).join(' | ');
}

function refreshStatusText() {
  const extraLoadNote = model.dataLoad.loadingSiteExtras ? ' Additional site files are still loading in the background.' : '';
  const siteMsg = model.dataLoad.loadingSites
    ? `Loading campsite data… trying ${SITE_DATA_URLS.join(', ')}`
    : model.sites.length
      ? `Loaded ${model.sites.length} campsites across ${model.layerDefs.size} layers from ${model.dataLoad.sitesUrl || 'an unknown file'}${(model.dataLoad.siteExtrasLoaded || []).length ? ` + ${(model.dataLoad.siteExtrasLoaded || []).length} additions file${(model.dataLoad.siteExtrasLoaded || []).length === 1 ? '' : 's'}` : ''}.${extraLoadNote}`
      : `No campsite records loaded. Tried: ${describeAttempts(model.dataLoad.sitesAttempted)}`;

  const basemapLabel = model.mapStyleMode === 'satellite'
    ? 'Satellite Hybrid'
    : model.mapStyleMode === 'topo'
      ? 'Topo'
      : model.mapStyleMode === 'outdoor'
        ? 'Outdoor'
        : model.mapStyleMode === 'tf_outdoors'
          ? 'Thunderforest Outdoors'
          : 'OSM fallback';

  const usingMapTiler = ['satellite', 'topo', 'outdoor'].includes(model.mapStyleMode);
  const usingThunderforest = model.mapStyleMode === 'tf_outdoors';
  const mapMsg = usingMapTiler && model.hasApiKey
    ? ` Basemap: ${basemapLabel}${model.terrainEnabled ? ' with 3D terrain' : ''}${model.tiltEnabled ? ' and tilt' : ''}.`
    : usingThunderforest && getSavedThunderforestKey()
      ? ` Basemap: ${basemapLabel}.`
      : ' Using OpenStreetMap fallback until you add a matching basemap API key.';

  if (els.statusText) els.statusText.textContent = `${siteMsg}${mapMsg}`;
  if (els.dataStats) {
    const extrasTried = (model.dataLoad.siteExtrasAttempted || []).length;
    const extrasLoaded = (model.dataLoad.siteExtrasLoaded || []).length;
    els.dataStats.textContent = `${enabledSites().length} enabled sites · ${model.stateGroups.size} states · ${extrasLoaded}/${extrasTried || EXTRA_SITE_DATA_URLS.length} additions files loaded`;
  }
}

function bindUi() {
  ensureBasemapOptions();
  model.manualDraftQueue = loadManualDraftQueue();
  refreshDraftQueueUi();
  els.menuToggle?.addEventListener('click', () => els.menuPanel.classList.toggle('is-collapsed'));
  els.closeMenu?.addEventListener('click', () => els.menuPanel.classList.add('is-collapsed'));
  els.manageApisBtn?.addEventListener('click', () => {
    openApiModal();
    els.apiKeyInput?.focus();
  });
  els.closeApiModalBtn?.addEventListener('click', closeApiModal);
  els.apiModal?.addEventListener('click', (event) => {
    if (event.target === els.apiModal) closeApiModal();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && els.apiModal && !els.apiModal.hidden) closeApiModal();
  });
  els.searchBtn?.addEventListener('click', runAreaSearch);
  els.searchInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runAreaSearch();
    }
  });
  els.toggleStateSummaries?.addEventListener('change', updateOverlays);
  els.toggleSitePoints?.addEventListener('change', updateOverlays);
  els.toggleBoondockingZones?.addEventListener('change', () => { updateOverlays(); if (els.toggleBoondockingZones.checked && typeof scheduleBoondockingZoneRefresh === 'function') scheduleBoondockingZoneRefresh(true); });
  els.toggleAddMode?.addEventListener('change', () => { model.addMode = els.toggleAddMode.checked; });

  els.basemapSelect.value = ['outdoor','satellite','topo','tf_outdoors','osm'].includes(model.mapStyleMode) ? model.mapStyleMode : 'outdoor';
  refreshBasemapUiState();
  els.basemapSelect?.addEventListener('change', async () => {
    model.mapStyleMode = els.basemapSelect.value;
    localStorage.setItem(STORAGE_KEYS.basemap, model.mapStyleMode);
    await rebuildMapStyle();
  });
  if (els.toggleTerrain) {
    els.toggleTerrain.checked = model.terrainEnabled;
    els.toggleTerrain.addEventListener('change', async () => {
      model.terrainEnabled = els.toggleTerrain.checked;
      localStorage.setItem(STORAGE_KEYS.terrain, String(model.terrainEnabled));
      await rebuildMapStyle();
    });
  }
  if (els.terrainExaggerationSlider) {
    updateTerrainExaggerationUi();
    const syncTerrainSlider = () => {
      const nextValue = Number(els.terrainExaggerationSlider.value);
      model.terrainExaggeration = Number.isFinite(nextValue) ? nextValue : 1.5;
      localStorage.setItem(STORAGE_KEYS.terrainExaggeration, String(model.terrainExaggeration));
      updateTerrainExaggerationUi();
    };
    els.terrainExaggerationSlider.addEventListener('input', () => {
      syncTerrainSlider();
      applyTerrainExaggeration();
    });
    els.terrainExaggerationSlider.addEventListener('change', async () => {
      syncTerrainSlider();
      if (model.terrainEnabled && model.hasApiKey && ['satellite','topo','outdoor'].includes(model.mapStyleMode) && typeof model.map?.setTerrainExaggeration !== 'function') {
        await rebuildMapStyle();
      }
    });
  }
  if (els.togglePitch) {
    els.togglePitch.checked = model.tiltEnabled;
    els.togglePitch.addEventListener('change', () => {
      model.tiltEnabled = els.togglePitch.checked;
      localStorage.setItem(STORAGE_KEYS.tilt, String(model.tiltEnabled));
      applyPitch();
    });
  }
  els.saveKeyBtn?.addEventListener('click', () => {
    localStorage.setItem(STORAGE_KEYS.apiKey, (els.apiKeyInput?.value || '').trim());
    setApiKeyUi();
    refreshStatusText();
    closeApiModal();
  });
  els.clearKeyBtn?.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEYS.apiKey);
    setApiKeyUi();
    refreshStatusText();
    closeApiModal();
  });
  els.saveTfKeyBtn?.addEventListener('click', () => {
    localStorage.setItem(STORAGE_KEYS.thunderforestApiKey, (els.tfApiKeyInput?.value || '').trim());
    setApiKeyUi();
    refreshStatusText();
    closeApiModal();
  });
  els.clearTfKeyBtn?.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEYS.thunderforestApiKey);
    setApiKeyUi();
    refreshStatusText();
    closeApiModal();
  });
  els.copyDraftQueueBtn?.addEventListener('click', copyDraftQueue);
  els.downloadDraftQueueBtn?.addEventListener('click', downloadDraftQueue);
  els.clearDraftQueueBtn?.addEventListener('click', clearDraftQueue);
}

function updateZoomReadout() {
  if (!els.zoomReadout || !model.map) return;
  els.zoomReadout.textContent = `Zoom: ${model.map.getZoom().toFixed(1)}`;
}
