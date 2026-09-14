# Mempool Mosaic

Mempool Mosaic is the ZZX-Labs mechanical/tessellating projected-next-block viewer. It is intentionally distinct from Mempool Tiles, Mempool Specs, and Mempool Goggles.

Production uses `widget.html`, `widget.css`, and bundled `widget.js`. The maintainable modules remain under `js/`; `build.py` deterministically rebuilds `widget.js`.

The geometry authority is `js/mosaic-packer.js`, a 3x3-dominant recursive exact-cover square tessellator. `js/animation.js` drives visual re-sorting/shuffling. There is no generic `packer.js`, `treemap.js`, `widget-shell.js`, theme engine, or scaler in this widget.

Colors and widget chrome come from the existing site/widget CSS contract. Mosaic-specific code controls only the visualization surface and transaction interaction.

Transport uses configured mempool API/WS endpoints when present and falls back to mempool.space. Optional full-feed endpoints are only used when explicitly configured; no synthetic same-origin API routes are manufactured.
