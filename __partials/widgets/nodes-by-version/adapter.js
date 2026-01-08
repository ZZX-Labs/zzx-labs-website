// __partials/widgets/nodes-by-version/adapter.js
// DROP-IN (NEW)
// Normalizes Bitnodes payload drift into:
//   { total: number|NaN, items: [{ label: string, count: number }] }
//
// Supports:
// - /nodes/user_agents/   -> { total_nodes?, user_agents: {ua: n, ...} } OR variants
// - /nodes/versions/      -> { total_nodes?, versions: {ver: n, ...} } OR variants
// - /snapshots/latest/    -> { total_nodes?, user_agents: {...} } OR variants
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

  function coerceTotal(p) {
    return (
      num(p?.total_nodes) ||
      num(p?.total) ||
      num(p?.count) ||
      num(p?.total_reachable_nodes) ||
      num(p?.reachable_nodes) ||
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
        if (label && Number.isFinite(count) && count > 0) {
          out.items.push({ label, count });
        }
        continue;
      }

      // pattern: { label/version/user_agent, count/nodes/value }
      if (row && typeof row === "object") {
        const label =
          String(
            row.label ??
            row.user_agent ??
            row.ua ??
            row.version ??
            row.name ??
            ""
          ).trim();

        const count =
          num(row.count ?? row.nodes ?? row.value ?? row.n ?? row.total);

        if (label && Number.isFinite(count) && count > 0) {
          out.items.push({ label, count });
        }
      }
    }
  }

  NS.parse = function parse(payload) {
    const out = { total: NaN, items: [] };

    if (!payload || typeof payload !== "object") return out;

    out.total = coerceTotal(payload);

    // Most common: maps
    // - payload.user_agents
    // - payload.versions
    // Some variants embed under payload.data / payload.results
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

    // Array variants
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

    // Sometimes Bitnodes nests the map deeper (rare)
    if (payload.data && typeof payload.data === "object") {
      pushMap(out, payload.data.user_agents);
      pushMap(out, payload.data.versions);
      if (out.items.length) return out;

      pushArray(out, payload.data.results);
      if (out.items.length) return out;
    }

    return out;
  };
})();
