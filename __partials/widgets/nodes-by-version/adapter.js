// __partials/widgets/nodes-by-version/adapter.js
// DROP-IN (FIXED)
// Normalizes Bitnodes payload drift into:
//   { total: number|NaN, items: [{ label: string, count: number }] }
//
// Supports:
// - /nodes/user_agents/   -> { total_nodes?, user_agents: {ua: n, ...} } + variants
// - /nodes/versions/      -> { total_nodes?, versions: {ver: n, ...} } + variants
// - /snapshots/latest/    -> sometimes includes user_agents/versions maps
// - /snapshots/<ts>/      -> { total_nodes?, nodes: { host: [.., "/UA/", ..], ... } }  (DERIVES UA distribution)
// - nested: payload.data.*, payload.results
//
// Never throws. Returns empty items on unknown shapes.

(function () {
  "use strict";

  const W = window;
  const NS = (W.ZZXNodesByVersionAdapter =
    W.ZZXNodesByVersionAdapter || {});

  function num(x) {
    const v = Number(x);
    return Number.isFinite(v) ? v : NaN;
  }

  function snorm(s) {
    return String(s ?? "").replace(/\s+/g, " ").trim();
  }

  function coerceTotal(p) {
    return (
      num(p?.total_nodes) ||
      num(p?.total) ||
      num(p?.count) ||
      num(p?.total_count) ||
      num(p?.reachable_nodes) ||
      num(p?.total_reachable) ||
      NaN
    );
  }

  function pushMap(out, map) {
    if (!map || typeof map !== "object") return;
    for (const k of Object.keys(map)) {
      const c = num(map[k]);
      if (!Number.isFinite(c) || c <= 0) continue;
      const label = snorm(k);
      if (!label) continue;
      out.items.push({ label, count: c });
    }
  }

  function pushArray(out, arr) {
    if (!Array.isArray(arr)) return;

    for (const row of arr) {
      // pattern: [label, count]
      if (Array.isArray(row) && row.length >= 2) {
        const label = snorm(row[0]);
        const count = num(row[1]);
        if (label && Number.isFinite(count) && count > 0) {
          out.items.push({ label, count });
        }
        continue;
      }

      // pattern: { label/version/user_agent, count/nodes/value }
      if (row && typeof row === "object") {
        const label = snorm(
          row.label ??
          row.user_agent ??
          row.ua ??
          row.version ??
          row.name ??
          row.key ??
          ""
        );

        const count = num(
          row.count ?? row.nodes ?? row.value ?? row.n ?? row.total
        );

        if (label && Number.isFinite(count) && count > 0) {
          out.items.push({ label, count });
        }
      }
    }
  }

  function pushSnapshotNodes(out, nodesObj) {
    // Bitnodes snapshots/<ts> shape:
    // nodes: { "<host:port>": [services, "/Satoshi:29.2.0/Knots:20251110/", last_seen, ..., height], ... }
    if (!nodesObj || typeof nodesObj !== "object") return;

    const counts = Object.create(null);
    for (const v of Object.values(nodesObj)) {
      if (!Array.isArray(v) || v.length < 2) continue;
      const ua = snorm(v[1]);
      if (!ua) continue;
      counts[ua] = (counts[ua] || 0) + 1;
    }
    pushMap(out, counts);
  }

  NS.parse = function parse(payload) {
    const out = { total: NaN, items: [] };

    if (!payload || typeof payload !== "object") return out;

    // total may be overridden later if we derive from nodes list
    out.total = coerceTotal(payload);

    // 1) Direct map shapes (most common)
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

    // 2) Snapshot nodes shape
    if (payload.nodes && typeof payload.nodes === "object") {
      pushSnapshotNodes(out, payload.nodes);

      // If total missing/NaN, use items sum (which equals node count derived)
      if (!Number.isFinite(out.total) && out.items.length) {
        let s = 0;
        for (const it of out.items) s += num(it.count) || 0;
        out.total = s > 0 ? s : NaN;
      }
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

    // 4) Deeper nesting / uncommon drift
    if (payload.data && typeof payload.data === "object") {
      if (payload.data.nodes && typeof payload.data.nodes === "object") {
        pushSnapshotNodes(out, payload.data.nodes);
        if (!Number.isFinite(out.total) && out.items.length) {
          let s = 0;
          for (const it of out.items) s += num(it.count) || 0;
          out.total = s > 0 ? s : NaN;
        }
        return out;
      }

      pushMap(out, payload.data.user_agents);
      pushMap(out, payload.data.versions);
      if (out.items.length) return out;

      pushArray(out, payload.data.results);
      if (out.items.length) return out;
    }

    return out;
  };
})();
