// __partials/widgets/nodes-by-version/sources.js
// DROP-IN (FIXED ENDPOINTS)

(function () {
  "use strict";

  const W = window;
  const NS = (W.ZZXNodesByVersionSources =
    W.ZZXNodesByVersionSources || {});

  NS.id = "nodes-by-version";

  NS.config = {
    pageSize: 5,
    refreshMs: 10 * 60_000,

    // Prefer user-agent distribution endpoint (more common than versions).
    // Keep versions as fallback only.
    endpoints: {
      userAgents: "https://bitnodes.io/api/v1/nodes/user_agents/",
      versions: "https://bitnodes.io/api/v1/nodes/versions/",          // fallback (may 404)
      snapshotLatest: "https://bitnodes.io/api/v1/snapshots/latest/",  // final fallback
    },
  };

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
