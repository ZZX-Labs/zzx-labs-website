// __partials/widgets/nodes-by-version/adapter.js
// DROP-IN (UPDATED)
// Fixes your real-world Bitnodes snapshot shape:
//
// Snapshot example (what you pasted):
//   {
//     "timestamp": 1769991597,
//     "total_nodes": 24672,
//     "latest_height": 934662,
//     "nodes": {
//        "ip:8333": [70016, "/Satoshi:30.0.0/", 1769990898, 3081, 934661],
//        "xxxx.onion:8333": [70016, "/Satoshi:29.2.0/Knots:20251110/", ...],
//        ...
//     }
//   }
//
// This adapter now supports 2 families:
//
// A) Lightweight endpoints (preferred):
//   /api/v1/nodes/user_agents/  -> payload.user_agents map (or variants)
//   /api/v1/nodes/versions/     -> payload.versions map (or variants)
//
// B) Snapshot endpoints:
//   /api/v1/snapshots/latest/   -> usually returns payload.nodes map (NOT user_agents)
//   /api/v1/snapshots/<ts>/     -> payload.nodes map
//
// Output shape:
//   {
//     total: number|NaN,
//     stamp: string|null,          // timestamp if present
//     latestHeight: number|NaN,
//     items: [{ label: string, count: number }]
//   }
//
// Never throws. Returns empty items on unknown shapes.

(function () {
  "use strict";

  const W = window;
  const NS = (W.ZZXNodesByVersionAdapter = W.ZZXNodesByVersionAdapter || {});

  function num(x) {
    const v = Number(x);
    return Number.isFinite(v) ? v : NaN;
  }

  function asStamp(p) {
    // Prefer numeric timestamp field used by Bitnodes snapshots.
    if (p && typeof p === "object") {
      if (p.timestamp != null) return String(p.timestamp);
      if (p.ts != null) return String(p.ts);
      if (p.time != null) return String(p.time);
      if (p.date != null) return String(p.date);
      if (p.created_at != null) return String(p.created_at);
    }
    return null;
  }

  function coerceTotal(p) {
    return (
      num(p?.total_nodes) ||
      num(p?.total) ||
      num(p?.count) ||
      num(p?.reachable_nodes) ||
      num(p?.total_reachable_nodes) ||
      NaN
    );
  }

  function pushMap(out, map) {
    if (!map || typeof map !== "object") return;
    for (const k of Object.keys(map)) {
      const c = num(map[k]);
      if (!Number.isFinite(c) || c <= 0) continue;
      const label = String(k || "").trim();
      if (!label) continue;
      out.items.push({ label, count: c });
    }
  }

  function pushArray(out, arr) {
    if (!Array.isArray(arr)) return;

    for (const row of arr) {
      // pattern: [label, count]
      if (Array.isArray(row) && row.length >= 2) {
        const label = String(row[0] ?? "").trim();
        const count = num(row[1]);
        if (label && Number.isFinite(count) && count > 0) out.items.push({ label, count });
        continue;
      }

      // pattern: { label/version/user_agent, count/nodes/value }
      if (row && typeof row === "object") {
        const label = String(row.label ?? row.user_agent ?? row.ua ?? row.version ?? row.name ?? "").trim();
        const count = num(row.count ?? row.nodes ?? row.value ?? row.n ?? row.total);
        if (label && Number.isFinite(count) && count > 0) out.items.push({ label, count });
      }
    }
  }

  function aggregateFromSnapshotNodes(out, nodesObj) {
    // nodes: { "host:port": [services, "/Satoshi:..../", last_seen, ...], ... }
    if (!nodesObj || typeof nodesObj !== "object") return;

    const counts = Object.create(null);

    for (const k of Object.keys(nodesObj)) {
      const row = nodesObj[k];
      if (!Array.isArray(row) || row.length < 2) continue;
      const ua = String(row[1] ?? "").trim();
      if (!ua) continue;
      counts[ua] = (counts[ua] || 0) + 1;
    }

    pushMap(out, counts);

    // If total missing, total can be #keys in nodes
    if (!Number.isFinite(out.total)) {
      const n = Object.keys(nodesObj).length;
      out.total = n > 0 ? n : NaN;
    }
  }

  NS.parse = function parse(payload) {
    const out = { total: NaN, stamp: null, latestHeight: NaN, items: [] };

    if (!payload || typeof payload !== "object") return out;

    out.total = coerceTotal(payload);
    out.stamp = asStamp(payload);
    out.latestHeight = num(payload.latest_height);

    // 1) Map endpoints first (fast path)
    const map =
      (payload.user_agents && typeof payload.user_agents === "object" && payload.user_agents) ||
      (payload.versions && typeof payload.versions === "object" && payload.versions) ||
      (payload.data && typeof payload.data === "object" && payload.data.user_agents) ||
      (payload.data && typeof payload.data === "object" && payload.data.versions) ||
      null;

    if (map) {
      pushMap(out, map);
      return out;
    }

    // 2) Snapshot nodes map (your actual snapshot shape)
    if (payload.nodes && typeof payload.nodes === "object") {
      aggregateFromSnapshotNodes(out, payload.nodes);
      return out;
    }

    // 3) Array variants
    const arr =
      (Array.isArray(payload.results) && payload.results) ||
      (Array.isArray(payload.data) && payload.data) ||
      (Array.isArray(payload.user_agents) && payload.user_agents) ||
      (Array.isArray(payload.versions) && payload.versions) ||
      null;

    if (arr) {
      pushArray(out, arr);
      return out;
    }

    // 4) Deep nesting (rare)
    if (payload.data && typeof payload.data === "object") {
      pushMap(out, payload.data.user_agents);
      pushMap(out, payload.data.versions);
      if (out.items.length) return out;

      if (payload.data.nodes && typeof payload.data.nodes === "object") {
        aggregateFromSnapshotNodes(out, payload.data.nodes);
        return out;
      }

      pushArray(out, payload.data.results);
      if (out.items.length) return out;
    }

    return out;
  };
})();
