// __partials/widgets/knots-vs-core/bitnodes-snapshots.js
// DROP-IN REPLACEMENT (v3) — fixes the 12s timeout + "JSON.parse unexpected character" class of failures.
//
// What changed vs v2:
// - Uses a proxy-rotation fetcher with retries + longer timeout.
// - Fetches as TEXT first, then parses JSON safely (so HTML/proxy errors don't blow up as JSON.parse line 1 col 1).
// - Adds additional CORS-bypass options beyond allorigins (notably r.jina.ai), while still preferring direct Bitnodes.
// - Provides a shared global cache so other node widgets can reuse the same baseline fetch without rate-limit pressure:
//     window.ZZXBitnodesCache.snapshotPair()
// - Caches in-memory and localStorage with TTL.
//
// Output shape (normalized):
//   { ua, reachable, unreachable, tor, total, stamp, raw }
// Exposed:
//   window.ZZXKnotsVsCore.Bitnodes.snapshotPair()
//   window.ZZXBitnodesCache.snapshotPair()

(function () {
  "use strict";

  const W = window;

  // Public namespaces
  const NS = (W.ZZXKnotsVsCore = W.ZZXKnotsVsCore || {});
  const API = (NS.Bitnodes = NS.Bitnodes || {});

  // Shared cache namespace (so Nodes / Nodes-by-* widgets can reuse)
  const SHARED = (W.ZZXBitnodesCache = W.ZZXBitnodesCache || {});

  const DEFAULTS = {
    SNAPSHOT_LATEST: "https://bitnodes.io/api/v1/snapshots/latest/",
    SNAPSHOT_INDEX: "https://bitnodes.io/api/v1/snapshots/",

    // Timeout/retry tuned for mobile + slow proxies
    TIMEOUT_MS: 28_000,
    RETRIES: 2,
    RETRY_BACKOFF_MS: 900,

    // Cache to reduce load across multiple widgets on same page/site
    CACHE_TTL_MS: 5 * 60_000, // 5 minutes
    LS_KEY_PAIR: "zzx.bitnodes.snapshotPair.v1",

    // Proxy rotation (first success wins)
    // 1) direct (works if Bitnodes sends permissive CORS)
    // 2) allorigins raw
    // 3) allorigins "get" (returns JSON wrapper with contents)
    // 4) r.jina.ai (very effective at CORS-bypassing simple GET JSON)
    PROXIES: [
      { name: "direct", build: (u) => String(u) },
      { name: "allorigins_raw", build: (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(String(u)) },
      { name: "allorigins_get", build: (u) => "https://api.allorigins.win/get?url=" + encodeURIComponent(String(u)) },
      { name: "jina", build: (u) => {
        const s = String(u);
        // r.jina.ai/http(s)://...
        return "https://r.jina.ai/" + s;
      }},
    ],
  };

  // -----------------------------
  // Utilities
  // -----------------------------
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

  async function fetchText(url) {
    const r = await fetch(url, { cache: "no-store" });
    // Even if non-200, read body so we can surface a useful snippet
    const txt = await r.text().catch(() => "");
    if (!r.ok) {
      const snip = (txt || "").slice(0, 240).replace(/\s+/g, " ").trim();
      throw new Error("HTTP " + r.status + (snip ? " • " + snip : ""));
    }
    return txt;
  }

  function safeParseJSON(text) {
    const t = String(text || "").trim();
    if (!t) throw new Error("empty response");
    // If it’s HTML, bail with a clearer message
    if (t.startsWith("<!doctype") || t.startsWith("<html") || t.startsWith("<")) {
      throw new Error("non-JSON (HTML) response from proxy/origin");
    }
    // allorigins /get returns { contents: "...string..." }
    const j = JSON.parse(t);
    if (j && typeof j === "object" && typeof j.contents === "string") {
      const inner = String(j.contents).trim();
      if (!inner) throw new Error("allorigins get: empty contents");
      return JSON.parse(inner);
    }
    return j;
  }

  async function fetchJSON_viaRotation(targetUrl, label) {
    let lastErr = null;

    for (let attempt = 0; attempt <= DEFAULTS.RETRIES; attempt++) {
      for (const p of DEFAULTS.PROXIES) {
        const u = p.build(targetUrl);
        try {
          const txt = await withTimeout(fetchText(u), DEFAULTS.TIMEOUT_MS, label + " (" + p.name + ")");
          return safeParseJSON(txt);
        } catch (e) {
          lastErr = e;
          // keep rotating
        }
      }
      if (attempt < DEFAULTS.RETRIES) {
        await sleep(DEFAULTS.RETRY_BACKOFF_MS * (attempt + 1));
      }
    }

    throw lastErr || new Error(label + " failed");
  }

  function readLS(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function writeLS(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {
      // ignore (quota/private mode)
    }
  }

  // -----------------------------
  // Bitnodes payload normalization
  // -----------------------------
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

  function normalize(payload) {
    const ua = extractUserAgents(payload);
    const nums = extractNumbers(payload);

    // Sum UA counts (often equals reachable)
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
    let arr = null;
    if (Array.isArray(indexPayload)) arr = indexPayload;
    else if (indexPayload && Array.isArray(indexPayload.results)) arr = indexPayload.results;
    else if (indexPayload && indexPayload.data && Array.isArray(indexPayload.data)) arr = indexPayload.data;

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

  // -----------------------------
  // Shared snapshotPair() with caching
  // -----------------------------
  let inflight = null;
  let memCache = { at: 0, latest: null, prev: null };

  async function snapshotPairImpl() {
    // memory cache
    const now = Date.now();
    if (memCache.latest && (now - memCache.at) < DEFAULTS.CACHE_TTL_MS) {
      return { latest: memCache.latest, prev: memCache.prev };
    }

    // localStorage cache (for multi-page navigations)
    const ls = readLS(DEFAULTS.LS_KEY_PAIR);
    if (ls && ls.at && (now - Number(ls.at)) < DEFAULTS.CACHE_TTL_MS && ls.latest) {
      memCache = { at: Number(ls.at), latest: ls.latest, prev: ls.prev || null };
      return { latest: memCache.latest, prev: memCache.prev };
    }

    // fetch latest (rotating proxies)
    const latestPayload = await fetchJSON_viaRotation(DEFAULTS.SNAPSHOT_LATEST, "bitnodes latest");
    const latestNorm = normalize(latestPayload);

    // fetch previous (best effort)
    let prevNorm = null;
    const prevUrl = findPreviousUrlFromPayload(latestPayload);

    if (prevUrl) {
      try {
        const prevPayload = await fetchJSON_viaRotation(prevUrl, "bitnodes previous");
        prevNorm = normalize(prevPayload);
      } catch (_) {
        prevNorm = null;
      }
    }

    if (!prevNorm) {
      try {
        const indexPayload = await fetchJSON_viaRotation(DEFAULTS.SNAPSHOT_INDEX, "bitnodes index");
        const prevFromIndex = pickPrevFromIndex(indexPayload, latestNorm);
        if (prevFromIndex) {
          const prevPayload2 = await fetchJSON_viaRotation(prevFromIndex, "bitnodes previous (index)");
          prevNorm = normalize(prevPayload2);
        }
      } catch (_) {
        // ignore
      }
    }

    memCache = { at: Date.now(), latest: latestNorm, prev: prevNorm };
    writeLS(DEFAULTS.LS_KEY_PAIR, { at: memCache.at, latest: latestNorm, prev: prevNorm });

    return { latest: latestNorm, prev: prevNorm };
  }

  async function snapshotPair() {
    if (inflight) return inflight;
    inflight = snapshotPairImpl().finally(() => { inflight = null; });
    return inflight;
  }

  // expose both in widget namespace and shared cache
  API.snapshotPair = snapshotPair;
  SHARED.snapshotPair = snapshotPair;

  // Optional: a tiny status accessor for debugging panels
  SHARED._status = function () {
    return {
      ttlMs: DEFAULTS.CACHE_TTL_MS,
      memAt: memCache.at,
      hasLatest: !!memCache.latest,
      hasPrev: !!memCache.prev,
      inflight: !!inflight,
      proxies: DEFAULTS.PROXIES.map(p => p.name),
    };
  };
})();
