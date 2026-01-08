// __partials/widgets/high-low-24h/plotter.js
// DROP-IN (module)
// Low-level drawing helpers.
// Exposes: window.ZZXHLPlotter

(function () {
  "use strict";

  const W = window;
  const NS = (W.ZZXHLPlotter = W.ZZXHLPlotter || {});

  function sizeCanvas(canvas){
    const dpr = W.devicePixelRatio || 1;
    const cssW = Math.max(1, Math.floor(canvas.clientWidth || 320));
    const cssH = Math.max(1, Math.floor(canvas.clientHeight || 92));
    const w = Math.floor(cssW * dpr);
    const h = Math.floor(cssH * dpr);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    return { w, h, dpr };
  }

  function minmax(arr){
    let mn = Infinity, mx = -Infinity;
    for (const v of arr){
      if (!Number.isFinite(v)) continue;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    if (!Number.isFinite(mn) || !Number.isFinite(mx)) return { mn:0, mx:1 };
    if (mn === mx) return { mn, mx: mn + 1 };
    return { mn, mx };
  }

  NS.sizeCanvas = sizeCanvas;

  NS.drawBackground = function drawBackground(ctx, w, h){
    ctx.clearRect(0,0,w,h);
    ctx.save();
    ctx.fillStyle = "#000";
    ctx.globalAlpha = 0.20;
    ctx.fillRect(0,0,w,h);
    ctx.restore();

    // subtle horizontal rules
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let i=1;i<=3;i++){
      const y = Math.round((h/4)*i) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();
  };

  NS.projectSeries = function projectSeries(values, w, h, pad){
    const { mn, mx } = minmax(values);
    const span = (mx - mn) || 1;
    const iw = w - pad*2;
    const ih = h - pad*2;

    const xAt = (i, n) => pad + (i / Math.max(1, n-1)) * iw;
    const yAt = (v) => pad + (1 - ((v - mn) / span)) * ih;

    return { mn, mx, xAt, yAt, iw, ih };
  };

  NS.findExtrema = function findExtrema(values){
    let hi = { v:-Infinity, i:-1 };
    let lo = { v: Infinity, i:-1 };
    for (let i=0;i<values.length;i++){
      const v = values[i];
      if (!Number.isFinite(v)) continue;
      if (v > hi.v){ hi = { v, i }; }
      if (v < lo.v){ lo = { v, i }; }
    }
    return { hi, lo };
  };

  NS.drawMarker = function drawMarker(ctx, x, y, color, label){
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 3.25, 0, Math.PI*2);
    ctx.fill();

    if (label){
      ctx.font = `12px ${getComputedStyle(document.documentElement).getPropertyValue("--zzx-font-mono") || "IBMPlexMono"}`;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = 3;
      ctx.strokeText(label, x + 6, y - 6);
      ctx.fillText(label, x + 6, y - 6);
    }
    ctx.restore();
  };

  NS.strokeLine = function strokeLine(ctx, pts, color, width){
    ctx.save();
    ctx.lineWidth = width || 2;
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let i=0;i<pts.length;i++){
      const p = pts[i];
      if (!p) continue;
      if (i===0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  };

  NS.fillArea = function fillArea(ctx, pts, baseY, color){
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, baseY);
    for (let i=0;i<pts.length;i++){
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.lineTo(pts[pts.length-1].x, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  NS.drawBars = function drawBars(ctx, xs, heights, baseY, color){
    ctx.save();
    ctx.fillStyle = color;
    const n = xs.length;
    const barW = Math.max(2, Math.floor((xs[n-1] - xs[0]) / Math.max(8, n)) );
    for (let i=0;i<n;i++){
      const x = xs[i];
      const y = heights[i];
      const h = Math.max(1, baseY - y);
      ctx.fillRect(Math.floor(x - barW/2), Math.floor(y), barW, Math.floor(h));
    }
    ctx.restore();
  };

  NS.border = function border(ctx, w, h){
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5,0.5,w-1,h-1);
    ctx.restore();
  };
})();
