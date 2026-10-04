// __partials/widgets/global-power-grid/js/sources.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXGlobalPowerGridSources?.__version||0)>=3)return;

  W.ZZXGlobalPowerGridSources=Object.freeze({
    __version:3,

    registry:[
      "/bitcoin/power-grid/api/countries.json",
      "/__partials/widgets/global-power-grid/data/countries.json"
    ],

    factbook:[
      "/worldfactbook/api/electricity-history.json",
      "/bitcoin/power-grid/api/factbook-history.json",
      "/__partials/widgets/global-power-grid/data/factbook-history.json"
    ],

    live:[
      "/bitcoin/power-grid/api/live-grid.json",
      "/__partials/widgets/global-power-grid/data/live-grid.json"
    ],

    archiveModule:"/__partials/worldfactbook/archive.js",
    sourceRegistry:"/__partials/widgets/global-power-grid/data/sources.json",
    archiveCatalog:"/__partials/widgets/global-power-grid/data/worldfactbook-source-catalog.json"
  });
})();
