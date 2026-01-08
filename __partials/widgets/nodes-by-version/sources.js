// __partials/widgets/nodes-by-version/sources.js
// DROP-IN
// Declares inputs/endpoints for nodes-by-version widget.

(function () {
  "use strict";

  const W = window;
  const NS = (W.ZZXNodesByVersionSources =
    W.ZZXNodesByVersionSources || {});

  NS.id = "nodes-by-version";

  NS.config = {
    pageSize: 5,
    refreshMs: 10 * 60_000,

    // Bitnodes API (best effort)
    endpoints: {
      versions: "https://bitnodes.io/api/v1/nodes/versions/",
      snapshotLatest: "https://bitnodes.io/api/v1/snapshots/latest/",
    },
  };

  // optional: allow overriding endpoints from elsewhere
  NS.get = function get() {
    const cfg = NS.config;
    const ovr = W.ZZX_WIDGET_OVERRIDES?.[NS.id];
    if (ovr && typeof ovr === "object") {
      return {
        ...cfg,
        endpoints: { ...cfg.endpoints, ...(ovr.endpoints || {}) },
      };
    }
    return cfg;
  };
})();
