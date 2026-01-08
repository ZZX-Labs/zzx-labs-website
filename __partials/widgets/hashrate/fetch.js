// __partials/widgets/hashrate/fetch.js
// DROP-IN REPLACEMENT
// AllOrigins RAW fetch + tolerant parsers.
// Exposes:
//   window.ZZXHashrateFetch.fetchHashrateSeries(core, url)
//   window.ZZXHashrateFetch.fetchDifficulty(core, url)

(function () {
  "use strict";

  const W = window;
  const NS = (W.ZZXHashrateFetch = W.ZZXHashrateFetch || {});

  const AO_RAW = "https://api.allorigins.win/raw?url=";
  const ao = (u) => AO_RAW + encodeURIComponent(String(u));

  function n2(x){ const v = Number(x); return Number.isFinite(v) ? v : NaN; }

  async function fetchJSON(core, url) {
    // Prefer your runtime fetcher if present (it may already proxy/normalize)
    if (core && typeof core.fetchJSON === "function") return await core.fetchJSON(url);

    // Prefer your AO helper if you have it
    if (W.ZZXAO && typeof W.ZZXAO.json === "function") return await W.ZZXAO.json(url);

    // Always AllOrigins RAW for cross-origin safety
    const r = await fetch(ao(url), { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  // Normalize mempool hashrate series into:
  // [{ t: <ms>, hs: <H/s> }, ...] sorted asc
  function normalizeHashrateSeries(payload) {
    let arr = payload;

    // wrappers: { hashrates }, { data }, { series }
    if (!Array.isArray(arr) && payload && typeof payload === "object") {
      if (Array.isArray(payload.hashrates)) arr = payload.hashrates;
      else if (Array.isArray(payload.data)) arr = payload.data;
      else if (Array.isArray(payload.series)) arr = payload.series;
    }

    if (!Array.isArray(arr)) return [];

    const out = [];

    for (const p of arr) {
      if (!p) continue;

      // Some providers might return [[t, v], ...]
      if (Array.isArray(p)) {
        const t = n2(p[0]);
        const hs = n2(p[1]);
        if (Number.isFinite(hs)) out.push({ t, hs });
        continue;
      }

      if (typeof p === "object") {
        const t = n2(p.timestamp ?? p.time ?? p.t ?? p[0]);
        const hs = n2(p.hashrate ?? p.avgHashrate ?? p.value ?? p.v ?? p.h ?? p[1]);
        if (Number.isFinite(hs)) out.push({ t, hs });
      }
    }

    // Normalize timestamps: seconds -> ms if needed
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
    return normalizeDifficulty(json);
  };
})();
