// __partials/widgets/fees/estimator.js
(function () {
  "use strict";

  const NS = (window.ZZXFeesEstimator = window.ZZXFeesEstimator || {});

  function n(x){ const v = Number(x); return Number.isFinite(v) ? v : NaN; }

  // Range policy:
  // We compute a “band” around each tier using neighboring values in sorted unique set.
  function neighborRange(values, v) {
    const arr = values.filter(Number.isFinite).slice().sort((a,b)=>a-b);
    if (!arr.length || !Number.isFinite(v)) return { lo: NaN, hi: NaN };

    // unique
    const uniq = [];
    for (const x of arr) {
      if (!uniq.length || uniq[uniq.length-1] !== x) uniq.push(x);
    }

    // find nearest indices
    let idx = 0;
    for (let i=0;i<uniq.length;i++){
      if (uniq[i] === v) { idx = i; break; }
      if (uniq[i] > v) { idx = Math.max(0, i-1); break; }
      idx = i;
    }

    const lo = uniq[Math.max(0, idx-1)] ?? v;
    const hi = uniq[Math.min(uniq.length-1, idx+1)] ?? v;

    // ensure lo<=v<=hi
    return { lo: Math.min(lo, v), hi: Math.max(hi, v) };
  }

  // mempool recommended:
  // { fastestFee, halfHourFee, hourFee, economyFee, minimumFee }
  NS.build = function build(rec) {
    const fastest = n(rec?.fastestFee);
    const halfHr  = n(rec?.halfHourFee);
    const hour    = n(rec?.hourFee);
    const econ    = n(rec?.economyFee);
    const min     = n(rec?.minimumFee);

    // Your desired labels:
    // Instant, Fast, High, Mid, Low, Min, Economy
    // We map:
    // Instant = fastest
    // Fast    = halfHour
    // High    = fastest
    // Mid     = halfHour
    // Low     = hour
    // Economy = economyFee
    // Min     = minimumFee
    const tiers = {
      instant: fastest,
      fast: halfHr,
      high: fastest,
      mid: halfHr,
      low: hour,
      economy: econ,
      min: min
    };

    const allVals = Object.values(tiers).filter(Number.isFinite);
    const avg = allVals.length ? (allVals.reduce((a,b)=>a+b,0) / allVals.length) : NaN;

    const ranges = {};
    for (const k in tiers) {
      const v = tiers[k];
      const r = neighborRange(allVals, v);
      ranges[k] = r;
    }

    return { tiers, ranges, avg };
  };
})();
