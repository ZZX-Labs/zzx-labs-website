// __partials/widgets/mempool-specs/plotter.js
// - Draws packed tx squares to canvas
// - Uses Theme.colorForFeeRate for fee bands
// Exposes: window.ZZXMempoolSpecs.Plotter

(function () {
  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});

  function drawGridLines(ctx, grid, theme) {
    const { W, H, padPx } = grid;
    ctx.save();
    ctx.strokeStyle = theme.gridLine;
    ctx.lineWidth = 1;

    // subtle stripes, not full cell grid (keeps it fast)
    for (let y = padPx; y < H - padPx; y += Math.max(24, Math.round(28 * grid.dpr))) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(W, y + 0.5);
      ctx.stroke();
    }
    for (let x = padPx; x < W - padPx; x += Math.max(34, Math.round(44 * grid.dpr))) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, H);
      ctx.stroke();
    }

    ctx.restore();
  }

  function draw(ctx, canvas, grid, layout, meta) {
    const theme = NS.Theme?.get?.() || {};
    const colorForFee = NS.Theme?.colorForFeeRate || (() => "#555");

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // bg
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

    drawGridLines(ctx, grid, theme);

    const outline = theme.tileOutline || "rgba(255,255,255,0.08)";

    // draw squares
    for (const tx of (layout?.placed || [])) {
      const x = grid.x0 + tx.x * grid.step;
      const y = grid.y0 + tx.y * grid.step;

      const sideCells = tx.side || 1;
      const px = (sideCells * grid.cellPx) + (Math.max(0, sideCells - 1) * grid.gapPx);

      ctx.fillStyle = colorForFee(Number(tx.feeRate) || 0, theme);
      ctx.fillRect(x, y, px, px);

      ctx.strokeStyle = outline;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, px - 1, px - 1);
    }

    // meta text overlay (bottom-left)
    if (meta) {
      ctx.save();
      const fs = Math.max(12, Math.round(11 * grid.dpr));
      ctx.font = `${fs}px IBMPlexMono, ui-monospace, monospace`;
      ctx.fillStyle = theme.text || "#c0d674";
      ctx.globalAlpha = 0.9;
      ctx.fillText(String(meta), Math.round(10 * grid.dpr), canvas.height - Math.round(14 * grid.dpr));
      ctx.restore();
    }

    ctx.restore();
  }

  NS.Plotter = { draw };
})();
