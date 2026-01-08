// __partials/widgets/hashrate-by-nation/fetch.js
// DROP-IN (DEBUGGED)
// Strategy:
//   1) Try direct fetch (fast, clean JSON when allowed)
//   2) Fallback to AllOrigins RAW if blocked
//   3) Text-first parsing with safe error previews

(function () {
  "use strict";

  const NS = (window.ZZXHashrateNationFetch =
    window.ZZXHashrateNationFetch || {});

  const AO_RAW = "https://api.allorigins.win/raw?url=";

  async function fetchTextDirect(url) {
    const r = await fetch(url, {
      cache: "no-store",
      credentials: "omit",
      redirect: "follow",
    });
    const t = await r.text();
    if (!r.ok) {
      const head = t.slice(0, 160).replace(/\s+/g, " ").trim();
      throw new Error(`HTTP ${r.status}: ${head || "no body"}`);
    }
    return t;
  }

  async function fetchTextAO(url) {
    const r = await fetch(AO_RAW + encodeURIComponent(String(url)), {
      cache: "no-store",
      redirect: "follow",
    });
    const t = await r.text();
    if (!r.ok) {
      const head = t.slice(0, 160).replace(/\s+/g, " ").trim();
      throw new Error(`AO HTTP ${r.status}: ${head || "no body"}`);
    }
    return t;
  }

  function parseJSON(text, source) {
    const s = String(text || "").trim();
    if (!s) throw new Error(`empty response (${source})`);
    try {
      return JSON.parse(s);
    } catch {
      const head = s.slice(0, 200).replace(/\s+/g, " ").trim();
      throw new Error(`JSON.parse failed (${source}): ${head || "no preview"}`);
    }
  }

  NS.fetchJSON = async function fetchJSON(url) {
    // 1) Direct first
    try {
      const text = await fetchTextDirect(url);
      return parseJSON(text, "direct");
    } catch (e1) {
      // 2) Fallback to AllOrigins
      try {
        const text = await fetchTextAO(url);
        return parseJSON(text, "allorigins");
      } catch (e2) {
        // Surface both causes for real debugging
        throw new Error(
          `fetchJSON failed\n` +
          `direct: ${e1.message}\n` +
          `allorigins: ${e2.message}`
        );
      }
    }
  };
})();
