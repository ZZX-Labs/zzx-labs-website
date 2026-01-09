// __partials/widgets/mempool-specs/renderer.js
// DROP-IN COMPLETE REPLACEMENT
//
// Purpose:
// - Render SQUARE tiles (side x side, in grid cells) to canvas using the Grid metrics.
// - This replaces the older Plotter for the "tile field" look, but keeps compatibility:
//     renderer.draw(ctx, canvas, grid, layout, meta)
//
// Layout contract (from binfill/tetrifill):
//   layout = { placed:[{ txid, feeRate, vbytes, side, x, y, ... }], cols, rows }
//
// Color:
// - Uses Theme.colorForFeeRate(feeRate) to color tiles.
// - Optional: subtle alpha/outline + a tiny “heat” overlay for high fee.
//
// Exposes:
//   window.ZZXMempoolSpecs.Renderer.draw(...)
(function () {
  "use strict";

  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});
  const API = (NS.Renderer = NS.Renderer || {});

  function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }

  function getTheme() {
    return (NS.Theme?.get?.() || {
      canvasBg: "#000",
      border: "#e6a42b",
      text: "#c0d674",
      muted: "rgba(192,214,116,0.75)",
      gridLine: "rgba(255,255,255,0.06)",
      tileOutline: "rgba(0,0,0,0.35)",
    });
  }

  function colorForFee(feeRate, theme) {
    const fn = NS.Theme?.colorForFeeRate;
    if (typeof fn === "function") return fn(feeRate, theme);
    return "#3a3a3a";
  }

  function drawFrame(ctx, canvas, grid, theme) {
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // bg
    ctx.fillStyle = theme.canvasBg || "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // border frame
    ctx.strokeStyle = theme.border || "#e6a42b";
    ctx.lineWidth = Math.max(2, Math.round(3 * (grid.dpr || 1)));
    const inset = Math.round(2 * (grid.dpr || 1));
    ctx.strokeRect(inset, inset, canvas.width - inset * 2, canvas.height - inset * 2);

    // subtle guide stripes (not full grid; keeps it fast)
    ctx.strokeStyle = theme.gridLine || "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;

    const stepStripeY = Math.max(26, Math.round(30 * (grid.dpr || 1)));
    const stepStripeX = Math.max(38, Math.round(46 * (grid.dpr || 1)));

    for (let y = grid.y0; y < canvas.height - grid.padPx; y += stepStripeY) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(canvas.width, y + 0.5);
      ctx.stroke();
    }
    for (let x = grid.x0; x < canvas.width - grid.padPx; x += stepStripeX) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, canvas.height);
      ctx.stroke();
    }

    ctx.restore();
  }

  function cellRectPx(grid, x, y, side) {
    const sx = grid.x0 + x * grid.step;
    const sy = grid.y0 + y * grid.step;

    // side cells occupy: side*cellPx + (side-1)*gapPx
    const px = (side * grid.cellPx) + (Math.max(0, side - 1) * grid.gapPx);
    return { x: sx, y: sy, w: px, h: px };
  }

  function drawTiles(ctx, canvas, grid, layout, theme) {
    const placed = (layout && Array.isArray(layout.placed)) ? layout.placed : [];
    if (!placed.length) return;

    const outline = theme.tileOutline || "rgba(0,0,0,0.35)";
    const dpr = grid.dpr || 1;

    // render order: draw big first, small last (avoids “small hidden under big” when animating)
    const arr = placed.slice().sort((a,b) => (Number(b.side)||1) - (Number(a.side)||1));

    for (const t of arr) {
      const side = clamp(Math.floor(Number(t.side) || 1), 1, 999);
      const x = Math.floor(Number(t.x) || 0);
      const y = Math.floor(Number(t.y) || 0);

      const r = cellRectPx(grid, x, y, side);

      // fill
      ctx.fillStyle = colorForFee(Number(t.feeRate) || 0, theme);
      ctx.fillRect(r.x, r.y, r.w, r.h);

      // subtle “heat” glaze for very high fees
      const fr = Number(t.feeRate) || 0;
      if (fr >= 150) {
        ctx.save();
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.restore();
      }

      // outline
      ctx.strokeStyle = outline;
      ctx.lineWidth = Math.max(1, Math.round(1 * dpr));
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    }
  }

  function drawMeta(ctx, canvas, grid, theme, meta) {
    if (!meta) return;
    ctx.save();
    const dpr = grid.dpr || 1;
    const fs = Math.max(12, Math.round(11 * dpr));
    ctx.font = `${fs}px IBMPlexMono, ui-monospace, monospace`;
    ctx.fillStyle = theme.text || "#c0d674";
    ctx.globalAlpha = 0.92;
    ctx.fillText(String(meta), Math.round(10 * dpr), canvas.height - Math.round(14 * dpr));
    ctx.restore();
  }

  API.draw = function draw(ctx, canvas, grid, layout, meta) {
    if (!ctx || !canvas || !grid) return;
    const theme = getTheme();
    drawFrame(ctx, canvas, grid, theme);
    drawTiles(ctx, canvas, grid, layout, theme);
    drawMeta(ctx, canvas, grid, theme, meta);
  };
})();
