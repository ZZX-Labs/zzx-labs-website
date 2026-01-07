// __partials/widgets/price-24h/plotter.js
// DPR-aware plotter for 24h price candles: High/Low band + close line

(function () {
  "use strict";

  const NS = (window.ZZXPlotter = window.ZZXPlotter || {});

  function sizeCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(1, Math.floor(canvas.clientWidth || 300));
    const cssH = Math.max(1, Math.floor(canvas.clientHeight || 96));
    const w = Math.floor(cssW * dpr);
    const h = Math.floor(cssH * dpr);

    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    return { w, h, dpr };
  }

  function finite(n){ return Number.isFinite(n); }

  NS.drawHL = function drawHL(canvas, candles, deltaIsUp) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { w, h } = sizeCanvas(canvas);

    ctx.clearRect(0, 0, w, h);

    // Theme hook
    const theme = window.ZZXTheme?.widgets?.price24 || {};
    const bg = theme.bg || "#000";
    const grid = theme.grid || "rgba(255,255,255,0.06)";
    const band = theme.band || "rgba(192,214,116,0.10)";
    const line = deltaIsUp ? (theme.up || "#6aa92a") : (theme.down || "#e05858");
    const dot  = theme.dot || "#e6a42b";

    // background wash
    ctx.fillStyle = bg;
    ctx.globalAlpha = 0.20;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;

    const arr = Array.isArray(candles) ? candles : [];
    const pts = arr.filter(x => finite(x.h) && finite(x.l) && finite(x.c));
    if (pts.length < 2) return;

    const highs = pts.map(x => x.h);
    const lows  = pts.map(x => x.l);

    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const span = (max - min) || 1;

    const pad = Math.floor(8 * (window.devicePixelRatio || 1));
    const iw = w - pad * 2;
    const ih = h - pad * 2;

    const xAt = (i) => pad + (i / (pts.length - 1)) * iw;
    const yAt = (v) => pad + (1 - ((v - min) / span)) * ih;

    // subtle grid
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    for (let y = pad; y < h - pad; y += Math.floor(24 * (window.devicePixelRatio || 1))) {
      ctx.beginPath();
      ctx.moveTo(pad, y + 0.5);
      ctx.lineTo(w - pad, y + 0.5);
      ctx.stroke();
    }

    // High/Low band
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      ctx.lineTo(xAt(i), yAt(pts[i].h));
    }
    for (let i = pts.length - 1; i >= 0; i--) {
      ctx.lineTo(xAt(i), yAt(pts[i].l));
    }
    ctx.closePath();
    ctx.fillStyle = band;
    ctx.fill();

    // Close line
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const x = xAt(i);
      const y = yAt(pts[i].c);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = line;
    ctx.lineWidth = Math.max(2, Math.floor(2 * (window.devicePixelRatio || 1)));
    ctx.stroke();

    // last dot
    const last = pts[pts.length - 1];
    const lx = xAt(pts.length - 1);
    const ly = yAt(last.c);
    ctx.beginPath();
    ctx.arc(lx, ly, Math.max(3, Math.floor(3.25 * (window.devicePixelRatio || 1))), 0, Math.PI * 2);
    ctx.fillStyle = dot;
    ctx.fill();

    // border
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  };
})();
