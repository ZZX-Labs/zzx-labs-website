// __partials/widgets/mempool-specs/grid.js
// - DPR-aware canvas sizing
// - Cell grid metrics + coordinate conversion
// Exposes: window.ZZXMempoolSpecs.Grid

(function () {
  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function ensureCanvas(canvas, { minCssH = 220 } = {}) {
    const dpr = window.devicePixelRatio || 1;

    const cssW = Math.max(1, Math.floor(canvas.clientWidth || 320));
    const cssH = Math.max(minCssH, Math.floor(canvas.clientHeight || minCssH));

    // only resize when needed
    const wantW = Math.floor(cssW * dpr);
    const wantH = Math.floor(cssH * dpr);

    const changed = (canvas.width !== wantW) || (canvas.height !== wantH);
    if (changed) {
      canvas.width = wantW;
      canvas.height = wantH;
    }

    return { cssW, cssH, dpr, changed };
  }

  // Derive a grid: cellPx and gapPx are in DEVICE pixels (not CSS px).
  // We keep cell sizes readable and stable.
  function makeGrid(canvas, opts = {}) {
    const { cssW, cssH, dpr } = ensureCanvas(canvas, opts);

    const cellCss = Number.isFinite(opts.cellCss) ? opts.cellCss : 7; // CSS px
    const gapCss  = Number.isFinite(opts.gapCss)  ? opts.gapCss  : 1; // CSS px

    const cellPx = Math.max(2, Math.round(cellCss * dpr));
    const gapPx  = Math.max(0, Math.round(gapCss * dpr));

    // padding inside canvas
    const padCss = Number.isFinite(opts.padCss) ? opts.padCss : 10;
    const padPx  = Math.round(padCss * dpr);

    const W = canvas.width;
    const H = canvas.height;

    const innerW = Math.max(1, W - padPx * 2);
    const innerH = Math.max(1, H - padPx * 2);

    const step = cellPx + gapPx;

    const cols = clamp(Math.floor((innerW + gapPx) / step), 8, 512);
    const rows = clamp(Math.floor((innerH + gapPx) / step), 8, 512);

    return {
      dpr, cssW, cssH,
      W, H,
      padPx, cellPx, gapPx, step,
      cols, rows,
      // origin of grid
      x0: padPx,
      y0: padPx,
    };
  }

  function cellToPx(grid, cx, cy) {
    return {
      x: grid.x0 + cx * grid.step,
      y: grid.y0 + cy * grid.step,
    };
  }

  NS.Grid = { ensureCanvas, makeGrid, cellToPx };
})();
