// __partials/widgets/price-24h/plotter.js
// DROP-IN (module, not a widget)
// Exposes:
//   window.ZZXPrice24Plotter.plotOHLC(ctx, series, opts)
// Also provides backwards-compatible aliases:
//   window.ZZXPricePlotter (if any code checks that name)

(function () {
  "use strict";

  const W = window;

  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

  function asNum(x){ const n = Number(x); return Number.isFinite(n) ? n : null; }

  // series: [{t,o,h,l,c,v}] ascending by time
  function bounds(series){
    let lo = Infinity, hi = -Infinity;
    for (const p of series){
      const h = asNum(p?.h); const l = asNum(p?.l);
      if (h !== null) hi = Math.max(hi, h);
      if (l !== null) lo = Math.min(lo, l);
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi){
      // fallback to closes
      lo = Infinity; hi = -Infinity;
      for (const p of series){
        const c = asNum(p?.c);
        if (c !== null){ hi = Math.max(hi, c); lo = Math.min(lo, c); }
      }
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi){
        lo = 0; hi = 1;
      }
    }
    return { lo, hi, span: (hi - lo) || 1 };
  }

  function plotOHLC(ctx, series, opts = {}){
    if (!ctx || !series || series.length < 2) return;

    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    const pad = Number.isFinite(opts.pad) ? opts.pad : 10;
    const iw = Math.max(1, w - pad * 2);
    const ih = Math.max(1, h - pad * 2);

    const { lo, hi, span } = bounds(series);

    const xAt = (i) => pad + (i / (series.length - 1)) * iw;
    const yAt = (v) => pad + (1 - ((v - lo) / span)) * ih;

    // High/Low envelope fill
    ctx.beginPath();
    for (let i=0;i<series.length;i++){
      const hh = asNum(series[i]?.h);
      const vv = (hh !== null) ? hh : asNum(series[i]?.c);
      const x = xAt(i), y = yAt(vv ?? lo);
      if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    for (let i=series.length-1;i>=0;i--){
      const ll = asNum(series[i]?.l);
      const vv = (ll !== null) ? ll : asNum(series[i]?.c);
      const x = xAt(i), y = yAt(vv ?? lo);
      ctx.lineTo(x,y);
    }
    ctx.closePath();
    ctx.fillStyle = opts.envelopeFill || "rgba(192,214,116,0.09)";
    ctx.fill();

    // Close line
    ctx.beginPath();
    for (let i=0;i<series.length;i++){
      const c = asNum(series[i]?.c);
      const x = xAt(i), y = yAt((c ?? lo));
      if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.lineWidth = Number.isFinite(opts.lineWidth) ? opts.lineWidth : 2;
    ctx.strokeStyle = opts.lineStroke || "#6aa92a";
    ctx.stroke();

    // End dot
    const last = series[series.length-1];
    const lc = asNum(last?.c);
    if (lc !== null){
      const lx = xAt(series.length-1);
      const ly = yAt(lc);
      ctx.beginPath();
      ctx.arc(lx, ly, 3.1, 0, Math.PI*2);
      ctx.fillStyle = opts.dotFill || "#e6a42b";
      ctx.fill();
    }

    // Border
    ctx.strokeStyle = opts.borderStroke || "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  }

  const api = { plotOHLC };

  // “Registration” for a submodule = publish a stable global API
  W.ZZXPrice24Plotter = api;

  // Alias for any earlier/other checker name
  if (!W.ZZXPricePlotter) W.ZZXPricePlotter = api;

  // Optional readiness flag (useful for debugging)
  W.__ZZX_PRICE24_PLOTTER_READY = true;
})();
