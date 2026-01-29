// __partials/widgets/knots-vs-core/bitnodes-snapshots.js
// Helper for knots-vs-core widget:
// - Fetch latest Bitnodes snapshot (via AllOrigins raw proxy)
// - Best-effort fetch "previous" snapshot for delta calculations
// - Normalizes payload into a stable shape:
//     { ua: <map>, reachable: <number|NaN>, unreachable: <number|NaN>, tor: <number|NaN>, total: <number|NaN>, stamp: <string|null>, raw }
// - Exposes: window.ZZXKnotsVsCore.Bitnodes.snapshotPair()

(function () {
  "use strict";

  const W = window;

  const NS = (W.ZZXKnotsVsCore = W.ZZXKnotsVsCore || {});
  const API = (NS.Bitnodes = NS.Bitnodes || {});

  const DEFAULTS = {
    ALLORIGINS_RAW: "https://api.allorigins.win/raw?url=",
    SNAPSHOT_LATEST: "https://bitnodes.io/api/v1/snapshots/latest/",
    // Some Bitnodes instances expose a list endpoint. If it exists, we’ll use it to locate the previous snapshot.
    SNAPSHOT_INDEX: "https://bitnodes.io/api/v1/snapshots/",
    TIMEOUT_MS: 12_000,
  };

  function allOrigins(url) {
    return DEFAULTS.ALLORIGINS_RAW + encodeURIComponent(String(url || ""));
  }

  function withTimeout(promise, ms, label) {
    let t = null;
    const timeout = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error((label || "timeout") + " after " + ms + "ms")), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
  }

  async function fetchJSON(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  // -----------------------------
  // Normalization / extraction
  // -----------------------------
  function extractUserAgents(payload) {
    // Most common: payload.user_agents
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

    // Reachable
    const reachable =
      Number(p.reachable_nodes) ||
      Number(p.reachable) ||
      Number(p.total_reachable) ||
      Number(p.reachable_count) ||
      NaN;

    // Unreachable (some APIs provide this)
    const unreachable =
      Number(p.unreachable_nodes) ||
      Number(p.unreachable) ||
      Number(p.total_unreachable) ||
      Number(p.unreachable_count) ||
      NaN;

    // Total nodes observed (sometimes equals reachable)
    const total =
      Number(p.total_nodes) ||
      Number(p.total) ||
      Number(p.nodes) ||
      Number(p.total_count) ||
      NaN;

    // Tor count: Bitnodes may provide something like tor_nodes / onion_nodes etc.
    // If absent, we leave NaN (widget will render "—")
    const tor =
      Number(p.tor_nodes) ||
      Number(p.onion_nodes) ||
      Number(p.onion) ||
      Number(p.tor) ||
      NaN;

    // Timestamp-ish
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

    // If reachable is missing, fall back to UA-summed total (reachable proxy)
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
    // Bitnodes might include:
    // - payload.previous
    // - payload.links.previous
    // - payload.data.previous
    const p = payload && typeof payload === "object" ? payload : {};
    if (p.previous) return String(p.previous);
    if (p.links && p.links.previous) return String(p.links.previous);
    if (p.data && p.data.previous) return String(p.data.previous);
    return null;
  }

  // Best-effort index parsing:
  // Some APIs return { results: [ {url: "...", timestamp: ...}, ... ] }
  // Others return a simple array.
  function pickPrevFromIndex(indexPayload, latestNorm) {
    if (!indexPayload) return null;

    let arr = null;

    if (Array.isArray(indexPayload)) {
      arr = indexPayload;
    } else if (indexPayload.results && Array.isArray(indexPayload.results)) {
      arr = indexPayload.results;
    } else if (indexPayload.data && Array.isArray(indexPayload.data)) {
      arr = indexPayload.data;
    }

    if (!arr || !arr.length) return null;

    // Try to get "url" fields, and skip the one matching latest if possible.
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

    // If we can compare stamps, choose the first candidate that doesn't match latest stamp.
    if (latestStamp) {
      const different = candidates.find((c) => c.stamp && String(c.stamp) !== latestStamp);
      if (different) return String(different.url);
    }

    // Otherwise: if the index is ordered newest->oldest, prev is candidates[1] when candidates[0] is latest.
    if (candidates.length >= 2) return String(candidates[1].url);
    return String(candidates[0].url);
  }

  // -----------------------------
  // Public API: snapshotPair()
  // -----------------------------
  let cache = {
    at: 0,
    latest: null,
    prev: null,
  };

  API.snapshotPair = async function snapshotPair() {
    // Lightweight cache to prevent multiple widgets hammering the proxy simultaneously.
    const now = Date.now();
    if (cache.latest && (now - cache.at) < 15_000) {
      return { latest: cache.latest, prev: cache.prev };
    }

    // 1) Latest
    const latestPayload = await withTimeout(
      fetchJSON(allOrigins(DEFAULTS.SNAPSHOT_LATEST)),
      DEFAULTS.TIMEOUT_MS,
      "bitnodes latest"
    );
    const latestNorm = normalize(latestPayload);

    // 2) Previous: prefer explicit "previous" link
    let prevNorm = null;

    const prevUrl = findPreviousUrlFromPayload(latestPayload);
    if (prevUrl) {
      try {
        const prevPayload = await withTimeout(
          fetchJSON(allOrigins(prevUrl)),
          DEFAULTS.TIMEOUT_MS,
          "bitnodes previous"
        );
        prevNorm = normalize(prevPayload);
      } catch (_) {
        prevNorm = null;
      }
    }

    // 3) If still missing, try the index endpoint and pick previous
    if (!prevNorm) {
      try {
        const indexPayload = await withTimeout(
          fetchJSON(allOrigins(DEFAULTS.SNAPSHOT_INDEX)),
          DEFAULTS.TIMEOUT_MS,
          "bitnodes index"
        );
        const prevFromIndex = pickPrevFromIndex(indexPayload, latestNorm);
        if (prevFromIndex) {
          const prevPayload2 = await withTimeout(
            fetchJSON(allOrigins(prevFromIndex)),
            DEFAULTS.TIMEOUT_MS,
            "bitnodes previous (index)"
          );
          prevNorm = normalize(prevPayload2);
        }
      } catch (_) {
        // ignore
      }
    }

    cache.at = Date.now();
    cache.latest = latestNorm;
    cache.prev = prevNorm;

    return { latest: latestNorm, prev: prevNorm };
  };
})();
