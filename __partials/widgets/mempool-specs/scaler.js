// __partials/widgets/mempool-specs/scaler.js
// DROP-IN COMPLETE REPLACEMENT
//
// Purpose:
// - Convert tx "mass" into AREA in grid-cells (not side length).
// - This is what enables mempool.space-like treemap packing.
//
// Exposes:
//   window.ZZXMempoolSpecs.Scaler
//     - areaCellsFromVBytes(vb)
//     - areaCellsFromTx(tx, { btcUsd })
//
(function () {
  "use strict";

  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  const DEFAULTS = {
    // Roughly: cells per vbyte. Bigger => more/larger tiles.
    // Tune this to change overall density.
    // For mobile-friendly treemap, start around ~1 cell / 850 vB.
    cellsPerVByte: 1 / 850,

    // Area clamps (cells^2, but we're using "area cells" as scalar)
    minAreaCells: 1,
    maxAreaCells: 2200,

    // Subtle weighting (optional) so expensive txs become slightly larger
    // without breaking "size drives area" feel.
    valueK: 0.06,    // based on feeUsd if available
    feeRateK: 0.02,  // based on feeRate sat/vB
  };

  class Scaler {
    constructor(opts = {}) {
      this.cfg = { ...DEFAULTS, ...(opts || {}) };
    }

    areaCellsFromVBytes(vb) {
      const v = Number(vb);
      if (!Number.isFinite(v) || v <= 0) return this.cfg.minAreaCells;

      let a = v * this.cfg.cellsPerVByte; // area in "cell units"
      a = clamp(a, this.cfg.minAreaCells, this.cfg.maxAreaCells);
      return Math.max(this.cfg.minAreaCells, Math.round(a));
    }

    areaCellsFromTx(tx, opts = {}) {
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
  }

  NS.Scaler = Scaler;
})();
