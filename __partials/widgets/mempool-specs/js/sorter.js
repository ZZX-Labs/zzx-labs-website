// __partials/widgets/mempool-specs/sorter.js
// DROP-IN COMPLETE REPLACEMENT
//
// Square Tile Packer (mempool-goggles style):
// - Packs VARIABLE-SIZE SQUARES into a grid (cols x rows)
// - Deterministic ordering: fee desc, then size desc, then seeded txid hash
// - No overlap, no rectangles, no "columns" artifact from treemaps
//
// Input items (expected):
//   [{ txid, feeRate, vbytes, areaCells?, side?, ... }]
//
// Output layout:
//   { placed:[{... , x,y,side}], rejected:[...], cols, rows }
//
// Notes:
// - If item.side is missing, we derive it from item.areaCells using sqrt(area).
// - This works with your Renderer/Plotter that expects tx.side.
// - Keep item count bounded (~<= 450) for mobile smoothness.
//
// Exposes: window.ZZXMempoolSpecs.Sorter.packSquares

(function () {
  "use strict";

  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  // Deterministic hash for stable tiebreaks
  function seededHash(str, seed) {
    const s = String(str || "");
    let h = (seed >>> 0) ^ 0x9e3779b9;
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
    }
    return h >>> 0;
  }

  // Occupancy grid: rows of Uint8Array(cols)
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

  // Find the next empty cell scanning top->bottom, left->right
  function nextEmpty(occ, cols, rows, startY, startX) {
    for (let y = startY; y < rows; y++) {
      const row = occ[y];
      for (let x = (y === startY ? startX : 0); x < cols; x++) {
        if (!row[x]) return { x, y };
      }
    }
    return null;
  }

  // Convert "areaCells" into a square side (cells)
  function sideFromArea(areaCells, minSide, maxSide) {
    const a = Number(areaCells);
    if (!Number.isFinite(a) || a <= 1) return minSide;
    // sqrt(area) gives side; keep it slightly flatter to avoid huge blocks
    let side = Math.sqrt(a);
    // gently compress extremes
    side = Math.pow(side, 0.92);
    return clamp(Math.round(side), minSide, maxSide);
  }

  // Attempt to place a square near a target position, searching outward
  function placeNear(occ, cols, rows, side, targetX, targetY) {
    // Spiral-ish expanding box search
    const maxR = Math.max(cols, rows);
    for (let r = 0; r <= maxR; r++) {
      const x0 = clamp(targetX - r, 0, cols - side);
      const x1 = clamp(targetX + r, 0, cols - side);
      const y0 = clamp(targetY - r, 0, rows - side);
      const y1 = clamp(targetY + r, 0, rows - side);

      // top edge
      for (let x = x0; x <= x1; x++) if (canPlace(occ, cols, rows, x, y0, side)) return { x, y: y0 };
      // right edge
      for (let y = y0; y <= y1; y++) if (canPlace(occ, cols, rows, x1, y, side)) return { x: x1, y };
      // bottom edge
      for (let x = x1; x >= x0; x--) if (canPlace(occ, cols, rows, x, y1, side)) return { x, y: y1 };
      // left edge
      for (let y = y1; y >= y0; y--) if (canPlace(occ, cols, rows, x0, y, side)) return { x: x0, y };
    }
    return null;
  }

  // Optional small compaction: try to nudge placed tiles up/left
  function bubbleUpLeft(placed, cols, rows) {
    // rebuild occ
    const occ = makeOcc(rows, cols);
    for (const p of placed) mark(occ, p.x, p.y, p.side, 1);

    for (const p of placed) {
      // clear current
      mark(occ, p.x, p.y, p.side, 0);

      let bestX = p.x, bestY = p.y;

      // try move up
      for (let y = 0; y <= p.y; y++) {
        if (canPlace(occ, cols, rows, p.x, y, p.side)) {
          bestY = y;
          break;
        }
      }
      // try move left (at new y)
      for (let x = 0; x <= p.x; x++) {
        if (canPlace(occ, cols, rows, x, bestY, p.side)) {
          bestX = x;
          break;
        }
      }

      // mark at best
      mark(occ, bestX, bestY, p.side, 1);
      p.x = bestX; p.y = bestY;
    }
  }

  function packSquares(items, grid, opts = {}) {
    const cols = grid.cols, rows = grid.rows;

    const seed = Number.isFinite(opts.seed) ? (opts.seed | 0) : 0;
    const bubblePasses = Number.isFinite(opts.bubblePasses) ? opts.bubblePasses : 1;

    // Side clamps in cell units
    const minSide = clamp(Number(opts.minSide ?? 1), 1, 64);
    const maxSide = clamp(Number(opts.maxSide ?? 22), 2, 96);

    // Build working list with resolved side
    const arr = (items || []).slice().map(it => {
      const side =
        Number.isFinite(it.side) ? clamp(Math.floor(it.side), minSide, maxSide)
        : sideFromArea(it.areaCells, minSide, maxSide);

      return { ...it, side };
    });

    // Sort: fee desc, side desc, stable hash tiebreak
    arr.sort((a, b) => {
      const fa = Number(a.feeRate) || 0;
      const fb = Number(b.feeRate) || 0;
      if (fb !== fa) return fb - fa;

      const sa = Number(a.side) || 1;
      const sb = Number(b.side) || 1;
      if (sb !== sa) return sb - sa;

      return seededHash(a.txid, seed) - seededHash(b.txid, seed);
    });

    const occ = makeOcc(rows, cols);
    const placed = [];
    const rejected = [];

    // Main loop: place each tile.
    // Strategy:
    // - Find the next empty cell (scan)
    // - Try to place the current tile near that cell (expanding search)
    // - If it doesn't fit, progressively shrink the tile (down to minSide) before rejecting.
    let cursor = { x: 0, y: 0 };

    for (const it of arr) {
      // update cursor to next empty
      const ne = nextEmpty(occ, cols, rows, cursor.y, cursor.x);
      if (!ne) {
        rejected.push(it);
        continue;
      }
      cursor = ne;

      let side = clamp(Math.floor(it.side || 1), minSide, maxSide);
      let placedPos = null;

      // Try fit at side, else shrink
      for (let s = side; s >= minSide; s--) {
        // target at current empty cell
        const pos = placeNear(occ, cols, rows, s, cursor.x, cursor.y);
        if (pos) {
          placedPos = { ...pos, side: s };
          break;
        }
      }

      if (!placedPos) {
        rejected.push(it);
        continue;
      }

      mark(occ, placedPos.x, placedPos.y, placedPos.side, 1);
      placed.push({ ...it, x: placedPos.x, y: placedPos.y, side: placedPos.side });

      // advance cursor a bit
      cursor.x = Math.min(cols - 1, placedPos.x + placedPos.side);
      cursor.y = placedPos.y;
    }

    // Optional compaction
    for (let pass = 0; pass < bubblePasses; pass++) {
      bubbleUpLeft(placed, cols, rows);
    }

    return { placed, rejected, cols, rows };
  }

  NS.Sorter = { packSquares };
})();
