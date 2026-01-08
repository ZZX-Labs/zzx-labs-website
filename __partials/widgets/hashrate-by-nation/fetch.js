// __partials/widgets/hashrate-by-nation/fetch.js
// DROP-IN REPLACEMENT
// - AllOrigins RAW fallback
// - text->JSON parsing with useful error messages
// - optional ctx.fetchJSON support (if you later wire it)

(function(){
  "use strict";

  const NS = (window.ZZXHashrateNationFetch =
    window.ZZXHashrateNationFetch || {});

  const AO_RAW = "https://api.allorigins.win/raw?url=";

  async function fetchText(url){
    // Prefer your existing AllOrigins helper if present
    if (window.ZZXAO?.rawText) return window.ZZXAO.rawText(url);

    // If you only have ZZXAO.json, don't use it here (we want text first).
    const r = await fetch(AO_RAW + encodeURIComponent(String(url)), {
      cache: "no-store",
      redirect: "follow",
    });
    const t = await r.text();
    if (!r.ok) {
      const head = t.slice(0, 160).replace(/\s+/g, " ").trim();
      throw new Error(`HTTP ${r.status} from allorigins: ${head || "no body"}`);
    }
    return t;
  }

  function parseJSON(text){
    // Trim BOM / whitespace
    const s = String(text || "").trim();
    if (!s) throw new Error("empty response");
    try {
      return JSON.parse(s);
    } catch (e) {
      const head = s.slice(0, 160).replace(/\s+/g, " ").trim();
      throw new Error(`JSON.parse failed: ${head || "no preview"}`);
    }
  }

  NS.fetchJSON = async function fetchJSON(url){
    const text = await fetchText(url);
    return parseJSON(text);
  };
})();
