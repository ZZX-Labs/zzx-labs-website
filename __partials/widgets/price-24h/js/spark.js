// Shared fallback renderer for the matched 24h market widget family.
// v3 preserves up/down colors and H/L semantics if the full plotter fails.

(function () {
  "use strict";

  const W = window;

  if (W.ZZXMarket24Spark?.__version >= 3) return;

  const GREEN = "#c0d674";
  const RED = "#d67474";
  const GOLD = "#e6a42b";
  const MUTED = "#b7bf9a";

  function number(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }

  function size(canvas) {
    const dpr =
      Math.max(
        1,
        number(
          W.devicePixelRatio
        ) || 1
      );

    const cssW =
      Math.max(
        1,
        Math.floor(
          canvas.clientWidth || 320
        )
      );

    const cssH =
      Math.max(
        1,
        Math.floor(
          canvas.clientHeight || 118
        )
      );

    const w =
      Math.max(
        1,
        Math.floor(cssW * dpr)
      );

    const h =
      Math.max(
        1,
        Math.floor(cssH * dpr)
      );

    if (canvas.width !== w) {
      canvas.width = w;
    }

    if (canvas.height !== h) {
      canvas.height = h;
    }

    return { w, h, dpr };
  }

  function extrema(values) {
    let high =
      {
        value: -Infinity,
        index: -1
      };

    let low =
      {
        value: Infinity,
        index: -1
      };

    values.forEach(
      (raw, index) => {
        const value =
          number(raw);

        if (!Number.isFinite(value)) {
          return;
        }

        if (value > high.value) {
          high = { value, index };
        }

        if (value < low.value) {
          low = { value, index };
        }
      }
    );

    return { high, low };
  }

  function dot(
    ctx,
    x,
    y,
    color,
    dpr
  ) {
    ctx.beginPath();
    ctx.arc(
      x,
      y,
      2.7 * dpr,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = color;
    ctx.fill();
  }

  function draw(
    canvas,
    kind,
    model
  ) {
    if (!canvas) return false;

    const ctx =
      canvas.getContext("2d");

    if (!ctx) return false;

    const candles =
      Array.isArray(
        model?.candles
      )
        ? model.candles
        : [];

    const {
      w,
      h,
      dpr
    } = size(canvas);

    ctx.clearRect(
      0,
      0,
      w,
      h
    );

    ctx.fillStyle =
      "#050505";

    ctx.fillRect(
      0,
      0,
      w,
      h
    );

    if (candles.length < 2) {
      return true;
    }

    const pad =
      8 * dpr;

    const iw =
      Math.max(
        1,
        w - pad * 2
      );

    const ih =
      Math.max(
        1,
        h - pad * 2
      );

    const xAt =
      index =>
        pad +
        (
          index /
          Math.max(
            1,
            candles.length - 1
          )
        ) *
        iw;

    let priceGeometry = null;

    if (
      kind === "price" ||
      kind === "combo"
    ) {
      const closes =
        candles.map(
          candle =>
            number(candle?.c)
        );

      const highs =
        candles.map(
          candle =>
            number(candle?.h)
        );

      const lows =
        candles.map(
          candle =>
            number(candle?.l)
        );

      const cleanRange =
        highs
          .concat(lows)
          .filter(Number.isFinite);

      let lo =
        Math.min(...cleanRange);

      let hi =
        Math.max(...cleanRange);

      if (
        !Number.isFinite(lo) ||
        !Number.isFinite(hi)
      ) {
        lo = 0;
        hi = 1;
      }

      if (lo === hi) {
        lo -= 1;
        hi += 1;
      }

      const yAt =
        value =>
          pad +
          (
            1 -
            (
              (
                value - lo
              ) /
              (hi - lo)
            )
          ) *
          ih;

      for (
        let i = 1;
        i < candles.length;
        i++
      ) {
        const a =
          closes[i - 1];

        const b =
          closes[i];

        if (
          !Number.isFinite(a) ||
          !Number.isFinite(b)
        ) {
          continue;
        }

        ctx.beginPath();
        ctx.moveTo(
          xAt(i - 1),
          yAt(a)
        );
        ctx.lineTo(
          xAt(i),
          yAt(b)
        );

        ctx.strokeStyle =
          b >= a
            ? GREEN
            : RED;

        ctx.lineWidth =
          Math.max(
            1.5 * dpr,
            1
          );

        ctx.stroke();
      }

      const high =
        extrema(highs).high;

      const low =
        extrema(lows).low;

      if (high.index >= 0) {
        dot(
          ctx,
          xAt(high.index),
          yAt(high.value),
          GOLD,
          dpr
        );
      }

      if (low.index >= 0) {
        dot(
          ctx,
          xAt(low.index),
          yAt(low.value),
          RED,
          dpr
        );
      }

      priceGeometry = {
        yAt
      };
    }

    if (
      kind === "volume" ||
      kind === "combo"
    ) {
      const volumes =
        candles.map(
          candle =>
            Math.max(
              0,
              number(candle?.v) || 0
            )
        );

      const vmax =
        Math.max(
          ...volumes,
          1
        );

      const band =
        kind === "combo"
          ? ih * .36
          : ih;

      const base =
        pad + ih;

      const step =
        iw /
        Math.max(
          1,
          candles.length
        );

      const barW =
        Math.max(
          1,
          step * .55
        );

      candles.forEach(
        (candle, i) => {
          const v =
            volumes[i];

          const previous =
            i > 0
              ? volumes[i - 1]
              : v;

          const bh =
            (v / vmax) *
            band;

          ctx.fillStyle =
            v >= previous
              ? "rgba(192,214,116,.66)"
              : "rgba(214,116,116,.64)";

          ctx.fillRect(
            pad +
            i * step +
            (
              step - barW
            ) /
            2,
            base - bh,
            barW,
            bh
          );
        }
      );

      const ext =
        extrema(volumes);

      if (
        kind === "volume" &&
        ext.high.index >= 0
      ) {
        dot(
          ctx,
          pad +
          ext.high.index * step +
          step / 2,
          Math.min(
            base - 3 * dpr,
            Math.max(
              pad + 3 * dpr,
              base -
              (
                ext.high.value /
                vmax
              ) *
              band
            )
          ),
          GOLD,
          dpr
        );
      }

      if (
        kind === "volume" &&
        ext.low.index >= 0
      ) {
        dot(
          ctx,
          pad +
          ext.low.index * step +
          step / 2,
          Math.min(
            base - 3 * dpr,
            Math.max(
              pad + 3 * dpr,
              base -
              (
                ext.low.value /
                vmax
              ) *
              band
            )
          ),
          MUTED,
          dpr
        );
      }

      if (
        kind === "combo" &&
        ext.high.index >= 0
      ) {
        dot(
          ctx,
          pad +
          ext.high.index * step +
          step / 2,
          Math.min(
            base - 3 * dpr,
            Math.max(
              pad + 3 * dpr,
              base -
              (
                ext.high.value /
                vmax
              ) *
              band
            )
          ),
          GREEN,
          dpr
        );
      }

      if (
        kind === "combo" &&
        ext.low.index >= 0
      ) {
        dot(
          ctx,
          pad +
          ext.low.index * step +
          step / 2,
          Math.min(
            base - 3 * dpr,
            Math.max(
              pad + 3 * dpr,
              base -
              (
                ext.low.value /
                vmax
              ) *
              band
            )
          ),
          MUTED,
          dpr
        );
      }
    }

    ctx.strokeStyle =
      "rgba(255,255,255,.07)";

    ctx.lineWidth =
      Math.max(
        1,
        dpr
      );

    ctx.strokeRect(
      .5 * dpr,
      .5 * dpr,
      w - dpr,
      h - dpr
    );

    return true;
  }

  W.ZZXMarket24Spark = {
    __version: 3,
    draw,
    size,
    extrema
  };
})();
