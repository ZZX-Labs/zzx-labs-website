# Mempool Tiles v2.0.0

`mempool-tiles` is the standalone ZZX-Labs projected-next-block Bitcoin transaction visualizer. This repository contains only this widget and the files required to build, test, demo, and deploy it.

The production widget uses three assets: `widget.html`, `widget.css`, and `widget.js`. `widget.js` is a prebuilt bundle, so the site does not make a chain of runtime requests for the source modules. The modular implementation remains under `js/` and can be rebuilt with `python build.py`.

## What changed in v2.0.0

The previous v1.6 layout used an equal logical slot for every transaction and drew a smaller square inside that slot. That design necessarily produced empty background between transactions and made large candidate sets look sparse or confetti-like. v2 replaces the slot renderer with a recursive exact-cover square tiling. A normal projected block is represented by one square leaf per real transaction, and the leaves cover the entire visualization field. Transaction glyphs are never rectangles.

The selected scale (`vsize`, BTC output value, or fee rate) determines which transactions receive the larger square leaves. The selected order mode controls spatial ordering within equal-size leaf bands. Fee-rate or transaction-type coloring is independent of geometry. Canvas rendering rounds shared normalized boundaries to common pixel edges, eliminating the deliberate gutters from the old renderer.

The widget retains the existing live data architecture: mempool.space-compatible WebSocket `track-mempool-block: 0` data supplies projected next-block membership, REST requests hydrate transaction details, and the inspector fetches full transaction JSON, raw hex, block information when confirmed, inputs, outputs, OP_RETURN data, and derived statistics. Inspector content stays present after a selected transaction leaves the live visual field, until the user closes it or selects another transaction.

The widget contains 32 built-in ZZX/0xdeadbeef themes. Themes do not require an additional JSON request. The production bundle also no longer self-loads the shared `zzx-mempool-visuals.js` module; if that shared state is already present it can be consumed opportunistically, but `mempool-tiles` does not create another hidden dependency chain.

## Repository layout

`widget.html` is the embeddable widget markup. `widget.css` is the complete widget styling, including card, controls, visualization, telemetry, and inspector styles. `widget.js` is the production bundle. `js/` contains the maintainable source modules and `widget-shell.js`. `build.py` rebuilds the production bundle. `tests/layout-selftest.js` verifies square tiling geometry, area conservation, hit testing, metric-to-area ordering, and the 32-theme catalog. `demo/index.html` is a standalone browser demo configured to use mempool.space directly.

## Build and test

From the repository root:

```bash
python build.py
node --check widget.js
node tests/layout-selftest.js
```

A passing self-test verifies exact area conservation for candidate populations from one transaction through several thousand transactions, verifies that each tile center resolves to the correct transaction, verifies the selected metric maps monotonically to tile area bands, and verifies that all 32 themes are registered.

## Site integration

For the current ZZX-Labs site layout, copy the repository contents to:

```text
__partials/widgets/mempool-tiles/
```

The site only needs to load:

```text
__partials/widgets/mempool-tiles/widget.html
__partials/widgets/mempool-tiles/widget.css
__partials/widgets/mempool-tiles/widget.js
```

The bundle still recognizes the existing ZZX widget registration APIs (`ZZXAPI.register`, `ZZXWidgetsCore.onMount`, and `ZZXWidgets.register`) and also has a DOM fallback that mounts any `[data-widget-root="mempool-tiles"]` element when used independently.

Configured API bases are preferred when supplied through the existing ZZX core/API context. The public mempool.space API and WebSocket remain the final fallback. A deployment can therefore point the widget at a self-hosted mempool instance without changing the visualizer source.

## Geometry behavior

For normal next-block candidate counts, the exact-cover constructor uses recursively subdivided square regions and a six-square base tiling when useful. This allows thousands of unequal square leaves to occupy exactly 100% of the canvas. The constructor intentionally has a bootstrap fallback for the tiny populations `2`, `3`, `5`, `8`, and `11`; those counts are irrelevant to a normal populated Bitcoin mempool but can occur in synthetic tests or during very early startup. Once the candidate population reaches a normal size, the layout switches to exact cover automatically.

Geometry updates are drawn atomically rather than interpolating square sizes. Interpolating between two exact tilings would temporarily create overlaps or holes, which contradicts the visual contract. Live updates therefore favor a correct fully packed field over decorative geometry tweening.

## Performance

The source modules are not fetched at runtime in production. The ~100 KB unminified bundle registers all modules before the widget shell mounts, so dependency checks resolve locally. Transaction detail hydration remains bounded and concurrent rather than firing every transaction request at once. The canvas uses device-pixel-ratio capping and tree-based hit testing rather than scanning every transaction on each pointer event.

No license is asserted by this package; retain whatever project-level licensing policy applies to the parent ZZX-Labs repository.
