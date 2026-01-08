// __partials/widgets/hashrate-by-nation/mapper.js
(function(){
  "use strict";

  const NS = (window.ZZXHashrateNationMap =
    window.ZZXHashrateNationMap || {});

  // Heuristic mapping — you can refine this over time
  const POOL_TO_NATION = {
    "Foundry USA": "US",
    "AntPool": "CN",
    "F2Pool": "CN",
    "ViaBTC": "CN",
    "Binance Pool": "SC",
    "Luxor": "US",
    "MARA Pool": "US",
    "Braiins Pool": "CZ",
    "Unknown": "Other"
  };

  NS.mapPool = function(poolName){
    return POOL_TO_NATION[poolName] || "Other";
  };
})();
