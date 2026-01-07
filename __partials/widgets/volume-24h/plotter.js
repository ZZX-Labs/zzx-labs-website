// __partials/widgets/volume-24h/plotter.js
// DROP-IN (module)
// Exports: window.ZZXPlotterVolume.drawVolume(ctx, candles, opts)
//
// Renders:
// - volume bars (v) with gentle smoothing
// - optional price line overlay (close) as faint guide

(function () {
  "use strict";

  const W = window;

  function num(x){
    const v = Number(x);
    return Number.isFinite(v) ? v : null;
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

  function drawVolume(ctx, candles, opts = {}) {
    if (!ctx || !Array.isArray(candles) || candles.length < 2) return;

    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    const pad = Number.isFinite(opts.pad) ? opts.pad : 10;
    const iw = Math.max(1, w - pad * 2);
    const ih = Math.max(1, h - pad * 2);

    // background
    ctx.clearRect(0,0,w,h);
    ctx.save();
    ctx.fillStyle = opts.bg || "#000";
    ctx.globalAlpha = Number.isFinite(opts.bgAlpha) ? opts.bgAlpha : 0.25;
    ctx.fillRect(0,0,w,h);
    ctx.restore();

    drawGrid(ctx, w, h, opts.grid || "rgba(255,255,255,0.06)");

    const vs = candles.map(c => num(c?.v)).map(v => v ?? 0);
    let vmax = Math.max(...vs);
    if (!Number.isFinite(vmax) || vmax <= 0) vmax = 1;

    const xAt = (i) => pad + (i/(candles.length-1))*iw;
    const yAtV = (v) => pad + (1 - (v / vmax))*ih;

    // bars
    const barW = Math.max(2, Math.floor(iw / candles.length) - 1);
    const barColor = opts.bar || "rgba(192,214,116,0.75)";

    ctx.save();
    ctx.fillStyle = barColor;

    for (let i=0;i<candles.length;i++){
      const v = vs[i];
      const x = xAt(i);
      const y = yAtV(v);
      const bh = (pad + ih) - y;
      ctx.fillRect(Math.floor(x - barW/2), Math.floor(y), barW, Math.ceil(bh));
    }
    ctx.restore();

    // faint close line overlay (optional)
    if (opts.priceLine) {
      const cs = candles.map(c => num(c?.c)).filter(Number.isFinite);
      if (cs.length >= 2) {
        const cmin = Math.min(...cs);
        const cmax = Math.max(...cs);
        const span = (cmax - cmin) || 1;
        const yAtC = (c) => pad + (1 - ((c - cmin)/span))*ih;

        ctx.beginPath();
        for (let i=0;i<candles.length;i++){
          const c = num(candles[i]?.c);
          const x = xAt(i), y = yAtC(c ?? cmin);
          if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        }
        ctx.lineWidth = 1.25;
        ctx.strokeStyle = opts.priceStroke || "rgba(230,164,43,0.55)";
        ctx.stroke();
      }
    }

    // border
    ctx.strokeStyle = opts.border || "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5,0.5,w-1,h-1);
  }

  W.ZZXPlotterVolume = W.ZZXPlotterVolume || {};
  W.ZZXPlotterVolume.drawVolume = drawVolume;
})();
