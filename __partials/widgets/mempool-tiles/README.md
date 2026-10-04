# Mempool Tiles

Mempool Tiles is the ZZX-Labs regular square tile-grid view of projected next-block Bitcoin transactions. It is intentionally distinct from Mempool Specs, Mosaic, Goggles, and Visualizer.

Production uses `widget.html`, `widget.css`, and the single bundled `widget.js`. The `js/` directory is maintainable source. `build.py` deterministically rebuilds `widget.js`; it does not reference `widget-shell.js`.

The current visual engine is `layout.js` grid v3 + `renderer.js` v3. `packer.js` remains in the source tree as historical/experimental code but is not part of the production bundle and is not used by the current Tiles renderer.

Transport follows the same public/configured mempool strategy as Mempool Specs: configured `MEMPOOL`/`MEMPOOL_API` first, public `https://mempool.space/api` fallback, and `wss://mempool.space/api/v1/ws` for projected block-0 membership. The widget no longer invents `/bitcoin/mempool/api` as a default route. REST requests use `ZZXAPI.fetchRaw` when available. Optional full-feed enrichment never gates initial rendering.

`reader-store.js` persists clicked transaction analyses without changing widget chrome.
