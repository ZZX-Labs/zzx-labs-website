// __partials/widgets/knots-vs-core/bitnodes-snapshots.js
// Shared Bitnodes snapshot cache for ALL node widgets.
//
// Key fixes vs earlier versions:
// - DIRECT fetch first (your "Nodes" widget already works via direct).
// - AllOrigins is fallback only.
// - Robust JSON parsing (detects HTML/403/Cloudflare pages that break JSON.parse).
// - Longer timeout + retry.
// - Coalesces concurrent callers (multiple widgets) into one network flight.
// - Provides stable API: window.ZZXBitnodesCache.snapshotPair()

(function () {
  "use strict";

  const W = window;

  const NS = (W.ZZXBitnodesCache = W.ZZXBitnodesCache || {});

  const CFG = {
    SNAPSHOT_LATEST: "https://bitnodes.io/api/v1/snapshots/latest/",
    SNAPSHOT_INDEX: "https://bitnodes.io/api/v1/snapshots/",
    ALLORIGINS_RAW: "https://api.allorigins.win/raw?url=",

    // Make this forgiving; Bitnodes can be slow. 12s was too tight in real world.
    TIMEOUT_MS: 25_000,
    RETRIES: 1,
    RETRY_DELAY_MS: 700,

    // Shared cache TTL to keep widgets from hammering endpoints.
    CACHE_TTL_MS: 60_000,

    // If your site uses aggressive caching/CDN, you can flip this on:
    // Adds a cache-busting query param.
    CACHE_BUST: false,
  };

  function allOrigins(url) {
    return CFG.ALLORIGINS_RAW + encodeURIComponent(String(url || ""));
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function withTimeout(promise, ms, label) {
    let t = null;
    const timeout = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error((label || "timeout") + " after " + ms + "ms")), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
  }

  function looksLikeHTML(text) {
    const s = String(text || "").trim().toLowerCase();
    return s.startsWith("<!doctype") || s.startsWith("<html") || s.includes("<head") || s.includes("<body");
  }

  async function fetchText(url) {
    const u = CFG.CACHE_BUST ? (url + (url.includes("?") ? "&" : "?") + "t=" + Date.now()) : url;
    const r = await fetch(u, {
      cache: "no-store",
      credentials: "omit",
      redirect: "follow",
    });
    const txt = await r.text();
    if (!r.ok) {
      // Include a small snippet to make debugging real failures easier
      const snippet = String(txt || "").slice(0, 180).replace(/\s+/g, " ").trim();
      throw new Error(`HTTP ${r.status} from ${url} :: ${snippet || "no body"}`);
    }
    return txt;
  }

  async function fetchJSONRobust(url, label) {
    const txt = await withTimeout(fetchText(url), CFG.TIMEOUT_MS, label || "fetch");
    if (looksLikeHTML(txt)) {
      const snippet = txt.slice(0, 200).replace(/\s+/g, " ").trim();
      throw new Error(`Non-JSON response (HTML) from ${url} :: ${snippet}`);
    }
    try {
      return JSON.parse(txt);
    } catch (e) {
      const snippet = txt.slice(0, 200).replace(/\s+/g, " ").trim();
      throw new Error(`JSON.parse failed for ${url} :: ${snippet}`);
    }
  }

  async function tryFetchLatestDirectThenProxy() {
    // 1) direct
    try {
      const j = await fetchJSONRobust(CFG.SNAPSHOT_LATEST, "bitnodes latest (direct)");
      return { payload: j, via: "direct" };
    } catch (e1) {
      // 2) allorigins fallback
      const j = await fetchJSONRobust(allOrigins(CFG.SNAPSHOT_LATEST), "bitnodes latest (allorigins)");
      return { payload: j, via: "allorigins" };
    }
  }

  async function tryFetchAny(url) {
    // Used for previous snapshot/index; direct first, then proxy.
    try {
      const j = await fetchJSONRobust(url, "bitnodes (direct)");
      return { payload: j, via: "direct" };
    } catch (e1) {
      const j = await fetchJSONRobust(allOrigins(url), "bitnodes (allorigins)");
      return { payload: j, via: "allorigins" };
    }
  }

  function extractUserAgents(payload) {
    if (payload && typeof payload === "object") {
      if (payload.user_agents && typeof payload.user_agents === "object") return payload.user_agents;
      if (payload.versions && typeof payload.versions === "object") return payload.versions;
      if (payload.data && payload.data.user_agents && typeof payload.data.user_agents === "object") return payload.data.user_agents;
      if (payload.data && payload.data.versions && typeof payload.data.versions === "object") return payload.data.versions;
    }
    return {};
  }

  function extractNumbers(payload) {
    const p = payload && typeof payload === "object" ? payload : {};

    const reachable =
      Number(p.reachable_nodes) ||
      Number(p.reachable) ||
      Number(p.total_reachable) ||
      Number(p.reachable_count) ||
      NaN;

    const unreachable =
      Number(p.unreachable_nodes) ||
      Number(p.unreachable) ||
      Number(p.total_unreachable) ||
      Number(p.unreachable_count) ||
      NaN;

    const total =
      Number(p.total_nodes) ||
      Number(p.total) ||
      Number(p.nodes) ||
      Number(p.total_count) ||
      NaN;

    const tor =
      Number(p.tor_nodes) ||
      Number(p.onion_nodes) ||
      Number(p.onion) ||
      Number(p.tor) ||
      NaN;

    const stamp =
      (p.timestamp != null ? String(p.timestamp) : null) ||
      (p.ts != null ? String(p.ts) : null) ||
      (p.time != null ? String(p.time) : null) ||
      (p.date != null ? String(p.date) : null) ||
      (p.created_at != null ? String(p.created_at) : null) ||
      null;

    return { reachable, unreachable, total, tor, stamp };
  }

  function normalize(payload, via) {
    const ua = extractUserAgents(payload);
    const nums = extractNumbers(payload);

    let uaSum = 0;
    for (const v of Object.values(ua)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) uaSum += n;
    }

    const reachable = Number.isFinite(nums.reachable) ? nums.reachable : (uaSum > 0 ? uaSum : NaN);
    const total = Number.isFinite(nums.total) ? nums.total : (uaSum > 0 ? uaSum : NaN);

    return {
      ua,
      reachable,
      unreachable: nums.unreachable,
      tor: nums.tor,
      total,
      stamp: nums.stamp,
      via: via || "unknown",
      raw: payload,
    };
  }

  function findPreviousUrlFromPayload(payload) {
    const p = payload && typeof payload === "object" ? payload : {};
    if (p.previous) return String(p.previous);
    if (p.links && p.links.previous) return String(p.links.previous);
    if (p.data && p.data.previous) return String(p.data.previous);
    return null;
  }

  function pickPrevFromIndex(indexPayload, latestNorm) {
    if (!indexPayload) return null;

    let arr = null;
    if (Array.isArray(indexPayload)) arr = indexPayload;
    else if (indexPayload.results && Array.isArray(indexPayload.results)) arr = indexPayload.results;
    else if (indexPayload.data && Array.isArray(indexPayload.data)) arr = indexPayload.data;

    if (!arr || !arr.length) return null;

    const latestStamp = latestNorm && latestNorm.stamp ? String(latestNorm.stamp) : null;

    const candidates = arr
      .map((x) => {
        if (typeof x === "string") return { url: x, stamp: null };
        if (x && typeof x === "object") {
          return {
            url: x.url || x.href || x.link || x.api_url || null,
            stamp: x.timestamp || x.ts || x.time || x.date || x.created_at || null,
          };
        }
        return { url: null, stamp: null };
      })
      .filter((x) => !!x.url);

    if (!candidates.length) return null;

    if (latestStamp) {
      const different = candidates.find((c) => c.stamp && String(c.stamp) !== latestStamp);
      if (different) return String(different.url);
    }

    if (candidates.length >= 2) return String(candidates[1].url);
    return String(candidates[0].url);
  }

  // -----------------------------------
  // Shared cache + request coalescing
  // -----------------------------------
  let cache = {
    at: 0,
    latest: null,
    prev: null,
    inFlight: null,
  };

  async function snapshotPairImpl() {
    // Retry wrapper around the whole pipeline.
    let lastErr = null;
    for (let attempt = 0; attempt <= CFG.RETRIES; attempt++) {
      try {
        // 1) latest
        const latestRes = await tryFetchLatestDirectThenProxy();
        const latestNorm = normalize(latestRes.payload, latestRes.via);

        // 2) previous (best-effort)
        let prevNorm = null;

        const prevUrl = findPreviousUrlFromPayload(latestRes.payload);
        if (prevUrl) {
          try {
            const prevRes = await tryFetchAny(prevUrl);
            prevNorm = normalize(prevRes.payload, prevRes.via);
          } catch (_) {
            prevNorm = null;
          }
        }

        if (!prevNorm) {
          try {
            const indexRes = await tryFetchAny(CFG.SNAPSHOT_INDEX);
            const prevFromIndex = pickPrevFromIndex(indexRes.payload, latestNorm);
            if (prevFromIndex) {
              const prevRes2 = await tryFetchAny(prevFromIndex);
              prevNorm = normalize(prevRes2.payload, prevRes2.via);
            }
          } catch (_) {
            // ignore
          }
        }

        return { latest: latestNorm, prev: prevNorm };
      } catch (e) {
        lastErr = e;
        if (attempt < CFG.RETRIES) await sleep(CFG.RETRY_DELAY_MS);
      }
    }
    throw lastErr || new Error("snapshotPair failed");
  }

  NS.snapshotPair = async function snapshotPair() {
    const now = Date.now();

    // Serve fresh cache
    if (cache.latest && (now - cache.at) < CFG.CACHE_TTL_MS) {
      return { latest: cache.latest, prev: cache.prev };
    }

    // Coalesce callers
    if (cache.inFlight) return cache.inFlight;

    cache.inFlight = (async () => {
      const pair = await snapshotPairImpl();
      cache.at = Date.now();
      cache.latest = pair.latest;
      cache.prev = pair.prev;
      cache.inFlight = null;
      return pair;
    })().catch((e) => {
      cache.inFlight = null;
      throw e;
    });

    return cache.inFlight;
  };
})();
