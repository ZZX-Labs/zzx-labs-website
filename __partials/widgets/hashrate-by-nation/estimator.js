// __partials/widgets/hashrate-by-nation/estimator.js
// DROP-IN (WORKING, NO FETCHES, NO DEPS)
//
// Purpose:
//   Centralize the math so widget.js stays thin.
//   Uses ONLY globals you already generate elsewhere.
//
// Inputs (required):
//   window.ZZXMiningStats.globalHashrateZH   -> Number (global hashrate in ZH/s)
//   window.ZZXNodesByNation                 -> { shares: {ISO:weight} } OR { byNation: {ISO:{nodes:N}} }
//
// Inputs (optional):
//   window.ZZX_MINING.J_PER_TH              -> Number (efficiency, default 30 J/TH)
//   window.ZZXPowerByNation                 -> { ISO: { gw:Number } }   (cap by national power ceiling)
//
// Output:
//   window.ZZXHashrateByNationEstimator.estimate(opts?)
//     -> [{ iso, zh, low, high, share, lowShare, highShare, capped, capZH }]
//
// Notes:
// - “Tor band” here is a *distribution uncertainty band* around your node-share allocation.
// - This estimator does NOT claim ground truth; it provides an internally consistent ranking
//   using your chosen assumptions.

(function () {
  "use strict";

  const NS = (window.ZZXHashrateByNationEstimator =
    window.ZZXHashrateByNationEstimator || {});

  const DEFAULTS = {
    topN: 10,

    // Tor uncertainty model
    torFraction: 0.68,
    torMinMult: 0.25,
    torMaxMult: 2.5,

    // Optional cap-by-power
    enablePowerCap: false,

    // Mining efficiency for power cap conversion
    defaultJPerTH: 30,
  };

  function n(x) {
    const v = Number(x);
    return Number.isFinite(v) ? v : NaN;
  }

  function normalizeShares(map) {
    if (!map || typeof map !== "object") return null;

    let sum = 0;
    for (const k in map) {
      const v = n(map[k]);
      if (v > 0) sum += v;
    }
    if (!(sum > 0)) return null;

    const out = {};
    for (const k in map) {
      const v = n(map[k]);
      if (v > 0) out[String(k).toUpperCase()] = v / sum;
    }
    return out;
  }

  function getGlobalZH() {
    return n(window.ZZXMiningStats?.globalHashrateZH);
  }

  function getNodeShares() {
    const src = window.ZZXNodesByNation;
    if (!src || typeof src !== "object") return null;

    // Preferred: shares already computed
    if (src.shares && typeof src.shares === "object") {
      return normalizeShares(src.shares);
    }

    // Fallback: byNation counts
    if (src.byNation && typeof src.byNation === "object") {
      const counts = {};
      for (const iso in src.byNation) {
        const c = n(src.byNation[iso]?.nodes);
        if (c > 0) counts[String(iso).toUpperCase()] = c;
      }
      return normalizeShares(counts);
    }

    return null;
  }

  function getJPerTH(opts) {
    const o = opts || {};
    const v1 = n(o.jPerTH);
    if (Number.isFinite(v1) && v1 > 0) return v1;

    const v2 = n(window.ZZX_MINING?.J_PER_TH);
    if (Number.isFinite(v2) && v2 > 0) return v2;

    return DEFAULTS.defaultJPerTH;
  }

  // Optional cap: power ceiling -> max plausible ZH/s
  // Derivation (same as your hashrate widget):
  //   W = TH/s * (J/TH)  => TH/s = W / (J/TH)
  //   ZH/s = (TH/s) / 1e9
  //   Given GW: W = GW * 1e9
  //   => ZH/s cap = (GW*1e9)/(J/TH) / 1e9 = GW/(J/TH)
  function getPowerCapZH(iso, jPerTH) {
    const p = window.ZZXPowerByNation?.[iso];
    const gw = n(p?.gw);
    if (!Number.isFinite(gw) || gw <= 0) return Infinity;
    return gw / (jPerTH > 0 ? jPerTH : DEFAULTS.defaultJPerTH);
  }

  // Tor redistribution: create alternative share maps to form min/max band.
  // Important: we renormalize after weighting, so totals always sum to 1.
  function torRedistribute(base, multMin, multMax) {
    const tmp = {};
    for (const iso in base) {
      const p = base[iso];
      // center weight is p; band adjusts weight within [p*multMin, p*multMax]
      const w = Math.max(p * multMin, Math.min(p * multMax, p));
      tmp[iso] = w;
    }
    return normalizeShares(tmp);
  }

  function buildRows(globalZH, publicShares, opts) {
    const torFrac = n(opts.torFraction);
    const torFraction = Number.isFinite(torFrac) ? torFrac : DEFAULTS.torFraction;

    const pubFrac = 1 - torFraction;

    const torMinMult = Number.isFinite(n(opts.torMinMult)) ? n(opts.torMinMult) : DEFAULTS.torMinMult;
    const torMaxMult = Number.isFinite(n(opts.torMaxMult)) ? n(opts.torMaxMult) : DEFAULTS.torMaxMult;

    const torBase = publicShares;
    const torLow = torRedistribute(publicShares, torMinMult, 1.0) || torBase;
    const torHigh = torRedistribute(publicShares, 1.0, torMaxMult) || torBase;

    const enableCap = !!opts.enablePowerCap;
    const jPerTH = getJPerTH(opts);

    const rows = [];
    for (const iso in publicShares) {
      const p = publicShares[iso];

      const baseShare = pubFrac * p + torFraction * (torBase[iso] || 0);
      const lowShare  = pubFrac * p + torFraction * (torLow[iso]  || 0);
      const highShare = pubFrac * p + torFraction * (torHigh[iso] || 0);

      let zh   = globalZH * baseShare;
      let low  = globalZH * lowShare;
      let high = globalZH * highShare;

      let capped = false;
      let capZH = Infinity;

      if (enableCap) {
        capZH = getPowerCapZH(iso, jPerTH);
        if (Number.isFinite(capZH)) {
          if (zh > capZH) { zh = capZH; capped = true; }
          if (low > capZH) low = capZH;
          if (high > capZH) high = capZH;
        }
      }

      rows.push({
        iso,
        share: baseShare,
        lowShare,
        highShare,
        zh,
        low,
        high,
        capped,
        capZH,
      });
    }

    rows.sort((a, b) => b.zh - a.zh);
    return rows;
  }

  // Public API
  NS.estimate = function estimate(options) {
    const opts = { ...DEFAULTS, ...(options || {}) };

    const globalZH = getGlobalZH();
    if (!(globalZH > 0)) return [];

    const shares = getNodeShares();
    if (!shares) return [];

    const rows = buildRows(globalZH, shares, opts);

    const topN = Math.max(1, Math.floor(opts.topN || DEFAULTS.topN));
    return rows.slice(0, topN);
  };

  // Convenience for widget.js
  NS.inputsReady = function inputsReady() {
    const g = window.ZZXMiningStats?.globalHashrateZH;
    const nbn = window.ZZXNodesByNation;
    return Number.isFinite(g) && !!nbn;
  };
})();
