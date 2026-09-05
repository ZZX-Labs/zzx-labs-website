// __partials/widgets/high-low-24h/js/chart.js
// DPR-aware 24h high/low chart with volume overlay and extrema markers.
// Registers window.ZZXHighLow24Chart.

(function () {
  "use strict";

  const W = window;

  if (W.ZZXHighLow24Chart?.__version >= 1) return;

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

  function drawMarker(ctx, x, y, color, label, dpr, alignRight) {
    ctx.save();

    ctx.beginPath();
    ctx.arc(x, y, 3 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.font =
      `${Math.max(9, 9 * dpr)}px ` +
      `ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace`;

    ctx.textBaseline = "middle";
    ctx.textAlign = alignRight ? "right" : "left";

    const labelX =
      alignRight
        ? x - 6 * dpr
        : x + 6 * dpr;

    ctx.lineWidth = Math.max(2.5 * dpr, 2);
    ctx.strokeStyle = "rgba(5,5,5,.92)";
    ctx.fillStyle = color;

    ctx.strokeText(label, labelX, y);
    ctx.fillText(label, labelX, y);

    ctx.restore();
  }

  function draw(canvas, candles, metrics) {
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const series = (Array.isArray(candles) ? candles : [])
      .filter(candle =>
        Number.isFinite(number(candle?.c)) &&
        Number.isFinite(number(candle?.h)) &&
        Number.isFinite(number(candle?.l))
      );

    const { width: w, height: h, dpr } = sizeCanvas(canvas);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, w, h);

    if (series.length < 2) return;

    const padX = 9 * dpr;
    const padY = 9 * dpr;
    const innerW = Math.max(1, w - padX * 2);
    const innerH = Math.max(1, h - padY * 2);

    const lows = series.map(candle => number(candle.l));
    const highs = series.map(candle => number(candle.h));
    const closes = series.map(candle => number(candle.c));

    let minPrice = Math.min(...lows);
    let maxPrice = Math.max(...highs);

    if (maxPrice === minPrice) {
      maxPrice += 1;
      minPrice -= 1;
    }

    const priceSpan = maxPrice - minPrice;
    const xAt = index =>
      padX + (index / (series.length - 1)) * innerW;

    const yPrice = value =>
      padY + (1 - ((value - minPrice) / priceSpan)) * innerH;

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

    // Volume bars in lower 42% of the chart.
    const volumes = series.map(candle => {
      const v = number(candle.v);
      return Number.isFinite(v) && v > 0 ? v : 0;
    });

    const maxVolume = Math.max(...volumes, 1);
    const step = innerW / Math.max(1, series.length - 1);
    const barWidth = Math.max(1.4 * dpr, step * 0.48);
    const volumeBandHeight = innerH * 0.42;
    const baseY = padY + innerH;

    series.forEach((candle, index) => {
      const ratio = Math.min(1, volumes[index] / maxVolume);
      const barHeight = ratio * volumeBandHeight;
      const x = xAt(index) - barWidth / 2;
      const y = baseY - barHeight;

      ctx.fillStyle =
        number(candle.c) < number(candle.o)
          ? "rgba(214,116,116,.24)"
          : "rgba(192,214,116,.30)";

      ctx.fillRect(
        Math.floor(x),
        Math.floor(y),
        Math.ceil(barWidth),
        Math.max(1, Math.ceil(barHeight))
      );
    });

    // High-low envelope.
    ctx.beginPath();

    series.forEach((candle, index) => {
      const x = xAt(index);
      const y = yPrice(number(candle.h));

      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    for (let index = series.length - 1; index >= 0; index--) {
      ctx.lineTo(
        xAt(index),
        yPrice(number(series[index].l))
      );
    }

    ctx.closePath();
    ctx.fillStyle = "rgba(230,164,43,.055)";
    ctx.fill();

    // Close-price area.
    ctx.beginPath();
    ctx.moveTo(xAt(0), baseY);

    closes.forEach((close, index) => {
      ctx.lineTo(xAt(index), yPrice(close));
    });

    ctx.lineTo(xAt(closes.length - 1), baseY);
    ctx.closePath();
    ctx.fillStyle = "rgba(230,164,43,.06)";
    ctx.fill();

    // Close-price line.
    ctx.beginPath();

    closes.forEach((close, index) => {
      const x = xAt(index);
      const y = yPrice(close);

      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.strokeStyle = "#e6a42b";
    ctx.lineWidth = Math.max(1.5 * dpr, 1);
    ctx.stroke();

    // Extrema markers.
    const highIndex =
      Number.isInteger(metrics?.highIndex)
        ? metrics.highIndex
        : highs.indexOf(maxPrice);

    const lowIndex =
      Number.isInteger(metrics?.lowIndex)
        ? metrics.lowIndex
        : lows.indexOf(minPrice);

    if (highIndex >= 0 && highIndex < series.length) {
      drawMarker(
        ctx,
        xAt(highIndex),
        yPrice(number(series[highIndex].h)),
        "#e6a42b",
        "H",
        dpr,
        highIndex > series.length * 0.72
      );
    }

    if (lowIndex >= 0 && lowIndex < series.length) {
      drawMarker(
        ctx,
        xAt(lowIndex),
        yPrice(number(series[lowIndex].l)),
        "#d67474",
        "L",
        dpr,
        lowIndex > series.length * 0.72
      );
    }

    // Latest close marker.
    ctx.beginPath();
    ctx.arc(
      xAt(closes.length - 1),
      yPrice(closes[closes.length - 1]),
      2.6 * dpr,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = "#c0d674";
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,.07)";
    ctx.lineWidth = Math.max(1, dpr);
    ctx.strokeRect(
      0.5 * dpr,
      0.5 * dpr,
      w - dpr,
      h - dpr
    );
  }

  W.ZZXHighLow24Chart = {
    __version: 1,
    draw,
    clear,
    sizeCanvas
  };
})();
