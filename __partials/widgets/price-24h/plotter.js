// __partials/widgets/price-24h/plotter.js
// DROP-IN (module, not a widget)
// MUST satisfy widget.js ensureDeps():
//   window.ZZXPlotter.drawHL exists

(function () {
  "use strict";

  const W = window;

  function n(x) {
    const v = Number(x);
    return Number.isFinite(v) ? v : null;
  }

  function boundsHL(series) {
    let lo = Infinity, hi = -Infinity;
    for (const p of series) {
      const h = n(p?.h);
      const l = n(p?.l);
      const c = n(p?.c);

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

  function drawGrid(ctx, w, h, grid = "rgba(255,255,255,0.06)") {
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

  // series: [{t,o,h,l,c,v}] ascending by time
  function drawHL(ctx, series, opts = {}) {
    if (!ctx || !Array.isArray(series) || series.length < 2) return;

    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    const pad = Number.isFinite(opts.pad) ? opts.pad : 10;
    const iw = Math.max(1, w - pad * 2);
    const ih = Math.max(1, h - pad * 2);

    const { lo, hi, span } = boundsHL(series);

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

    // HL band (envelope)
    ctx.beginPath();
    for (let i = 0; i < series.length; i++) {
      const p = series[i];
      const hh = n(p?.h);
      const cc = n(p?.c);
      const v = (hh !== null) ? hh : (cc ?? lo);
      const x = xAt(i), y = yAt(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = series.length - 1; i >= 0; i--) {
      const p = series[i];
      const ll = n(p?.l);
      const cc = n(p?.c);
      const v = (ll !== null) ? ll : (cc ?? lo);
      const x = xAt(i), y = yAt(v);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = opts.bandFill || "rgba(192,214,116,0.10)";
    ctx.fill();

    // Close line
    ctx.beginPath();
    for (let i = 0; i < series.length; i++) {
      const cc = n(series[i]?.c);
      const x = xAt(i), y = yAt(cc ?? lo);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineWidth = Number.isFinite(opts.lineWidth) ? opts.lineWidth : 2;
    ctx.strokeStyle = opts.lineStroke || "#6aa92a";
    ctx.stroke();

    // End dot
    const last = series[series.length - 1];
    const lc = n(last?.c);
    if (lc !== null) {
      const lx = xAt(series.length - 1);
      const ly = yAt(lc);
      ctx.beginPath();
      ctx.arc(lx, ly, 3.1, 0, Math.PI * 2);
      ctx.fillStyle = opts.dotFill || "#e6a42b";
      ctx.fill();
    }

    // Border
    ctx.strokeStyle = opts.border || "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  }

  // Register expected global
  W.ZZXPlotter = W.ZZXPlotter || {};
  W.ZZXPlotter.drawHL = drawHL;

  // Optional alias (won’t hurt anything)
  W.ZZXPrice24Plotter = W.ZZXPrice24Plotter || {};
  W.ZZXPrice24Plotter.drawHL = drawHL;
})();
