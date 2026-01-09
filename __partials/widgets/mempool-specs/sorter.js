// __partials/widgets/mempool-specs/sorter.js
// DROP-IN COMPLETE REPLACEMENT
//
// Squarified Treemap packer:
// - Packs items by AREA into a rectangle (grid cols x rows)
// - Produces mempool.space-like big tiles and dense small tiles
//
// Input items: [{ txid, feeRate, vbytes, areaCells, ... }]
// Output layout: { placed:[{... , x,y,w,h}], cols, rows, rejected }
//
// Exposes: window.ZZXMempoolSpecs.Sorter.packSquares (kept name for compatibility)
// NOTE: It packs RECTANGLES, not "squares". The squarify algorithm keeps them
// near-square when possible.
(function () {
  "use strict";

  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function worst(row, w) {
    // classic squarify "worst aspect ratio" metric
    let sum = 0, maxA = 0, minA = Infinity;
    for (const a of row) {
      sum += a;
      if (a > maxA) maxA = a;
      if (a < minA) minA = a;
    }
    const s2 = sum * sum;
    const w2 = w * w;
    return Math.max((w2 * maxA) / s2, s2 / (w2 * minA));
  }

  function layoutRow(rowItems, rowAreas, rect, horizontal, placed) {
    // rect: {x,y,w,h} in CELLS
    const sum = rowAreas.reduce((a, b) => a + b, 0);
    if (sum <= 0) return rect;

    if (horizontal) {
      // row spans full width, fixed height
      const rowH = Math.max(1, Math.round(sum / rect.w));
      let x = rect.x;
      for (let i = 0; i < rowItems.length; i++) {
        const area = rowAreas[i];
        const wi = Math.max(1, Math.round(area / rowH));
        placed.push({ ...rowItems[i], x, y: rect.y, w: wi, h: rowH });
        x += wi;
      }
      // leftover rect below
      return { x: rect.x, y: rect.y + rowH, w: rect.w, h: Math.max(0, rect.h - rowH) };
    } else {
      // column spans full height, fixed width
      const colW = Math.max(1, Math.round(sum / rect.h));
      let y = rect.y;
      for (let i = 0; i < rowItems.length; i++) {
        const area = rowAreas[i];
        const hi = Math.max(1, Math.round(area / colW));
        placed.push({ ...rowItems[i], x: rect.x, y, w: colW, h: hi });
        y += hi;
      }
      // leftover rect to the right
      return { x: rect.x + colW, y: rect.y, w: Math.max(0, rect.w - colW), h: rect.h };
    }
  }

  function normalizeAreas(items, cols, rows) {
    // Scale item areas so total area ~= available area
    const avail = Math.max(1, cols * rows);
    const sum = items.reduce((s, it) => s + (Number(it.areaCells) || 0), 0);
    if (sum <= 0) return items;

    const k = avail / sum;
    return items.map(it => ({
      ...it,
      _a: Math.max(1, Math.round((Number(it.areaCells) || 1) * k))
    }));
  }

  function packSquares(items, grid, opts = {}) {
    const cols = grid.cols, rows = grid.rows;

    // sort: big first (critical for treemap quality), then fee desc as tiebreak
    const arr0 = items.slice().sort((a, b) => {
      const aa = Number(a.areaCells) || 0;
      const ba = Number(b.areaCells) || 0;
      if (ba !== aa) return ba - aa;
      const fa = Number(a.feeRate) || 0;
      const fb = Number(b.feeRate) || 0;
      return fb - fa;
    });

    const arr = normalizeAreas(arr0, cols, rows);

    const placed = [];
    const rejected = [];

    // remaining rectangle in cell space
    let rect = { x: 0, y: 0, w: cols, h: rows };

    // squarify
    let rowItems = [];
    let rowAreas = [];

    let i = 0;
    while (i < arr.length) {
      const it = arr[i];
      const a = Number(it._a) || 1;

      // if rect is exhausted, reject remainder
      if (rect.w <= 0 || rect.h <= 0) {
        rejected.push(...arr.slice(i).map(x => ({ ...x, _a: undefined })));
        break;
      }

      const w = Math.min(rect.w, rect.h); // squarify uses the shorter side

      if (rowAreas.length === 0) {
        rowItems.push(it);
        rowAreas.push(a);
        i++;
        continue;
      }

      const currentWorst = worst(rowAreas, w);
      const nextWorst = worst(rowAreas.concat([a]), w);

      if (nextWorst <= currentWorst) {
        rowItems.push(it);
        rowAreas.push(a);
        i++;
      } else {
        const horizontal = rect.w >= rect.h; // fill along longer dimension first
        rect = layoutRow(rowItems, rowAreas, rect, horizontal, placed);
        rowItems = [];
        rowAreas = [];
      }
    }

    // flush last row
    if (rowAreas.length && rect.w > 0 && rect.h > 0) {
      const horizontal = rect.w >= rect.h;
      rect = layoutRow(rowItems, rowAreas, rect, horizontal, placed);
    }

    // clean internal fields
    for (const p of placed) delete p._a;

    // final clamp (keeps within grid)
    for (const p of placed) {
      p.x = clamp(p.x, 0, cols - 1);
      p.y = clamp(p.y, 0, rows - 1);
      p.w = clamp(p.w, 1, cols - p.x);
      p.h = clamp(p.h, 1, rows - p.y);
    }

    return { placed, rejected, cols, rows };
  }

  NS.Sorter = { packSquares };
})();
