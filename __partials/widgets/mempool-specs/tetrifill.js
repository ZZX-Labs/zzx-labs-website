// __partials/widgets/mempool-specs/tetrifill.js
// DROP-IN (NEW)
//
// Purpose:
// - Pack SQUARE tiles of varying side (in grid cells) into a cols x rows grid.
// - Produces mempool.space-like "big squares + dense small squares" fill.
// - Deterministic ordering (seed) + optional compaction passes to reduce holes.
//
// Input items: [{ txid, feeRate, vbytes, side, ... }]
// Output: { placed:[{... , x,y,side}], rejected:[...], cols, rows }
//
// Exposes:
//   window.ZZXMempoolSpecs.TetriFill.pack(items, grid, opts)
//
// opts:
//   - seed: number (determinism)
//   - bubblePasses: 0..N (default 1)
//   - scan: "row" | "col" (default "row")  // scan order preference
//
(function () {
  "use strict";

  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});
  const API = (NS.TetriFill = NS.TetriFill || {});

  function n2(x){ const v = Number(x); return Number.isFinite(v) ? v : NaN; }

  function hash32(str, seed = 0) {
    const s = String(str ?? "");
    let h = (seed >>> 0) ^ 0x9e3779b9;
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
      h ^= (h >>> 13);
    }
    return (h >>> 0);
  }

  function makeOcc(rows, cols) {
    const occ = new Array(rows);
    for (let y = 0; y < rows; y++) occ[y] = new Uint8Array(cols);
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
      for (let xx = x; xx < x + side; xx++) row[xx] = v;
    }
  }

  // Candidate scoring: prefer higher, more-left placements (tetris feel),
  // with slight preference for positions that minimize "ragged edges".
  function scorePos(x, y, side, cols, rows) {
    // higher row priority (top)
    const topBias = (rows - y);
    // left priority
    const leftBias = (cols - x);
    // larger tiles get slightly more priority to place cleanly
    const sizeBias = side * 2;
    return (topBias * 1000) + (leftBias * 10) + sizeBias;
  }

  function sortItems(items, seed) {
    const arr = items.slice();
    arr.sort((a, b) => {
      const sa = Math.max(1, Math.floor(n2(a.side) || 1));
      const sb = Math.max(1, Math.floor(n2(b.side) || 1));
      if (sb !== sa) return sb - sa; // BIG first (critical)
      const fa = n2(a.feeRate) || 0;
      const fb = n2(b.feeRate) || 0;
      if (fb !== fa) return fb - fa; // higher fee first tie-break
      // deterministic txid hash tie-break
      return (hash32(a.txid || a.txid || a.txid || a.txid, seed) - hash32(b.txid || b.txid || b.txid || b.txid, seed));
    });
    return arr;
  }

  // Scan all placements; pick the best score (fast enough for ~400 tiles on phone).
  function findBestSpot(occ, cols, rows, side, scanMode) {
    let best = null;
    let bestScore = -Infinity;

    if (scanMode === "col") {
      for (let x = 0; x <= cols - side; x++) {
        for (let y = 0; y <= rows - side; y++) {
          if (!canPlace(occ, cols, rows, x, y, side)) continue;
          const sc = scorePos(x, y, side, cols, rows);
          if (sc > bestScore) { bestScore = sc; best = { x, y }; }
        }
      }
      return best;
    }

    // default "row"
    for (let y = 0; y <= rows - side; y++) {
      for (let x = 0; x <= cols - side; x++) {
        if (!canPlace(occ, cols, rows, x, y, side)) continue;
        const sc = scorePos(x, y, side, cols, rows);
        if (sc > bestScore) { bestScore = sc; best = { x, y }; }
      }
    }
    return best;
  }

  function bubbleCompact(placed, cols, rows, passes = 1) {
    passes = Math.max(0, Math.floor(passes || 0));
    if (!passes || !placed.length) return;

    for (let pass = 0; pass < passes; pass++) {
      const occ = makeOcc(rows, cols);
      for (const p of placed) mark(occ, p.x, p.y, p.side, 1);

      let moved = 0;

      // attempt to move each tile up/left into earlier holes
      // process big->small for stability
      const order = placed.slice().sort((a, b) => (b.side - a.side));
      for (const p of order) {
        mark(occ, p.x, p.y, p.side, 0); // clear

        let best = { x: p.x, y: p.y };
        // search only above/left region to keep it fast
        for (let y = 0; y <= p.y; y++) {
          for (let x = 0; x <= p.x; x++) {
            if (canPlace(occ, cols, rows, x, y, p.side)) {
              best = { x, y };
              // as soon as we find an earlier spot, take it (tetris feel)
              y = p.y + 1; // break outer
              break;
            }
          }
        }

        mark(occ, best.x, best.y, p.side, 1);
        if (best.x !== p.x || best.y !== p.y) {
          p.x = best.x; p.y = best.y;
          moved++;
        } else {
          // restore
          // already marked at same spot
        }
      }

      if (!moved) break;
    }
  }

  API.pack = function pack(items, grid, opts = {}) {
    const cols = Math.max(1, Math.floor(grid?.cols || 1));
    const rows = Math.max(1, Math.floor(grid?.rows || 1));

    const seed = Number.isFinite(opts.seed) ? opts.seed : 0;
    const bubblePasses = Number.isFinite(opts.bubblePasses) ? Math.max(0, Math.floor(opts.bubblePasses)) : 1;
    const scanMode = (opts.scan === "col") ? "col" : "row";

    const occ = makeOcc(rows, cols);
    const placed = [];
    const rejected = [];

    const arr = sortItems(Array.isArray(items) ? items : [], seed);

    for (const it of arr) {
      const side = Math.max(1, Math.floor(n2(it.side) || 1));
      if (side > cols || side > rows) { rejected.push(it); continue; }

      const spot = findBestSpot(occ, cols, rows, side, scanMode);
      if (!spot) { rejected.push(it); continue; }

      mark(occ, spot.x, spot.y, side, 1);
      placed.push({ ...it, x: spot.x, y: spot.y, side });
    }

    // light compaction to reduce holes
    bubbleCompact(placed, cols, rows, bubblePasses);

    return { placed, rejected, cols, rows };
  };
})();
