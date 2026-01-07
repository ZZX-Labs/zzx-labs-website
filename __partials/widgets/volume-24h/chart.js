// __partials/widgets/volume-24h/chart.js
// DROP-IN (module)
// Exports: window.ZZXChartVolume.drawVolume24(canvas, candles, isUp)

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
  }

  function drawVolume24(canvas, candles, isUp) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    sizeCanvas(canvas);

    const theme = W.ZZXTheme?.widgets?.volume24 || {};
    const opts = {
      bg: theme.bg || "#000",
      bgAlpha: Number.isFinite(theme.bgAlpha) ? theme.bgAlpha : 0.25,
      grid: theme.grid || "rgba(255,255,255,0.06)",
      bar: isUp ? (theme.upBar || "rgba(106,169,42,0.75)") : (theme.downBar || "rgba(224,88,88,0.65)"),
      priceLine: true,
      priceStroke: theme.priceStroke || "rgba(230,164,43,0.55)",
      border: theme.border || "rgba(255,255,255,0.06)",
      pad: Number.isFinite(theme.pad) ? theme.pad : 10,
    };

    W.ZZXPlotterVolume?.drawVolume?.(ctx, candles, opts);
  }

  W.ZZXChartVolume = W.ZZXChartVolume || {};
  W.ZZXChartVolume.drawVolume24 = drawVolume24;
})();
