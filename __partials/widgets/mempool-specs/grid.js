// __partials/widgets/mempool-specs/grid.js
// DROP-IN COMPLETE REPLACEMENT
//
// Purpose:
// - DPR-aware canvas sizing
// - Stable grid metrics (cells, gaps, padding)
// - Zero network, zero layout logic
//
// Exposes:
//   window.ZZXMempoolSpecs.Grid.makeGrid(canvas, opts)

(function () {
  "use strict";

  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function ensureCanvas(canvas, minCssH = 220) {
    const dpr = window.devicePixelRatio || 1;

    const cssW = Math.max(1, Math.floor(canvas.clientWidth || 320));
    const cssH = Math.max(minCssH, Math.floor(canvas.clientHeight || minCssH));

    const wantW = Math.floor(cssW * dpr);
    const wantH = Math.floor(cssH * dpr);

    if (canvas.width !== wantW || canvas.height !== wantH) {
      canvas.width = wantW;
      canvas.height = wantH;
    }

    return { cssW, cssH, dpr };
  }

  function makeGrid(canvas, opts = {}) {
    const {
      minCssH = 220,
      cellCss = 7,
      gapCss  = 1,
      padCss  = 10
    } = opts;

    const { cssW, cssH, dpr } = ensureCanvas(canvas, minCssH);

    const cellPx = Math.max(2, Math.round(cellCss * dpr));
    const gapPx  = Math.max(0, Math.round(gapCss * dpr));
    const padPx  = Math.round(padCss * dpr);

    const W = canvas.width;
    const H = canvas.height;

    const innerW = Math.max(1, W - padPx * 2);
    const innerH = Math.max(1, H - padPx * 2);

    const step = cellPx + gapPx;

    const cols = clamp(Math.floor((innerW + gapPx) / step), 8, 512);
    const rows = clamp(Math.floor((innerH + gapPx) / step), 8, 512);

    return {
      cssW,
      cssH,
      dpr,
      W,
      H,
      padPx,
      cellPx,
      gapPx,
      step,
      cols,
      rows,
      x0: padPx,
      y0: padPx
    };
  }

  NS.Grid = { makeGrid };
})();
