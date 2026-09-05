// __partials/widgets/volume-24h/js/chart.js
// DPR-aware 24h volume bars with a faint normalized price guide.
// Registers window.ZZXVolume24Chart.

(function () {
  "use strict";

  const W = window;

  if (W.ZZXVolume24Chart?.__version >= 1) return;

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

  function draw(canvas, candles) {
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const series = (Array.isArray(candles) ? candles : [])
      .filter(candle =>
        Number.isFinite(number(candle?.v)) &&
        Number.isFinite(number(candle?.c))
      );

    const { width: w, height: h, dpr } = sizeCanvas(canvas);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, w, h);

    if (!series.length) return;

    const padX = 8 * dpr;
    const padY = 8 * dpr;
    const innerW = Math.max(1, w - padX * 2);
    const innerH = Math.max(1, h - padY * 2);

    const volumes = series.map(candle => Math.max(0, number(candle.v)));
    const maxVolume = Math.max(...volumes, 1);

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

    // Volume bars.
    const step = innerW / Math.max(1, series.length);
    const barWidth = Math.max(1.5 * dpr, step * 0.62);

    series.forEach((candle, index) => {
      const volume = Math.max(0, number(candle.v));
      const ratio = Math.min(1, volume / maxVolume);
      const barHeight = ratio * innerH;

      const x = padX + index * step + (step - barWidth) / 2;
      const y = padY + innerH - barHeight;

      const open = number(candle.o);
      const close = number(candle.c);

      ctx.fillStyle =
        close < open
          ? "rgba(214,116,116,.72)"
          : "rgba(192,214,116,.72)";

      ctx.fillRect(
        Math.floor(x),
        Math.floor(y),
        Math.ceil(barWidth),
        Math.max(1, Math.ceil(barHeight))
      );
    });

    // Faint price guide, independently normalized.
    if (series.length >= 2) {
      const closes = series.map(candle => number(candle.c));
      let minClose = Math.min(...closes);
      let maxClose = Math.max(...closes);

      if (maxClose === minClose) {
        maxClose += 1;
        minClose -= 1;
      }

      const closeSpan = maxClose - minClose;

      ctx.beginPath();

      closes.forEach((close, index) => {
        const x =
          padX +
          index * step +
          step / 2;

        const y =
          padY +
          (1 - ((close - minClose) / closeSpan)) *
          innerH;

        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });

      ctx.strokeStyle = "rgba(230,164,43,.52)";
      ctx.lineWidth = Math.max(1.1 * dpr, 1);
      ctx.stroke();
    }

    // Peak marker.
    const peakIndex = volumes.indexOf(maxVolume);

    if (peakIndex >= 0) {
      const x =
        padX +
        peakIndex * step +
        step / 2;

      const y = padY + 3 * dpr;

      ctx.beginPath();
      ctx.arc(x, y, 2.4 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = "#e6a42b";
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(255,255,255,.07)";
    ctx.lineWidth = Math.max(1, dpr);
    ctx.strokeRect(
      0.5 * dpr,
      0.5 * dpr,
      w - dpr,
      h - dpr
    );
  }

  W.ZZXVolume24Chart = {
    __version: 1,
    draw,
    clear,
    sizeCanvas
  };
})();
