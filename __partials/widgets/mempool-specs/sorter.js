// __partials/widgets/mempool-specs/sorter.js
// - Deterministic tetris-ish packing of squares into a grid
// - Primary: skyline packer scanning left->right, top->bottom
// - Optional: "bubble" pass that tries to reduce holes by local swaps
// Exposes: window.ZZXMempoolSpecs.Sorter

(function () {
  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});

  function keySeededSort(tx, seed = 0) {
    // stable tiebreak: fee desc, size desc, then seeded hash of txid
    const s = String(tx.txid || "");
    let h = (seed >>> 0) ^ 0x9e3779b9;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
    return h >>> 0;
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

  function makeOcc(rows, cols) {
    const occ = new Array(rows);
    for (let y = 0; y < rows; y++) {
      const r = new Uint8Array(cols);
      occ[y] = r;
    }
    return occ;
  }

  function packSquares(items, grid, opts = {}) {
    const cols = grid.cols, rows = grid.rows;
    const occ = makeOcc(rows, cols);

    const seed = Number.isFinite(opts.seed) ? opts.seed : 0;
    const bubblePasses = Number.isFinite(opts.bubblePasses) ? opts.bubblePasses : 0;

    // Sort: highest fee first, then bigger squares, then deterministic txid hash
    const arr = items.slice().sort((a, b) => {
      const fa = Number(a.feeRate) || 0;
      const fb = Number(b.feeRate) || 0;
      if (fb !== fa) return fb - fa;
      const sa = Number(a.side) || 1;
      const sb = Number(b.side) || 1;
      if (sb !== sa) return sb - sa;
      return keySeededSort(a, seed) - keySeededSort(b, seed);
    });

    const placed = [];
    const rejected = [];

    // Simple scan placement (tetris fill imitation comes from scan order)
    for (const it of arr) {
      const side = Math.max(1, Math.floor(it.side || 1));
      let ok = false;
      let px = 0, py = 0;

      // scan rows (top->bottom), cols (left->right)
      for (let y = 0; y <= rows - side; y++) {
        for (let x = 0; x <= cols - side; x++) {
          if (canPlace(occ, cols, rows, x, y, side)) {
            px = x; py = y; ok = true;
            mark(occ, x, y, side, 1);
            break;
          }
        }
        if (ok) break;
      }

      if (ok) {
        placed.push({ ...it, x: px, y: py });
      } else {
        rejected.push(it);
      }
    }

    // Optional “bubble” compaction: try to move each square upward/left if room.
    for (let pass = 0; pass < bubblePasses; pass++) {
      let moved = 0;

      // rebuild occupancy from placed
      const occ2 = makeOcc(rows, cols);
      for (const p of placed) mark(occ2, p.x, p.y, p.side, 1);

      for (const p of placed) {
        // clear current
        mark(occ2, p.x, p.y, p.side, 0);

        let bestX = p.x, bestY = p.y;

        // try to move up as far as possible, then left
        for (let y = 0; y <= p.y; y++) {
          for (let x = 0; x <= p.x; x++) {
            if (canPlace(occ2, cols, rows, x, y, p.side)) {
              bestX = x; bestY = y;
              break;
            }
          }
          if (bestY !== p.y || bestX !== p.x) break;
        }

        // mark at best position
        mark(occ2, bestX, bestY, p.side, 1);

        if (bestX !== p.x || bestY !== p.y) {
          p.x = bestX; p.y = bestY;
          moved++;
        }
      }

      if (!moved) break;
    }

    return { placed, rejected, cols, rows };
  }

  NS.Sorter = { packSquares };
})();
