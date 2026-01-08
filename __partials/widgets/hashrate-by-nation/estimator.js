// __partials/widgets/hashrate-by-nation/estimator.js
// DROP-IN, PURE ESTIMATOR
//
// INPUTS (globals you already have or can populate):
//   window.ZZXMiningStats.globalHashrateZH   -> Number (required)
//   window.ZZXNodesByNation.shares           -> { ISO: 0..1 } OR
//   window.ZZXNodesByNation.byNation         -> { ISO: { nodes: N } }
//
// OPTIONAL INPUTS:
//   window.ZZXPowerByNation                  -> { ISO: { gw: Number } }
//
// OUTPUT:
//   window.ZZXHashrateEstimator.estimate()
//     -> [{ iso, zh, lowZH, highZH, capped }]

(function () {
  "use strict";

  const NS = (window.ZZXHashrateEstimator =
    window.ZZXHashrateEstimator || {});

  // ---------------- CONFIG ----------------
  const CFG = {
    torFraction: 0.68,     // fraction of hashrate assumed hidden
    torMinMult: 0.25,      // pessimistic redistribution
    torMaxMult: 2.50,      // optimistic redistribution
    defaultJPerTH: 30,     // efficiency assumption
  };

  // ---------------- UTILS ----------------
  function n(x) {
    const v = Number(x);
    return Number.isFinite(v) ? v : NaN;
  }

  function normalize(map) {
    const sum = Object.values(map).reduce((a, b) => a + n(b), 0);
    if (!(sum > 0)) return null;
    const out = {};
    for (const k in map) out[k] = n(map[k]) / sum;
    return out;
  }

  // ---------------- INPUT ADAPTERS ----------------
  function getGlobalZH() {
    return n(window.ZZXMiningStats?.globalHashrateZH);
  }

  function getNodeShares() {
    const src = window.ZZXNodesByNation;
    if (!src) return null;

    if (src.shares) return normalize(src.shares);

    if (src.byNation) {
      const counts = {};
      for (const iso in src.byNation) {
        const c = n(src.byNation[iso]?.nodes);
        if (c > 0) counts[iso.toUpperCase()] = c;
      }
      return normalize(counts);
    }

    return null;
  }

  function getPowerCapZH(iso) {
    const p = window.ZZXPowerByNation?.[iso];
    if (!p || !Number.isFinite(p.gw)) return Infinity;

    const jPerTH =
      n(window.ZZX_MINING?.J_PER_TH) || CFG.defaultJPerTH;

    // GW → ZH/s
    // GW = (ZH * 1e9 TH/ZH * J/TH) / 1e9
    // => ZH = GW / J/TH
    return p.gw / jPerTH;
  }

  // ---------------- TOR MODEL ----------------
  function torRedistribute(base, minM, maxM) {
    const tmp = {};
    for (const iso in base) {
      const p = base[iso];
      tmp[iso] = Math.min(p * maxM, Math.max(p * minM, p));
    }
    return normalize(tmp);
  }

  // ---------------- CORE ESTIMATOR ----------------
  NS.estimate = function estimate() {
    const globalZH = getGlobalZH();
    if (!(globalZH > 0)) return [];

    const nodeShares = getNodeShares();
    if (!nodeShares) return [];

    const pubFrac = 1 - CFG.torFraction;

    const torBase = nodeShares;
    const torLow  = torRedistribute(nodeShares, CFG.torMinMult, 1.0);
    const torHigh = torRedistribute(nodeShares, 1.0, CFG.torMaxMult);

    const rows = [];

    for (const iso in nodeShares) {
      const p = nodeShares[iso];

      const baseShare =
        pubFrac * p + CFG.torFraction * torBase[iso];
      const lowShare =
        pubFrac * p + CFG.torFraction * torLow[iso];
      const highShare =
        pubFrac * p + CFG.torFraction * torHigh[iso];

      let zh     = globalZH * baseShare;
      let lowZH  = globalZH * lowShare;
      let highZH = globalZH * highShare;

      const capZH = getPowerCapZH(iso);
      let capped = false;

      if (Number.isFinite(capZH)) {
        if (zh > capZH)     { zh = capZH; capped = true; }
        if (lowZH > capZH)  lowZH = capZH;
        if (highZH > capZH) highZH = capZH;
      }

      rows.push({
        iso,
        zh,
        lowZH,
        highZH,
        capped,
      });
    }

    rows.sort((a, b) => b.zh - a.zh);
    return rows;
  };
})();
