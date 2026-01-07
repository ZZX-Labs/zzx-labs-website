// __partials/widgets/price-24h/plotter.js
// Low-level drawing primitives for HUD charts (DPR-aware).
// Used by chart.js. No network, no DOM assumptions beyond a canvas.

(function () {
  "use strict";

  const NS = (window.ZZXPlotter = window.ZZXPlotter || {});

  function dpr() { return window.devicePixelRatio || 1; }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function finite(n) { return Number.isFinite(n); }

  NS.sizeCanvas = function sizeCanvas(canvas, cssHFallback = 96) {
    const r = dpr();
    const cssW = Math.max(1, Math.floor(canvas.clientWidth || 300));
    const cssH = Math.max(1, Math.floor(canvas.clientHeight || cssHFallback));
    const w = Math.floor(cssW * r);
    const h = Math.floor(cssH * r);

    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    return { w, h, r, cssW, cssH };
  };

  NS.clear = function clear(ctx, W, H, bg, alpha = 1) {
    ctx.clearRect(0, 0, W, H);
    if (bg) {
      const old = ctx.globalAlpha;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = old;
    }
  };

  NS.gridH = function gridH(ctx, x0, x1, y0, y1, step, stroke) {
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    for (let y = y0; y <= y1; y += step) {
      ctx.beginPath();
      ctx.moveTo(x0, y + 0.5);
      ctx.lineTo(x1, y + 0.5);
      ctx.stroke();
    }
    ctx.restore();
  };

  NS.border = function border(ctx, W, H, stroke) {
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    ctx.restore();
  };

  NS.bandHL = function bandHL(ctx, xAt, yAt, highs, lows, fill) {
    if (!highs.length || highs.length !== lows.length) return;
    ctx.save();
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (let i = 0; i < highs.length; i++) ctx.lineTo(xAt(i), yAt(highs[i]));
    for (let i = lows.length - 1; i >= 0; i--) ctx.lineTo(xAt(i), yAt(lows[i]));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  NS.line = function line(ctx, xAt, yAt, values, stroke, widthPx) {
    if (!values.length) return;
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = widthPx;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < values.length; i++) {
      const x = xAt(i), y = yAt(values[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  };

  NS.dot = function dot(ctx, x, y, radius, fill) {
    ctx.save();
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  NS.volumeBars = function volumeBars(ctx, xAt, y0, y1, vols, fill, maxBarW) {
    if (!vols.length) return;
    const n = vols.length;
    const wAvail = (xAt(n - 1) - xAt(0)) || 1;
    const step = wAvail / Math.max(1, n - 1);
    const bw = clamp(step * 0.70, 1, maxBarW);

    const vmax = Math.max(...vols.map(v => finite(v) ? v : 0)) || 1;

    ctx.save();
    ctx.fillStyle = fill;

    for (let i = 0; i < n; i++) {
      const v = finite(vols[i]) ? vols[i] : 0;
      const h = ((v / vmax) * (y1 - y0));
      const x = xAt(i) - bw / 2;
      const y = y1 - h;
      ctx.fillRect(x, y, bw, h);
    }

    ctx.restore();
  };

  // optional: tiny labels for min/max
  NS.label = function label(ctx, text, x, y, color, font) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
    ctx.restore();
  };
})();
