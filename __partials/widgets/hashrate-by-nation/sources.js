// __partials/widgets/hashrate-by-nation/sources.js
(function(){
  "use strict";

  const NS = (window.ZZXHashrateNationSources =
    window.ZZXHashrateNationSources || {});

  NS.endpoints = {
    pools24h: "https://mempool.space/api/v1/mining/pools/24h",
    hashrate: "https://mempool.space/api/v1/mining/hashrate/3d"
  };
})();
