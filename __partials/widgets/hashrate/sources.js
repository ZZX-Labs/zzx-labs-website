// __partials/widgets/hashrate/sources.js
(function () {
  "use strict";

  const W = window;
  const NS = (W.ZZXHashrateSources = W.ZZXHashrateSources || {});

  const MEMPOOL = "https://mempool.space";

  NS.list = function list() {
    return [{
      id: "mempool",
      label: "mempool.space",
      endpoints: {
        hashrate3d: `${MEMPOOL}/api/v1/mining/hashrate/3d`,
        difficulty: `${MEMPOOL}/api/v1/difficulty-adjustment`
      }
    }];
  };

  // Defaults (override globally with window.ZZX_MINING.J_PER_TH)
  NS.defaults = { jPerTH: 30 };

  // Fetch behavior
  NS.policy = {
    refreshMs: 60_000,
    cacheTtlMs: 5 * 60_000,
    timeoutMs: 12_000
  };

  // Tor inference band (if you have tor node totals available)
  NS.tor = {
    clampMin: 0.05,
    clampMax: 0.85,
    bandLowMult: 0.70,
    bandHighMult: 1.30
  };
})();
