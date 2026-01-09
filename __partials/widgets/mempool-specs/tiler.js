// __partials/widgets/mempool-specs/tiler.js
// DROP-IN COMPLETE REPLACEMENT
//
// Purpose:
// - Convert “tx-like” items into SQUARE tiles sized in grid cells.
// - Keeps compatibility with older code that expected sideCellsFromVBytes()
// - Supports: vbytes-driven sizing + subtle fee/feeRate/value weighting.
// - Outputs tiles ready for BinFill.pack() (or tetrifill.js later).
//
// Input items (minimum):
//   [{ txid, vbytes, feeRate, feeSats, feeUsd, ... }]
//
// Output:
//   [{ ...item, side }]   // side is integer in GRID CELLS
//
// Exposes:
//   window.ZZXMempoolSpecs.Tiler.makeTiles(items, grid, opts)
//   window.ZZXMempoolSpecs.Tiler.sideFromTx(tx, grid, opts)
//   window.ZZXMempoolSpecs.Tiler.ensureScalerCompat()  (patches Scaler API compat)
//
// Notes:
// - Sizing target: keep the "block field" visually dense on mobile.
// - You can tune overall density with opts.density (default 1.0).
//
(function () {
  "use strict";

  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});
  const API = (NS.Tiler = NS.Tiler || {});

  function n2(x){ const v = Number(x); return Number.isFinite(v) ? v : NaN; }
  function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }

  // Default sizing knobs
  const DEFAULTS = {
    density: 1.0,          // global multiplier (bigger => larger tiles)
    minSide: 1,
    maxSide: 18,           // clamped to grid anyway

    // Base mapping: side ~ (vbytes / vbPerCell)^(gamma)
    vbPerCell: 1100,       // smaller => bigger tiles
    gamma: 0.52,           // <1 compresses large txs (keeps small txs visible)

    // Optional bumps (gentle)
    feeRateK: 0.08,        // sat/vB
    feeUsdK: 0.10,         // log-scaled
    feeSatsK: 0.06,        // log-scaled

    // If you want a “big tile” feel more like mempool goggles, raise this a bit:
    bigBias: 0.10,         // adds slight curvature toward larger tiles
  };

  function sideFromVBytes(vb, cfg) {
    const v = n2(vb);
    if (!Number.isFinite(v) || v <= 0) return cfg.minSide;

    // base: scale vbytes into “cell mass”
    const mass = (v / cfg.vbPerCell) * cfg.density;

    // side from mass (compressed by gamma)
    let side = Math.pow(Math.max(0.0001, mass), cfg.gamma);

    // bias toward bigger tiles without exploding
    side = side * (1 + cfg.bigBias * Math.log10(1 + mass));

    // convert to integer side in cells
    side = Math.round(side);

    return clamp(side, cfg.minSide, cfg.maxSide);
  }

  function sideFromTx(tx, grid, opts = {}) {
    const cfg = { ...DEFAULTS, ...(opts || {}) };

    // clamp maxSide by grid dimensions
    const cols = Math.max(1, Math.floor(grid?.cols || 1));
    const rows = Math.max(1, Math.floor(grid?.rows || 1));
    cfg.maxSide = clamp(cfg.maxSide, 1, Math.min(cols, rows));

    let side = sideFromVBytes(tx?.vbytes, cfg);

    // Gentle bumps:
    // - feeRate: high priority tends to be larger (subtle)
    const fr = n2(tx?.feeRate);
    if (Number.isFinite(fr) && fr > 0) {
      side *= (1 + cfg.feeRateK * Math.log10(1 + fr));
    }

    // - fee in sats: log bump
    const feeSats = n2(tx?.feeSats ?? tx?.fee);
    if (Number.isFinite(feeSats) && feeSats > 0) {
      side *= (1 + cfg.feeSatsK * Math.log10(1 + (feeSats / 1e4)));
    }

    // - fee in USD if available
    const feeUsd = n2(tx?.feeUsd);
    if (Number.isFinite(feeUsd) && feeUsd > 0) {
      side *= (1 + cfg.feeUsdK * Math.log10(1 + feeUsd));
    }

    side = Math.round(side);
    side = clamp(side, cfg.minSide, cfg.maxSide);

    return side;
  }

  // Back-compat patch: some of your widget.js expects scaler.sideCellsFromVBytes()
  // and/or scaler.sideCellsFromWeight(). If Scaler was replaced, patch it.
  function ensureScalerCompat() {
    const Scaler = NS.Scaler;
    if (!Scaler || !Scaler.prototype) return false;

    // If already present, do nothing
    if (typeof Scaler.prototype.sideCellsFromVBytes === "function") return true;

    // Provide compat methods by mapping "area" => side, or using vbytes directly.
    Scaler.prototype.sideCellsFromVBytes = function (vb) {
      // Prefer an existing areaCellsFromVBytes if present
      if (typeof this.areaCellsFromVBytes === "function") {
        const a = n2(this.areaCellsFromVBytes(vb));
        const s = Math.sqrt(Math.max(1, a));
        return Math.max(1, Math.round(s));
      }
      // fallback
      return Math.max(1, Math.round(Math.sqrt(Math.max(1, n2(vb) / 1100))));
    };

    Scaler.prototype.sideCellsFromWeight = function (w) {
      const vb = n2(w) / 4;
      return this.sideCellsFromVBytes(vb);
    };

    // Optional helper: side from tx (if it exists)
    if (typeof Scaler.prototype.sideCellsFromTx !== "function") {
      Scaler.prototype.sideCellsFromTx = function (tx, grid, opts) {
        return sideFromTx(tx, grid, opts);
      };
    }

    return true;
  }

  function makeTiles(items, grid, opts = {}) {
    const src = Array.isArray(items) ? items : [];
    const out = [];

    for (let i = 0; i < src.length; i++) {
      const tx = src[i];
      const txid = String(tx?.txid ?? tx?.id ?? `tx:${i}`);
      const side = sideFromTx({ ...tx, txid }, grid, opts);

      out.push({
        ...tx,
        txid,
        side
      });
    }

    // Sort big->small for packers (stable enough)
    out.sort((a, b) => (b.side - a.side) || ((n2(b.feeRate)||0) - (n2(a.feeRate)||0)));
    return out;
  }

  API.sideFromTx = sideFromTx;
  API.makeTiles = makeTiles;
  API.ensureScalerCompat = ensureScalerCompat;
})();
