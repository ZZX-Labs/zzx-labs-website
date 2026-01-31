// __partials/widgets/knots-vs-core/bitnodes-snapshots.js
// Shared Bitnodes snapshot cache + proxy rotation (for all node widgets)
// Exposes: window.ZZXBitnodesCache.snapshotPair()
//
// Normalized snapshot shape:
// {
//   ua: { [userAgent: string]: number },
//   reachable: number|NaN,
//   unreachable: number|NaN,
//   tor: number|NaN,
//   total: number|NaN,
//   stamp: string|null,
//   raw: any
// }

(function () {
  "use strict";

  const W = window;

  const NS = (W.ZZXBitnodesCache = W.ZZXBitnodesCache || {});

  const CFG = {
    SNAPSHOT_LATEST: "https://bitnodes.io/api/v1/snapshots/latest/",
    SNAPSHOT_INDEX: "https://bitnodes.io/api/v1/snapshots/",
    // timeouts tuned for mobile + proxy variance
    TIMEOUT_MS: 25_000,
    // cache TTL: all widgets share a single fetch for this period
    CACHE_TTL_MS: 60_000,
    // short anti-stampede backoff when failures happen
    FAIL_TTL_MS: 15_000,
    // proxy rotation (order matters)
    PROXIES: [
      { name: "direct", kind: "direct" },
      { name: "allorigins_raw", kind: "wrap_raw", base: "https://api.allorigins.win/raw?url=" },
      { name: "allorigins_json", kind: "wrap_json", base: "https://api.allorigins.win/get?url=" },
      // r.jina.ai fetches remote content server-side and returns text with a prefix
      { name: "jina", kind: "jina" }
    ]
  };

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function withTimeout(promise, ms, label) {
    let t = null;
    const timeout = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error((label || "timeout") + " after " + ms + "ms")), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
  }

  async function fetchText(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.text();
  }

  function looksLikeHTML(s) {
    const t = String(s || "").trim().toLowerCase();
    return t.startsWith("<!doctype") || t.startsWith("<html") || t.includes("<head") || t.includes("<body");
  }

  function stripJinaPrefix(text) {
    // r.jina.ai often prefixes with something like "###" or includes metadata lines.
    // We try to extract the first JSON object/array substring.
    const s = String(text || "");
    const firstObj = s.indexOf("{");
    const firstArr = s.indexOf("[");
    const start = (firstObj === -1) ? firstArr : (firstArr === -1 ? firstObj : Math.min(firstObj, firstArr));
    if (start <= 0) return s;
    return s.slice(start);
  }

  function safeJSONParse(text) {
    const raw = String(text || "");
    if (looksLikeHTML(raw)) throw new Error("non-json (html) response");
    // handle BOM
    const cleaned = raw.replace(/^\uFEFF/, "").trim();
    return JSON.parse(cleaned);
  }

  async function fetchJSONViaProxy(url, proxy) {
    const u = String(url);

    if (proxy.kind === "direct") {
      // direct JSON fetch
      const r = await fetch(u, { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }

    if (proxy.kind === "wrap_raw") {
      const wrapped = proxy.base + encodeURIComponent(u);
      const txt = await fetchText(wrapped);
      return safeJSONParse(txt);
    }

    if (proxy.kind === "wrap_json") {
      // allorigins /get returns JSON: { contents: "...", status: { ... } }
      const wrapped = proxy.base + encodeURIComponent(u);
      const outerTxt = await fetchText(wrapped);
      const outer = safeJSONParse(outerTxt);
      const contents = outer && outer.contents != null ? String(outer.contents) : "";
      return safeJSONParse(contents);
    }

    if (proxy.kind === "jina") {
      const wrapped = "https://r.jina.ai/http://r.jina.ai/http://" + u.replace(/^https?:\/\//, "");
      // r.jina.ai can be flaky; parse as text then extract JSON
      const txt = await fetchText(wrapped);
      const stripped = stripJinaPrefix(txt);
      return safeJSONParse(stripped);
    }

    throw new Error("unknown proxy kind");
  }

  // -----------------------------
  // Normalization / extraction
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
    const p = (payload && typeof payload === "object") ? payload : {};

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
      (p.data && p.data.timestamp != null ? String(p.data.timestamp) : null) ||
      null;

    return { reachable, unreachable, total, tor, stamp };
  }

  function normalize(payload) {
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
      raw: payload
    };
  }

  function findPreviousUrlFromPayload(payload) {
    const p = (payload && typeof payload === "object") ? payload : {};
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

    const candidates = arr.map((x) => {
      if (typeof x === "string") return { url: x, stamp: null };
      if (x && typeof x === "object") {
        return {
          url: x.url || x.href || x.link || x.api_url || null,
          stamp: x.timestamp || x.ts || x.time || x.date || x.created_at || null
        };
      }
      return { url: null, stamp: null };
    }).filter(c => !!c.url);

    if (!candidates.length) return null;

    if (latestStamp) {
      const different = candidates.find(c => c.stamp && String(c.stamp) !== latestStamp);
      if (different) return String(different.url);
    }

    if (candidates.length >= 2) return String(candidates[1].url);
    return String(candidates[0].url);
  }

  // -----------------------------
  // Cache + in-flight sharing
  // -----------------------------
  let cache = {
    at: 0,
    ok: false,
    latest: null,
    prev: null,
    inflight: null
  };

  async function tryFetch(url) {
    let lastErr = null;

    for (const proxy of CFG.PROXIES) {
      try {
        const payload = await withTimeout(
          fetchJSONViaProxy(url, proxy),
          CFG.TIMEOUT_MS,
          proxy.name + " fetch"
        );
        return payload;
      } catch (e) {
        lastErr = e;
        // tiny backoff between proxies (helps mobile)
        await sleep(150);
      }
    }

    throw lastErr || new Error("all proxies failed");
  }

  NS.snapshotPair = async function snapshotPair() {
    const now = Date.now();

    // Fresh ok cache
    if (cache.ok && cache.latest && (now - cache.at) < CFG.CACHE_TTL_MS) {
      return { latest: cache.latest, prev: cache.prev };
    }

    // Recent failure cache to avoid hammering
    if (!cache.ok && (now - cache.at) < CFG.FAIL_TTL_MS && cache.latest) {
      return { latest: cache.latest, prev: cache.prev };
    }

    // Share in-flight work
    if (cache.inflight) return cache.inflight;

    cache.inflight = (async () => {
      // 1) Latest
      const latestPayload = await tryFetch(CFG.SNAPSHOT_LATEST);
      const latestNorm = normalize(latestPayload);

      // 2) Previous
      let prevNorm = null;

      const prevUrl = findPreviousUrlFromPayload(latestPayload);
      if (prevUrl) {
        try {
          const prevPayload = await tryFetch(prevUrl);
          prevNorm = normalize(prevPayload);
        } catch (_) {
          prevNorm = null;
        }
      }

      // 3) Try index endpoint if no explicit previous
      if (!prevNorm) {
        try {
          const indexPayload = await tryFetch(CFG.SNAPSHOT_INDEX);
          const prevFromIndex = pickPrevFromIndex(indexPayload, latestNorm);
          if (prevFromIndex) {
            const prevPayload2 = await tryFetch(prevFromIndex);
            prevNorm = normalize(prevPayload2);
          }
        } catch (_) {
          // ignore
        }
      }

      cache.at = Date.now();
      cache.ok = true;
      cache.latest = latestNorm;
      cache.prev = prevNorm;
      return { latest: latestNorm, prev: prevNorm };
    })();

    try {
      return await cache.inflight;
    } catch (e) {
      cache.at = Date.now();
      cache.ok = false;

      // Keep a minimal cache object so widgets don't crash on repeated refresh
      cache.latest = cache.latest || normalize({});
      cache.prev = cache.prev || null;

      throw e;
    } finally {
      cache.inflight = null;
    }
  };
})();
