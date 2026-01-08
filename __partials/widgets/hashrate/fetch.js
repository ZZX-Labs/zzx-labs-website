// __partials/widgets/hashrate/fetch.js
// DROP-IN (NEW)
// Robust JSON fetch:
// - tries direct fetch first (fastest when CORS allows)
// - falls back to AllOrigins RAW
// - parses text-first with better errors (shows first bytes)
// - never silently JSON.parse() garbage

(function () {
  "use strict";

  const W = window;
  const NS = (W.ZZXHashrateFetch = W.ZZXHashrateFetch || {});

  const AO_RAW = "https://api.allorigins.win/raw?url=";
  const ao = (u) => AO_RAW + encodeURIComponent(String(u));

  function snip(s, n = 160) {
    const t = String(s ?? "").replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n) + "…" : t;
  }

  function isProbablyJSON(text) {
    const t = String(text || "").trim();
    return t.startsWith("{") || t.startsWith("[") || /^-?\d+(\.\d+)?$/.test(t);
  }

  function parseJSONish(text, url) {
    const raw = String(text ?? "");
    const t = raw.trim();

    // numeric-only endpoints (rare, but safe)
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);

    try {
      return JSON.parse(t);
    } catch {
      const hint =
        t.startsWith("<") ? "Looks like HTML (blocked/edge page)." :
        t.toLowerCase().includes("rate") || t.toLowerCase().includes("too many") ? "Looks like rate-limit text." :
        "Non-JSON response.";
      throw new Error(`JSON.parse failed (${hint}) for ${url}. First bytes: "${snip(t)}"`);
    }
  }

  async function fetchTextDirect(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  }

  async function fetchTextAO(url) {
    const r = await fetch(ao(url), { cache: "no-store" });
    if (!r.ok) throw new Error(`AO HTTP ${r.status}`);
    return await r.text();
  }

  // core-aware wrapper:
  // - if core.fetchText exists and url is same-origin-ish, use it
  // - for absolute urls, we still do direct→AO fallback
  async function fetchText(core, url) {
    if (core && typeof core.fetchText === "function" && !/^https?:\/\//i.test(url)) {
      return await core.fetchText(url);
    }

    // try direct first
    try {
      const t = await fetchTextDirect(url);
      return t;
    } catch {
      // AO fallback
      return await fetchTextAO(url);
    }
  }

  NS.fetchJSON = async function fetchJSON(core, url) {
    // If you already have ZZXAO.text (your AllOrigins helper), prefer it,
    // but still parse text-first so we can error-report properly.
    if (W.ZZXAO && typeof W.ZZXAO.text === "function") {
      const t = await W.ZZXAO.text(url);
      return parseJSONish(t, url);
    }

    const t = await fetchText(core, url);

    // If direct fetch returned an HTML page (e.g. Cloudflare), parseJSONish will show it.
    // If it looks non-json but not HTML, still show first bytes.
    if (!isProbablyJSON(t)) {
      // try AO once if we used direct and got non-json
      try {
        const ta = await fetchTextAO(url);
        return parseJSONish(ta, url);
      } catch (e) {
        // fall through to parseJSONish on original to preserve first-bytes of the original response too
      }
    }

    return parseJSONish(t, url);
  };
})();
