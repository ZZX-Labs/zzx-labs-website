// Shared full chart renderer for the matched 24h market widget family.

(function () {
  "use strict";

  const W = window;
  if (W.ZZXMarket24Plotter?.__version >= 3) return;

  const COLORS = Object.freeze({
    green: "#c0d674",
    red: "#d67474",
    gold: "#e6a42b",
    muted: "#b7bf9a",
    grid: "rgba(255,255,255,.055)",
    border: "rgba(255,255,255,.07)",
    bg: "#050505"
  });

  function number(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }

  function sizeCanvas(canvas) {
    const dpr = Math.max(1, number(W.devicePixelRatio) || 1);
    const cssWidth = Math.max(1, Math.floor(canvas.clientWidth || 320));
    const cssHeight = Math.max(1, Math.floor(canvas.clientHeight || 118));
    const width = Math.max(1, Math.floor(cssWidth * dpr));
    const height = Math.max(1, Math.floor(cssHeight * dpr));

    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    return { width, height, dpr };
  }

  function drawGrid(ctx, width, height, dpr) {
    ctx.save();
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = Math.max(1, dpr);

    for (let i = 1; i < 4; i++) {
      const y = (height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    for (let i = 1; i < 6; i++) {
      const x = (width / 6) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    ctx.restore();
  }

  function range(values, fallbackMin, fallbackMax) {
    const clean = values.map(number).filter(Number.isFinite);

    if (!clean.length) {
      return {
        min: fallbackMin ?? 0,
        max: fallbackMax ?? 1,
        span: (fallbackMax ?? 1) - (fallbackMin ?? 0) || 1
      };
    }

    let min = Math.min(...clean);
    let max = Math.max(...clean);

    if (min === max) {
      const bump = Math.max(1, Math.abs(max) * 0.001);
      min -= bump;
      max += bump;
    }

    return { min, max, span: max - min };
  }

  function findExtrema(values) {
    let high = { value: -Infinity, index: -1 };
    let low = { value: Infinity, index: -1 };

    values.forEach((raw, index) => {
      const value = number(raw);
      if (!Number.isFinite(value)) return;

      if (value > high.value) high = { value, index };
      if (value < low.value) low = { value, index };
    });

    return { high, low };
  }

  function marker(ctx, x, y, color, label, dpr, right) {
    ctx.save();

    ctx.beginPath();
    ctx.arc(x, y, 3 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    if (label) {
      ctx.font =
        `${Math.max(9, Math.round(9 * dpr))}px ` +
        `ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace`;

      ctx.textBaseline = "middle";
      ctx.textAlign = right ? "right" : "left";

      const labelX = right ? x - 6 * dpr : x + 6 * dpr;

      ctx.lineWidth = Math.max(2.5 * dpr, 2);
      ctx.strokeStyle = "rgba(5,5,5,.95)";
      ctx.fillStyle = color;

      ctx.strokeText(label, labelX, y);
      ctx.fillText(label, labelX, y);
    }

    ctx.restore();
  }

  function drawPriceSegments(ctx, candles, xAt, yPrice, dpr) {
    for (let i = 1; i < candles.length; i++) {
      const previous = number(candles[i - 1]?.c);
      const current = number(candles[i]?.c);

      if (!Number.isFinite(previous) || !Number.isFinite(current)) continue;

      ctx.beginPath();
      ctx.moveTo(xAt(i - 1), yPrice(previous));
      ctx.lineTo(xAt(i), yPrice(current));
      ctx.lineWidth = Math.max(1.6 * dpr, 1);
      ctx.strokeStyle = current >= previous ? COLORS.green : COLORS.red;
      ctx.stroke();
    }
  }

  function drawVolumeBars(ctx, candles, xAt, padY, innerHeight, dpr, bandScale) {
    const volumes = candles.map(c => Math.max(0, number(c?.v) || 0));
    const maxVolume = Math.max(...volumes, 1);
    const step =
      candles.length > 1
        ? xAt(1) - xAt(0)
        : 10 * dpr;

    const barWidth = Math.max(1.5 * dpr, step * 0.58);
    const bandHeight = innerHeight * (bandScale || 1);
    const baseY = padY + innerHeight;

    candles.forEach((candle, index) => {
      const volume = volumes[index];
      const previous =
        index > 0
          ? volumes[index - 1]
          : volume;

      const height =
        Math.min(1, volume / maxVolume) *
        bandHeight;

      const x =
        xAt(index) -
        barWidth / 2;

      const y =
        baseY -
        height;

      ctx.fillStyle =
        volume >= previous
          ? "rgba(192,214,116,.72)"
          : "rgba(214,116,116,.70)";

      ctx.fillRect(
        Math.floor(x),
        Math.floor(y),
        Math.ceil(barWidth),
        Math.max(1, Math.ceil(height))
      );
    });

    return { volumes, maxVolume, baseY, bandHeight };
  }

  function draw(canvas, kind, model) {
    if (!canvas || !model?.candles?.length) return false;

    const ctx = canvas.getContext("2d");
    if (!ctx) return false;

    const candles = model.candles;
    const { width, height, dpr } = sizeCanvas(canvas);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);
    drawGrid(ctx, width, height, dpr);

    const padX = 10 * dpr;
    const padY = 9 * dpr;
    const innerWidth = Math.max(1, width - padX * 2);
    const innerHeight = Math.max(1, height - padY * 2);

    const xAt = index =>
      candles.length <= 1
        ? padX + innerWidth / 2
        : padX + (index / (candles.length - 1)) * innerWidth;

    const lows = candles.map(c => number(c?.l));
    const highs = candles.map(c => number(c?.h));
    const closes = candles.map(c => number(c?.c));
    const prices = range(lows.concat(highs));

    const yPrice = value =>
      padY +
      (1 - ((value - prices.min) / prices.span)) *
      innerHeight;

    if (kind === "price") {
      ctx.beginPath();
      ctx.moveTo(xAt(0), padY + innerHeight);

      closes.forEach((close, index) => {
        if (Number.isFinite(close)) ctx.lineTo(xAt(index), yPrice(close));
      });

      ctx.lineTo(xAt(candles.length - 1), padY + innerHeight);
      ctx.closePath();

      const first = closes.find(Number.isFinite);
      const last = [...closes].reverse().find(Number.isFinite);

      ctx.fillStyle =
        Number.isFinite(first) &&
        Number.isFinite(last) &&
        last < first
          ? "rgba(214,116,116,.075)"
          : "rgba(192,214,116,.075)";

      ctx.fill();
      drawPriceSegments(ctx, candles, xAt, yPrice, dpr);

      const hi = findExtrema(highs).high;
      const lo = findExtrema(lows).low;

      if (hi.index >= 0) {
        marker(
          ctx,
          xAt(hi.index),
          yPrice(hi.value),
          COLORS.gold,
          "H",
          dpr,
          hi.index > candles.length * .72
        );
      }

      if (lo.index >= 0) {
        marker(
          ctx,
          xAt(lo.index),
          yPrice(lo.value),
          COLORS.red,
          "L",
          dpr,
          lo.index > candles.length * .72
        );
      }
    }

    if (kind === "volume") {
      const volume = drawVolumeBars(
        ctx,
        candles,
        xAt,
        padY,
        innerHeight,
        dpr,
        1
      );

      const ext = findExtrema(volume.volumes);

      if (ext.high.index >= 0) {
        const y =
          Math.min(
            volume.baseY - 4 * dpr,
            Math.max(
              padY + 4 * dpr,
              volume.baseY -
              (ext.high.value / volume.maxVolume) *
              volume.bandHeight
            )
          );

        marker(
          ctx,
          xAt(ext.high.index),
          y,
          COLORS.gold,
          "H",
          dpr,
          ext.high.index > candles.length * .72
        );
      }

      if (ext.low.index >= 0) {
        const y =
          Math.min(
            volume.baseY - 4 * dpr,
            Math.max(
              padY + 4 * dpr,
              volume.baseY -
              (ext.low.value / volume.maxVolume) *
              volume.bandHeight
            )
          );

        marker(
          ctx,
          xAt(ext.low.index),
          y,
          COLORS.muted,
          "L",
          dpr,
          ext.low.index > candles.length * .72
        );
      }
    }

    if (kind === "combo") {
      const volume = drawVolumeBars(
        ctx,
        candles,
        xAt,
        padY,
        innerHeight,
        dpr,
        .38
      );

      drawPriceSegments(
        ctx,
        candles,
        xAt,
        yPrice,
        dpr
      );

      const priceHigh = findExtrema(highs).high;
      const priceLow = findExtrema(lows).low;
      const volumeExt = findExtrema(volume.volumes);

      if (priceHigh.index >= 0) {
        marker(
          ctx,
          xAt(priceHigh.index),
          yPrice(priceHigh.value),
          COLORS.gold,
          "P-H",
          dpr,
          priceHigh.index > candles.length * .72
        );
      }

      if (priceLow.index >= 0) {
        marker(
          ctx,
          xAt(priceLow.index),
          yPrice(priceLow.value),
          COLORS.red,
          "P-L",
          dpr,
          priceLow.index > candles.length * .72
        );
      }

      if (volumeExt.high.index >= 0) {
        const y =
          Math.min(
            volume.baseY - 4 * dpr,
            Math.max(
              padY + 4 * dpr,
              volume.baseY -
              (volumeExt.high.value / volume.maxVolume) *
              volume.bandHeight
            )
          );

        marker(
          ctx,
          xAt(volumeExt.high.index),
          y,
          COLORS.green,
          "V-H",
          dpr,
          volumeExt.high.index > candles.length * .72
        );
      }

      if (volumeExt.low.index >= 0) {
        const y =
          Math.min(
            volume.baseY - 4 * dpr,
            Math.max(
              padY + 4 * dpr,
              volume.baseY -
              (volumeExt.low.value / volume.maxVolume) *
              volume.bandHeight
            )
          );

        marker(
          ctx,
          xAt(volumeExt.low.index),
          y,
          COLORS.muted,
          "V-L",
          dpr,
          volumeExt.low.index > candles.length * .72
        );
      }
    }

    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = Math.max(1, dpr);
    ctx.strokeRect(
      .5 * dpr,
      .5 * dpr,
      width - dpr,
      height - dpr
    );

    return true;
  }

  W.ZZXMarket24Plotter = {
    __version: 3,
    COLORS,
    draw,
    sizeCanvas,
    findExtrema
  };
})();
