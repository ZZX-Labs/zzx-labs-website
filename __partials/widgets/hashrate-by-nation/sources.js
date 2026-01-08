// __partials/widgets/hashrate-by-nation/sources.js
// DROP-IN (DEBUGGED + USEFUL)
//
// What this file does (and does NOT do):
// - DOES NOT fetch anything.
// - Defines the input/output contracts + provides small, *reliable* helpers that
//   other modules (estimator/widget) can call without guessing shapes.
//
// Key fixes vs a “static contract” file:
// - Normalizes ISO keys (uppercases, trims)
// - Normalizes shares/counts into a clean { ISO: share } map
// - Provides a safe global hashrate getter that tolerates both:
//     window.ZZXMiningStats.globalHashrateZH
//     window.ZZXMiningStats.hashrateZH
//     window.ZZXMiningStats.globalZH
// - Provides a consistent .ready() + .diagnose() for real debugging

(function () {
  "use strict";

  const NS = (window.ZZXHashrateNationSources =
    window.ZZXHashrateNationSources || {});

  // ---------------------------------------------------------------------------
  // REQUIRED INPUT KEYS (documented)
  // ---------------------------------------------------------------------------
  NS.requires = {
    globalHashrateZH: "ZZXMiningStats.globalHashrateZH",
    nodesByNation: "ZZXNodesByNation",
  };

  // ---------------------------------------------------------------------------
  // OPTIONAL INPUT KEYS (documented)
  // ---------------------------------------------------------------------------
  NS.optional = {
    powerByNation: "ZZXPowerByNation",
    joulesPerTH: "ZZX_MINING.J_PER_TH",
  };

  // ---------------------------------------------------------------------------
  // ASSUMPTIONS (documented defaults; estimator may override)
  // ---------------------------------------------------------------------------
  NS.assumptions = {
    torFraction: 0.68,
    torMinMultiplier: 0.25,
    torMaxMultiplier: 2.5,
    defaultJPerTH: 30,
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function n(x) {
    const v = Number(x);
    return Number.isFinite(v) ? v : NaN;
  }

  function iso2(k) {
    if (!k) return "";
    return String(k).trim().toUpperCase();
  }

  function normalizeMapToShares(map) {
    if (!map || typeof map !== "object") return null;

    // accept {ISO: share} where share could be 0..1 OR 0..100
    const tmp = {};
    let sum = 0;

    for (const rawK of Object.keys(map)) {
      const k = iso2(rawK);
      if (!k) continue;

      const v = n(map[rawK]);
      if (!(v > 0)) continue;

      tmp[k] = v;
      sum += v;
    }

    if (!(sum > 0)) return null;

    // if sum looks like 100-ish, treat as percentages
    const percentish = sum > 1.5;

    const out = {};
    let s2 = 0;
    for (const k of Object.keys(tmp)) {
      const v = tmp[k] / (percentish ? 100 : 1);
      if (v > 0) {
        out[k] = v;
        s2 += v;
      }
    }

    if (!(s2 > 0)) return null;

    // final normalize to sum 1
    for (const k of Object.keys(out)) out[k] = out[k] / s2;

    return out;
  }

  // ---------------------------------------------------------------------------
  // Public API expected by estimator/widget
  // ---------------------------------------------------------------------------

  // Tolerant global hashrate getter (ZH/s)
  NS.getGlobalHashrateZH = function getGlobalHashrateZH() {
    const ms = window.ZZXMiningStats || {};
    const v =
      n(ms.globalHashrateZH) ||
      n(ms.hashrateZH) ||
      n(ms.globalZH) ||
      NaN;
    return v;
  };

  // Preferred: window.ZZXNodesByNation.shares
  // Fallback: window.ZZXNodesByNation.byNation[ISO].nodes
  NS.getNodeShares = function getNodeShares() {
    const src = window.ZZXNodesByNation;
    if (!src || typeof src !== "object") return null;

    // 1) shares map
    if (src.shares && typeof src.shares === "object") {
      return normalizeMapToShares(src.shares);
    }

    // 2) byNation nodes
    if (src.byNation && typeof src.byNation === "object") {
      const counts = {};
      for (const rawIso of Object.keys(src.byNation)) {
        const iso = iso2(rawIso);
        const nodes = n(src.byNation[rawIso]?.nodes);
        if (iso && nodes > 0) counts[iso] = nodes;
      }
      // normalize counts -> shares
      const sum = Object.values(counts).reduce((a, b) => a + n(b), 0);
      if (!(sum > 0)) return null;

      const shares = {};
      for (const iso of Object.keys(counts)) shares[iso] = counts[iso] / sum;
      return normalizeMapToShares(shares);
    }

    return null;
  };

  // Optional: power caps (GW) by nation
  NS.getPowerGW = function getPowerGW(iso) {
    const k = iso2(iso);
    if (!k) return NaN;
    const p = window.ZZXPowerByNation?.[k];
    const gw = n(p?.gw ?? p?.GW ?? p?.power_gw);
    return gw;
  };

  // Optional: efficiency override
  NS.getJPerTH = function getJPerTH() {
    const v = n(window.ZZX_MINING?.J_PER_TH);
    return v > 0 ? v : NS.assumptions.defaultJPerTH;
  };

  // Ready check (strict)
  NS.ready = function ready() {
    const g = NS.getGlobalHashrateZH();
    const shares = NS.getNodeShares();
    return Number.isFinite(g) && g > 0 && !!shares && Object.keys(shares).length > 0;
  };

  // Diagnostics string (useful in-widget subline)
  NS.diagnose = function diagnose() {
    const g = NS.getGlobalHashrateZH();
    const src = window.ZZXNodesByNation;

    const parts = [];
    parts.push(Number.isFinite(g) ? `globalZH=${g}` : "globalZH=missing");

    if (!src) {
      parts.push("nodes=missing");
    } else if (src.shares) {
      const s = NS.getNodeShares();
      parts.push(s ? `nodes.shares=${Object.keys(s).length}` : "nodes.shares=bad");
    } else if (src.byNation) {
      const s = NS.getNodeShares();
      parts.push(s ? `nodes.byNation=${Object.keys(s).length}` : "nodes.byNation=bad");
    } else {
      parts.push("nodes=unknown-shape");
    }

    return parts.join(" · ");
  };
})();
