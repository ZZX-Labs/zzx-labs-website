// __partials/widgets/mempool-specs/scaler.js
// DROP-IN COMPLETE REPLACEMENT
//
// Purpose:
// - Convert tx "mass" into a SQUARE tile size (side length in grid cells).
// - Keeps compatibility with older widget code that calls:
//     scaler.sideCellsFromVBytes(vb)
// - Adds richer helpers for value/fee-rate weighting:
//     scaler.sideCellsFromTx(tx)
//
// Notes:
// - This is the key to "mempool goggles" look: a few big tiles, many small.
// - Tune SIDE_PER_VBYTE (and clamps) to change density.
//
// Exposes:
//   window.ZZXMempoolSpecs.Scaler
//     - sideCellsFromVBytes(vb)
//     - sideCellsFromWeight(weight)         // weight -> vbytes -> side
//     - sideCellsFromAreaCells(areaCells)   // if you later compute area first
//     - sideCellsFromTx(tx)
//
// tx expected fields (best-effort):
//   tx.vbytes, tx.weight, tx.feeRate (sat/vB), tx.feeUsd (optional), tx.valueUsd (optional)
//
// IMPORTANT:
// - Output is an INTEGER side length in CELLS.
// - Packing stage must treat tiles as squares (side x side).
//
(function () {
  "use strict";

  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});

  function n2(x){ const v = Number(x); return Number.isFinite(v) ? v : NaN; }
  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

  const DEFAULTS = {
    // --- Base size mapping (vbytes -> area -> side) ---
    // Treat vb as "mass". Convert vb -> areaCells, then side = sqrt(areaCells).
    // Bigger AREA_PER_VB => bigger tiles.
    //
    // Starting point that yields visible size diversity on phone:
    // - If you later create ~250-420 tiles total, this looks good.
    AREA_PER_VBYTE: 1 / 620,  // cells^2 per vB (tune)

    // Curve controls (shape the distribution of sizes)
    // gamma < 1 makes big tiles a bit more common (fatter tail)
    GAMMA: 0.88,
    K: 1.00,

    // Clamps on the final side length
    MIN_SIDE: 1,
    MAX_SIDE: 18,

    // --- Optional subtle weighting (keeps "size ≈ vbytes" but nudges importance) ---
    // These are deliberately small to avoid destroying the “block mass” feel.
    FEE_USD_K: 0.05,     // log bump vs feeUsd
    VALUE_USD_K: 0.03,   // log bump vs valueUsd (if provided)
    FEERATE_K: 0.02,     // log bump vs feeRate (sat/vB)

    // If you only have histogram (no per-tx), you can ignore USD fields.
  };

  class Scaler {
    constructor(opts = {}) {
      this.cfg = { ...DEFAULTS, ...(opts || {}) };
    }

    // --- Core: vbytes -> side in cells ---
    // Compatibility: widget.js currently calls this.
    sideCellsFromVBytes(vb) {
      const v = n2(vb);
      if (!Number.isFinite(v) || v <= 0) return this.cfg.MIN_SIDE;

      // area in "cell^2" units
      let area = v * this.cfg.AREA_PER_VBYTE;

      // convert to side
      let side = Math.sqrt(Math.max(0, area)) * this.cfg.K;

      // shape distribution
      side = Math.pow(side, this.cfg.GAMMA);

      // clamp + integer
      side = clamp(side, this.cfg.MIN_SIDE, this.cfg.MAX_SIDE);
      return Math.max(this.cfg.MIN_SIDE, Math.round(side));
    }

    sideCellsFromWeight(weight) {
      const w = n2(weight);
      if (!Number.isFinite(w) || w <= 0) return this.cfg.MIN_SIDE;
      return this.sideCellsFromVBytes(w / 4);
    }

    // If you compute areaCells elsewhere (e.g., from a treemap mass),
    // convert area -> side for square packing.
    sideCellsFromAreaCells(areaCells) {
      const a = n2(areaCells);
      if (!Number.isFinite(a) || a <= 0) return this.cfg.MIN_SIDE;

      let side = Math.sqrt(Math.max(0, a)) * this.cfg.K;
      side = Math.pow(side, this.cfg.GAMMA);

      side = clamp(side, this.cfg.MIN_SIDE, this.cfg.MAX_SIDE);
      return Math.max(this.cfg.MIN_SIDE, Math.round(side));
    }

    // --- Rich helper: tx -> side ---
    // Uses vbytes/weight as primary mass, then nudges size based on fee/value/feerate if present.
    sideCellsFromTx(tx = {}) {
      // base mass
      const vb = n2(tx.vbytes);
      const wt = n2(tx.weight);

      let baseSide = Number.isFinite(vb)
        ? this.sideCellsFromVBytes(vb)
        : (Number.isFinite(wt) ? this.sideCellsFromWeight(wt) : this.cfg.MIN_SIDE);

      // optional nudges (log-scale)
      let bump = 1.0;

      const feeUsd = n2(tx.feeUsd);
      if (Number.isFinite(feeUsd) && feeUsd > 0) {
        bump *= (1 + this.cfg.FEE_USD_K * Math.log10(1 + feeUsd));
      }

      const valueUsd = n2(tx.valueUsd);
      if (Number.isFinite(valueUsd) && valueUsd > 0) {
        bump *= (1 + this.cfg.VALUE_USD_K * Math.log10(1 + valueUsd));
      }

      const fr = n2(tx.feeRate);
      if (Number.isFinite(fr) && fr > 0) {
        bump *= (1 + this.cfg.FEERATE_K * Math.log10(1 + fr));
      }

      let side = baseSide * bump;

      side = clamp(side, this.cfg.MIN_SIDE, this.cfg.MAX_SIDE);
      return Math.max(this.cfg.MIN_SIDE, Math.round(side));
    }
  }

  NS.Scaler = Scaler;
})();
