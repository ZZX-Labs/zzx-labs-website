# Mempool Mosaic v3.0.0

`mempool-mosaic` is the standalone ZZX-Labs projected-next-block Bitcoin mosaic visualizer. The repository contains only this widget, its modular source, deterministic tests, build script, and standalone demo. Production integration is intentionally limited to `widget.html`, `widget.css`, and the generated `widget.js` bundle.

## What changed from the old Mosaic

The previous site version used `treemap.js`, which recursively split the canvas into weighted rectangles and then inset every rectangle with a visual gap. That architecture could never satisfy the widget contract: transaction glyphs were rectangular and background space was intentionally exposed between them.

v3 removes the rectangular treemap completely. `js/mosaic-packer.js` generates a recursive exact-cover square tessellation using only 2x2 and 3x3 subdivisions. Mosaic deliberately prefers 3x3 subdivision, producing a cellular/pixel-mosaic texture that is distinct from Mempool Tiles' atlas arrangement. Every leaf is mathematically square and the complete root area is conserved.

A recursive square dissection built from 2x2 and 3x3 replacement operations has a leaf count of `1 + 3a + 8b`. If the projected block contains a nonconstructible number of real transactions, the layout advances only to the next constructible leaf count. The extra leaves are linked fragments of real transactions, not fabricated TXIDs, filler rectangles, or empty cells. Clicking any fragment opens the same persistent reader as its real transaction.

## Visual model

The default square-area metric is BTC output amount. The user can switch area to vsize or fee rate. The layout assigns larger selected metrics to leaves that are at least as large as leaves assigned to smaller metrics, while same-size cells are arranged into stable spatial neighborhoods.

The default `Mosaic` neighborhood mode groups same-size cells primarily by package fee rate, then BTC value and projected rank. Alternate neighborhood modes include projected likelihood, fee, BTC value, vsize, age, RBF, type, and deterministic shuffle.

The default color mode is `Fee × vB`: fee rate chooses the base chroma and normalized vsize modulates luminance/density. This keeps BTC amount available for geometry while fee and vB jointly encode color. Fee-only and transaction-type color modes are also available.

The renderer never creates gutters. Faint hierarchy and cell strokes are drawn over the filled cells, not between them, so 100% of the visual field remains owned by square transaction leaves.

## Live data and hydration

The widget prefers a configured self-hosted mempool-compatible API and WebSocket endpoint and falls back to public mempool.space-compatible endpoints. `js/live.js` tracks projected block index 0 from the WebSocket stream. `js/provider.js` and `js/model.js` preserve that exact live membership while REST hydration progressively resolves full transaction objects, vsize, output amount, script classification, fee information, RBF state, and other reader data.

If a full mempool feed is available it is used as a faster REST fallback. Otherwise the widget hydrates the mempool TXID universe in bounded concurrent batches until it can construct a block-sized candidate field. A periodic REST refresh does not discard the current WebSocket membership.

## Persistent transaction readers

`js/reader-store.js` stores reader records in IndexedDB under `zzx-mempool-mosaic-readers`, with a compact localStorage fallback. Clicking a square pins the reader immediately; a cached analysis is shown immediately when available and is then refreshed from the transaction API. The archive survives transaction eviction from the projected block and browser reloads.

Up to 64 readers are retained. The 16 most recent are directly reopenable from the widget, the last reader is restored automatically, the archive can be exported as JSON, and clearing the active inspector does not delete the archive. `Clear archive` is a separate explicit action.

## Themes

The widget includes 32 built-in ZZX/0xdeadbeef palettes. No runtime theme JSON request is required.

## Repository layout

```text
mempool-mosaic/
├── widget.html
├── widget.css
├── widget.js
├── manifest.json
├── README.md
├── CHECKSUMS.sha256
├── build.py
├── demo/
│   └── index.html
├── tests/
│   ├── layout-selftest.js
│   ├── model-selftest.js
│   └── reader-store-selftest.js
└── js/
    ├── sources.js
    ├── fetch.js
    ├── analyzer.js
    ├── provider.js
    ├── live.js
    ├── model.js
    ├── scaler.js
    ├── sorter.js
    ├── mosaic-packer.js
    ├── layout.js
    ├── themes.js
    ├── renderer.js
    ├── txfetcher.js
    ├── reader-store.js
    ├── inspector.js
    └── widget-shell.js
```

`mosaic-packer.js` owns exact square geometry. `layout.js` maps transactions to that geometry. `renderer.js` owns fee/vB/type presentation. `reader-store.js` owns persistent readers. `inspector.js` presents the complete transaction analysis. `widget-shell.js` coordinates live data, hydration, layout, rendering, controls, persistence, and site registration.

## Build and verification

From the repository root:

```bash
python build.py
node --check widget.js
node tests/layout-selftest.js
node tests/model-selftest.js
node tests/reader-store-selftest.js
```

The layout test verifies constructibility, parent/child area conservation, square geometry, 100% coverage, real-TX primary mapping, fragment accounting, hit testing, metric-to-area monotonicity, 3x3-dominant planning, and all 32 themes through projected fields of up to 4,096 transactions. The model test verifies candidate construction and live-membership preservation. The reader-store test verifies pin, save, retrieve, last-reader tracking, export, and clear behavior.

## ZZX-Labs integration

Copy the repository to:

```text
__partials/widgets/mempool-mosaic/
```

The live site needs only:

```text
__partials/widgets/mempool-mosaic/widget.html
__partials/widgets/mempool-mosaic/widget.css
__partials/widgets/mempool-mosaic/widget.js
```

Do not add one production `<script>` tag per file under `js/`; those files are already compiled into `widget.js`. The modular dependency loader in `widget-shell.js` exists only as a development/compatibility fallback when the shell is run unbundled.

## Network note

The included automated tests are deterministic and offline. They validate geometry, candidate-model behavior, persistence, syntax, and packaging; they do not substitute for a live browser smoke test against the deployed mempool API/WebSocket service.
