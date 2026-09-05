// __partials/widgets/price-24h/js/chart.js
// Compact DPR-aware 24h price chart.
// Registers window.ZZXPrice24Chart.

(function () {
  "use strict";

  const W = window;

  if (W.ZZXPrice24Chart?.__version >= 1) return;

  function number(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }

  function sizeCanvas(canvas) {
    const dpr = Math.max(1, number(W.devicePixelRatio) || 1);
    const cssWidth = Math.max(1, Math.floor(canvas.clientWidth || 320));
    const cssHeight = Math.max(1, Math.floor(canvas.clientHeight || 112));

    const width = Math.max(1, Math.floor(cssWidth * dpr));
    const height = Math.max(1, Math.floor(cssHeight * dpr));

    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    return { width, height, dpr };
  }

  function clear(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    sizeCanvas(canvas);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function draw(canvas, candles, tone) {
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const series = (Array.isArray(candles) ? candles : [])
      .filter(c => Number.isFinite(number(c?.c)));

    const { width: w, height: h, dpr } = sizeCanvas(canvas);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, w, h);

    if (series.length < 2) return;

    const closes = series.map(c => number(c.c));
    const lows = series.map(c => Number.isFinite(number(c.l)) ? number(c.l) : number(c.c));
    const highs = series.map(c => Number.isFinite(number(c.h)) ? number(c.h) : number(c.c));

    let lo = Math.min(...lows);
    let hi = Math.max(...highs);

    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return;

    if (hi === lo) {
      const bump = Math.max(1, Math.abs(hi) * 0.001);
      hi += bump;
      lo -= bump;
    }

    const padX = 8 * dpr;
    const padY = 8 * dpr;
    const innerW = Math.max(1, w - padX * 2);
    const innerH = Math.max(1, h - padY * 2);
    const span = hi - lo;

    const xAt = index =>
      padX + (index / (series.length - 1)) * innerW;

    const yAt = value =>
      padY + (1 - ((value - lo) / span)) * innerH;

    // Grid.
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,.055)";
    ctx.lineWidth = Math.max(1, dpr);

    for (let i = 1; i < 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    for (let i = 1; i < 6; i++) {
      const x = (w / 6) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.restore();

    // High/low band.
    ctx.beginPath();

    series.forEach((candle, index) => {
      const x = xAt(index);
      const y = yAt(
        Number.isFinite(number(candle.h))
          ? number(candle.h)
          : number(candle.c)
      );

      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    for (let index = series.length - 1; index >= 0; index--) {
      const candle = series[index];
      ctx.lineTo(
        xAt(index),
        yAt(
          Number.isFinite(number(candle.l))
            ? number(candle.l)
            : number(candle.c)
        )
      );
    }

    ctx.closePath();
    ctx.fillStyle = "rgba(192,214,116,.075)";
    ctx.fill();

    // Close-price area.
    ctx.beginPath();
    ctx.moveTo(xAt(0), h - padY);

    closes.forEach((close, index) => {
      ctx.lineTo(xAt(index), yAt(close));
    });

    ctx.lineTo(xAt(closes.length - 1), h - padY);
    ctx.closePath();

    ctx.fillStyle =
      tone === "down"
        ? "rgba(214,116,116,.07)"
        : "rgba(192,214,116,.07)";

    ctx.fill();

    // Close-price line.
    ctx.beginPath();

    closes.forEach((close, index) => {
      const x = xAt(index);
      const y = yAt(close);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.strokeStyle =
      tone === "down"
        ? "#d67474"
        : tone === "flat"
          ? "#b7bf9a"
          : "#c0d674";

    ctx.lineWidth = Math.max(1.5 * dpr, 1);
    ctx.stroke();

    // Start marker.
    ctx.beginPath();
    ctx.arc(xAt(0), yAt(closes[0]), 2.3 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = "#777";
    ctx.fill();

    // Latest marker.
    ctx.beginPath();
    ctx.arc(
      xAt(closes.length - 1),
      yAt(closes[closes.length - 1]),
      2.8 * dpr,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = "#e6a42b";
    ctx.fill();

    // Border.
    ctx.strokeStyle = "rgba(255,255,255,.07)";
    ctx.lineWidth = Math.max(1, dpr);
    ctx.strokeRect(
      0.5 * dpr,
      0.5 * dpr,
      w - dpr,
      h - dpr
    );
  }

  W.ZZXPrice24Chart = {
    __version: 1,
    draw,
    clear,
    sizeCanvas
  };
})();
