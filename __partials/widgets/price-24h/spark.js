// __partials/widgets/price-24h/spark.js
// Tiny spark renderer: price line + subtle area fill, DPR-aware.

(function () {
  "use strict";

  const NS = (window.ZZXSpark = window.ZZXSpark || {});

  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

  NS.sizeCanvas = function sizeCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(canvas.clientWidth || 300));
    const h = Math.max(1, Math.floor(canvas.clientHeight || 90));
    const rw = Math.floor(w * dpr);
    const rh = Math.floor(h * dpr);
    if (canvas.width !== rw) canvas.width = rw;
    if (canvas.height !== rh) canvas.height = rh;
    return { w: rw, h: rh, dpr };
  };

  NS.drawPrice = function drawPrice(canvas, closes, deltaIsUp) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { w, h } = NS.sizeCanvas(canvas);

    ctx.clearRect(0,0,w,h);

    // background
    ctx.fillStyle = "#000";
    ctx.globalAlpha = 0.25;
    ctx.fillRect(0,0,w,h);
    ctx.globalAlpha = 1;

    const arr = Array.isArray(closes) ? closes.filter(Number.isFinite) : [];
    if (arr.length < 2) return;

    const min = Math.min(...arr);
    const max = Math.max(...arr);
    const span = (max - min) || 1;

    const pad = 8;
    const iw = w - pad*2;
    const ih = h - pad*2;

    const xAt = (i) => pad + (i/(arr.length-1))*iw;
    const yAt = (v) => pad + (1 - ((v - min)/span))*ih;

    // area fill
    ctx.beginPath();
    ctx.moveTo(xAt(0), h - pad);
    for (let i=0;i<arr.length;i++){
      ctx.lineTo(xAt(i), yAt(arr[i]));
    }
    ctx.lineTo(xAt(arr.length-1), h - pad);
    ctx.closePath();
    ctx.fillStyle = "rgba(192,214,116,0.10)";
    ctx.fill();

    // line
    ctx.beginPath();
    for (let i=0;i<arr.length;i++){
      const x = xAt(i), y = yAt(arr[i]);
      if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = deltaIsUp ? "#6aa92a" : "#e05858";
    ctx.stroke();

    // end dot
    const lx = xAt(arr.length-1);
    const ly = yAt(arr[arr.length-1]);
    ctx.beginPath();
    ctx.arc(lx, ly, 3.25, 0, Math.PI*2);
    ctx.fillStyle = "#e6a42b";
    ctx.fill();

    // subtle border
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5,0.5,w-1,h-1);
  };
})();
