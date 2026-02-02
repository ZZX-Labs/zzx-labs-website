// __partials/widgets/nodes-by-version/sources.js
// DROP-IN (UPDATED)
// Uses Bitnodes endpoints that match the real payload shapes you showed.
//
// Strategy:
// - Primary: /api/v1/nodes/user_agents/  (small, ideal for "by version")
// - Fallback: /api/v1/nodes/versions/    (sometimes present, sometimes not)
// - Fallback: /api/v1/snapshots/latest/  (small-ish)
// - Fallback: /api/v1/snapshots/<ts>/    (HUGE; adapter must aggregate from nodes map; fetch.js will not cache)
//
// You can override any endpoint via:
//   window.ZZX_WIDGET_OVERRIDES["nodes-by-version"] = { endpoints: { snapshotTs: "..." } }

(function () {
  "use strict";

  const W = window;
  const NS = (W.ZZXNodesByVersionSources = W.ZZXNodesByVersionSources || {});

  NS.id = "nodes-by-version";

  NS.config = {
    pageSize: 5,
    refreshMs: 10 * 60_000,

    // Optional fixed timestamp snapshot (string or number). If set, widget can use it.
    // Example: "1769991597"
    snapshotTs: null,

    endpoints: {
      userAgents: "https://bitnodes.io/api/v1/nodes/user_agents/",
      versions: "https://bitnodes.io/api/v1/nodes/versions/",
      snapshotLatest: "https://bitnodes.io/api/v1/snapshots/latest/",
      // If snapshotTs is set, widget will expand this template:
      snapshotByTsTpl: "https://bitnodes.io/api/v1/snapshots/{ts}/",
    },
  };

  NS.get = function get() {
    const base = NS.config;
    const ovr = W.ZZX_WIDGET_OVERRIDES?.[NS.id];

    const cfg = (ovr && typeof ovr === "object")
      ? {
          ...base,
          ...ovr,
          endpoints: { ...base.endpoints, ...(ovr.endpoints || {}) },
        }
      : { ...base, endpoints: { ...base.endpoints } };

    // Expand snapshotTs -> snapshotByTs endpoint if provided
    const ts = cfg.snapshotTs != null ? String(cfg.snapshotTs).trim() : "";
    if (ts) {
      cfg.endpoints.snapshotTs = cfg.endpoints.snapshotByTsTpl.replace("{ts}", encodeURIComponent(ts));
    } else {
      cfg.endpoints.snapshotTs = null;
    }

    return cfg;
  };
})();
