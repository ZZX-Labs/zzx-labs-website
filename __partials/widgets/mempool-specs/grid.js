// __partials/widgets/mempool-specs/grid.js
// DROP-IN COMPLETE REPLACEMENT (STABLE + SIGNATURE-FRIENDLY)
//
// Purpose:
// - DPR-aware canvas sizing
// - Stable grid metrics (cells, gaps, padding)
// - Provides helpers used by packers/renderers (cell->px, rect->px, signature)
//
// Exposes:
//   window.ZZXMempoolSpecs.Grid.makeGrid(canvas, opts)
//   window.ZZXMempoolSpecs.Grid.signature(grid)
//   window.ZZXMempoolSpecs.Grid.cellToPx(grid, cx, cy)
//   window.ZZXMempoolSpecs.Grid.rectToPx(grid, x, y, w, h)

(function () {
  "use strict";

  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function int(n, d = 0) {
    n = Number.isFinite(Number(n)) ? Number(n) : d;
    return Math.round(n);
  }

  function ensureCanvas(canvas, minCssH = 220) {
    const dpr = window.devicePixelRatio || 1;

    // clientWidth/Height can be 0 during first paint; guard.
    const cssW = Math.max(1, Math.floor(canvas.clientWidth || 320));
    const cssH = Math.max(minCssH, Math.floor(canvas.clientHeight || minCssH));

    const wantW = Math.max(1, Math.floor(cssW * dpr));
    const wantH = Math.max(1, Math.floor(cssH * dpr));

    const changed = (canvas.width !== wantW) || (canvas.height !== wantH);
    if (changed) {
      canvas.width = wantW;
      canvas.height = wantH;
    }

    return { cssW, cssH, dpr, changed };
  }

  // cellSpan in CELLS -> pixel span in DEVICE PX
  function spanPx(cellSpan, cellPx, gapPx) {
    const c = Math.max(1, Math.floor(cellSpan || 1));
    return (c * cellPx) + (Math.max(0, c - 1) * gapPx);
  }

  function makeGrid(canvas, opts = {}) {
    const minCssH = Number.isFinite(opts.minCssH) ? opts.minCssH : 220;

    // Use CSS px inputs; convert to device px with DPR.
    const cellCss = Number.isFinite(opts.cellCss) ? opts.cellCss : 7;
    const gapCss  = Number.isFinite(opts.gapCss)  ? opts.gapCss  : 1;
    const padCss  = Number.isFinite(opts.padCss)  ? opts.padCss  : 10;

    const { cssW, cssH, dpr, changed } = ensureCanvas(canvas, minCssH);

    const cellPx = Math.max(2, int(cellCss * dpr));
    const gapPx  = Math.max(0, int(gapCss  * dpr));
    const padPx  = Math.max(0, int(padCss  * dpr));

    const W = canvas.width;
    const H = canvas.height;

    const innerW = Math.max(1, W - padPx * 2);
    const innerH = Math.max(1, H - padPx * 2);

    const step = cellPx + gapPx;

    // cols/rows: how many cells fit in inner area (include final cell without gap)
    const cols = clamp(Math.floor((innerW + gapPx) / step), 8, 1024);
    const rows = clamp(Math.floor((innerH + gapPx) / step), 8, 1024);

    // true usable pixel spans (for renderers that want bounds)
    const usableW = spanPx(cols, cellPx, gapPx);
    const usableH = spanPx(rows, cellPx, gapPx);

    // grid origin (top-left) — center inside the padded box if there is slack
    const x0 = padPx + Math.max(0, Math.floor((innerW - usableW) / 2));
    const y0 = padPx + Math.max(0, Math.floor((innerH - usableH) / 2));

    return {
      // canvas / css
      cssW, cssH, dpr, changed,
      W, H,

      // geometry
      padPx,
      cellPx,
      gapPx,
      step,

      // grid dims
      cols,
      rows,

      // grid origin
      x0,
      y0,

      // helpers for renderers
      spanPx: (cells) => spanPx(cells, cellPx, gapPx)
    };
  }

  function signature(grid) {
    if (!grid) return "";
    return `${grid.cols}x${grid.rows}@${grid.cellPx}/${grid.gapPx}/${grid.padPx}/${grid.dpr}`;
  }

  function cellToPx(grid, cx, cy) {
    return {
      x: grid.x0 + (cx * grid.step),
      y: grid.y0 + (cy * grid.step),
    };
  }

  function rectToPx(grid, x, y, w, h) {
    const p = cellToPx(grid, x, y);
    return {
      x: p.x,
      y: p.y,
      w: grid.spanPx(w),
      h: grid.spanPx(h),
    };
  }

  NS.Grid = { makeGrid, signature, cellToPx, rectToPx };
})();
