# Camping Map patch build

This build rolls in the requests from the last few messages:

- mobile-safe menu button moved down and enlarged for phones
- one state summary circle while zoomed out
- automatic breakout to individual site points when a state mostly fills the view or the zoom is high enough
- Trails layer added
- basic North Country Trail and Iron Ore Heritage Trail overlays included

## Important

Keep your existing campsite data file in place. This build tries, in order:

1. `data/sites.json`
2. `data/site-data.json`
3. `data/campgrounds.json`
4. `sites.json`

If none of those exist, the app shell still loads but it will tell you no campsite file was found.

## Files in this zip

- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `data/trails.geojson`

## Notes on the trail layer

The two trails in `data/trails.geojson` are deliberately simplified overview lines, not turn-by-turn route geometry.
