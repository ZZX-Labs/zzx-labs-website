// __partials/widgets/hashrate/fetch.js
// DROP-IN REPLACEMENT
// - Forces AllOrigins RAW for absolute URLs (mempool.space) to avoid CORS/HTML surprises
// - Parses as text first, then JSON.parse with better errors
// - If provider returns plain numbers (rare here), supports numeric fallback
//
// Exposes:
//   window.ZZXHashrateFetch.fetchHashrateSeries(core, url)
//   window.ZZXHashrateFetch.fetchDifficulty(core, url)

(function () {
  "use strict";

  const W = window;
  const NS = (W.ZZXHashrateFetch = W.ZZXHashrateFetch || {});

  const AO_RAW = "https://api.allorigins.win/raw?url=";
  const ao = (u) => AO_RAW + encodeURIComponent(String(u));

  function isAbsUrl(u) {
    return /^https?:\/\//i.test(String(u || ""));
  }

  function n2(x){ const v = Number(x); return Number.isFinite(v) ? v : NaN; }

  function snip(s, n=140){
    const t = String(s || "").replace(/\s+/g, " ").trim();
    return t.length > n ? (t.slice(0, n) + "…") : t;
  }

  async function fetchTextViaAO(url) {
    const r = await fetch(ao(url), { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  }

  async function fetchText(core, url) {
    // If you have a site fetcher and the URL is site-relative, let it handle it.
    // For absolute URLs, we FORCE AllOrigins for reliability.
    if (!isAbsUrl(url) && core && typeof core.fetchText === "function") {
      return await core.fetchText(url);
    }
    return await fetchTextViaAO(url);
  }

  async function fetchJSON(core, url) {
    // If you already have ZZXAO.json and want it, it's fine for abs URLs too,
    // but we still keep the robust "text-first" parsing because ZZXAO.json may call r.json().
    if (W.ZZXAO && typeof W.ZZXAO.text === "function") {
      const t = await W.ZZXAO.text(url);
      return parseJSONish(t, url);
    }

    const t = await fetchText(core, url);
    return parseJSONish(t, url);
  }

  function parseJSONish(text, url) {
    const raw = String(text ?? "");

    // Sometimes endpoints return just a number or a quoted string.
    const trimmed = raw.trim();

    // Numeric-only fallback
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);

    // JSON parse attempt
    try {
      return JSON.parse(trimmed);
    } catch (e) {
      // Common case: HTML error page or plaintext throttle message
      const hint =
        trimmed.startsWith("<") ? "Looks like HTML (blocked / error page)." :
        trimmed.toLowerCase().includes("rate") || trimmed.toLowerCase().includes("too many") ? "Looks like rate-limiting text." :
        "Non-JSON response.";
      throw new Error(`JSON.parse failed for ${url}. ${hint} First bytes: "${snip(trimmed)}"`);
    }
  }

  // Normalize mempool hashrate series into:
  // [{ t: <ms>, hs: <H/s> }, ...] sorted asc
  function normalizeHashrateSeries(payload) {
    let arr = payload;

    if (!Array.isArray(arr) && payload && typeof payload === "object") {
      if (Array.isArray(payload.hashrates)) arr = payload.hashrates;
      else if (Array.isArray(payload.data)) arr = payload.data;
      else if (Array.isArray(payload.series)) arr = payload.series;
    }

    if (!Array.isArray(arr)) return [];

    const out = [];

    for (const p of arr) {
      if (!p) continue;

      if (Array.isArray(p)) {
        const t = n2(p[0]);
        const hs = n2(p[1]);
        if (Number.isFinite(hs)) out.push({ t, hs });
        continue;
      }

      if (typeof p === "object") {
        const t = n2(p.timestamp ?? p.time ?? p.t);
        const hs = n2(p.hashrate ?? p.avgHashrate ?? p.value ?? p.v ?? p.h);
        if (Number.isFinite(hs)) out.push({ t, hs });
      }
    }

    // seconds -> ms
    for (const pt of out) {
      if (Number.isFinite(pt.t) && pt.t < 2e12) pt.t = pt.t * 1000;
    }

    out.sort((a,b)=> (a.t||0) - (b.t||0));
    return out;
  }

  function normalizeDifficulty(payload) {
    return (
      n2(payload?.difficulty) ||
      n2(payload?.currentDifficulty) ||
      n2(payload?.current_difficulty) ||
      n2(payload?.previousRetarget) ||
      n2(payload?.previous_retarget) ||
      NaN
    );
  }

  NS.fetchHashrateSeries = async function fetchHashrateSeries(core, url) {
    const json = await fetchJSON(core, url);
    const points = normalizeHashrateSeries(json);
    if (!points.length) throw new Error("hashrate series empty");
    return points;
  };

  NS.fetchDifficulty = async function fetchDifficulty(core, url) {
    const json = await fetchJSON(core, url);
    const d = normalizeDifficulty(json);
    return d;
  };
})();
