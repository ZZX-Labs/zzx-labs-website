// __partials/widgets/hashrate-by-nation/js/sources.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXHashrateNationSources?.__version||0)>=5)return;

  W.ZZXHashrateNationSources=Object.freeze({
    __version:5,

    hashrate:{
      model:"/__partials/widgets/hashrate/js/model.js",
      provider:"/__partials/widgets/hashrate/js/provider.js"
    },

    // Optional direct nation-share model. When populated, this is the most
    // direct input the estimator accepts and outranks all proxy evidence.
    estimates:[
      "/bitcoin/mining/api/hashrate-by-nation/latest.json",
      "/bitcoin/mining/hashrate-by-nation.json",
      "/__partials/widgets/hashrate-by-nation/hashrate-by-nation.json"
    ],

    pools:{
      localPrimary:"/bitcoin/mining/api/pools/24h.json",
      localFallback:"/bitcoin/mining/pools/24h.json",
      direct:"https://mempool.space/api/v1/mining/pools/24h"
    },

    poolEvidence:{
      localPrimary:"/bitcoin/mining/api/hashrate-by-nation/pool-country-evidence.json",
      localFallback:"/bitcoin/mining/api/pool-country-evidence.json",
      bundled:"/__partials/widgets/hashrate-by-nation/data/pool-country-evidence.json"
    },

    miningGrid:{
      localPrimary:"/bitcoin/mining/api/hashrate-by-nation/power-grid-24h.json",
      localFallback:"/bitcoin/mining/api/power-grid/24h.json",
      bundled:"/__partials/widgets/hashrate-by-nation/data/power-grid-24h.json"
    },

    powerGrid:{
      model:"/__partials/widgets/global-power-grid/js/model.js",
      provider:"/__partials/widgets/global-power-grid/js/provider.js",
      registry:[
        "/bitcoin/power-grid/api/countries.json",
        "/__partials/widgets/global-power-grid/data/countries.json"
      ],
      factbook:[
        "/bitcoin/power-grid/api/factbook-history.json",
        "/worldfactbook/api/electricity-history.json",
        "/__partials/widgets/global-power-grid/data/factbook-history.json"
      ],
      live:[
        "/bitcoin/power-grid/api/live-grid.json",
        "/__partials/widgets/global-power-grid/data/live-grid.json"
      ]
    },

    nodes:{
      countryAggregates:[
        "/bitcoin/bitnodes/maps/data/map-countries.json",
        "/bitcoin/bitnodes/live-map/data/map-countries.json"
      ],
      geojson:[
        "/bitcoin/bitnodes/maps/data/nodes.geojson",
        "/bitcoin/bitnodes/live-map/data/nodes.geojson",
        "/bitcoin/bitnodes/maps/zzxbitnodes/data/nodes.geojson",
        "/bitcoin/bitnodes/live-map/zzxbitnodes/data/nodes.geojson",
        "/bitcoin/bitnodes/maps/data/map-points.geojson",
        "/bitcoin/bitnodes/live-map/data/map-points.geojson"
      ]
    }
  });
})();
