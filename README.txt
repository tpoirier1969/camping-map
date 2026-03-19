Western U.P. Camping Map — v20.4.1-clean-icons
Generated: 2026-03-19

What changed in this batch
- Kept the prior rebuild features.
- Tightened marker halos so they hug the symbol instead of floating too wide.
- Replaced the campground marker look with a cleaner tent icon.
- Swapped boondocking/opportunity markers to compact tree and flag icons for faster visual parsing.
- Kept overlap handling: markers at the same coordinates spider out on click.

Important caveat
- I did NOT draw the broad opportunity polygons yet. I could verify the opportunity AREAS, but I could not verify ownership-safe outline geometry tightly enough to promise “no private land inside.” So I left polygons out rather than sneaking in bogus boundaries.
- A few campsite coordinates come from reputable third-party map/camping listings where the official page surfaced the campground but not a machine-friendly coordinate line in the available result set.

Files
- index.html
- styles.css
- app.js
- data/data.js

Run
- Open index.html in a browser, or serve the folder locally with any static web server.
