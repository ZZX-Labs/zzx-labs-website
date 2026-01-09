// __partials/widgets/mempool-specs/scaler.js
// DROP-IN COMPLETE REPLACEMENT
//
// Goal:
// - Produce varied square sizes that "feel" like mempool goggles,
//   using vbytes as the primary driver + optional economic weighting.
//
// Inputs supported:
// - sideCellsFromVBytes(vb)
// - sideCellsFromTx(tx, { btcUsd })  // tx may contain: vbytes, feeRate, feeSats, feeBtc, feeUsd
//
// Notes:
// - vbytes dominates size
// - value weighting is intentionally subtle (prevents giant squares everywhere)
// - clamps protect performance and readability
//
// Exposes: window.ZZXMempoolSpecs.Scaler
(function () {
  "use strict";

  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  const DEFAULTS = {
    // Primary mapping: vbytes -> area in cell^2 (tuned for 1,000,000 vB)
    // Smaller number => smaller squares.
    areaPerVByte: 1 / 18_000,

    minSideCells: 1,
    maxSideCells: 22,

    // Base curvature (keeps large txs from dominating)
    curveGamma: 0.92,

    // Value weighting (subtle):
    // side *= (1 + valueK * log10(1 + feeUsd))
    // feeUsd may be missing; then it falls back to sats weighting.
    valueK: 0.11,

    // Fee-rate weighting (very subtle): side *= (1 + feeRateK * log10(1 + feeRate))
    feeRateK: 0.05,
  };

  class Scaler {
    constructor(opts = {}) {
      this.cfg = { ...DEFAULTS, ...(opts || {}) };
    }

    sideCellsFromVBytes(vb) {
      const v = Number(vb);
      if (!Number.isFinite(v) || v <= 0) return this.cfg.minSideCells;

      // area in cells^2
      const area = Math.max(0, v * this.cfg.areaPerVByte);

      // side baseline (sqrt(area)), then flatten extremes
      let side = Math.sqrt(area);
      side = Math.pow(side, this.cfg.curveGamma);

      side = clamp(side, this.cfg.minSideCells, this.cfg.maxSideCells);
      return Math.max(this.cfg.minSideCells, Math.round(side));
    }

    // Economic-weighted sizing
    sideCellsFromTx(tx, opts = {}) {
      const vb = Number(tx?.vbytes);
      let side = this.sideCellsFromVBytes(vb);

      // Use feeUsd if provided, otherwise estimate from sats if present
      let feeUsd = Number(tx?.feeUsd);
      if (!Number.isFinite(feeUsd) || feeUsd <= 0) {
        const btcUsd = Number(opts?.btcUsd);
        const feeBtc = Number(tx?.feeBtc);
        const feeSats = Number(tx?.feeSats);

        if (Number.isFinite(feeUsd) && feeUsd > 0) {
          // ok
        } else if (Number.isFinite(feeBtc) && feeBtc > 0 && Number.isFinite(btcUsd) && btcUsd > 0) {
          feeUsd = feeBtc * btcUsd;
        } else if (Number.isFinite(feeSats) && feeSats > 0 && Number.isFinite(btcUsd) && btcUsd > 0) {
          feeUsd = (feeSats / 1e8) * btcUsd;
        } else {
          feeUsd = NaN;
        }
      }

      // Value weighting (subtle)
      if (Number.isFinite(feeUsd) && feeUsd > 0) {
        const bump = 1 + this.cfg.valueK * Math.log10(1 + feeUsd);
        side = side * bump;
      } else {
        // fallback to sats bump if we have it
        const feeSats = Number(tx?.feeSats);
        if (Number.isFinite(feeSats) && feeSats > 0) {
          const bump = 1 + (this.cfg.valueK * 0.65) * Math.log10(1 + feeSats);
          side = side * bump;
        }
      }

      // Fee-rate bump (very subtle)
      const fr = Number(tx?.feeRate);
      if (Number.isFinite(fr) && fr > 0) {
        const bump = 1 + this.cfg.feeRateK * Math.log10(1 + fr);
        side = side * bump;
      }

      side = clamp(side, this.cfg.minSideCells, this.cfg.maxSideCells);
      return Math.max(this.cfg.minSideCells, Math.round(side));
    }

    // Convert cell side -> pixel side (uses grid.cellPx)
    sidePx(sideCells, grid) {
      const s = Number(sideCells);
      const cell = Number(grid?.cellPx || 8);
      const gap  = Number(grid?.gapPx  || 1);
      return (s * cell) + (Math.max(0, s - 1) * gap);
    }
  }

  NS.Scaler = Scaler;
})();
