// __partials/widgets/hashrate-by-nation/plotter.js
// DROP-IN (DEBUGGED)
//
// Builds deterministic bar layout for hashrate-by-nation.
// Supports central estimate + min/max uncertainty bands.
//
// INPUT (array):
//   [{
//     iso: "US",
//     hashrateZH: Number,      // central estimate
//     minZH?: Number,          // optional pessimistic estimate
//     maxZH?: Number           // optional optimistic estimate
//   }]
//
// OUTPUT (array):
//   layout rows with x/y/w/h + band widths

(function () {
  "use strict";

  const NS = (window.ZZXHashrateNationPlotter =
    window.ZZXHashrateNationPlotter || {});

  const BAR = {
    x: 10,
    h: 12,
    gap: 18,
    maxW: 260,
  };

  NS.layout = function layout(data) {
    if (!Array.isArray(data) || !data.length) return [];

    // sanitize values
    const safe = data.map(d => ({
      ...d,
      hashrateZH: Number.isFinite(d.hashrateZH) ? d.hashrateZH : 0,
      minZH: Number.isFinite(d.minZH) ? d.minZH : null,
      maxZH: Number.isFinite(d.maxZH) ? d.maxZH : null,
    }));

    const maxVal = Math.max(
      1,
      ...safe.map(d => d.maxZH ?? d.hashrateZH)
    );

    return safe.map((d, i) => {
      const scale = BAR.maxW / maxVal;

      const w = d.hashrateZH * scale;
      const wMin = d.minZH != null ? d.minZH * scale : null;
      const wMax = d.maxZH != null ? d.maxZH * scale : null;

      return {
        iso: d.iso,
        hashrateZH: d.hashrateZH,

        // main bar
        x: BAR.x,
        y: BAR.x + i * BAR.gap,
        w,
        h: BAR.h,

        // uncertainty band (optional)
        bandMinW: wMin,
        bandMaxW: wMax,

        // raw values preserved for labels
        _raw: d,
      };
    });
  };
})();
