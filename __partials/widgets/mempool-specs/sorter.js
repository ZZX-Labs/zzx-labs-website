// __partials/widgets/mempool-specs/sorter.js
// DROP-IN COMPLETE REPLACEMENT
//
// Squarified Treemap packer (stable, no overlap):
// - Packs items by AREA into a rectangle (grid cols x rows)
// - Deterministic row/col sizing (no rounding overflow/gaps)
// - Last item absorbs remainder so each row/col exactly fits
//
// Input items: [{ txid, feeRate, vbytes, areaCells, ... }]
// Output layout: { placed:[{... , x,y,w,h}], cols, rows, rejected }
//
// Exposes: window.ZZXMempoolSpecs.Sorter.packSquares
(function () {
  "use strict";

  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function worst(row, w) {
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

  function normalizeAreas(items, cols, rows) {
    const avail = Math.max(1, cols * rows);
    const sum = items.reduce((s, it) => s + (Number(it.areaCells) || 0), 0);
    if (sum <= 0) return items;

    const k = avail / sum;
    return items.map(it => ({
      ...it,
      _a: Math.max(1, Math.round((Number(it.areaCells) || 1) * k))
    }));
  }

  // Allocate integer lengths that sum exactly to totalSpan.
  // Uses proportional floors + last absorbs remainder, with a minimum of 1.
  function splitSpan(areas, totalSpan) {
    const out = new Array(areas.length).fill(1);
    if (areas.length === 0) return out;

    const sumA = areas.reduce((s, a) => s + a, 0);
    if (sumA <= 0) return out;

    // We must give at least 1 to each item; remaining span to distribute
    const base = areas.length; // 1 each
    let rem = totalSpan - base;

    if (rem <= 0) {
      // Not enough span for 1 each: caller should reject, but be safe.
      return out.map(() => 1);
    }

    // Proportional allocation of the remaining span (floors)
    let used = 0;
    for (let i = 0; i < areas.length; i++) {
      const share = Math.floor((areas[i] / sumA) * rem);
      out[i] = 1 + share;
      used += share;
    }

    // Give remainder to the last item (ensures exact sum)
    const leftover = rem - used;
    out[out.length - 1] += leftover;

    return out;
  }

  function layoutRow(rowItems, rowAreas, rect, horizontal, placed, rejected) {
    const sum = rowAreas.reduce((a, b) => a + b, 0);
    if (sum <= 0) return rect;

    if (horizontal) {
      // Row spans full width, fixed height
      // Thickness chosen so row area ~= sum, but never exceeds remaining height
      let rowH = Math.ceil(sum / Math.max(1, rect.w));
      rowH = clamp(rowH, 1, rect.h);

      // Not enough vertical room for this row at all
      if (rowH <= 0) {
        rejected.push(...rowItems.map(it => ({ ...it, _a: undefined })));
        return rect;
      }

      // Split widths to exactly fill rect.w
      // If rect.w < rowItems.length, we can't give 1 col each => reject all
      if (rect.w < rowItems.length) {
        rejected.push(...rowItems.map(it => ({ ...it, _a: undefined })));
        return rect;
      }

      const widths = splitSpan(rowAreas, rect.w);

      let x = rect.x;
      for (let i = 0; i < rowItems.length; i++) {
        const wi = widths[i];
        placed.push({ ...rowItems[i], x, y: rect.y, w: wi, h: rowH });
        x += wi;
      }

      return { x: rect.x, y: rect.y + rowH, w: rect.w, h: rect.h - rowH };
    } else {
      // Column spans full height, fixed width
      let colW = Math.ceil(sum / Math.max(1, rect.h));
      colW = clamp(colW, 1, rect.w);

      if (colW <= 0) {
        rejected.push(...rowItems.map(it => ({ ...it, _a: undefined })));
        return rect;
      }

      if (rect.h < rowItems.length) {
        rejected.push(...rowItems.map(it => ({ ...it, _a: undefined })));
        return rect;
      }

      const heights = splitSpan(rowAreas, rect.h);

      let y = rect.y;
      for (let i = 0; i < rowItems.length; i++) {
        const hi = heights[i];
        placed.push({ ...rowItems[i], x: rect.x, y, w: colW, h: hi });
        y += hi;
      }

      return { x: rect.x + colW, y: rect.y, w: rect.w - colW, h: rect.h };
    }
  }

  function packSquares(items, grid, opts = {}) {
    const cols = grid.cols, rows = grid.rows;

    // sort: big first (critical for treemap quality), then fee desc tiebreak
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

    let rect = { x: 0, y: 0, w: cols, h: rows };

    let rowItems = [];
    let rowAreas = [];

    let i = 0;
    while (i < arr.length) {
      const it = arr[i];
      const a = Number(it._a) || 1;

      if (rect.w <= 0 || rect.h <= 0) {
        rejected.push(...arr.slice(i).map(x => ({ ...x, _a: undefined })));
        break;
      }

      const w = Math.min(rect.w, rect.h);

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
        const horizontal = rect.w >= rect.h;
        rect = layoutRow(rowItems, rowAreas, rect, horizontal, placed, rejected);
        rowItems = [];
        rowAreas = [];
      }
    }

    // flush last row
    if (rowAreas.length && rect.w > 0 && rect.h > 0) {
      const horizontal = rect.w >= rect.h;
      rect = layoutRow(rowItems, rowAreas, rect, horizontal, placed, rejected);
    }

    // clean internal fields
    for (const p of placed) delete p._a;

    // final clamp (safety only; should be unnecessary now)
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
