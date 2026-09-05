// __partials/widgets/mempool-specs/plotter.js
// DROP-IN COMPLETE REPLACEMENT (RECT + SQUARE SUPPORT)
//
// Purpose:
// - Paint packed tx *tiles* onto canvas
// - Works with BOTH shapes:
//    A) square-tiles layout: {x,y,side}
//    B) rect-tiles layout:   {x,y,w,h}   (treemap / binpack / tetrifill)
// - Fee-rate → color via Theme
// - Zero layout logic, zero fetching
//
// Layout contract expected by renderer/widget:
//   layout = { placed: [ { txid, feeRate, vbytes, x,y, (side|w,h), ... } ] }
//
// Exposes:
//   window.ZZXMempoolSpecs.Plotter.draw(ctx, canvas, grid, layout, meta)

(function () {
  "use strict";

  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});

  function drawGrid(ctx, grid, theme) {
    ctx.save();
    ctx.strokeStyle = theme.gridLine || "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;

    // subtle stripes only (fast)
    const stepY = Math.max(24, Math.round(28 * grid.dpr));
    const stepX = Math.max(34, Math.round(44 * grid.dpr));

    for (let y = grid.padPx; y < grid.H - grid.padPx; y += stepY) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(grid.W, y + 0.5);
      ctx.stroke();
    }

    for (let x = grid.padPx; x < grid.W - grid.padPx; x += stepX) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, grid.H);
      ctx.stroke();
    }

    ctx.restore();
  }

  // Convert cell units to device pixels.
  // A tile of width "w cells" occupies: w*cellPx + (w-1)*gapPx.
  function cellsToPx(cells, cellPx, gapPx) {
    const c = Math.max(1, Math.floor(cells || 1));
    return (c * cellPx) + (Math.max(0, c - 1) * gapPx);
  }

  function clampInt(n, a, b) {
    n = Math.floor(n);
    if (n < a) return a;
    if (n > b) return b;
    return n;
  }

  function draw(ctx, canvas, grid, layout, meta) {
    const Theme = NS.Theme;
    const theme = Theme?.get?.() || {};
    const colorForFee = Theme?.colorForFeeRate || (() => "#555");

    const placed = Array.isArray(layout?.placed) ? layout.placed : [];

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // background
    ctx.fillStyle = theme.canvasBg || "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // frame
    ctx.strokeStyle = theme.border || "#e6a42b";
    ctx.lineWidth = Math.max(2, Math.round(3 * grid.dpr));
    ctx.strokeRect(
      Math.round(2 * grid.dpr),
      Math.round(2 * grid.dpr),
      canvas.width - Math.round(4 * grid.dpr),
      canvas.height - Math.round(4 * grid.dpr)
    );

    drawGrid(ctx, grid, theme);

    const outline = theme.tileOutline || "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;

    const cols = Math.max(1, grid.cols || 1);
    const rows = Math.max(1, grid.rows || 1);

    // tiles
    for (const tx of placed) {
      if (!tx) continue;

      // prefer rect fields if present, else square "side"
      let cx = Number(tx.x);
      let cy = Number(tx.y);

      if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;

      cx = clampInt(cx, 0, cols - 1);
      cy = clampInt(cy, 0, rows - 1);

      let wCells, hCells;

      if (Number.isFinite(Number(tx.w)) || Number.isFinite(Number(tx.h))) {
        wCells = Number(tx.w);
        hCells = Number(tx.h);
      } else {
        const s = Number(tx.side);
        wCells = s;
        hCells = s;
      }

      wCells = clampInt(wCells || 1, 1, cols - cx);
      hCells = clampInt(hCells || 1, 1, rows - cy);

      const x = grid.x0 + cx * grid.step;
      const y = grid.y0 + cy * grid.step;

      const wPx = cellsToPx(wCells, grid.cellPx, grid.gapPx);
      const hPx = cellsToPx(hCells, grid.cellPx, grid.gapPx);

      ctx.fillStyle = colorForFee(Number(tx.feeRate) || 0, theme);
      ctx.fillRect(x, y, wPx, hPx);

      ctx.strokeStyle = outline;
      ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, wPx - 1), Math.max(0, hPx - 1));
    }

    // meta text overlay (bottom-left)
    if (meta) {
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = theme.text || "#c0d674";

      // Use your site font stack (fonts.css should define IBMPlexMono)
      const fs = Math.max(12, Math.round(11 * grid.dpr));
      ctx.font = `${fs}px IBMPlexMono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace`;

      ctx.fillText(
        String(meta),
        Math.round(10 * grid.dpr),
        canvas.height - Math.round(14 * grid.dpr)
      );
      ctx.restore();
    }

    ctx.restore();
  }

  NS.Plotter = { draw };
})();
