// __partials/widgets/hashrate-by-nation/plotter.js
// DROP-IN (DEBUGGED + FIXED)
//
// Fixes vs your current file:
// - y was incorrectly based on BAR.x (so rows start at 10 but also offset by x again)
// - accepts BOTH naming schemes from upstream:
//     hashrateZH / minZH / maxZH
//     zh        / lowZH / highZH
// - clamps widths to [0, maxW]
// - produces a stable row baseline (top padding) so labels don’t collide
// - keeps band widths relative to the SAME scale as the main bar
//
// INPUT (array):
//   [{ iso, hashrateZH|zh, minZH|lowZH?, maxZH|highZH? }]
//
// OUTPUT rows:
//   { iso, hashrateZH, minZH, maxZH, x, y, w, h, bandMinW, bandMaxW, _raw }

(function () {
  "use strict";

  const NS = (window.ZZXHashrateNationPlotter =
    window.ZZXHashrateNationPlotter || {});

  const BAR = {
    x: 10,
    y0: 12,        // top padding
    h: 12,
    gap: 18,
    maxW: 260,
  };

  function n(x) {
    const v = Number(x);
    return Number.isFinite(v) ? v : NaN;
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function pickVal(d, keys) {
    for (const k of keys) {
      const v = n(d?.[k]);
      if (Number.isFinite(v)) return v;
    }
    return NaN;
  }

  NS.layout = function layout(data) {
    if (!Array.isArray(data) || data.length === 0) return [];

    // sanitize + accept alt naming
    const safe = data.map((d) => {
      const hashrateZH = pickVal(d, ["hashrateZH", "zh"]);
      const minZH = pickVal(d, ["minZH", "lowZH"]);
      const maxZH = pickVal(d, ["maxZH", "highZH"]);

      return {
        iso: String(d?.iso ?? "??").toUpperCase(),
        hashrateZH: Number.isFinite(hashrateZH) ? hashrateZH : 0,
        minZH: Number.isFinite(minZH) ? minZH : null,
        maxZH: Number.isFinite(maxZH) ? maxZH : null,
        _raw: d,
      };
    });

    // scale by the biggest value we might draw (prefer maxZH if present)
    const maxVal = Math.max(
      1,
      ...safe.map((d) => (d.maxZH != null ? d.maxZH : d.hashrateZH))
    );

    const scale = BAR.maxW / maxVal;

    return safe.map((d, i) => {
      const w = clamp(d.hashrateZH * scale, 0, BAR.maxW);

      const wMin = d.minZH != null ? clamp(d.minZH * scale, 0, BAR.maxW) : null;
      const wMax = d.maxZH != null ? clamp(d.maxZH * scale, 0, BAR.maxW) : null;

      return {
        iso: d.iso,
        hashrateZH: d.hashrateZH,
        minZH: d.minZH,
        maxZH: d.maxZH,

        x: BAR.x,
        y: BAR.y0 + i * BAR.gap,
        w,
        h: BAR.h,

        // uncertainty band widths in the SAME coordinate system
        bandMinW: wMin,
        bandMaxW: wMax,

        _raw: d._raw,
      };
    });
  };
})();
