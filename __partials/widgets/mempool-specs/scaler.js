// __partials/widgets/mempool-specs/scaler.js
// DROP-IN COMPLETE REPLACEMENT
//
// Purpose:
// - Convert tx "mass" into AREA in grid-cells (areaCells).
// - ALSO exposes sideCells helpers for compatibility with Sorter.packSquares,
//   which expects square tiles with integer side length in cells.
//
// Exposes:
//   window.ZZXMempoolSpecs.Scaler
//     - areaCellsFromVBytes(vb)
//     - areaCellsFromTx(tx)
//     - sideCellsFromVBytes(vb)   // compat
//     - sideCellsFromTx(tx)       // compat
//
(function () {
  "use strict";

  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  const DEFAULTS = {
    // AREA scale: larger => larger tiles overall
    // Start around 1 cell / 850 vB (you chose this)
    cellsPerVByte: 1 / 850,

    // Clamp for AREA (not side)
    minAreaCells: 1,
    maxAreaCells: 2200,

    // Subtle weighting so higher-value txs can appear slightly larger
    valueK: 0.06,    // based on feeUsd
    feeRateK: 0.02,  // based on feeRate sat/vB

    // Side clamps derived from area
    minSideCells: 1,
    maxSideCells: 64,

    // Optional curve to avoid giant whales dominating (side-based)
    // side = ceil(pow(sqrt(area), sideGamma))
    sideGamma: 1.0,  // 1.0 = linear in sqrt(area). <1 compresses big tiles.
  };

  class Scaler {
    constructor(opts = {}) {
      this.cfg = { ...DEFAULTS, ...(opts || {}) };
    }

    // -----------------------------
    // AREA API (your primary)
    // -----------------------------
    areaCellsFromVBytes(vb) {
      const v = Number(vb);
      if (!Number.isFinite(v) || v <= 0) return this.cfg.minAreaCells;

      let a = v * this.cfg.cellsPerVByte; // area in "cell units"
      a = clamp(a, this.cfg.minAreaCells, this.cfg.maxAreaCells);
      return Math.max(this.cfg.minAreaCells, Math.round(a));
    }

    areaCellsFromTx(tx) {
      const vb = Number(tx?.vbytes);
      let a = this.areaCellsFromVBytes(vb);

      // value bump (subtle)
      const feeUsd = Number(tx?.feeUsd);
      if (Number.isFinite(feeUsd) && feeUsd > 0) {
        const bump = 1 + this.cfg.valueK * Math.log10(1 + feeUsd);
        a *= bump;
      }

      // fee-rate bump (very subtle)
      const fr = Number(tx?.feeRate);
      if (Number.isFinite(fr) && fr > 0) {
        const bump = 1 + this.cfg.feeRateK * Math.log10(1 + fr);
        a *= bump;
      }

      a = clamp(a, this.cfg.minAreaCells, this.cfg.maxAreaCells);
      return Math.max(this.cfg.minAreaCells, Math.round(a));
    }

    // -----------------------------
    // SIDE API (compat for packer)
    // -----------------------------
    _sideFromArea(areaCells) {
      const a = clamp(Number(areaCells) || 1, this.cfg.minAreaCells, this.cfg.maxAreaCells);

      // Base: side ~= sqrt(area)
      let side = Math.sqrt(a);

      // Optional compression/expansion
      const g = Number(this.cfg.sideGamma);
      if (Number.isFinite(g) && g > 0 && g !== 1) side = Math.pow(side, g);

      side = Math.ceil(side);
      side = clamp(side, this.cfg.minSideCells, this.cfg.maxSideCells);
      return Math.max(this.cfg.minSideCells, Math.floor(side));
    }

    sideCellsFromVBytes(vb) {
      return this._sideFromArea(this.areaCellsFromVBytes(vb));
    }

    sideCellsFromTx(tx) {
      return this._sideFromArea(this.areaCellsFromTx(tx));
    }
  }

  NS.Scaler = Scaler;
})();
