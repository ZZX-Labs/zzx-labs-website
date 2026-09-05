// __partials/widgets/mempool-specs/binfill.js
// DROP-IN COMPLETE REPLACEMENT
//
// Purpose:
// - Fast, deterministic SQUARE bin packer for mempool-specs.
// - Packs tiles (side x side in grid-cells) into a cols x rows grid.
// - Produces the “dense mosaic” look: big tiles first, then fills gaps with smaller.
// - Designed to be used by your upcoming tetrifill.js / renderer.js pipeline.
//
// Input tiles:
//   [{ txid, feeRate, vbytes, side, ... }]
//
// Output layout:
//   {
//     placed:   [{...tile, x, y, side}],
//     rejected: [{...tile}],
//     cols, rows
//   }
//
// Exposes:
//   window.ZZXMempoolSpecs.BinFill.pack(tiles, grid, opts)
//
// Notes:
// - This is NOT a treemap. It packs true squares.
// - Algorithm:
//   1) sort big->small (fee as tiebreak)
//   2) skyline+scan: try candidate x from skyline, drop tile to lowest y that fits
//   3) optional "gap scan" pass for small tiles to fill holes
//
(function () {
  "use strict";

  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});
  const API = (NS.BinFill = NS.BinFill || {});

  function n2(x){ const v = Number(x); return Number.isFinite(v) ? v : NaN; }
  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

  // Deterministic hash for stable tie-breaks
  function hash32(str, seed = 0) {
    const s = String(str ?? "");
    let h = (seed >>> 0) ^ 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  // Occupancy grid: rows of Uint8Array
  function makeOcc(rows, cols) {
    const occ = new Array(rows);
    for (let y = 0; y < rows; y++) occ[y] = new Uint8Array(cols);
    return occ;
  }

  function canPlace(occ, cols, rows, x, y, side) {
    if (x < 0 || y < 0 || (x + side) > cols || (y + side) > rows) return false;
    for (let yy = y; yy < y + side; yy++) {
      const r = occ[yy];
      for (let xx = x; xx < x + side; xx++) {
        if (r[xx]) return false;
      }
    }
    return true;
  }

  function mark(occ, x, y, side, v = 1) {
    for (let yy = y; yy < y + side; yy++) {
      const r = occ[yy];
      for (let xx = x; xx < x + side; xx++) r[xx] = v;
    }
  }

  // Rebuild a skyline array (height at each x) from occupancy.
  // O(rows*cols) but rows/cols are modest; used sparingly.
  function buildSkylineFromOcc(occ, cols, rows) {
    const sky = new Uint16Array(cols);
    for (let x = 0; x < cols; x++) {
      let h = 0;
      for (let y = 0; y < rows; y++) {
        if (occ[y][x]) h = y + 1;
      }
      sky[x] = h;
    }
    return sky;
  }

  // Given skyline, compute the first y where a side-wide tile at x could sit.
  // We choose y = max(sky[x..x+side-1]) then we still must check canPlace (holes).
  function skylineDropY(sky, x, side) {
    let y = 0;
    for (let i = 0; i < side; i++) {
      const h = sky[x + i] || 0;
      if (h > y) y = h;
    }
    return y;
  }

  // Update skyline after placing a tile at (x,y,side): set sky[x..x+side-1] = max(old, y+side)
  function skylineBump(sky, x, side, newH) {
    for (let i = 0; i < side; i++) {
      if (sky[x + i] < newH) sky[x + i] = newH;
    }
  }

  // Optional gap-filling scan: for small tiles, brute-scan top-left to find holes.
  function gapScanPlace(occ, cols, rows, side) {
    for (let y = 0; y <= rows - side; y++) {
      for (let x = 0; x <= cols - side; x++) {
        if (canPlace(occ, cols, rows, x, y, side)) return { x, y };
      }
    }
    return null;
  }

  API.pack = function pack(tiles, grid, opts = {}) {
    const cols = Math.max(1, Math.floor(grid?.cols || 1));
    const rows = Math.max(1, Math.floor(grid?.rows || 1));

    const seed = Number.isFinite(n2(opts.seed)) ? (opts.seed >>> 0) : 0;

    // Behavior knobs
    const minSide = Number.isFinite(n2(opts.minSide)) ? Math.max(1, Math.floor(opts.minSide)) : 1;
    const maxSide = Number.isFinite(n2(opts.maxSide)) ? Math.max(minSide, Math.floor(opts.maxSide)) : Math.min(cols, rows);
    const enableGapFill = opts.gapFill !== false;               // default true
    const gapFillSideMax = Number.isFinite(n2(opts.gapFillSideMax)) ? Math.max(1, Math.floor(opts.gapFillSideMax)) : 4;

    // Normalize + clamp tiles
    const arr = (Array.isArray(tiles) ? tiles : []).map((t) => {
      const s0 = Math.floor(n2(t?.side) || 1);
      const side = clamp(s0, minSide, Math.min(maxSide, cols, rows));
      return { ...t, side };
    });

    // Sort: big -> small; fee desc; deterministic txid hash
    arr.sort((a, b) => {
      if (b.side !== a.side) return b.side - a.side;
      const fa = n2(a.feeRate) || 0;
      const fb = n2(b.feeRate) || 0;
      if (fb !== fa) return fb - fa;
      return (hash32(a.txid, seed) - hash32(b.txid, seed));
    });

    const occ = makeOcc(rows, cols);
    const sky = new Uint16Array(cols); // start 0s

    const placed = [];
    const rejected = [];

    // Primary placement using skyline candidates
    for (const tile of arr) {
      const side = tile.side;

      // If tile is larger than grid, reject
      if (side > cols || side > rows) {
        rejected.push(tile);
        continue;
      }

      let best = null;

      // Candidate x positions:
      // - scan across x and use skylineDropY to avoid full y scanning
      // - choose placement with minimal y, then minimal x
      for (let x = 0; x <= cols - side; x++) {
        const y0 = skylineDropY(sky, x, side);
        if (y0 > rows - side) continue;

        // Fast reject: if y0 already worse than best, skip
        if (best && y0 > best.y) continue;

        // Holes can break skyline assumption; confirm via occupancy
        if (canPlace(occ, cols, rows, x, y0, side)) {
          const cand = { x, y: y0 };
          if (!best || cand.y < best.y || (cand.y === best.y && cand.x < best.x)) best = cand;
        }
      }

      // Optional gap fill for small tiles (fills holes skyline misses)
      if (!best && enableGapFill && side <= gapFillSideMax) {
        best = gapScanPlace(occ, cols, rows, side);
      }

      if (!best) {
        rejected.push(tile);
        continue;
      }

      // Commit placement
      mark(occ, best.x, best.y, side, 1);
      skylineBump(sky, best.x, side, best.y + side);

      placed.push({ ...tile, x: best.x, y: best.y });
    }

    // If you want: a final skyline rebuild after many gap-fills (keeps it honest)
    // (cheap enough, but only if requested)
    if (opts.rebuildSkyline === true) {
      const rebuilt = buildSkylineFromOcc(occ, cols, rows);
      for (let i = 0; i < cols; i++) sky[i] = rebuilt[i];
    }

    return { placed, rejected, cols, rows };
  };
})();
