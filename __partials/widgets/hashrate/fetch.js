// __partials/widgets/hashrate/fetch.js
(function () {
  "use strict";

  const W = window;
  const NS = (W.ZZXHashrateFetch = W.ZZXHashrateFetch || {});
  const AO_RAW = "https://api.allorigins.win/raw?url=";

  function now(){ return Date.now(); }
  function enc(u){ return encodeURIComponent(String(u)); }

  function snip(s, n=180){
    const t = String(s ?? "").replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0,n) + "…" : t;
  }

  function lsGet(key){
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
  }
  function lsSet(key, val){
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }

  async function fetchText(url, timeoutMs){
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), Math.max(1000, timeoutMs || 12000));
    try{
      const r = await fetch(url, { cache:"no-store", redirect:"follow", signal: ac.signal });
      const text = await r.text();
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${snip(text) || "no body"}`);
      return text;
    } finally {
      clearTimeout(t);
    }
  }

  function parseJSON(text, tag){
    const s = String(text || "").trim();
    if (!s) throw new Error(`empty response (${tag})`);
    try { return JSON.parse(s); }
    catch {
      throw new Error(`JSON.parse failed (${tag}): "${snip(s)}"`);
    }
  }

  NS.fetchJSON = async function fetchJSON(core, url, opts){
    const u = String(url || "");
    const ttlMs = Number(opts?.ttlMs) || (W.ZZXHashrateSources?.policy?.cacheTtlMs || 300000);
    const timeoutMs = Number(opts?.timeoutMs) || (W.ZZXHashrateSources?.policy?.timeoutMs || 12000);
    const cacheKey = String(opts?.cacheKey || ("zzx:hashrate:" + u));

    const cached = lsGet(cacheKey);
    if (cached?.data && (now() - cached.at) < ttlMs) {
      return { data: cached.data, source:"cache", stale:false, cachedAt: cached.at };
    }

    // 1) direct
    let e1 = null;
    try{
      const text = await fetchText(u, timeoutMs);
      const data = parseJSON(text, "direct");
      lsSet(cacheKey, { at: now(), data });
      return { data, source:"direct", stale:false, cachedAt: now() };
    } catch (e){ e1 = e; }

    // 2) allorigins
    let e2 = null;
    try{
      const text = await fetchText(AO_RAW + enc(u), timeoutMs);
      const data = parseJSON(text, "allorigins");
      lsSet(cacheKey, { at: now(), data });
      return { data, source:"allorigins", stale:false, cachedAt: now() };
    } catch (e){ e2 = e; }

    // 3) stale cache
    if (cached?.data) {
      return {
        data: cached.data,
        source:"cache",
        stale:true,
        cachedAt: cached.at,
        error: `direct: ${e1?.message || e1} · allorigins: ${e2?.message || e2}`
      };
    }

    throw new Error(`fetchJSON failed direct: ${e1?.message || e1} allorigins: ${e2?.message || e2}`);
  };
})();
