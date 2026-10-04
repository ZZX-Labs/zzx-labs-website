# ZZX-Labs Widget System

`__partials/widgets/` is the shared widget layer for the ZZX-Labs R&D website. It contains the reusable Bitcoin, Lightning, mining, node, market, intelligence, project, and visualization components embedded throughout the site.

The current directory snapshot contains **62 widget directories**, plus the shared `_core/` and `_shared/` infrastructure directories, `hud-state.js`, and the root widget `manifest.json`.

> This README documents the widget layer as a reusable subsystem. Widget-specific implementation details remain authoritative in each widget directory and in the root `manifest.json`.

## Architecture

The widget layer is organized around four concerns:

1. **Core runtime** — `_core/` contains shared widget runtime behavior. The current repository history specifically identifies `widget-core.js` as the integration point for the shared-price widget/runtime.
2. **Shared resources** — `_shared/` is reserved for resources consumed by multiple widgets rather than duplicated into individual widget directories.
3. **Independent widget modules** — each named widget directory owns the presentation and logic for one widget surface.
4. **Root state and registry** — `hud-state.js` coordinates cross-widget HUD/display state, while `manifest.json` provides the root machine-readable widget registry.

This separation is intentional: presentation state and widget visibility should remain independent from data-provider state. Collapsing or hiding a widget must not silently disable the underlying canonical provider unless that behavior is explicitly part of the provider contract.

## Core files

### `_core/`

Shared widget runtime and common controller behavior belong here. Shared primitives should be centralized here when multiple widgets need identical lifecycle or state behavior.

The current code history identifies the shared Bitcoin price runtime as part of this layer. Price-consuming widgets should prefer the canonical shared price state rather than independently producing conflicting market snapshots.

### `_shared/`

Reusable assets, helper modules, formatting logic, shared styles, and other common widget dependencies belong here when they are not part of the runtime core.

A helper belongs in `_shared/` when it is reusable but does not itself control the widget lifecycle.

### `hud-state.js`

`hud-state.js` is the root HUD/render-state layer. It should coordinate interface state such as widget visibility/collapse without coupling those controls to independent data providers.

The practical rule is:

```text
display OFF  != provider OFF
display ON   != provider restart
```

A switchboard toggle controls whether its corresponding widget is rendered. Provider lifecycle is managed separately unless a provider explicitly defines another contract.

### `manifest.json`

`manifest.json` is the widget registry. It should be treated as the canonical inventory for discoverable widget metadata and titles.

When adding, renaming, moving, or retiring a widget, update the manifest in the same change as the widget files.

## Shared Bitcoin price contract

Price-sensitive widgets should consume one canonical site-wide Bitcoin market state rather than fetching and interpreting unrelated snapshots independently.

The shared state should support the site's current price-source modes:

```text
OFF
BPI
Global BPI
```

The BPI/Global-BPI price and volume infrastructure targets a normal refresh cadence of approximately **2.5–5 seconds**. A consumer may render less frequently for UX reasons, but it should not invent a conflicting price snapshot.

Canonical denomination labels and ordering are:

```text
KBTC → BTC → mBTC → Ksat → μBTC → sat → msat → μsat
```

Widgets that display Bitcoin denominations should use those labels consistently.

## Widget module convention

Not every widget requires every file, but the existing repository history shows a recurring modular pattern built from files such as:

```text
widget.js
widget.css
provider.js
model.js
telemetry.js
```

Their intended separation is:

- `widget.js` — DOM/render/controller behavior local to the widget;
- `widget.css` — widget-local presentation and responsive layout;
- `provider.js` — data acquisition, normalization, fallback, and freshness handling;
- `model.js` — derived state, transformations, chart-ready structures, and domain calculations;
- `telemetry.js` — optional output/telemetry adaptation where the widget requires it.

Shared behavior should not be copied into every widget when it can live safely in `_core/` or `_shared/`.

## Data-provider rules

Widget providers should be deterministic about where data came from and when it was observed. A widget that cannot obtain valid data should expose an explicit offline/unavailable/stale state rather than silently rendering zeroes or fabricated values.

Price consumers should prefer the shared canonical price state. Mempool, mining, node, Lightning, and repository widgets may use their own domain-specific providers while following the same principles:

- normalize source data before presentation;
- preserve source/freshness metadata where available;
- distinguish missing data from a true numeric zero;
- avoid blocking the rest of the widget system when one provider fails;
- use local/static JSON snapshots where appropriate for mirrored/static deployments;
- keep rendering logic separate from acquisition logic.

## Styling contract

Widgets should visually behave as members of one system rather than standalone microsites.

The house style uses the site's existing dark tactical interface, locally hosted fonts, compact information density, and shared spacing/typographic conventions. Widget CSS should remain scoped enough that loading one widget does not restyle unrelated site content.

Chart widgets such as `price-24h`, `volume-24h`, and `high-low-24h` should share the same visual grammar—frame, labels, spacing, typography, loading/error states, and responsive behavior—even though their data models differ.

## Current directory layout

```text
__partials/widgets/
├── _core/
├── _shared/
├── bitage/
├── bitavg/
├── bitbilling/
├── bitcoin-ticker/
├── bitrng/
├── bittrackit/
├── block-clock/
├── block-stats/
├── btc-blockexplorer/
├── btc-burned/
├── btc-commits/
├── btc-gif-price/
├── btc-gif/
├── btc-halving-suite/
├── btc-intel/
├── btc-lost/
├── btc-mined/
├── btc-news/
├── btc-notabletxs/
├── btc-prs/
├── btc-repo/
├── btc-stolen/
├── btc-to-mine/
├── clock-drift/
├── currency-converter/
├── deadopop/
├── difficulty-adjustment/
├── drift/
├── fees/
├── global-power-grid/
├── hashrate-by-nation/
├── hashrate/
├── high-low-24h/
├── iching/
├── intel/
├── knots-vs-core/
├── lightning-detail/
├── lightning/
├── mempool-goggles/
├── mempool-mosaic/
├── mempool-specs/
├── mempool-tiles/
├── mempool-visualizer/
├── mempool/
├── mining-rewards/
├── mining-stats/
├── node-health/
├── node-latency/
├── node-network-mix/
├── nodes-by-asn/
├── nodes-by-city/
├── nodes-by-county/
├── nodes-by-nation/
├── nodes-by-version/
├── nodes/
├── price-24h/
├── satoshi-quote/
├── spp/
├── themarketbtccreated/
├── tip-drift/
├── tip/
├── volume-24h/
├── hud-state.js
└── manifest.json
```

The listing above reflects the supplied repository snapshot. It describes directory identity, not implementation maturity.

## Widget index

| Widget | Area | Purpose |
|---|---|---|
| [`bitavg`](./bitavg/) | Price, Markets & Conversion | Global weighted Bitcoin price/index presentation surface. |
| [`bitcoin-ticker`](./bitcoin-ticker/) | Price, Markets & Conversion | Primary live Bitcoin ticker and denomination display. |
| [`btc-gif-price`](./btc-gif-price/) | Price, Markets & Conversion | Price-aware BTC GIF output/telemetry surface. |
| [`btc-gif`](./btc-gif/) | Price, Markets & Conversion | BTC GIF rendering/output surface. |
| [`currency-converter`](./currency-converter/) | Price, Markets & Conversion | BTC/fiat and supported-unit conversion interface. |
| [`high-low-24h`](./high-low-24h/) | Price, Markets & Conversion | 24-hour BTC high/low visualization. |
| [`price-24h`](./price-24h/) | Price, Markets & Conversion | 24-hour Bitcoin price chart. |
| [`themarketbtccreated`](./themarketbtccreated/) | Price, Markets & Conversion | Bitcoin-created market/value research widget. |
| [`volume-24h`](./volume-24h/) | Price, Markets & Conversion | 24-hour Bitcoin market-volume chart. |
| [`bitage`](./bitage/) | Blocks, Supply, Fees & Chain State | Bitcoin block-interval / chain-age presentation surface. |
| [`block-clock`](./block-clock/) | Blocks, Supply, Fees & Chain State | Block-height and Bitcoin network clock display. |
| [`block-stats`](./block-stats/) | Blocks, Supply, Fees & Chain State | Current block/network statistics. |
| [`btc-blockexplorer`](./btc-blockexplorer/) | Blocks, Supply, Fees & Chain State | Compact Bitcoin block explorer interface. |
| [`btc-burned`](./btc-burned/) | Blocks, Supply, Fees & Chain State | Burned/unspendable BTC dataset visualization. |
| [`btc-halving-suite`](./btc-halving-suite/) | Blocks, Supply, Fees & Chain State | Halving-related Bitcoin metrics and countdown suite. |
| [`btc-lost`](./btc-lost/) | Blocks, Supply, Fees & Chain State | Lost-Bitcoin research/estimate surface. |
| [`btc-mined`](./btc-mined/) | Blocks, Supply, Fees & Chain State | Mined/circulating Bitcoin supply surface. |
| [`btc-notabletxs`](./btc-notabletxs/) | Blocks, Supply, Fees & Chain State | Notable Bitcoin transaction presentation. |
| [`btc-stolen`](./btc-stolen/) | Blocks, Supply, Fees & Chain State | Stolen-Bitcoin research/data surface. |
| [`btc-to-mine`](./btc-to-mine/) | Blocks, Supply, Fees & Chain State | Remaining Bitcoin issuance / BTC-to-mine surface. |
| [`clock-drift`](./clock-drift/) | Blocks, Supply, Fees & Chain State | Clock/drift metric presentation. |
| [`difficulty-adjustment`](./difficulty-adjustment/) | Blocks, Supply, Fees & Chain State | Bitcoin difficulty-adjustment state and projection. |
| [`drift`](./drift/) | Blocks, Supply, Fees & Chain State | Drift metric/widget surface. |
| [`fees`](./fees/) | Blocks, Supply, Fees & Chain State | Bitcoin fee-rate and fee-estimation display. |
| [`spp`](./spp/) | Blocks, Supply, Fees & Chain State | SPP project widget surface; canonical behavior belongs to its widget files/manifest. |
| [`tip-drift`](./tip-drift/) | Blocks, Supply, Fees & Chain State | Chain-tip drift metric surface. |
| [`tip`](./tip/) | Blocks, Supply, Fees & Chain State | Bitcoin chain-tip state. |
| [`mempool-goggles`](./mempool-goggles/) | Mempool | Alternative mempool visualization surface. |
| [`mempool-mosaic`](./mempool-mosaic/) | Mempool | Mosaic-style mempool visualization. |
| [`mempool-specs`](./mempool-specs/) | Mempool | Detailed mempool metrics/specification view. |
| [`mempool-tiles`](./mempool-tiles/) | Mempool | Tile-based mempool visualization. |
| [`mempool-visualizer`](./mempool-visualizer/) | Mempool | ZZX-Labs mempool visualizer surface. |
| [`mempool`](./mempool/) | Mempool | Primary mempool metrics widget. |
| [`global-power-grid`](./global-power-grid/) | Mining & Energy | Global power-grid dataset visualization used by the broader research/Bitcoin stack. |
| [`hashrate-by-nation`](./hashrate-by-nation/) | Mining & Energy | Geographic hashrate distribution by nation. |
| [`hashrate`](./hashrate/) | Mining & Energy | Bitcoin network hashrate display. |
| [`mining-rewards`](./mining-rewards/) | Mining & Energy | Mining subsidy/reward/fee metrics. |
| [`mining-stats`](./mining-stats/) | Mining & Energy | Bitcoin mining statistics overview. |
| [`knots-vs-core`](./knots-vs-core/) | Bitcoin Nodes & Network | Bitcoin Knots vs Bitcoin Core comparison surface. |
| [`node-health`](./node-health/) | Bitcoin Nodes & Network | Bitcoin node health status. |
| [`node-latency`](./node-latency/) | Bitcoin Nodes & Network | Bitcoin node/network latency metrics. |
| [`node-network-mix`](./node-network-mix/) | Bitcoin Nodes & Network | Bitcoin node network/transport mix. |
| [`nodes-by-asn`](./nodes-by-asn/) | Bitcoin Nodes & Network | Bitcoin nodes grouped by ASN. |
| [`nodes-by-city`](./nodes-by-city/) | Bitcoin Nodes & Network | Bitcoin nodes grouped by city. |
| [`nodes-by-county`](./nodes-by-county/) | Bitcoin Nodes & Network | Bitcoin nodes grouped by county. |
| [`nodes-by-nation`](./nodes-by-nation/) | Bitcoin Nodes & Network | Bitcoin nodes grouped by nation. |
| [`nodes-by-version`](./nodes-by-version/) | Bitcoin Nodes & Network | Bitcoin nodes grouped by software/version. |
| [`nodes`](./nodes/) | Bitcoin Nodes & Network | Primary Bitcoin node/Bitnodes-style overview. |
| [`lightning-detail`](./lightning-detail/) | Lightning Network | Detailed Lightning Network metrics. |
| [`lightning`](./lightning/) | Lightning Network | Primary Lightning Network overview. |
| [`btc-commits`](./btc-commits/) | Repositories, News & Intelligence | Bitcoin-related repository commit activity. |
| [`btc-intel`](./btc-intel/) | Repositories, News & Intelligence | Bitcoin intelligence aggregation surface. |
| [`btc-news`](./btc-news/) | Repositories, News & Intelligence | Bitcoin news/feed surface. |
| [`btc-prs`](./btc-prs/) | Repositories, News & Intelligence | Bitcoin-related pull-request activity. |
| [`btc-repo`](./btc-repo/) | Repositories, News & Intelligence | Bitcoin repository activity/provider surface. |
| [`intel`](./intel/) | Repositories, News & Intelligence | General intelligence/source aggregation widget. |
| [`satoshi-quote`](./satoshi-quote/) | Repositories, News & Intelligence | Satoshi quotation/content widget. |
| [`bitbilling`](./bitbilling/) | Application / Project Widgets | Fiat → BTC invoice snapshot and billing presentation. |
| [`bitrng`](./bitrng/) | Application / Project Widgets | BitRNG project widget surface. |
| [`bittrackit`](./bittrackit/) | Application / Project Widgets | BitTrackIt project/widget surface. |
| [`iching`](./iching/) | Application / Project Widgets | I-Ching project widget with canonical Bitcoin price integration. |
| [`deadopop`](./deadopop/) | Experimental / Specialized | Specialized project widget surface; canonical behavior belongs to its widget files/manifest. |

## Mempool family

The mempool widgets are separate views over related Bitcoin mempool state:

```text
mempool
├── mempool-goggles
├── mempool-mosaic
├── mempool-specs
├── mempool-tiles
└── mempool-visualizer
```

They should be able to coexist without each one becoming a separate source of truth for shared price or common network state.

`mempool-visualizer` is the ZZX-Labs visualization surface, while the other mempool widgets provide alternate summary, metric, tile, mosaic, or specialized views.

## Node / Bitnodes family

The node widgets separate aggregate network state from focused dimensions:

```text
nodes
├── node-health
├── node-latency
├── node-network-mix
├── nodes-by-asn
├── nodes-by-city
├── nodes-by-county
├── nodes-by-nation
└── nodes-by-version
```

This allows the main `nodes` surface to remain concise while detailed widgets handle filtering, grouping, and geographic/version analysis.

## Market chart family

The three primary 24-hour chart widgets are:

```text
price-24h
volume-24h
high-low-24h
```

They are independent renderers but should use the same canonical market state, common widget CSS language, synchronized freshness semantics, and consistent axis/label behavior.

## Lightning family

`lightning` provides the primary Lightning Network overview. `lightning-detail` is the expanded metrics view. Shared Lightning data should be normalized before either renderer consumes it.

## Repository and intelligence widgets

`btc-commits`, `btc-prs`, and `btc-repo` expose Bitcoin-related repository activity. `btc-news`, `btc-intel`, and `intel` provide news/intelligence-facing surfaces. Their provider logic should preserve source attribution and timestamps rather than merging unrelated observations into an unattributed result.

## Adding a widget

A new widget should be added as an independent directory and registered in `manifest.json`.

Recommended workflow:

```text
1. Create __partials/widgets/<widget>/
2. Add the widget's local render/style/provider files as required.
3. Reuse _core/ and _shared/ behavior instead of cloning it.
4. Add the widget to manifest.json.
5. Add switchboard/HUD integration when the widget is user-toggleable.
6. Test load, render, resize, collapse, restore, offline, stale-data, and recovery states.
7. Confirm the widget does not alter unrelated providers or DOM outside its own surface.
```

Do not make a widget depend on Node.js/npm/npx/React or Node-backed GitHub Actions. Browser-side JavaScript should remain lightweight and limited to functionality that actually belongs in the browser.

## Debugging checklist

When a widget appears broken, check the layers in this order:

```text
manifest registration
        ↓
partial/widget loader
        ↓
shared/core dependencies
        ↓
provider / source availability
        ↓
model normalization
        ↓
widget.js render lifecycle
        ↓
widget.css layout / visibility
        ↓
hud-state / switchboard state
```

Common failure classes include stale source URLs, invalid JSON, a provider returning an unexpected schema, a model treating missing data as zero, duplicate event listeners, stale cached JavaScript, CSS collapsing the widget body, and a switchboard state being incorrectly coupled to the provider.

## Validation expectations

Before merging a widget change, verify at minimum that:

- the widget is present in `manifest.json`;
- all local imports and asset paths resolve from the deployed page context;
- no console exception occurs during initial load;
- a failed provider produces an explicit recoverable state;
- the widget survives repeated hide/show operations;
- its event listeners do not multiply after repeated renders;
- responsive layout works at narrow and wide widths;
- canonical price consumers agree on the same price source and timestamp;
- denomination labels use the site-wide canonical spelling;
- the change does not require Node-based tooling.

## Repository location

```text
zzx-labs-website/
└── __partials/
    └── widgets/
```

GitHub:

<https://github.com/ZZX-Labs/zzx-labs-website/tree/main/__partials/widgets>

## Maintenance rule

The root widget manifest, this README, and the deployed directory tree should describe the same inventory.

When the directory changes, update documentation in the same commit. Do not rely on GitHub's automatically generated directory listing as the only human-readable documentation for the widget subsystem.
