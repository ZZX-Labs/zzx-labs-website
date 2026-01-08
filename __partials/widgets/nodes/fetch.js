// __partials/widgets/nodes/fetch.js
// DROP-IN
// Direct -> AllOrigins fallback, with:
// - timeout
// - 429 backoff (Retry-After supported when readable)
// - in-memory + localStorage cache
// - singleflight per URL

(function(){
  "use strict";

  const NS = (window.ZZXNodesFetch = window.ZZXNodesFetch || {});

  const AO_RAW = "https://api.allorigins.win/raw?url=";

  const mem = {
    inflight: new Map(),   // url -> Promise
    backoffUntil: 0,       // epoch ms
  };

  function now(){ return Date.now(); }

  function withTimeout(promise, ms){
    const ctrl = new AbortController();
    const t = setTimeout(()=>ctrl.abort(), ms);
    const wrapped = (async()=>{
      try { return await promise(ctrl.signal); }
      finally { clearTimeout(t); }
    })();
    return wrapped;
  }

  function allOrigins(url){
    return AO_RAW + encodeURIComponent(String(url));
  }

  function safeJsonParse(text, tag){
    const s = String(text || "").trim();
    if (!s) throw new Error(`empty response (${tag})`);
    try { return JSON.parse(s); }
    catch {
      const head = s.slice(0, 180).replace(/\s+/g," ").trim();
      throw new Error(`JSON.parse failed (${tag}): ${head || "no preview"}`);
    }
  }

  async function fetchText(url, signal){
    const r = await fetch(url, {
      cache: "no-store",
      credentials: "omit",
      redirect: "follow",
      signal
    });

    const t = await r.text();

    // Handle rate limit explicitly
    if (r.status === 429){
      // Retry-After might be blocked by CORS in direct mode, but try
      const ra = Number(r.headers?.get?.("Retry-After"));
      const waitMs = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 10 * 60_000; // default 10m
      mem.backoffUntil = Math.max(mem.backoffUntil, now() + waitMs);

      const head = t.slice(0, 140).replace(/\s+/g," ").trim();
      throw new Error(`HTTP 429 (rate limited): ${head || "retry later"}`);
    }

    if (!r.ok){
      const head = t.slice(0, 140).replace(/\s+/g," ").trim();
      throw new Error(`HTTP ${r.status}: ${head || "no body"}`);
    }
    return t;
  }

  function loadCache(key){
    try{
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    }catch{ return null; }
  }

  function saveCache(key, obj){
    try{
      localStorage.setItem(key, JSON.stringify(obj));
    }catch{}
  }

  // Core fetch with cache + backoff.
  NS.fetchJSON = async function fetchJSON(opts){
    const url = String(opts?.url || "");
    const cacheKey = String(opts?.cacheKey || "");
    const metaKey = String(opts?.metaKey || "");
    const ttlMs = Number(opts?.ttlMs) || 0;
    const timeoutMs = Number(opts?.timeoutMs) || 12_000;

    if (!url) throw new Error("missing url");
    if (!cacheKey) throw new Error("missing cacheKey");

    // If we are in backoff window, use cache immediately.
    if (mem.backoffUntil && now() < mem.backoffUntil){
      const cached = loadCache(cacheKey);
      if (cached?.data) return { data: cached.data, source: "cache(backoff)", stale: true, cachedAt: cached.at };
      throw new Error("rate-limited (backoff active) and no cache");
    }

    // Return valid cache if TTL not expired
    const cached = loadCache(cacheKey);
    if (cached?.data && cached?.at && ttlMs > 0){
      if (now() - cached.at < ttlMs){
        return { data: cached.data, source: "cache(ttl)", stale: false, cachedAt: cached.at };
      }
    }

    // Singleflight per URL
    if (mem.inflight.has(url)) return mem.inflight.get(url);

    const job = (async()=>{
      // 1) Direct
      try{
        const text = await withTimeout((signal)=>fetchText(url, signal), timeoutMs);
        const data = safeJsonParse(text, "direct");
        saveCache(cacheKey, { at: now(), data });
        if (metaKey) saveCache(metaKey, { at: now(), source: "direct" });
        return { data, source: "direct", stale: false, cachedAt: now() };
      }catch(e1){
        // 2) AllOrigins fallback
        try{
          const prox = allOrigins(url);
          const text = await withTimeout((signal)=>fetchText(prox, signal), timeoutMs);
          const data = safeJsonParse(text, "allorigins");
          saveCache(cacheKey, { at: now(), data });
          if (metaKey) saveCache(metaKey, { at: now(), source: "allorigins" });
          return { data, source: "allorigins", stale: false, cachedAt: now() };
        }catch(e2){
          // 3) Serve stale cache if present (even if expired)
          const stale = loadCache(cacheKey);
          if (stale?.data){
            return {
              data: stale.data,
              source: `cache(stale)`,
              stale: true,
              cachedAt: stale.at
            };
          }

          // Surface both errors for real debugging
          throw new Error(
            `fetchJSON failed\n` +
            `direct: ${String(e1?.message || e1)}\n` +
            `allorigins: ${String(e2?.message || e2)}`
          );
        }
      }finally{
        mem.inflight.delete(url);
      }
    })();

    mem.inflight.set(url, job);
    return job;
  };
})();
