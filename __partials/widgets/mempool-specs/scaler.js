// __partials/widgets/mempool-specs/scaler.js
// DROP-IN COMPLETE REPLACEMENT
//
// Purpose (SQUARE-TILE MODE, mempool-goggles style):
// - Provide BOTH area + side helpers so different pipeline parts don't break.
// - Primary output for the square packer is `side` (cells).
// - Size is driven mostly by vbytes, with *subtle* bumps for fee-rate + economic value.
//   (So big txs look big, and expensive/urgent txs get a little emphasis without
//    becoming cartoonishly huge.)
//
// Exposes:
//   window.ZZXMempoolSpecs.Scaler
//     - areaCellsFromVBytes(vb)
//     - areaCellsFromTx(tx, { btcUsd })
//     - sideCellsFromVBytes(vb)
//     - sideCellsFromTx(tx, { btcUsd })
//
// Notes:
// - `sideCellsFromVBytes()` is REQUIRED by your existing widget.js/bandsToSquares.
// - If you later add real tx objects, call `sideCellsFromTx()` and attach `side`.
//
// Safe defaults, deterministic, no network.

(function () {
  "use strict";

  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  // Defaults tuned so a typical 1,000,000 vB block can be represented
  // in ~200–450 tiles depending on chunking, without filling the grid with 1x1 noise.
  const DEFAULTS = {
    // Base mapping: vbytes -> "area cells"
    // Higher => bigger tiles overall.
    // (This is NOT side length; we convert area -> side via sqrt later.)
    cellsPerVByte: 1 / 900,          // ~1 area-cell per 900 vB (starting point)

    // Clamp the computed "area cells"
    minAreaCells: 1,
    maxAreaCells: 2400,

    // Side clamps (cells)
    minSideCells: 1,
    maxSideCells: 26,

    // Curve shaping:
    // side ~= sqrt(area)^gamma * k
    curveK: 1.0,
    curveGamma: 0.92,                // <1 compresses extremes (prevents mega-tiles)

    // Optional *subtle* emphasis knobs (log-scaled bumps)
    // Fee-rate bump: urgent txs slightly larger (not dominant)
    feeRateK: 0.020,                 // multiplier on log10(1+feerate)
    // Fee bump: if you have feeSats/feeUsd, slightly increase size
    feeValueK: 0.050,                // multiplier on log10(1+feeUsd) or log10(1+feeBtc)

    // Safety: never let bumps exceed this factor (prevents spikes)
    maxBumpFactor: 1.35
  };

  function safeNum(x) {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  }

  function log1p10(x) {
    // log10(1+x) for x>=0
    const v = Math.max(0, Number(x) || 0);
    return Math.log10(1 + v);
  }

  class Scaler {
    constructor(opts = {}) {
      this.cfg = { ...DEFAULTS, ...(opts || {}) };
    }

    // --- AREA ---
    areaCellsFromVBytes(vb) {
      const v = safeNum(vb);
      if (!v || v <= 0) return this.cfg.minAreaCells;

      let a = v * this.cfg.cellsPerVByte;
      a = clamp(a, this.cfg.minAreaCells, this.cfg.maxAreaCells);
      return Math.max(this.cfg.minAreaCells, Math.round(a));
    }

    // tx may include:
    // - vbytes
    // - feeRate (sat/vB)
    // - feeSats (or fee_sat, fee)
    // - feeUsd (optional)
    // - valueUsd/valueBtc/volumeUsd (optional) -> treated as "economic mass"
    areaCellsFromTx(tx, { btcUsd } = {}) {
      const vb = safeNum(tx?.vbytes);
      let a = this.areaCellsFromVBytes(vb);

      // ---- Subtle emphasis bumps ----
      let bump = 1.0;

      // 1) fee-rate bump (sat/vB)
      const fr = safeNum(tx?.feeRate);
      if (fr && fr > 0) bump *= (1 + this.cfg.feeRateK * log1p10(fr));

      // 2) fee value bump (prefer feeUsd if present, else feeSats->feeBtc->feeUsd)
      const feeUsd = safeNum(tx?.feeUsd);
      if (feeUsd && feeUsd > 0) {
        bump *= (1 + this.cfg.feeValueK * log1p10(feeUsd));
      } else {
        const feeSats =
          safeNum(tx?.feeSats) ??
          safeNum(tx?.fee_sat) ??
          safeNum(tx?.fee) ??
          null;

        if (feeSats && feeSats > 0) {
          const feeBtc = feeSats / 1e8;
          let feeValue = feeBtc;
          const px = safeNum(btcUsd);
          if (px && px > 0) feeValue = feeBtc * px; // convert to USD if price known
          bump *= (1 + this.cfg.feeValueK * log1p10(feeValue));
        }
      }

      // 3) "economic mass" bump (optional, very restrained)
      // If you later feed real txs with valueUsd/volumeUsd, this can add a tiny bump.
      const econUsd =
        safeNum(tx?.valueUsd) ??
        safeNum(tx?.volumeUsd) ??
        null;
      if (econUsd && econUsd > 0) {
        bump *= (1 + (this.cfg.feeValueK * 0.35) * log1p10(econUsd));
      }

      bump = clamp(bump, 1.0, this.cfg.maxBumpFactor);

      a = a * bump;
      a = clamp(a, this.cfg.minAreaCells, this.cfg.maxAreaCells);
      return Math.max(this.cfg.minAreaCells, Math.round(a));
    }

    // --- SIDE (SQUARE TILE) ---
    sideCellsFromVBytes(vb) {
      const area = this.areaCellsFromVBytes(vb);
      return this._sideFromArea(area);
    }

    sideCellsFromTx(tx, { btcUsd } = {}) {
      const area = this.areaCellsFromTx(tx, { btcUsd });
      return this._sideFromArea(area);
    }

    _sideFromArea(areaCells) {
      const a = safeNum(areaCells);
      if (!a || a <= 1) return this.cfg.minSideCells;

      // Convert area->side with curve shaping
      let side = Math.sqrt(a) * this.cfg.curveK;
      side = Math.pow(side, this.cfg.curveGamma);

      side = clamp(side, this.cfg.minSideCells, this.cfg.maxSideCells);
      return Math.max(this.cfg.minSideCells, Math.round(side));
    }
  }

  NS.Scaler = Scaler;
})();
