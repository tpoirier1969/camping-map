Camping Map v18.1

This build uses MapLibre + MapTiler styles.

How to use the MapTiler key on each device:
1. Upload this site to GitHub Pages (or open locally through your normal workflow).
2. Open the map on the device.
3. Open Settings / Menu.
4. Paste your MapTiler API key into the 'MapTiler API key' field.
5. Tap Save.
6. Choose Outdoor or Satellite. Turn on 3D terrain if desired.

Notes:
- The key is stored locally in that device/browser only.
- Keep your existing campsite data file in place, usually data/sites.json.
- This package does not hardcode the key.
- If no key is entered, the map falls back to OpenStreetMap.


Trail data notes:
- The map now checks for data/trails.vector.json first. If present with working tile URLs, it will use vector tiles.
- If no vector manifest works, it falls back to data/trails.geojson.
- Long-distance trails like the North Country Trail should use trailCategory: long_distance so they render orange.
