// __partials/widgets/mempool-specs/sources.js
// DROP-IN COMPLETE REPLACEMENT
//
// Centralized endpoints + tuning knobs for mempool-specs.
// Uses mempool.space where possible.
// Exposes:
//   window.ZZXMempoolSpecsSources.get()
//
(function () {
  "use strict";

  const W = window;
  const NS = (W.ZZXMempoolSpecsSources = W.ZZXMempoolSpecsSources || {});

  const ID = "mempool-specs";

  const DEFAULTS = {
    id: ID,

    // data cadence
    minIntervalMs: 15_000,          // txfetcher throttle floor
    refreshMs: 20 * 60_000,         // full refresh (the widget ticks faster; fetcher gates)

    // mempool.space API base (no trailing slash)
    apiBase: "https://mempool.space/api",

    endpoints: {
      // primary
      mempool: "/mempool",
      tipHeight: "/blocks/tip/height",
      tipHash: "/blocks/tip/hash",

      // optional / future expansion
      blockHeightToHash: "/block-height/{height}",
      block: "/block/{hash}",
      blockTxids: "/block/{hash}/txids",
      tx: "/tx/{txid}",
    },

    // visual sizing defaults (used by widget.js grid builder)
    grid: {
      minCssH: 220,
      cellCss: 7,
      gapCss: 1,
      padCss: 10,
      // Safety cap: keep rendering fast
      maxSquares: 420
    },

    // histogram -> square chunking
    chunking: {
      maxSquares: 420,
      minChunkVb: 900,
      vbPerSquare: 12_000, // ~1 square per this vB; widget.js converts into chunks
      maxChunksPerBand: 24
    }
  };

  function deepMerge(a, b) {
    const out = { ...(a || {}) };
    for (const [k, v] of Object.entries(b || {})) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        out[k] = deepMerge(out[k], v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  function resolve(cfg) {
    // allow global override per widget id
    const ovr = W.ZZX_WIDGET_OVERRIDES?.[ID];
    if (ovr && typeof ovr === "object") return deepMerge(cfg, ovr);
    return cfg;
  }

  function buildUrl(base, path) {
    const b = String(base || "").replace(/\/+$/, "");
    const p = String(path || "");
    if (!p) return b;
    if (/^https?:\/\//i.test(p)) return p;
    return b + (p.startsWith("/") ? p : ("/" + p));
  }

  NS.get = function get() {
    const cfg = resolve(DEFAULTS);

    // materialize absolute endpoint URLs for convenience
    const apiBase = String(cfg.apiBase || DEFAULTS.apiBase).replace(/\/+$/, "");
    const ep = cfg.endpoints || {};
    const abs = {
      mempool: buildUrl(apiBase, ep.mempool),
      tipHeight: buildUrl(apiBase, ep.tipHeight),
      tipHash: buildUrl(apiBase, ep.tipHash),

      blockHeightToHash: buildUrl(apiBase, ep.blockHeightToHash),
      block: buildUrl(apiBase, ep.block),
      blockTxids: buildUrl(apiBase, ep.blockTxids),
      tx: buildUrl(apiBase, ep.tx),
    };

    return {
      ...cfg,
      apiBase,
      endpointsAbs: abs
    };
  };
})();
