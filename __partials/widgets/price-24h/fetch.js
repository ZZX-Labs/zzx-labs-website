// __partials/widgets/price-24h/fetch.js
// AllOrigins RAW fetch helpers + caching.

(function () {
  "use strict";

  const NS = (window.ZZXAO = window.ZZXAO || {});
  const AO_RAW = "https://api.allorigins.win/raw?url=";

  function ao(u){ return AO_RAW + encodeURIComponent(String(u)); }

  NS.text = async function fetchText(url) {
    const r = await fetch(ao(url), { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  };

  NS.json = async function fetchJSON(url) {
    const r = await fetch(ao(url), { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  };
})();
