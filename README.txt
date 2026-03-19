<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Western U.P. Camping Map</title>
  <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="map" aria-label="Western Upper Peninsula camping map"></div>

  <aside class="panel">
    <h1>Western U.P. Camping Map</h1>
    <div class="subtle" id="versionText"></div>
    <div class="subtle" id="countsText"></div>

    <div class="rule"></div>

    <div class="control-row">
      <label class="main" for="baseLayerSelect">Base map</label>
      <div class="select-wrap">
        <select id="baseLayerSelect">
          <option value="hybrid" selected>Hybrid Sat</option>
          <option value="mobileAtlas">Mobile Atlas</option>
          <option value="topo">Topo</option>
          <option value="streets">Streets</option>
        </select>
      </div>
    </div>

    <div class="control-row">
      <label class="main" for="terrainSlider">3D effect</label>
      <div class="select-wrap">
        <input id="terrainSlider" type="range" min="1" max="2" step="0.05" value="1.35">
        <div class="terrain-value" id="terrainValue">1.35x</div>
      </div>
      <div class="legend-note">Open DEM terrain is wired in here, so this slider actually changes terrain exaggeration instead of pretending to.</div>
    </div>

    <div class="control-row">
      <label class="main">Layers</label>
      <label class="checkbox-row"><input id="showCampgrounds" type="checkbox" checked> Campgrounds</label>
      <label class="checkbox-row"><input id="showOpportunities" type="checkbox" checked> Opportunity area markers</label>
    </div>

    <div class="rule"></div>

    <div class="control-row">
      <label class="main">Marker key / cleaned up icons</label>
      <div class="legend">
        <div class="legend-item"><span class="swatch modern"></span> Modern / more developed</div>
        <div class="legend-item"><span class="swatch rustic"></span> Rustic / basic developed</div>
        <div class="legend-item"><span class="swatch boondocking"></span> Free or dispersed-style site</div>
        <div class="legend-item"><span class="swatch opportunity"></span> Official opportunity area marker</div>
      </div>
      <div class="legend-note">Markers were tightened up so the halo hugs the symbol instead of floating around it like a tiny UFO convention. Same-coordinate markers still spider out on click.</div>
    </div>

    <div class="rule"></div>

    <div class="footer-note">
      This pass keeps the previous rebuild features but cleans up marker styling: tighter halos, clearer campground icons, and less visual mush on crowded sections of the map. Opportunity areas are still point-based here because I was not willing to fake ownership-safe polygons.
    </div>
  </aside>

  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <script src="data/data.js"></script>
  <script src="app.js"></script>
</body>
</html>
