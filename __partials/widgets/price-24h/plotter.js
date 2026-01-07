// __partials/widgets/price-24h/plotter.js
// DROP-IN (module)
// Exports: window.ZZXPlotter.drawHL(ctx, candles, opts)

(function () {
  "use strict";

  const W = window;

  function num(x) {
    const v = Number(x);
    return Number.isFinite(v) ? v : null;
  }

  function boundsHL(series) {
    let lo = Infinity, hi = -Infinity;

    for (const p of series) {
      const h = num(p?.h);
      const l = num(p?.l);
      const c = num(p?.c);

      const hh = (h !== null) ? h : c;
      const ll = (l !== null) ? l : c;

      if (hh !== null) hi = Math.max(hi, hh);
      if (ll !== null) lo = Math.min(lo, ll);
    }

    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) {
      lo = 0; hi = 1;
    }

    return { lo, hi, span: (hi - lo) || 1 };
  }

  function drawGrid(ctx, w, h, grid) {
    ctx.save();
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;

    for (let y = 0; y <= h; y += 28) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
      ctx.stroke();
    }
    for (let x = 0; x <= w; x += 44) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, h);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ctx: 2d context
  // series: [{t,o,h,l,c,v}] ascending
  // opts: {bg,bgAlpha,grid,bandFill,lineStroke,dotFill,border,lineWidth,pad}
  function drawHL(ctx, series, opts = {}) {
    if (!ctx || !Array.isArray(series) || series.length < 2) return;

    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    const pad = Number.isFinite(opts.pad) ? opts.pad : 10;
    const iw = Math.max(1, w - pad * 2);
    const ih = Math.max(1, h - pad * 2);

    const { lo, span } = boundsHL(series);

    const xAt = (i) => pad + (i / (series.length - 1)) * iw;
    const yAt = (v) => pad + (1 - ((v - lo) / span)) * ih;

    // BG
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.fillStyle = opts.bg || "#000";
    ctx.globalAlpha = Number.isFinite(opts.bgAlpha) ? opts.bgAlpha : 0.25;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // Grid
    drawGrid(ctx, w, h, opts.grid || "rgba(255,255,255,0.06)");

    // HL band (upper envelope then lower envelope backwards)
    ctx.beginPath();
    for (let i = 0; i < series.length; i++) {
      const p = series[i];
      const hh = num(p?.h);
      const cc = num(p?.c);
      const v = (hh !== null) ? hh : (cc ?? lo);
      const x = xAt(i), y = yAt(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = series.length - 1; i >= 0; i--) {
      const p = series[i];
      const ll = num(p?.l);
      const cc = num(p?.c);
      const v = (ll !== null) ? ll : (cc ?? lo);
      ctx.lineTo(xAt(i), yAt(v));
    }
    ctx.closePath();
    ctx.fillStyle = opts.bandFill || "rgba(192,214,116,0.10)";
    ctx.fill();

    // Close line
    ctx.beginPath();
    for (let i = 0; i < series.length; i++) {
      const c = num(series[i]?.c);
      const x = xAt(i), y = yAt(c ?? lo);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineWidth = Number.isFinite(opts.lineWidth) ? opts.lineWidth : 2;
    ctx.strokeStyle = opts.lineStroke || "#6aa92a";
    ctx.stroke();

    // End dot
    const last = series[series.length - 1];
    const lc = num(last?.c);
    if (lc !== null) {
      ctx.beginPath();
      ctx.arc(xAt(series.length - 1), yAt(lc), 3.1, 0, Math.PI * 2);
      ctx.fillStyle = opts.dotFill || "#e6a42b";
      ctx.fill();
    }

    // Border
    ctx.strokeStyle = opts.border || "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  }

  W.ZZXPlotter = W.ZZXPlotter || {};
  W.ZZXPlotter.drawHL = drawHL;
})();
