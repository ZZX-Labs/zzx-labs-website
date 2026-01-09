// __partials/widgets/mempool-specs/sorter.js
// DROP-IN COMPLETE REPLACEMENT
//
// Deterministic square packing for mempool block visualization.
// Goals:
// - Stable ordering (same input = same layout)
// - Fast (O(n * grid scan))
// - No physics, no randomness unless seeded
//
// Exposes:
//   window.ZZXMempoolSpecs.Sorter.packSquares()

(function () {
  "use strict";

  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});

  function hashSeed(str, seed = 0) {
    let h = seed ^ 0x9e3779b9;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
    }
    return h >>> 0;
  }

  function makeOcc(rows, cols) {
    const occ = new Array(rows);
    for (let y = 0; y < rows; y++) {
      occ[y] = new Uint8Array(cols);
    }
    return occ;
  }

  function canPlace(occ, cols, rows, x, y, side) {
    if (x < 0 || y < 0 || x + side > cols || y + side > rows) return false;
    for (let yy = y; yy < y + side; yy++) {
      const row = occ[yy];
      for (let xx = x; xx < x + side; xx++) {
        if (row[xx]) return false;
      }
    }
    return true;
  }

  function mark(occ, x, y, side, v = 1) {
    for (let yy = y; yy < y + side; yy++) {
      const row = occ[yy];
      for (let xx = x; xx < x + side; xx++) {
        row[xx] = v;
      }
    }
  }

  function packSquares(items, grid, opts = {}) {
    const cols = grid.cols;
    const rows = grid.rows;

    const seed = Number.isFinite(opts.seed) ? opts.seed : 0;
    const bubblePasses = Number.isFinite(opts.bubblePasses) ? opts.bubblePasses : 0;

    const occ = makeOcc(rows, cols);

    // Sort: fee DESC → size DESC → stable seeded hash
    const sorted = items.slice().sort((a, b) => {
      const fa = Number(a.feeRate) || 0;
      const fb = Number(b.feeRate) || 0;
      if (fb !== fa) return fb - fa;

      const sa = Number(a.side) || 1;
      const sb = Number(b.side) || 1;
      if (sb !== sa) return sb - sa;

      return hashSeed(String(a.txid || ""), seed) -
             hashSeed(String(b.txid || ""), seed);
    });

    const placed = [];
    const rejected = [];

    // Primary scan: top → bottom, left → right
    for (const it of sorted) {
      const side = Math.max(1, Math.floor(it.side || 1));
      let placedOK = false;

      for (let y = 0; y <= rows - side && !placedOK; y++) {
        for (let x = 0; x <= cols - side; x++) {
          if (canPlace(occ, cols, rows, x, y, side)) {
            mark(occ, x, y, side, 1);
            placed.push({ ...it, x, y });
            placedOK = true;
            break;
          }
        }
      }

      if (!placedOK) rejected.push(it);
    }

    // Optional compaction pass
    for (let pass = 0; pass < bubblePasses; pass++) {
      let moved = 0;
      const occ2 = makeOcc(rows, cols);
      for (const p of placed) mark(occ2, p.x, p.y, p.side, 1);

      for (const p of placed) {
        mark(occ2, p.x, p.y, p.side, 0);

        let bestX = p.x;
        let bestY = p.y;

        for (let y = 0; y <= p.y; y++) {
          for (let x = 0; x <= p.x; x++) {
            if (canPlace(occ2, cols, rows, x, y, p.side)) {
              bestX = x;
              bestY = y;
              break;
            }
          }
          if (bestX !== p.x || bestY !== p.y) break;
        }

        mark(occ2, bestX, bestY, p.side, 1);

        if (bestX !== p.x || bestY !== p.y) {
          p.x = bestX;
          p.y = bestY;
          moved++;
        }
      }

      if (!moved) break;
    }

    return {
      placed,
      rejected,
      cols,
      rows
    };
  }

  NS.Sorter = { packSquares };
})();
