// __partials/widgets/nodes/sources.js
// DROP-IN
// Declares endpoints + config for the Nodes widget.

(function () {
  "use strict";

  const NS = (window.ZZXNodesSources = window.ZZXNodesSources || {});

  // Primary data source
  NS.endpoints = {
    bitnodesLatest: "https://bitnodes.io/api/v1/snapshots/latest/",
  };

  // Proxy candidates (first that works wins)
  // We keep direct + allorigins available; widget.js chooses.
  NS.proxies = {
    none: (url) => String(url),
    alloriginsRaw: (url) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(String(url)),
  };

  NS.defaults = {
    refreshMs: 5 * 60_000,
  };
})();
