// __partials/widgets/knots-vs-core/bitnodes-snapshots.js
// Shared Bitnodes snapshot cache (timestamped snapshots) for ALL node widgets.
//
// Works with the payload shape you pasted:
// {
//   "timestamp": 1769991597,
//   "total_nodes": 24672,
//   "latest_height": 934662,
//   "nodes": {
//      "host:8333": [services, "/Satoshi:29.2.0/Knots:20251110/", last_seen, ..., height],
//      ...
//   }
// }
//
// Provides stable API:
//   window.ZZXBitnodesCache.getSnapshot(ts?)
//   window.ZZXBitnodesCache.getSnapshotPair()  -> { latest, prev, delta }
//   window.ZZXBitnodesCache.aggregate(snapshot) -> precomputed totals/buckets
//
// Key behavior:
// - DIRECT fetch first; AllOrigins fallback.
// - Robust non-JSON detection (HTML/WAF) to avoid JSON.parse explosions.
// - Cache + request coalescing to avoid rate limits.
// - Uses snapshots/latest to discover timestamp; then fetches snapshots/<ts>/ (stable).
//
// IMPORTANT: "unreachable" is not provided by this payload.
// We expose delta.newNodes / delta.goneNodes as your “between snapshots” signal.

(function () {
  "use strict";

  const W = window;
  const NS = (W.ZZXBitnodesCache = W.ZZXBitnodesCache || {});

  const CFG = {
    SNAPSHOT_LATEST: "https://bitnodes.io/api/v1/snapshots/latest/",
    SNAPSHOT_AT: (ts) => `https://bitnodes.io/api/v1/snapshots/${encodeURIComponent(String(ts))}/`,
    SNAPSHOT_INDEX: "https://bitnodes.io/api/v1/snapshots/",
    ALLORIGINS_RAW: "https://api.allorigins.win/raw?url=",

    TIMEOUT_MS: 25_000,
    RETRIES: 1,
    RETRY_DELAY_MS: 800,

    // Shared TTL. Widgets should refresh less frequently than Bitnodes updates.
    CACHE_TTL_MS: 60_000,

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
    return (
      s.startsWith("<!doctype") ||
      s.startsWith("<html") ||
      s.includes("<head") ||
      s.includes("<body") ||
      s.includes("cloudflare") ||
      s.includes("attention required")
    );
  }

  function snip(text, n) {
    return String(text || "").replace(/\s+/g, " ").trim().slice(0, n);
  }

  async function fetchText(url, label) {
    const u = CFG.CACHE_BUST ? (url + (url.includes("?") ? "&" : "?") + "t=" + Date.now()) : url;

    const r = await fetch(u, {
      cache: "no-store",
      credentials: "omit",
      redirect: "follow",
      headers: { "Accept": "application/json,text/plain,*/*" },
    });

    const txt = await r.text();
    if (!r.ok) throw new Error(`${label || "fetch"}: HTTP ${r.status} :: ${snip(txt, 220) || "no body"}`);
    return txt;
  }

  async function fetchJSONRobust(url, label) {
    const txt = await withTimeout(fetchText(url, label), CFG.TIMEOUT_MS, label || "fetch");
    if (looksLikeHTML(txt)) throw new Error(`${label || "fetch"}: Non-JSON (HTML/WAF) :: ${snip(txt, 240)}`);
    try {
      return JSON.parse(txt);
    } catch (_) {
      throw new Error(`${label || "fetch"}: JSON.parse failed :: ${snip(txt, 240)}`);
    }
  }

  async function tryFetchDirectThenProxy(url, labelDirect, labelProxy) {
    try {
      const payload = await fetchJSONRobust(url, labelDirect || "direct");
      return { payload, via: "direct" };
    } catch (_) {
      const payload = await fetchJSONRobust(allOrigins(url), labelProxy || "allorigins");
      return { payload, via: "allorigins" };
    }
  }

  // -----------------------------
  // Snapshot normalization (timestamped "nodes" map)
  // -----------------------------
  function extractTimestamp(payload) {
    const p = payload && typeof payload === "object" ? payload : {};
    const ts = Number(p.timestamp) || Number(p.ts) || Number(p.time) || NaN;
    return Number.isFinite(ts) ? ts : NaN;
  }

  function normalize(payload, via) {
    const p = payload && typeof payload === "object" ? payload : {};

    const ts = extractTimestamp(p);
    const total_nodes = Number(p.total_nodes) || Number(p.total) || Number(p.nodes_count) || NaN;
    const latest_height = Number(p.latest_height) || Number(p.height) || NaN;

    // The critical map:
    const nodes = (p.nodes && typeof p.nodes === "object") ? p.nodes : {};

    // Derive a reachable count from nodes map size if missing.
    const reachable = Number.isFinite(total_nodes) ? total_nodes : Object.keys(nodes).length;

    return {
      ts,
      stamp: Number.isFinite(ts) ? String(ts) : null,
      total_nodes: total_nodes,
      latest_height: latest_height,
      nodes,         // raw node map
      reachable,     // derived reachable
      via: via || "unknown",
      raw: payload,
    };
  }

  // -----------------------------
  // Aggregation helpers
  // -----------------------------
  function uaFromNodeEntry(entry) {
    // entry shape: [services, "/Satoshi:29.2.0/Knots:20251110/", last_seen, ..., height]
    if (!Array.isArray(entry)) return "";
    return String(entry[1] || "");
  }

  function isTorKey(nodeKey) {
    const s = String(nodeKey || "").toLowerCase();
    return s.includes(".onion");
  }

  function isKnotsUA(ua) {
    const s = String(ua || "").toLowerCase();
    // Your real data uses "/.../Knots:YYYYMMDD/" inside UA.
    return s.includes("knots:");
  }

  function classifyUA(ua) {
    return isKnotsUA(ua) ? "knots" : "core";
  }

  // Aggregates for all widgets:
  // - core vs knots totals (reachable derived from nodes map)
  // - tor totals (by key)
  // - versions list (UA string counts)
  function aggregate(snapshot) {
    const nodes = snapshot && snapshot.nodes ? snapshot.nodes : {};

    let total = 0;
    let core = 0;
    let knots = 0;

    let torTotal = 0;
    let torCore = 0;
    let torKnots = 0;

    const uaCounts = Object.create(null);

    for (const [k, entry] of Object.entries(nodes)) {
      total += 1;

      const ua = uaFromNodeEntry(entry);
      if (ua) {
        uaCounts[ua] = (uaCounts[ua] || 0) + 1;
      }

      const c = classifyUA(ua);
      if (c === "knots") knots += 1;
      else core += 1;

      if (isTorKey(k)) {
        torTotal += 1;
        if (c === "knots") torKnots += 1;
        else torCore += 1;
      }
    }

    // Build sorted UA list for "Nodes by Version"
    const versions = Object.entries(uaCounts)
      .map(([ua, n]) => ({ ua, n }))
      .sort((a, b) => b.n - a.n);

    return {
      total,              // derived from nodes map
      reachable: total,   // in this model: nodes map is your reachable set
      core,
      knots,
      torTotal,
      torCore,
      torKnots,
      versions,
      uaCounts,
    };
  }

  function computeDelta(latestSnap, prevSnap) {
    if (!latestSnap || !prevSnap) return null;

    const a = latestSnap.nodes || {};
    const b = prevSnap.nodes || {};

    // new = keys in latest not in prev
    // gone = keys in prev not in latest
    let newCount = 0;
    let goneCount = 0;

    for (const k of Object.keys(a)) {
      if (!(k in b)) newCount += 1;
    }
    for (const k of Object.keys(b)) {
      if (!(k in a)) goneCount += 1;
    }

    return {
      newNodes: newCount,
      goneNodes: goneCount,
    };
  }

  // Previous snapshot selection:
  // 1) if latest payload contains previous URL, use it
  // 2) else use index endpoint and pick second entry
  function findPreviousUrlFromPayload(payload) {
    const p = payload && typeof payload === "object" ? payload : {};
    if (p.previous) return String(p.previous);
    if (p.links && p.links.previous) return String(p.links.previous);
    if (p.data && p.data.previous) return String(p.data.previous);
    return null;
  }

  function pickPrevFromIndex(indexPayload) {
    let arr = null;

    if (Array.isArray(indexPayload)) arr = indexPayload;
    else if (indexPayload.results && Array.isArray(indexPayload.results)) arr = indexPayload.results;
    else if (indexPayload.data && Array.isArray(indexPayload.data)) arr = indexPayload.data;

    if (!arr || arr.length < 2) return null;

    const urls = arr
      .map((x) => {
        if (typeof x === "string") return x;
        if (x && typeof x === "object") return x.url || x.href || x.link || x.api_url || null;
        return null;
      })
      .filter(Boolean);

    if (urls.length >= 2) return String(urls[1]);
    return urls.length ? String(urls[0]) : null;
  }

  // -----------------------------------
  // Cache + request coalescing
  // -----------------------------------
  let cache = {
    at: 0,
    pair: null,
    inFlight: null,
  };

  async function getLatestStableSnapshot() {
    // 1) latest (discover ts)
    const latestRes = await tryFetchDirectThenProxy(
      CFG.SNAPSHOT_LATEST,
      "bitnodes latest (direct)",
      "bitnodes latest (allorigins)"
    );

    const latestPayload = latestRes.payload;
    const ts = extractTimestamp(latestPayload);

    // 2) fetch snapshot/<ts>/ as stable
    if (Number.isFinite(ts)) {
      const stableRes = await tryFetchDirectThenProxy(
        CFG.SNAPSHOT_AT(ts),
        "bitnodes snapshotAt (direct)",
        "bitnodes snapshotAt (allorigins)"
      );
      return normalize(stableRes.payload, stableRes.via);
    }

    // fallback: normalize latest itself
    return normalize(latestPayload, latestRes.via);
  }

  async function getPreviousSnapshot(latestNorm) {
    // Try explicit previous URL (from raw latest snapshotAt payload if present)
    const raw = latestNorm && latestNorm.raw ? latestNorm.raw : null;
    const prevUrl = raw ? findPreviousUrlFromPayload(raw) : null;

    if (prevUrl) {
      try {
        const prevRes = await tryFetchDirectThenProxy(prevUrl, "bitnodes prev (direct)", "bitnodes prev (allorigins)");
        return normalize(prevRes.payload, prevRes.via);
      } catch (_) {
        // continue
      }
    }

    // Try index
    try {
      const indexRes = await tryFetchDirectThenProxy(
        CFG.SNAPSHOT_INDEX,
        "bitnodes index (direct)",
        "bitnodes index (allorigins)"
      );
      const picked = pickPrevFromIndex(indexRes.payload);
      if (!picked) return null;

      const prevRes2 = await tryFetchDirectThenProxy(picked, "bitnodes prev2 (direct)", "bitnodes prev2 (allorigins)");
      return normalize(prevRes2.payload, prevRes2.via);
    } catch (_) {
      return null;
    }
  }

  async function snapshotPairImpl() {
    let lastErr = null;

    for (let attempt = 0; attempt <= CFG.RETRIES; attempt++) {
      try {
        const latest = await getLatestStableSnapshot();
        const prev = await getPreviousSnapshot(latest);
        const delta = prev ? computeDelta(latest, prev) : null;

        return {
          latest,
          prev,
          delta,
          latestAgg: aggregate(latest),
          prevAgg: prev ? aggregate(prev) : null,
        };
      } catch (e) {
        lastErr = e;
        if (attempt < CFG.RETRIES) await sleep(CFG.RETRY_DELAY_MS);
      }
    }

    throw lastErr || new Error("Bitnodes snapshotPair failed");
  }

  // Public API
  NS.aggregate = aggregate;

  NS.getSnapshot = async function getSnapshot(ts) {
    const res = await tryFetchDirectThenProxy(
      CFG.SNAPSHOT_AT(ts),
      "bitnodes snapshotAt (direct)",
      "bitnodes snapshotAt (allorigins)"
    );
    return normalize(res.payload, res.via);
  };

  NS.getSnapshotPair = async function getSnapshotPair() {
    const now = Date.now();

    if (cache.pair && (now - cache.at) < CFG.CACHE_TTL_MS) {
      return cache.pair;
    }

    if (cache.inFlight) return cache.inFlight;

    cache.inFlight = (async () => {
      const pair = await snapshotPairImpl();
      cache.at = Date.now();
      cache.pair = pair;
      cache.inFlight = null;
      return pair;
    })().catch((e) => {
      cache.inFlight = null;
      throw e;
    });

    return cache.inFlight;
  };

  NS.__cfg = CFG;
})();
