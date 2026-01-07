// __partials/widgets/price-24h/chart.js
// DROP-IN (module, not a widget)
// MUST satisfy widget.js ensureDeps():
//   window.ZZXChart.drawPrice24 exists

(function () {
  "use strict";

  const W = window;

  function sizeCanvas(canvas) {
    const dpr = W.devicePixelRatio || 1;
    const cssW = Math.max(1, Math.floor(canvas.clientWidth || 300));
    const cssH = Math.max(1, Math.floor(canvas.clientHeight || 92));
    const rw = Math.floor(cssW * dpr);
    const rh = Math.floor(cssH * dpr);
    if (canvas.width !== rw) canvas.width = rw;
    if (canvas.height !== rh) canvas.height = rh;
    return { w: rw, h: rh, dpr };
  }

  // candles: [{t,o,h,l,c,v}]
  function drawPrice24(canvas, candles, isUp) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    sizeCanvas(canvas);

    const theme = W.ZZXTheme?.widgets?.price24 || {};
    const opts = {
      bg: theme.bg || "#000",
      bgAlpha: Number.isFinite(theme.bgAlpha) ? theme.bgAlpha : 0.25,
      grid: theme.grid || "rgba(255,255,255,0.06)",
      bandFill: theme.bandFill || "rgba(192,214,116,0.10)",
      lineStroke: isUp ? (theme.up || "#6aa92a") : (theme.down || "#e05858"),
      dotFill: theme.dot || "#e6a42b",
      border: theme.border || "rgba(255,255,255,0.06)",
      lineWidth: Number.isFinite(theme.lineWidth) ? theme.lineWidth : 2,
      pad: Number.isFinite(theme.pad) ? theme.pad : 10,
    };

    W.ZZXPlotter?.drawHL?.(ctx, candles, opts);
  }

  W.ZZXChart = W.ZZXChart || {};
  W.ZZXChart.drawPrice24 = drawPrice24;
})();
