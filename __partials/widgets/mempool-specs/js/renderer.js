// __partials/widgets/mempool-specs/renderer.js
// DROP-IN COMPLETE REPLACEMENT
//
// Purpose:
// - Paint a *tiled field* of variable-size TX tiles onto the canvas.
// - Supports BOTH square tiles (tx.side) and rectangle tiles (tx.w/tx.h in cells).
// - Uses Theme for colors + chrome, identical look regardless of packer used.
// - This replaces “columns” vibes by honoring packed geometry (w/h or side).
//
// Input:
//   - grid: from Grid.makeGrid()
//   - layout: { placed:[ {x,y, side? , w?, h?, feeRate, ...} ] }
//     where x/y and side/w/h are in GRID CELLS.
//
// Exposes:
//   window.ZZXMempoolSpecs.Renderer.draw(ctx, canvas, grid, layout, meta)
//
// Notes:
// - Your packer can be: tetrifill (squares), binfill (squares), treemap (rectangles).
// - This renderer will faithfully draw what the packer outputs.

(function () {
  "use strict";

  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});

  function pxSpan(cells, cellPx, gapPx) {
    const c = Math.max(1, Math.floor(cells || 1));
    return (c * cellPx) + (Math.max(0, c - 1) * gapPx);
  }

  function drawStripes(ctx, grid, theme) {
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

  function drawFrame(ctx, canvas, grid, theme) {
    ctx.save();

    // bg
    ctx.fillStyle = theme.canvasBg || "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // border frame
    ctx.strokeStyle = theme.border || "#e6a42b";
    ctx.lineWidth = Math.max(2, Math.round(3 * grid.dpr));
    ctx.strokeRect(
      Math.round(2 * grid.dpr),
      Math.round(2 * grid.dpr),
      canvas.width - Math.round(4 * grid.dpr),
      canvas.height - Math.round(4 * grid.dpr)
    );

    drawStripes(ctx, grid, theme);

    ctx.restore();
  }

  function drawMeta(ctx, canvas, grid, theme, meta) {
    if (!meta) return;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = theme.text || "#c0d674";
    ctx.font = `${Math.max(12, Math.round(11 * grid.dpr))}px IBMPlexMono, ui-monospace, monospace`;
    ctx.fillText(
      String(meta),
      Math.round(10 * grid.dpr),
      canvas.height - Math.round(14 * grid.dpr)
    );
    ctx.restore();
  }

  function draw(ctx, canvas, grid, layout, meta) {
    const Theme = NS.Theme;
    const theme = Theme?.get?.() || {};
    const colorForFee = Theme?.colorForFeeRate || (() => "#555");

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawFrame(ctx, canvas, grid, theme);

    const outline = theme.tileOutline || "rgba(255,255,255,0.10)";
    const placed = (layout && Array.isArray(layout.placed)) ? layout.placed : [];

    // Paint tiles
    for (const tx of placed) {
      const cx = Math.max(0, Math.floor(tx.x || 0));
      const cy = Math.max(0, Math.floor(tx.y || 0));

      // Prefer rectangles if present, else squares
      const wCells = Number.isFinite(tx.w) ? Math.max(1, Math.floor(tx.w)) : null;
      const hCells = Number.isFinite(tx.h) ? Math.max(1, Math.floor(tx.h)) : null;

      const sideCells = Number.isFinite(tx.side)
        ? Math.max(1, Math.floor(tx.side))
        : 1;

      const wc = (wCells != null && hCells != null) ? wCells : sideCells;
      const hc = (wCells != null && hCells != null) ? hCells : sideCells;

      const x = grid.x0 + cx * grid.step;
      const y = grid.y0 + cy * grid.step;

      const wpx = pxSpan(wc, grid.cellPx, grid.gapPx);
      const hpx = pxSpan(hc, grid.cellPx, grid.gapPx);

      ctx.fillStyle = colorForFee(Number(tx.feeRate) || 0, theme);
      ctx.fillRect(x, y, wpx, hpx);

      // outline
      ctx.strokeStyle = outline;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, wpx - 1), Math.max(0, hpx - 1));
    }

    drawMeta(ctx, canvas, grid, theme, meta);

    ctx.restore();
  }

  NS.Renderer = { draw };
})();
