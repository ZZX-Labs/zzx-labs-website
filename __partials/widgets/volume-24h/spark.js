// __partials/widgets/volume-24h/spark.js
// DROP-IN (module)
// Tiny fallback spark for volumes.
// Exports: window.ZZXSparkVolume.drawBars(canvas, volumes, isUp)

(function () {
  "use strict";

  const W = window;
  const NS = (W.ZZXSparkVolume = W.ZZXSparkVolume || {});

  function sizeCanvas(canvas) {
    const dpr = W.devicePixelRatio || 1;
    const cssW = Math.max(1, Math.floor(canvas.clientWidth || 300));
    const cssH = Math.max(1, Math.floor(canvas.clientHeight || 92));
    const rw = Math.floor(cssW * dpr);
    const rh = Math.floor(cssH * dpr);
    if (canvas.width !== rw) canvas.width = rw;
    if (canvas.height !== rh) canvas.height = rh;
    return { w: rw, h: rh };
  }

  NS.drawBars = function drawBars(canvas, vols, isUp) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { w, h } = sizeCanvas(canvas);

    ctx.clearRect(0,0,w,h);

    // bg
    ctx.save();
    ctx.fillStyle = "#000";
    ctx.globalAlpha = 0.25;
    ctx.fillRect(0,0,w,h);
    ctx.restore();

    const arr = Array.isArray(vols) ? vols.map(Number).filter(Number.isFinite) : [];
    if (arr.length < 2) return;

    let vmax = Math.max(...arr);
    if (!Number.isFinite(vmax) || vmax <= 0) vmax = 1;

    const pad = 10;
    const iw = w - pad*2;
    const ih = h - pad*2;

    const barW = Math.max(2, Math.floor(iw / arr.length) - 1);
    const xAt = (i) => pad + (i/(arr.length-1))*iw;

    ctx.fillStyle = isUp ? "rgba(106,169,42,0.75)" : "rgba(224,88,88,0.65)";
    for (let i=0;i<arr.length;i++){
      const v = arr[i];
      const x = xAt(i);
      const y = pad + (1 - (v / vmax))*ih;
      ctx.fillRect(Math.floor(x - barW/2), Math.floor(y), barW, Math.ceil((pad+ih)-y));
    }

    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5,0.5,w-1,h-1);
  };
})();
