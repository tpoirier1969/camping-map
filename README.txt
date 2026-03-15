Camping Map Clean Base

This package is a cleaned baseline built from the newest working code only.

What was cleaned:
- Removed legacy v20.1/v20.2/v20.3 duplicate script files
- Kept only the active app modules
- Consolidated historical site additions into data/sites.json
- Removed dependency on old sites-additions JSON patch files
- Updated index.html to reference only the active cleaned modules
- Version tag now matches the build in HTML and JS

Active files:
- index.html
- styles.css
- manifest.webmanifest
- js/app-config.js
- js/app-data.js
- js/app-summaries.js
- js/app-basemap.js
- js/app-ui.js
- js/app-main.js
- data/sites.json

2026-03-15 v20.5.0
- Restored boondocking zones instead of leaving them removed.
- Replaced the fake hand-drawn boondocking zone file with live ownership-based public-land queries:
  - Ottawa National Forest Basic Ownership (USFS ArcGIS service)
  - Chequamegon-Nicolet National Forest ownership (Wisconsin DNR ArcGIS service)
- Zones now follow official public-land ownership polygons instead of one broad blob crossing private land.
- 3D exaggeration slider still ranges from 1.00x to 3.00x.

Important note:
- These zones are now ownership-accurate public-land overlays for the west-end federal forests.
- They are not a promise that every square foot inside the polygon is camp-ready; users still need to obey site-specific closures, setbacks, posted restrictions, and motor-vehicle rules.
