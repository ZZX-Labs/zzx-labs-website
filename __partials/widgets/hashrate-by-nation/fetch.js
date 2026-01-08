// __partials/widgets/hashrate-by-nation/fetch.js
(function(){
  "use strict";

  const NS = (window.ZZXHashrateNationFetch =
    window.ZZXHashrateNationFetch || {});

  async function fetchJSON(url){
    if (window.ZZXAO?.json) return window.ZZXAO.json(url);
    const r = await fetch(
      "https://api.allorigins.win/raw?url=" + encodeURIComponent(url),
      { cache:"no-store" }
    );
    if (!r.ok) throw new Error("HTTP "+r.status);
    return r.json();
  }

  NS.fetch = fetchJSON;
})();
