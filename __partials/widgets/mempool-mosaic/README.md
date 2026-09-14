# Mempool Mosaic 3.0.0

`mempool-mosaic/` is the ZZX-Labs/0xDEADBEEF projected-next-block transaction mosaic. It mounts through the existing manifest-driven widget core, resolves the site's configured sovereign mempool endpoint first, and retains `mempool.space`-compatible REST and WebSocket transports as a public fallback.

## Rendering contract

The mosaic is one outer square and every transaction tessera is a square. `js/packer.js` constructs an exact recursive 2×2/3×3 square dissection with one leaf per candidate transaction for all normal projected-block populations. Leaf areas sum to 1.0. There are no rectangle transaction marks, reserved cells, gutters, or unassigned visual regions. Very small synthetic populations that cannot mathematically dissect one square into exactly 2, 3, 5, 6, 8, 11, or 14 square leaves use clearly reported dust-continuation leaves. Real block-sized populations need no continuation leaves.

Square area can follow output BTC value, vBytes, absolute fee, or fee rate. Because an exact square dissection quantizes leaf dimensions, weighted bundle assignment preserves the relative importance of the selected metric without breaking the square-only/full-coverage contract. The default color mode is bivariate: fee rate selects the palette position and transaction vBytes modulate the result. Additional color modes expose fee rate, absolute fee, vBytes, transaction type, and mempool age.

## Live candidate construction

The preferred WebSocket path subscribes to projected mempool block zero and maintains transaction identity across additions, removals, replacements, and reordering. The REST bootstrap loads mempool totals, projected-block statistics, fee recommendations, tip height, the complete mempool TXID universe, recent transactions, configured full-feed snapshots, and the site's shared Bitcoin price state in parallel. When an exact projected membership feed is unavailable, progressive hydration ranks the full TXID universe into a clearly labeled local candidate rather than inventing transaction identities.

## Persistent readers

Selecting a transaction immediately pins a local reader. Full transaction JSON, raw hex, inputs, outputs, output spend state, script classes, OP_RETURN payloads, block metadata, and Merkle inclusion data are retained in IndexedDB. The selected reader does not depend on current mosaic membership and therefore remains available after a projected block changes or after a reload. A bounded localStorage summary fallback preserves the pin when IndexedDB is unavailable. Readers can be revalidated, individually unpinned, cleared, or exported as JSON.

## Themes

`js/themes.js` contains 40 built-in ZZX-Labs/0xDEADBEEF palettes, including regional, terminal, signal, Bitcoin, celestial, operational, and accessible groups. The selected theme, scale, color, and spatial order are retained locally. `themes/catalog.json` is the auditable theme inventory. Theme state and reader storage are namespaced to this widget so Mempool Mosaic can run beside Mempool Specs, Mempool Tiles, and Mempool Goggles without collisions.

## Self-test

Run from this directory:

```text
node tests/selftest.js
```

The test verifies theme count and identity, square geometry, exact normalized coverage, in-bounds leaves, sampled gapless hit-testing, one-to-one transaction identity for constructible populations, and reader-summary persistence.
