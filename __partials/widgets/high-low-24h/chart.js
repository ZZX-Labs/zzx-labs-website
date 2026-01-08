// __partials/widgets/high-low-24h/chart.js
// DROP-IN (module)
// Orchestrates combined price + volume rendering.
// Exposes: window.ZZXHLChart.draw(canvas, candles, opts)

(function () {
  "use strict";

  const W = window;
  const NS = (W.ZZXHLChart = W.ZZXHLChart || {});

  NS.draw = function draw(canvas, candles, opts = {}){
    if (!canvas || !W.ZZXHLPlotter) return;

    const P = W.ZZXHLPlotter;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { w, h } = P.sizeCanvas(canvas);
    const pad = 10;

    P.drawBackground(ctx, w, h);

    const arr = Array.isArray(candles) ? candles : [];
    if (arr.length < 4){
      P.border(ctx, w, h);
      return;
    }

    // Use last 24 candles for “24h” plot
    const tail = arr.slice(-24);

    const price = tail.map(x => Number(x.c));
    const vol   = tail.map(x => Number(x.v));

    const projP = P.projectSeries(price, w, h, pad);
    const projV = P.projectSeries(vol,   w, h, pad);

    // Build points
    const ptsPrice = [];
    const xs = [];
    const ysVol = [];

    for (let i=0;i<tail.length;i++){
      const x = projP.xAt(i, tail.length);
      const yP = projP.yAt(price[i]);
      // volume projected into the same chart space, but we’ll compress it to lower band visually
      // by mapping volume y to a lower “floor” band.
      xs.push(x);
      ptsPrice.push({ x, y: yP });

      // volume band: bottom 55% of chart (visual separation)
      const bandTop = pad + (projP.ih * 0.55);
      const bandBot = pad + projP.ih;
      const vspan = (projV.mx - projV.mn) || 1;
      const vNorm = (vol[i] - projV.mn) / vspan;
      const yV = bandBot - (vNorm * (bandBot - bandTop));
      ysVol.push(yV);
    }

    const baseY = pad + projP.ih;

    // volume overlay first (so price sits above)
    const volColor = "rgba(106,169,42,0.30)";
    const volBar   = "rgba(106,169,42,0.55)";
    // subtle volume area + bars
    P.fillArea(ctx, xs.map((x,i)=>({x, y: ysVol[i]})), baseY, volColor);
    P.drawBars(ctx, xs, ysVol, baseY, volBar);

    // price area
    const priceFill = "rgba(230,164,43,0.10)";
    P.fillArea(ctx, ptsPrice, baseY, priceFill);

    // price line
    const priceLine = "rgba(230,164,43,0.95)";
    P.strokeLine(ctx, ptsPrice, priceLine, 2);

    // extrema markers
    const exP = P.findExtrema(price);
    const exV = P.findExtrema(vol);

    // Price hi/lo markers (orange / red)
    if (exP.hi.i >= 0){
      const x = xs[exP.hi.i];
      const y = ptsPrice[exP.hi.i].y;
      P.drawMarker(ctx, x, y, "#e6a42b", "H");
    }
    if (exP.lo.i >= 0){
      const x = xs[exP.lo.i];
      const y = ptsPrice[exP.lo.i].y;
      P.drawMarker(ctx, x, y, "#e05858", "L");
    }

    // Volume hi/lo markers (green / gray)
    if (exV.hi.i >= 0){
      const x = xs[exV.hi.i];
      const y = ysVol[exV.hi.i];
      P.drawMarker(ctx, x, y, "#6aa92a", "VH");
    }
    if (exV.lo.i >= 0){
      const x = xs[exV.lo.i];
      const y = ysVol[exV.lo.i];
      P.drawMarker(ctx, x, y, "#b7bf9a", "VL");
    }

    P.border(ctx, w, h);
  };
})();
