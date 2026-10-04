# Mempool Specs · Spectacles v11

ZZX Labs' next-tip Bitcoin transaction field. It consumes real projected-block transactions, represents every candidate as one square, orders square scale by BTC output value, and colors the square by effective/package fee rate in sat/vB.

## Hard invariants

- 100% normalized canvas coverage; `emptyArea === 0`.
- Square primitives only (`width === height`); no rectangle fallback.
- One real transaction per square and no aggregate/fabricated tiles.
- Recursive 2×2/3×3 subdivision preserves a mathematically exact cover.
- Visual rank is monotonic with perceptually compressed BTC output value.
- Fee/vB is mapped through the active ZZX palette's 11-stop heat scale.
- Up to 48 clicked transaction readers persist independently of live block membership. Metadata uses local storage; full analysis bundles use IndexedDB.
- The reader includes status, confirmations, sizes, fee/package rate, input/output value, script families, RBF/SegWit/Taproot flags, OP_RETURN, I/O details, transaction JSON, raw hex, and confirmed block headers.

## Theme system

`themes/catalog.json` contains 37 palettes across House, Bitcoin, Cyber, Tactical, Spectrum, Accessible, Places, and Research families. Selection is persisted under `zzx:mempool-specs:theme:selected` and redraws without refetching block data.

## Data flow

The REST projection bootstraps the widget. The mempool.space WebSocket subscribes to projected block 0 and applies transaction snapshots/deltas. Background hydration resolves output values for candidates while retaining every txid in the exact cover.

Run `node tests/mempool-specs-invariants.js` from the site root for the dependency, catalog, and geometry checks.
