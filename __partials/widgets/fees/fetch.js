// __partials/widgets/fees/fetch.js
// direct -> allorigins -> stale cache fallback
(function () {
  "use strict";

  const NS = (window.ZZXFeesFetch = window.ZZXFeesFetch || {});
  const AO_RAW = "https://api.allorigins.win/raw?url=";

  function now() { return Date.now(); }

  function lsGet(key) {
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }

  async function fetchText(url, timeoutMs) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), Math.max(1000, timeoutMs || 12000));
    try {
      const r = await fetch(url, { cache: "no-store", redirect: "follow", signal: ac.signal });
      const text = await r.text();
      return { ok: r.ok, status: r.status, text };
    } finally {
      clearTimeout(t);
    }
  }

  function parseJSON(text, tag) {
    const s = String(text || "").trim();
    if (!s) throw new Error(`empty response (${tag})`);
    try { return JSON.parse(s); }
    catch {
      const head = s.slice(0, 180).replace(/\s+/g, " ").trim();
      throw new Error(`JSON.parse failed (${tag}): ${head || "no preview"}`);
    }
  }

  // opts: { url, cacheKey, ttlMs, timeoutMs }
  NS.fetchJSON = async function fetchJSON(opts) {
    const url = String(opts?.url || "");
    const cacheKey = String(opts?.cacheKey || "zzx:fees:cache:v1");
    const ttlMs = Number(opts?.ttlMs) || (5 * 60_000);
    const timeoutMs = Number(opts?.timeoutMs) || 12_000;

    const cached = lsGet(cacheKey);

    // serve fresh cache first
    if (cached?.data && (now() - cached.at) < ttlMs) {
      return { data: cached.data, source: "cache", stale: false, cachedAt: cached.at };
    }

    // direct
    let e1 = null;
    try {
      const r = await fetchText(url, timeoutMs);
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      const data = parseJSON(r.text, "direct");
      lsSet(cacheKey, { at: now(), data });
      return { data, source: "direct", stale: false, cachedAt: now() };
    } catch (err) {
      e1 = err;
    }

    // allorigins
    let e2 = null;
    try {
      const r = await fetchText(AO_RAW + encodeURIComponent(url), timeoutMs);
      if (!r.ok) throw new Error(`AO HTTP ${r.status} for ${url}`);
      const data = parseJSON(r.text, "allorigins");
      lsSet(cacheKey, { at: now(), data });
      return { data, source: "allorigins", stale: false, cachedAt: now() };
    } catch (err) {
      e2 = err;
    }

    // stale cache fallback (prevents “dead widget”)
    if (cached?.data) {
      return {
        data: cached.data,
        source: "cache",
        stale: true,
        cachedAt: cached.at,
        error: `direct: ${e1?.message || e1} allorigins: ${e2?.message || e2}`
      };
    }

    throw new Error(`fetchJSON failed direct: ${e1?.message || e1} allorigins: ${e2?.message || e2}`);
  };
})();
