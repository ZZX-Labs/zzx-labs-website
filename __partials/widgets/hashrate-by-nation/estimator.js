// __partials/widgets/hashrate-by-nation/estimator.js
// DROP-IN (DEBUGGED)
// Pure estimator module — NO network, NO AllOrigins.
//
// INPUTS (required, provided elsewhere):
//   window.ZZXMiningStats.globalHashrateZH      -> Number (global ZH/s)
//   window.ZZXNodesByNation                     -> { shares } OR { byNation }
//
// OPTIONAL INPUTS:
//   window.ZZXPowerByNation[ISO].gw             -> Number (power production in GW, optional cap)
//   window.ZZX_MINING.J_PER_TH                  -> Number (efficiency assumption, default 30)
//
// OUTPUT:
//   window.ZZXHashrateNationEstimator.estimate({ topN? })
//     -> rows: [{ iso, sharePublic, shareTorBase, shareLow, shareHigh, zh, lowZH, highZH, capped }]
//
// This is intentionally “best-effort”: if optional inputs are missing, it still works.

(function () {
  "use strict";

  const W = window;

  const NS = (W.ZZXHashrateNationEstimator =
    W.ZZXHashrateNationEstimator || {});

  const CFG = {
    // How much of global hashrate we model as “hidden / unattributable” (Tor/hosting/obfuscation)
    torFraction: 0.68,

    // Per-nation tor allocation bands relative to public node share
    torMinMult: 0.25,
    torMaxMult: 2.50,

    // Efficiency baseline
    defaultJPerTH: 30,
  };

  // ---------------- utils ----------------
  function n(x) {
    const v = Number(x);
    return Number.isFinite(v) ? v : NaN;
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function normalizeShares(map) {
    if (!map || typeof map !== "object") return null;
    let sum = 0;
    const tmp = {};
    for (const k in map) {
      const v = n(map[k]);
      if (v > 0) {
        const iso = String(k).toUpperCase();
        tmp[iso] = v;
        sum += v;
      }
    }
    if (!(sum > 0)) return null;

    const out = {};
    for (const iso in tmp) out[iso] = tmp[iso] / sum;
    return out;
  }

  function getGlobalZH() {
    return n(W.ZZXMiningStats?.globalHashrateZH);
  }

  function getNodeShares() {
    const src = W.ZZXNodesByNation;
    if (!src || typeof src !== "object") return null;

    // Preferred: already shares
    if (src.shares && typeof src.shares === "object") {
      return normalizeShares(src.shares);
    }

    // Fallback: counts
    if (src.byNation && typeof src.byNation === "object") {
      const counts = {};
      for (const iso in src.byNation) {
        const nodes = n(src.byNation[iso]?.nodes ?? src.byNation[iso]);
        if (nodes > 0) counts[String(iso).toUpperCase()] = nodes;
      }
      return normalizeShares(counts);
    }

    return null;
  }

  // Optional: cap by nation power production (GW).
  // We convert GW to a loose upper bound ZH/s using J/TH:
  //
  // TH/s = W / (J/TH)      (because J/s = W)
  // ZH/s = TH/s / 1e9
  // => ZH_cap = (GW * 1e9) / (J/TH) / 1e9 = GW / (J/TH)
  //
  // So: capZH ≈ GW / J_PER_TH
  function getJPerTH() {
    const v = n(W.ZZX_MINING?.J_PER_TH);
    return (Number.isFinite(v) && v > 0) ? v : CFG.defaultJPerTH;
  }

  function getPowerCapZH(iso) {
    const gw = n(W.ZZXPowerByNation?.[iso]?.gw);
    if (!Number.isFinite(gw) || gw <= 0) return Infinity;
    const jPerTH = getJPerTH();
    return gw / jPerTH;
  }

  // ---------------- tor redistribution ----------------
  // We produce an alternate distribution for the “torFraction” pool.
  // Instead of “flat” we allow bounds: each nation can be under/over-weighted
  // but must renormalize to 1.
  function torRedistribute(publicShares, multMin, multMax) {
    const tmp = {};
    for (const iso in publicShares) {
      const p = publicShares[iso];
      // allow scaling within bounds
      const scaled = clamp(p, p * multMin, p * multMax);
      tmp[iso] = scaled;
    }
    return normalizeShares(tmp);
  }

  // ---------------- estimator core ----------------
  function buildRows(globalZH, publicShares) {
    const torFrac = clamp(CFG.torFraction, 0, 0.95);
    const pubFrac = 1 - torFrac;

    // “base” tor distribution = publicShares
    const torBase = publicShares;

    // pessimistic: tor is less aligned with public shares
    const torLow = torRedistribute(publicShares, CFG.torMinMult, 1.0) || torBase;

    // optimistic: tor can be more concentrated than public shares
    const torHigh = torRedistribute(publicShares, 1.0, CFG.torMaxMult) || torBase;

    const rows = [];

    for (const iso in publicShares) {
      const p = publicShares[iso];

      const shareTorBase = torBase[iso] ?? 0;
      const shareLowTor  = torLow[iso] ?? 0;
      const shareHighTor = torHigh[iso] ?? 0;

      const shareBase = pubFrac * p + torFrac * shareTorBase;
      const shareLow  = pubFrac * p + torFrac * shareLowTor;
      const shareHigh = pubFrac * p + torFrac * shareHighTor;

      let zh     = globalZH * shareBase;
      let lowZH  = globalZH * shareLow;
      let highZH = globalZH * shareHigh;

      // Optional power cap
      const capZH = getPowerCapZH(iso);
      let capped = false;

      if (Number.isFinite(capZH) && capZH !== Infinity) {
        if (zh > capZH) { zh = capZH; capped = true; }
        if (lowZH > capZH) lowZH = capZH;
        if (highZH > capZH) highZH = capZH;
      }

      rows.push({
        iso,
        sharePublic: p,
        shareTorBase,
        shareLow,
        shareHigh,
        zh,
        lowZH,
        highZH,
        capped,
      });
    }

    rows.sort((a, b) => b.zh - a.zh);
    return rows;
  }

  // Public API
  NS.estimate = function estimate(opts) {
    const topN = Math.max(1, Math.min(250, Number(opts?.topN ?? 10)));

    const globalZH = getGlobalZH();
    if (!(globalZH > 0)) return [];

    const shares = getNodeShares();
    if (!shares) return [];

    const rows = buildRows(globalZH, shares);
    return rows.slice(0, topN);
  };

  // Optional: allow tuning without editing file
  NS.setConfig = function setConfig(next) {
    if (!next || typeof next !== "object") return;
    if (Number.isFinite(n(next.torFraction))) CFG.torFraction = clamp(n(next.torFraction), 0, 0.95);
    if (Number.isFinite(n(next.torMinMult))) CFG.torMinMult = clamp(n(next.torMinMult), 0.01, 10);
    if (Number.isFinite(n(next.torMaxMult))) CFG.torMaxMult = clamp(n(next.torMaxMult), 0.01, 10);
    if (Number.isFinite(n(next.defaultJPerTH))) CFG.defaultJPerTH = clamp(n(next.defaultJPerTH), 1, 200);
  };

  NS._debug = function _debug() {
    return {
      cfg: { ...CFG },
      globalZH: getGlobalZH(),
      shares: getNodeShares(),
      jPerTH: getJPerTH(),
    };
  };
})();
