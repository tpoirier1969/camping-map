This corrective build restores dataset-driven campsite layers.

What changed:
- Keeps one state summary circle per state when zoomed out.
- Breaks back out to individual points when zoomed in or when a state fills the view.
- Builds campsite layer toggles from your actual site data instead of flattening everything into 3 generic layers.
- Removes bad trail geometry from the package. Trail support still exists in code, but no trail file is included until accurate labeled trail data is available.

Important:
- Keep your existing campsite data file in the repo, ideally at data/sites.json.
- This build will also try a few fallback filenames if needed.
