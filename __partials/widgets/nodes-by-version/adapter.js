// __partials/widgets/nodes-by-version/adapter.js
// DROP-IN (DEBUGGED)
// Normalizes Bitnodes shapes into:
// { total: Number|NaN, items: [{ label:String, count:Number }] }

(function () {
  "use strict";

  const W = window;
  const NS = (W.ZZXNodesByVersionAdapter =
    W.ZZXNodesByVersionAdapter || {});

  function n(x){ const v = Number(x); return Number.isFinite(v) ? v : NaN; }

  function toItemsFromMap(map) {
    const items = [];
    for (const [k, v] of Object.entries(map || {})) {
      const c = n(v);
      if (!(c > 0)) continue;
      items.push({ label: String(k), count: c });
    }
    return items;
  }

  function toItemsFromArray(arr) {
    const items = [];
    for (const row of arr || []) {
      if (Array.isArray(row) && row.length >= 2) {
        const label = String(row[0]);
        const count = n(row[1]);
        if (label && count > 0) items.push({ label, count });
        continue;
      }
      if (row && typeof row === "object") {
        const label = String(row.label ?? row.version ?? row.ua ?? row.user_agent ?? "");
        const count = n(row.count ?? row.nodes ?? row.value ?? row.n);
        if (label && count > 0) items.push({ label, count });
      }
    }
    return items;
  }

  NS.parse = function parse(payload) {
    const out = { total: NaN, items: [] };
    if (!payload || typeof payload !== "object") return out;

    // totals
    out.total =
      n(payload.total_nodes) ||
      n(payload.total) ||
      n(payload.count) ||
      n(payload.total_reachable_nodes) ||
      NaN;

    // common maps
    const map =
      (payload.versions && typeof payload.versions === "object" && payload.versions) ||
      (payload.user_agents && typeof payload.user_agents === "object" && payload.user_agents) ||
      (payload.userAgents && typeof payload.userAgents === "object" && payload.userAgents) ||
      null;

    if (map) {
      out.items = toItemsFromMap(map);
      return out;
    }

    // common arrays
    const arr =
      (Array.isArray(payload.results) && payload.results) ||
      (Array.isArray(payload.data) && payload.data) ||
      (Array.isArray(payload.versions) && payload.versions) ||
      (Array.isArray(payload.items) && payload.items) ||
      null;

    if (arr) {
      out.items = toItemsFromArray(arr);
      return out;
    }

    return out;
  };
})();
