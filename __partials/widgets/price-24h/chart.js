// __partials/widgets/price-24h/chart.js
// Chart composition for 24h candles:
// - High/Low band + close line + last dot
// - Optional volume bars (disabled by default here, enabled later for high-low/volume widgets)

(function () {
  "use strict";

  const NS = (window.ZZXChart = window.ZZXChart || {});

  function finite(n) { return Number.isFinite(n); }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function themePrice24(deltaIsUp) {
    const t = window.ZZXTheme?.widgets?.price24 || {};
    return {
      bg: t.bg || "#000",
      washAlpha: finite(t.washAlpha) ? t.washAlpha : 0.22,
      grid: t.grid || "rgba(255,255,255,0.06)",
      border: t.border || "rgba(255,255,255,0.06)",
      band: t.band || "rgba(192,214,116,0.11)",
      line: deltaIsUp ? (t.up || "#6aa92a") : (t.down || "#e05858"),
      dot: t.dot || "#e6a42b",
      vol: t.vol || "rgba(106,169,42,0.22)",
      font: `12px ${getComputedStyle(document.documentElement).getPropertyValue("--zzx-font-mono").trim() || "IBMPlexMono"}`,
    };
  }

  // candles: [{t,o,h,l,c,v}]
  NS.drawPrice24 = function drawPrice24(canvas, candles, deltaIsUp, opts = {}) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const P = window.ZZXPlotter;
    if (!P?.sizeCanvas) return;

    const { w:W, h:H, r } = P.sizeCanvas(canvas, 96);

    const T = themePrice24(!!deltaIsUp);

    // Extract arrays
    const arr = Array.isArray(candles) ? candles : [];
    const pts = arr.filter(x => finite(x.h) && finite(x.l) && finite(x.c));
    if (pts.length < 2) {
      P.clear(ctx, W, H, T.bg, T.washAlpha);
      P.border(ctx, W, H, T.border);
      return;
    }

    const highs = pts.map(x => Number(x.h));
    const lows  = pts.map(x => Number(x.l));
    const closes= pts.map(x => Number(x.c));
    const vols  = pts.map(x => Number(x.v));

    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const span = (max - min) || 1;

    // Make the chart look less “flat”: add small padding
    const padPct = finite(opts.padPct) ? opts.padPct : 0.06; // 6% vertical padding
    const padVal = span * padPct;
    const yMin = min - padVal;
    const yMax = max + padVal;
    const ySpan = (yMax - yMin) || 1;

    // Layout (DPR-scaled)
    const pad = Math.floor(8 * r);
    const x0 = pad, x1 = W - pad;
    const y0 = pad, y1 = H - pad;

    const n = pts.length;
    const xAt = (i) => x0 + (i / (n - 1)) * (x1 - x0);
    const yAt = (v) => y0 + (1 - ((v - yMin) / ySpan)) * (y1 - y0);

    // Background
    P.clear(ctx, W, H, T.bg, T.washAlpha);

    // Grid (horizontal only, clean)
    const gridStep = Math.floor((y1 - y0) / 3) || Math.floor(20 * r);
    P.gridH(ctx, x0, x1, y0, y1, gridStep, T.grid);

    // Optional volume bars (off by default here)
    const drawVol = !!opts.volume;
    if (drawVol) {
      // reserve a small base region for volume
      const vTop = y0 + Math.floor((y1 - y0) * 0.62);
      const vBot = y1;
      P.volumeBars(ctx, xAt, vTop, vBot, vols, T.vol, Math.floor(10 * r));
    }

    // High/Low band
    P.bandHL(ctx, xAt, yAt, highs, lows, T.band);

    // Close line
    P.line(ctx, xAt, yAt, closes, T.line, Math.max(2, Math.floor(2 * r)));

    // Last close dot
    const lx = xAt(n - 1);
    const ly = yAt(closes[n - 1]);
    P.dot(ctx, lx, ly, Math.max(3, Math.floor(3.25 * r)), T.dot);

    // Border
    P.border(ctx, W, H, T.border);

    // Optional labels (min/max) — default off for now (keeps it clean)
    if (opts.labels) {
      const hi = Math.max(...highs);
      const lo = Math.min(...lows);
      const hiY = yAt(hi);
      const loY = yAt(lo);
      P.label(ctx, `H ${hi.toFixed(0)}`, x0 + 2, clamp(hiY - 6, y0 + 12, y1 - 2), "rgba(255,255,255,0.55)", T.font);
      P.label(ctx, `L ${lo.toFixed(0)}`, x0 + 2, clamp(loY - 6, y0 + 12, y1 - 2), "rgba(255,255,255,0.55)", T.font);
    }
  };
})();
