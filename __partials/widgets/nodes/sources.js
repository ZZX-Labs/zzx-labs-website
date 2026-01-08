// __partials/widgets/nodes/sources.js
// DROP-IN
(function(){
  "use strict";

  const NS = (window.ZZXNodesSources = window.ZZXNodesSources || {});

  NS.endpoints = {
    bitnodesLatest: "https://bitnodes.io/api/v1/snapshots/latest/",
  };

  // IMPORTANT: Bitnodes rate-limits. Default refresh should be >= 15 min.
  NS.policy = {
    refreshMs: 30 * 60_000,      // 30 minutes
    cacheTtlMs: 6 * 60 * 60_000, // 6 hours: serve stale if needed
    timeoutMs: 12_000,           // request timeout
  };

  // Storage keys
  NS.cache = {
    key: "zzx:nodes:bitnodes:latest:v1",
    metaKey: "zzx:nodes:bitnodes:meta:v1",
  };
})();
