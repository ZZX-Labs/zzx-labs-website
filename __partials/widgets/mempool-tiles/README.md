# Mempool Tiles

`mempool-tiles/` is the ZZX-Labs projected-next-block transaction atlas. It is mounted by the existing manifest-driven widget core and uses the configured mempool REST/WebSocket source before falling back to `mempool.space` compatibility endpoints.

## Rendering contract

The atlas is one outer square and every leaf is a square. `js/packer.js` constructs an exact recursive 2×2/3×3 square dissection with one leaf per candidate transaction for all normal projected-block populations. The leaf areas sum to 1.0; there are no rectangle transaction tiles, reserved cells, gutters, or unassigned visual regions. Very small synthetic populations that cannot mathematically dissect one square into exactly 2, 3, 5, 6, 8, 11, or 14 square leaves use clearly tracked dust-continuation leaves. Real block-sized populations need no continuation leaves.

Square area can follow output BTC value, vBytes, absolute fee, or fee rate. The default color mode is bivariate: fee rate selects the palette position and transaction vBytes modulate the result. Additional color modes expose fee rate, absolute fee, vBytes, transaction type, and mempool age.

## Persistent readers

Selecting a transaction immediately pins a local reader. Full transaction JSON, raw hex, inputs, outputs, output spend state, script classes, OP_RETURN payloads, block metadata, and Merkle inclusion data are retained in IndexedDB. The selected reader does not depend on current atlas membership and therefore remains available after a projected block changes or after a reload. A bounded localStorage summary fallback preserves the pin when IndexedDB is unavailable. Readers can be revalidated, individually unpinned, cleared, or exported as JSON.

## Themes

`js/themes.js` contains 40 built-in ZZX-Labs/0xDEADBEEF palettes, including regional, terminal, signal, Bitcoin, celestial, operational, and accessible groups. The selected theme, scale, color, and spatial order are retained locally. `themes/catalog.json` is the auditable theme inventory.

## Self-test

Run from this directory:

```text
node tests/selftest.js
```

The test checks module syntax separately in the site validation flow, then verifies theme count/identity, square geometry, exact normalized coverage, in-bounds leaves, gapless sampled hit-testing, candidate identity preservation, and reader-summary persistence.
