// __partials/widgets/mempool-specs/scaler.js
// DROP-IN COMPLETE REPLACEMENT
//
// Purpose:
// - Convert transaction size → square size (grid cells)
// - Stable, deterministic sizing (no jitter across renders)
// - Zero network, zero DOM dependencies
//
// Exposes:
//   window.ZZXMempoolSpecs.Scaler

(function () {
  "use strict";

  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  const DEFAULTS = {
    areaPerVByte: 1 / 6500,   // tuned for ~1M vB block
    minSideCells: 1,
    maxSideCells: 18,
    curveGamma: 0.92          // flattens very large tx dominance
  };

  class Scaler {
    constructor(opts = {}) {
      this.cfg = { ...DEFAULTS, ...(opts || {}) };
    }

    // vbytes → grid cell side length
    sideCellsFromVBytes(vbytes) {
      const vb = Number(vbytes);
      if (!Number.isFinite(vb) || vb <= 0) {
        return this.cfg.minSideCells;
      }

      // area in grid-cell units
      const area = vb * this.cfg.areaPerVByte;

      // side length with curve flattening
      let side = Math.pow(Math.sqrt(area), this.cfg.curveGamma);

      side = clamp(
        Math.round(side),
        this.cfg.minSideCells,
        this.cfg.maxSideCells
      );

      return side;
    }

    // weight → vbytes → side
    sideCellsFromWeight(weight) {
      const w = Number(weight);
      if (!Number.isFinite(w) || w <= 0) {
        return this.cfg.minSideCells;
      }
      return this.sideCellsFromVBytes(w / 4);
    }

    // grid-cells → pixels (helper)
    sidePx(sideCells, grid) {
      const s = Math.max(1, Number(sideCells) || 1);
      const cell = Number(grid?.cellPx || 8);
      const gap  = Number(grid?.gapPx  || 1);
      return (s * cell) + ((s - 1) * gap);
    }
  }

  NS.Scaler = Scaler;
})();
