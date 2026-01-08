// __partials/widgets/hashrate/sources.js
// DROP-IN REPLACEMENT
// Defines endpoints only. Network routing (AllOrigins RAW) is handled in fetch.js.
// Exposes: window.ZZXHashrateSources.list() and .get(id)

(function () {
  "use strict";

  const W = window;
  const NS = (W.ZZXHashrateSources = W.ZZXHashrateSources || {});

  // You can override mempool base globally if you want:
  // window.ZZX_API = { MEMPOOL_BASE: "https://mempool.space" }
  function mempoolBase() {
    const u = W.ZZX_API && typeof W.ZZX_API.MEMPOOL_BASE === "string" ? W.ZZX_API.MEMPOOL_BASE.trim() : "";
    return u || "https://mempool.space";
  }

  const SOURCES = [
    {
      id: "mempool",
      label: "mempool.space",
      base: () => mempoolBase(),
      endpoints(base) {
        return {
          hashrate3d: `${base}/api/v1/mining/hashrate/3d`,     // ~hourly points
          difficulty: `${base}/api/v1/difficulty-adjustment`,  // difficulty info
        };
      }
    }
  ];

  NS.list = function list() {
    return SOURCES.map(s => ({
      id: s.id,
      label: s.label,
      endpoints: s.endpoints(s.base()),
    }));
  };

  NS.get = function get(id) {
    const found = SOURCES.find(s => s.id === id) || SOURCES[0];
    const base = found.base();
    return {
      id: found.id,
      label: found.label,
      endpoints: found.endpoints(base),
    };
  };
})();
