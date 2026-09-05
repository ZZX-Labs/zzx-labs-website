// __partials/widgets/mempool-specs/scaler.js
// DROP-IN COMPLETE REPLACEMENT (COMPAT + TREEMAP-READY)
//
// Fixes your runtime error:
//   scaler.sideCellsFromVBytes is not a function
//
// What this does:
// - Provides BOTH interfaces:
//     * sideCellsFromVBytes(vb)  -> integer side length in grid-cells (square tiles)
//     * sideCellsFromTx(tx)      -> same, but can use fee/feerate/value bumps
// - ALSO provides areaCellsFrom* helpers for future treemap/binpack renderers.
// - Keeps output stable across resizes because output is in GRID CELL UNITS.
//
// Exposes:
//   window.ZZXMempoolSpecs.Scaler
//     - sideCellsFromVBytes(vb)
//     - sideCellsFromTx(tx, { btcUsd? })
//     - areaCellsFromVBytes(vb)
//     - areaCellsFromTx(tx, { btcUsd? })
//
(function () {
  "use strict";

  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  // IMPORTANT:
  // - Your current widget pipeline (bandsToSquares -> Sorter.packSquares -> Plotter.draw)
  //   expects a "side" (square tiles).
  // - Future treemap renderers will prefer "areaCells".
  //
  // This scaler supports both, with a single consistent mapping.
  const DEFAULTS = {
    // Base density: vb -> areaCells (roughly “cell^2 units”)
    // Bigger => larger tiles / fewer total tiles fit.
    // Start conservative; adjust after you see real visuals.
    areaCellsPerVByte: 1 / 850, // ~1 area cell per 850 vB (tune)

    // Limits
    minSideCells: 1,
    maxSideCells: 22,        // keeps huge tiles from swallowing the canvas
    minAreaCells: 1,
    maxAreaCells: 2600,

    // Curve: side = sqrt(area) transformed to avoid extremes
    curveK: 1.0,
    curveGamma: 0.92,        // <1 flattens big txs slightly

    // Optional bumps (subtle; don’t let “value” override size)
    valueK: 0.05,            // feeUsd bump (log-scaled)
    feeRateK: 0.02,          // feerate bump (log-scaled)

    // If you later attach explicit "weight" fields, you can treat vbytes ~= weight/4
    weightToVBytes: 1 / 4
  };

  class Scaler {
    constructor(opts = {}) {
      this.cfg = { ...DEFAULTS, ...(opts || {}) };
    }

    // -----------------------------
    // AREA (for future treemap/binpack)
    // -----------------------------
    areaCellsFromVBytes(vb) {
      const v = Number(vb);
      if (!Number.isFinite(v) || v <= 0) return this.cfg.minAreaCells;

      let a = v * this.cfg.areaCellsPerVByte;
      a = clamp(a, this.cfg.minAreaCells, this.cfg.maxAreaCells);
      return Math.max(this.cfg.minAreaCells, Math.round(a));
    }

    areaCellsFromTx(tx, opts = {}) {
      // vbytes primary
      let vb = Number(tx?.vbytes);

      // allow weight fallback
      if (!Number.isFinite(vb) || vb <= 0) {
        const w = Number(tx?.weight);
        if (Number.isFinite(w) && w > 0) vb = w * this.cfg.weightToVBytes;
      }

      let a = this.areaCellsFromVBytes(vb);

      // feeUsd bump (log-scaled, subtle)
      const feeUsd = Number(tx?.feeUsd);
      if (Number.isFinite(feeUsd) && feeUsd > 0) {
        a *= (1 + this.cfg.valueK * Math.log10(1 + feeUsd));
      }

      // feerate bump (log-scaled, very subtle)
      const fr = Number(tx?.feeRate);
      if (Number.isFinite(fr) && fr > 0) {
        a *= (1 + this.cfg.feeRateK * Math.log10(1 + fr));
      }

      a = clamp(a, this.cfg.minAreaCells, this.cfg.maxAreaCells);
      return Math.max(this.cfg.minAreaCells, Math.round(a));
    }

    // -----------------------------
    // SIDE (square tile side length, used by CURRENT widget.js + plotter.js)
    // -----------------------------
    sideCellsFromVBytes(vb) {
      const area = this.areaCellsFromVBytes(vb);

      // Convert area -> side, with curve
      let side = Math.sqrt(Math.max(1, area)) * this.cfg.curveK;
      side = Math.pow(side, this.cfg.curveGamma);

      side = clamp(side, this.cfg.minSideCells, this.cfg.maxSideCells);
      return Math.max(this.cfg.minSideCells, Math.round(side));
    }

    sideCellsFromTx(tx, opts = {}) {
      const area = this.areaCellsFromTx(tx, opts);

      let side = Math.sqrt(Math.max(1, area)) * this.cfg.curveK;
      side = Math.pow(side, this.cfg.curveGamma);

      side = clamp(side, this.cfg.minSideCells, this.cfg.maxSideCells);
      return Math.max(this.cfg.minSideCells, Math.round(side));
    }

    // Convenience: weight -> side (if you ever feed weight directly)
    sideCellsFromWeight(weight) {
      const w = Number(weight);
      if (!Number.isFinite(w) || w <= 0) return this.cfg.minSideCells;
      return this.sideCellsFromVBytes(w * this.cfg.weightToVBytes);
    }
  }

  NS.Scaler = Scaler;
})();
