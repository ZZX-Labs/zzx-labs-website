// __partials/widgets/mempool-specs/plotter.js
// DROP-IN COMPLETE REPLACEMENT
//
// Purpose:
// - Paint packed tx squares onto canvas
// - Fee-rate → color via Theme
// - Zero layout logic, zero fetching
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

  function draw(ctx, canvas, grid, layout, meta) {
    const Theme = NS.Theme;
    const theme = Theme?.get?.() || {};
    const colorForFee = Theme?.colorForFeeRate || (() => "#555");

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

    // tiles
    for (const tx of (layout?.placed || [])) {
      const x = grid.x0 + tx.x * grid.step;
      const y = grid.y0 + tx.y * grid.step;
      const s = Math.max(1, tx.side || 1);

      const px =
        (s * grid.cellPx) +
        (Math.max(0, s - 1) * grid.gapPx);

      ctx.fillStyle = colorForFee(Number(tx.feeRate) || 0, theme);
      ctx.fillRect(x, y, px, px);

      ctx.strokeStyle = outline;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, px - 1, px - 1);
    }

    // meta text
    if (meta) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = theme.text || "#c0d674";
      ctx.font = `${Math.max(12, Math.round(11 * grid.dpr))}px IBMPlexMono, monospace`;
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
