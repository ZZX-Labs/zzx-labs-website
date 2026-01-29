// __partials/widgets/knots-vs-core/bitnodes-snapshots.js
// DROP-IN helper (no globals required except attaching to window for other widget files)
//
// Purpose:
// - Fetch Bitnodes snapshot(s) via allorigins (CORS-safe)
// - Extract UA distribution and (best-effort) reachable / unreachable / tor counts
// - Provide "latest" + "previous" so the widget can compute deltas
//
// Notes:
// - Bitnodes response shape can drift; this module is defensive.
// - "Core vs Knots" logic is handled by the widget; this module only returns raw-ish numbers.

(function () {
  "use strict";

  const W = window;

  const API = {
    base: "https://bitnodes.io/api/v1",
    latest: "https://bitnodes.io/api/v1/snapshots/latest/",
    list: "https://bitnodes.io/api/v1/snapshots/",
    // sometimes older APIs provide /snapshots/?limit=2, sometimes pagination; we try both.
  };

  const ALLORIGINS_RAW = "https://api.allorigins.win/raw?url=";

  function allOrigins(url) {
    return ALLORIGINS_RAW + encodeURIComponent(String(url || ""));
  }

  async function fetchJSON(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  function isObj(x) {
    return !!x && typeof x === "object" && !Array.isArray(x);
  }

  // Normalize possible UA maps from Bitnodes payload.
  function extractUserAgents(payload) {
    if (!isObj(payload)) return {};
    // known/likely keys
    if (isObj(payload.user_agents)) return payload.user_agents;
    if (isObj(payload.userAgents)) return payload.userAgents;
    if (isObj(payload.versions)) return payload.versions;
    if (isObj(payload.user_agent_distribution)) return payload.user_agent_distribution;

    // Some payloads have nested "data"
    if (isObj(payload.data)) {
      const d = payload.data;
      if (isObj(d.user_agents)) return d.user_agents;
      if (isObj(d.versions)) return d.versions;
      if (isObj(d.user_agent_distribution)) return d.user_agent_distribution;
    }
    return {};
  }

  // Best-effort numeric getter (top-level or nested "data")
  function pickNumber(payload, keys) {
    if (!isObj(payload)) return null;

    for (const k of keys) {
      const v = payload[k];
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }

    if (isObj(payload.data)) {
      for (const k of keys) {
        const v = payload.data[k];
        const n = Number(v);
        if (Number.isFinite(n)) return n;
      }
    }

    return null;
  }

  // Attempt to infer snapshot time/height identifiers for display.
  function pickStamp(payload) {
    if (!isObj(payload)) return null;
    const cand =
      payload.timestamp ??
      payload.time ??
      payload.datetime ??
      payload.created_at ??
      (isObj(payload.data) ? (payload.data.timestamp ?? payload.data.time ?? payload.data.datetime ?? payload.data.created_at) : null);

    if (cand == null) return null;

    // If it's seconds-since-epoch
    const n = Number(cand);
    if (Number.isFinite(n) && n > 1e9 && n < 1e11) {
      // could be seconds or ms; guess:
      const ms = n < 1e12 ? n * 1000 : n;
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }

    // else keep as string
    return String(cand);
  }

  // Some Bitnodes list endpoints return { results: [...] } or { snapshots: [...] } or an array.
  function extractList(payload) {
    if (Array.isArray(payload)) return payload;
    if (!isObj(payload)) return [];
    if (Array.isArray(payload.results)) return payload.results;
    if (Array.isArray(payload.snapshots)) return payload.snapshots;
    if (isObj(payload.data) && Array.isArray(payload.data.results)) return payload.data.results;
    return [];
  }

  // Attempt to fetch "latest" and one "previous" snapshot.
  async function fetchLatestAndPrev() {
    // Always fetch latest first
    const latest = await fetchJSON(allOrigins(API.latest));

    // For "previous" snapshot, try a few strategies:
    // 1) /snapshots/?limit=2
    // 2) /snapshots/ then take first two
    // 3) if latest provides a previous url/id, attempt it (rare)
    let prev = null;

    // Strategy 1
    try {
      const list1 = await fetchJSON(allOrigins(API.list + "?limit=2"));
      const arr1 = extractList(list1);
      if (arr1.length >= 2) {
        // determine which is latest vs previous; assume sorted newest->oldest
        prev = arr1[1];
      }
    } catch (_) {}

    // Strategy 2
    if (!prev) {
      try {
        const list2 = await fetchJSON(allOrigins(API.list));
        const arr2 = extractList(list2);
        if (arr2.length >= 2) prev = arr2[1];
      } catch (_) {}
    }

    // If prev is a "summary row" not a full snapshot, it may contain a "url" to fetch.
    // We attempt to expand it into full snapshot payload.
    async function expandMaybe(x) {
      if (!x) return null;
      if (isObj(x) && (x.user_agents || x.versions || x.user_agent_distribution || (isObj(x.data) && x.data.user_agents))) {
        return x; // already full-ish
      }
      if (isObj(x)) {
        const u =
          x.url ||
          x.snapshot_url ||
          x.href ||
          (isObj(x.links) ? (x.links.self || x.links.url) : null);
        if (u && typeof u === "string" && u.startsWith("http")) {
          try { return await fetchJSON(allOrigins(u)); } catch (_) {}
        }
        // Sometimes an "id" exists and endpoint is /snapshots/<id>/
        const id = x.id ?? x.pk ?? x.snapshot_id;
        if (id != null) {
          const url = `${API.base}/snapshots/${id}/`;
          try { return await fetchJSON(allOrigins(url)); } catch (_) {}
        }
      }
      return x; // keep as-is
    }

    prev = await expandMaybe(prev);

    return { latest, prev };
  }

  // Public function: returns normalized snapshot info
  async function snapshotPair() {
    const { latest, prev } = await fetchLatestAndPrev();

    const latestUA = extractUserAgents(latest);
    const prevUA = extractUserAgents(prev);

    // Totals (fallback: compute from UA map)
    function sumUA(map) {
      let t = 0;
      if (!isObj(map)) return 0;
      for (const v of Object.values(map)) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) t += n;
      }
      return t;
    }

    const latestTotal =
      pickNumber(latest, ["total_nodes", "total", "nodes", "node_count"]) ??
      sumUA(latestUA) ??
      null;

    const prevTotal =
      pickNumber(prev, ["total_nodes", "total", "nodes", "node_count"]) ??
      sumUA(prevUA) ??
      null;

    // Reachable/unreachable/tor (best-effort; if absent -> null)
    const latestReachable =
      pickNumber(latest, ["reachable_nodes", "reachable", "reachable_total", "nodes_reachable"]) ??
      pickNumber(latest, ["reachable_nodes_count"]) ??
      null;

    const prevReachable =
      pickNumber(prev, ["reachable_nodes", "reachable", "reachable_total", "nodes_reachable"]) ??
      pickNumber(prev, ["reachable_nodes_count"]) ??
      null;

    const latestUnreachable =
      pickNumber(latest, ["unreachable_nodes", "unreachable", "unreachable_total", "nodes_unreachable"]) ??
      pickNumber(latest, ["unreachable_nodes_count"]) ??
      null;

    const prevUnreachable =
      pickNumber(prev, ["unreachable_nodes", "unreachable", "unreachable_total", "nodes_unreachable"]) ??
      pickNumber(prev, ["unreachable_nodes_count"]) ??
      null;

    const latestTor =
      pickNumber(latest, ["tor_nodes", "tor", "onion_nodes", "tor_total"]) ??
      pickNumber(latest, ["tor_nodes_count"]) ??
      null;

    const prevTor =
      pickNumber(prev, ["tor_nodes", "tor", "onion_nodes", "tor_total"]) ??
      pickNumber(prev, ["tor_nodes_count"]) ??
      null;

    return {
      latest: {
        stamp: pickStamp(latest),
        ua: latestUA,
        total: latestTotal,
        reachable: latestReachable,
        unreachable: latestUnreachable,
        tor: latestTor,
      },
      prev: prev
        ? {
            stamp: pickStamp(prev),
            ua: prevUA,
            total: prevTotal,
            reachable: prevReachable,
            unreachable: prevUnreachable,
            tor: prevTor,
          }
        : null
    };
  }

  // Register on window for widget.js to use.
  W.ZZXKnotsVsCore = W.ZZXKnotsVsCore || {};
  W.ZZXKnotsVsCore.Bitnodes = {
    snapshotPair,
  };
})();
