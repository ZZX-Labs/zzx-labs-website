// __partials/widgets/hashrate-by-nation/fetch.js
// DROP-IN
// AllOrigins RAW -> text -> JSON (with useful parse error previews)

(function(){
  "use strict";

  const NS = (window.ZZXHashrateNationFetch =
    window.ZZXHashrateNationFetch || {});

  const AO_RAW = "https://api.allorigins.win/raw?url=";

  async function fetchText(url){
    const r = await fetch(AO_RAW + encodeURIComponent(String(url)), {
      cache: "no-store",
      redirect: "follow",
    });
    const t = await r.text();
    if (!r.ok){
      const head = t.slice(0, 180).replace(/\s+/g," ").trim();
      throw new Error(`HTTP ${r.status} (allorigins): ${head || "no body"}`);
    }
    return t;
  }

  function parseJSON(text){
    const s = String(text || "").trim();
    if (!s) throw new Error("empty response");
    try{
      return JSON.parse(s);
    }catch{
      const head = s.slice(0, 180).replace(/\s+/g," ").trim();
      throw new Error(`JSON.parse failed: ${head || "no preview"}`);
    }
  }

  NS.fetchJSON = async function(url){
    const text = await fetchText(url);
    return parseJSON(text);
  };
})();
