// __partials/widgets/mempool-specs/scaler.js
// - Maps tx vbytes/weight to square sizes in grid cells.
// - Keeps sizes stable across resizes by anchoring to grid cell units.
// Exposes: window.ZZXMempoolSpecs.Scaler

(function () {
  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  // Default: vbytes -> area (cells^2). Then square side = sqrt(area).
  // We keep the mapping gentle so large txs don’t dominate.
  const DEFAULTS = {
    // grid cell area per vbyte. smaller => smaller squares.
    areaPerVByte: 1 / 6500,     // tuned for 1,000,000 vB block
    minSideCells: 1,
    maxSideCells: 18,

    // curve tweak: side = sqrt(area) * curveK, curveGamma flattens extremes.
    curveK: 1.0,
    curveGamma: 0.92,           // <1 flattens large values
  };

  class Scaler {
    constructor(opts = {}) {
      this.cfg = { ...DEFAULTS, ...(opts || {}) };
    }

    // vbytes -> side in cells (integer)
    sideCellsFromVBytes(vb) {
      const v = Number(vb);
      if (!Number.isFinite(v) || v <= 0) return this.cfg.minSideCells;

      const area = v * this.cfg.areaPerVByte;          // cells^2 (float)
      let side = Math.sqrt(Math.max(0, area)) * this.cfg.curveK;
      side = Math.pow(side, this.cfg.curveGamma);

      side = clamp(side, this.cfg.minSideCells, this.cfg.maxSideCells);
      return Math.max(this.cfg.minSideCells, Math.round(side));
    }

    // weight -> approximate vbytes (vB ~= weight/4)
    sideCellsFromWeight(weight) {
      const w = Number(weight);
      if (!Number.isFinite(w) || w <= 0) return this.cfg.minSideCells;
      return this.sideCellsFromVBytes(w / 4);
    }

    // Convert cell side -> pixel side (uses grid.cellPx)
    sidePx(sideCells, grid) {
      const s = Number(sideCells);
      const cell = Number(grid?.cellPx || 8);
      const gap  = Number(grid?.gapPx  || 1);
      // sideCells squares occupy cellPx each plus gaps between internal cells.
      // For single square per tx: treat as sideCells * cell + (sideCells-1)*gap.
      return (s * cell) + (Math.max(0, s - 1) * gap);
    }
  }

  NS.Scaler = Scaler;
})();
