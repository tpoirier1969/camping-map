Camping Map v18.2

What changed in this build:
- Added a live zoom readout on the map.
- Tightened the mobile menu so it behaves more like a slide-out drawer on phones.
- Split campground ownership into separate layer buckets: Federal, State, Local, Private, plus Boondocking.
- DNR campgrounds are treated as State campgrounds.
- Modern vs. Rustic is shown by marker shape inside those campground groups.
- Re-enabled trail loading support. The app now looks for trail files at:
  data/trails.geojson
  data/trails.json
  trails.geojson
- Trails stay hidden when zoomed out.
  - Orange long-distance / regional trails can show first at mid zoom.
  - Other trails appear only when zoomed in further.
- Trail colors are set up to match campground ownership colors, except long-distance / regional trails, which are orange.

How to use the MapTiler key on each device:
1. Upload this site to GitHub Pages (or open locally through your normal workflow).
2. Open the map on the device.
3. Open Settings / Menu.
4. Paste your MapTiler API key into the 'MapTiler API key' field.
5. Tap Save.
6. Choose Outdoor, Satellite, Topo, or OpenStreetMap fallback.
7. Turn on 3D terrain if desired.

Notes:
- The key is stored locally in that device/browser only.
- Keep your existing campsite data file in place, usually data/sites.json.
- This package does not hardcode the key.
- If no key is entered, the map falls back to OpenStreetMap.
- This package includes trail-file support, but accurate trail geometry still depends on adding a real trail GeoJSON/JSON file.
