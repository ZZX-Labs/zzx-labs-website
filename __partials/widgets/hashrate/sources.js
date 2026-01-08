// __partials/widgets/hashrate/sources.js
// DROP-IN (NEW)
// Centralizes endpoints (so widget.js stays thin)

(function () {
  "use strict";

  const W = window;
  const NS = (W.ZZXHashrateSources = W.ZZXHashrateSources || {});

  const MEMPOOL = "https://mempool.space";

  NS.list = function list() {
    return [
      {
        id: "mempool",
        label: "mempool.space",
        endpoints: {
          hashrate3d: `${MEMPOOL}/api/v1/mining/hashrate/3d`,
          difficulty: `${MEMPOOL}/api/v1/difficulty-adjustment`,
        }
      }
    ];
  };
})();
