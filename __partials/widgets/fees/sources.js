// __partials/widgets/fees/sources.js
(function () {
  "use strict";

  const NS = (window.ZZXFeesSources = window.ZZXFeesSources || {});

  NS.endpoints = {
    recommended: "https://mempool.space/api/v1/fees/recommended"
  };

  // Reduce 429 risk + provide stability
  NS.policy = {
    refreshMs: 60_000,
    cacheTtlMs: 5 * 60_000,
    timeoutMs: 12_000
  };

  // unit cycle requested
  // click: sat/vB -> BTC/vB -> msat/vB -> μsat/vB
  NS.units = [
    { id: "sat",  label: "sat/vB" },
    { id: "btc",  label: "BTC/vB" },
    { id: "msat", label: "msat/vB" },
    { id: "usat", label: "μsat/vB" }
  ];
})();
