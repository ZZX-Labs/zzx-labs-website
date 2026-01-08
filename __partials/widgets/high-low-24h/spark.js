// __partials/widgets/high-low-24h/spark.js
// DROP-IN (module)
// DPR-aware canvas sizing + simple background/border helpers.
// Exposes: window.ZZXHLSpark.sizeCanvas(canvas), .bg(ctx,w,h), .border(ctx,w,h)

(function () {
  "use strict";

  const W = window;
  const NS = (W.ZZXHLSpark = W.ZZXHLSpark || {});

  NS.sizeCanvas = function sizeCanvas(canvas, fallbackW = 320, fallbackH = 92) {
    const dpr = W.devicePixelRatio || 1;

    const cssW = Math.max(1, Math.floor(canvas.clientWidth || fallbackW));
    const cssH = Math.max(1, Math.floor(canvas.clientHeight || fallbackH));

    const w = Math.floor(cssW * dpr);
    const h = Math.floor(cssH * dpr);

    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    return { w, h, dpr, cssW, cssH };
  };

  NS.bg = function bg(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);

    // dark panel wash
    ctx.save();
    ctx.fillStyle = "#000";
    ctx.globalAlpha = 0.20;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // subtle horizontal guides
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const y = Math.round((h / 4) * i) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();
  };

  NS.border = function border(ctx, w, h) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    ctx.restore();
  };
})();
