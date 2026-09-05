// __partials/widgets/mempool-specs/tiler.js
// DROP-IN COMPLETE REPLACEMENT
//
// Purpose:
// - Convert an input stream of "tx-like" items (or fee bands) into *square tiles*
//   with a `side` (cells) suitable for square-packing / tetris-fill.
// - Keeps compatibility with older code that expected `sideCellsFromVBytes()`
//   by providing a deterministic fallback based on area.
//
// Inputs supported:
//   A) tx-like items: [{ txid, vbytes, feeRate, feeUsd?, valueUsd?, ... }]
//   B) fee bands:    [{ feeRate, vbytes }]  (from fee histogram / block template)
//
// Output:
//   [{ txid, feeRate, vbytes, areaCells, side, ... }]
//
// Exposes:
//   window.ZZXMempoolSpecs.Tiler.fromTxs(txs, scaler, opts)
//   window.ZZXMempoolSpecs.Tiler.fromFeeBands(bands, scaler, opts)
//
// Notes:
// - This module DOES NOT fetch.
// - It only produces tiles; your packer decides placement.
// - “mempool-goggles feel” comes from: many small tiles + a few big tiles.
//   Tune `MAX_TILES`, `TARGET_CHUNK_VB`, and side clamps.

(function () {
  "use strict";

  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});

  function n(x, d = NaN) {
    const v = Number(x);
    return Number.isFinite(v) ? v : d;
  }

  function clamp(nv, a, b) {
    return Math.max(a, Math.min(b, nv));
  }

  // Deterministic string hash (for stable ids / tiebreakers if needed)
  function hash32(s) {
    s = String(s ?? "");
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // --- Core: area -> square side (cells) ---
  function sideFromArea(areaCells, cfg) {
    // areaCells is a scalar in "cell units" (not pixels).
    const a = Math.max(1, Math.floor(areaCells || 1));

    // square side ~= sqrt(area). Keep a gentle curve so whales exist but don’t eat the canvas.
    // gamma < 1 makes large tiles less dominant.
    const gamma = Number.isFinite(cfg?.sideGamma) ? cfg.sideGamma : 0.92;
    const k = Number.isFinite(cfg?.sideK) ? cfg.sideK : 1.0;

    let side = Math.sqrt(a) * k;
    side = Math.pow(Math.max(1e-9, side), gamma);

    const minSide = Number.isFinite(cfg?.minSide) ? cfg.minSide : 1;
    const maxSide = Number.isFinite(cfg?.maxSide) ? cfg.maxSide : 20;

    return clamp(Math.round(side), minSide, maxSide);
  }

  // --- Helper: derive areaCells from scaler (supports multiple scaler APIs) ---
  function areaFromVBytes(vbytes, scaler) {
    if (!scaler) return Math.max(1, Math.round(n(vbytes, 0) / 850));

    // Preferred (your new scaler)
    if (typeof scaler.areaCellsFromVBytes === "function") {
      return scaler.areaCellsFromVBytes(vbytes);
    }

    // Old API: sideCellsFromVBytes -> convert side^2 -> area
    if (typeof scaler.sideCellsFromVBytes === "function") {
      const side = Math.max(1, Math.round(scaler.sideCellsFromVBytes(vbytes)));
      return side * side;
    }

    // Last resort: proportional
    return Math.max(1, Math.round(n(vbytes, 0) / 850));
  }

  function areaFromTx(tx, scaler, opts) {
    if (!tx) return 1;

    if (scaler && typeof scaler.areaCellsFromTx === "function") {
      return scaler.areaCellsFromTx(tx, opts);
    }

    // fallback: use vbytes only
    return areaFromVBytes(tx.vbytes, scaler);
  }

  // --- Build tiles from tx list (already discrete txs) ---
  function fromTxs(txs, scaler, opts = {}) {
    const cfg = {
      MAX_TILES: Number.isFinite(opts.maxTiles) ? opts.maxTiles : 520,
      minSide: Number.isFinite(opts.minSide) ? opts.minSide : 1,
      maxSide: Number.isFinite(opts.maxSide) ? opts.maxSide : 22,
      sideGamma: Number.isFinite(opts.sideGamma) ? opts.sideGamma : 0.92,
      sideK: Number.isFinite(opts.sideK) ? opts.sideK : 1.0,
      btcUsd: Number.isFinite(opts.btcUsd) ? opts.btcUsd : undefined,
    };

    const out = [];
    const src = Array.isArray(txs) ? txs : [];

    for (let i = 0; i < src.length && out.length < cfg.MAX_TILES; i++) {
      const t = src[i];
      if (!t) continue;

      const txid = String(t.txid ?? t.hash ?? t.id ?? `tx:${i}:${hash32(JSON.stringify(t))}`);
      const vbytes = Math.max(1, Math.round(n(t.vbytes ?? t.vsize ?? t.size, 0)));
      const feeRate = n(t.feeRate ?? t.fee_rate ?? t.feerate ?? t.feePerVb, 0);

      const txObj = {
        txid,
        vbytes,
        feeRate,
        feeUsd: n(t.feeUsd, NaN),
        valueUsd: n(t.valueUsd, NaN),
      };

      const areaCells = areaFromTx(txObj, scaler, { btcUsd: cfg.btcUsd });
      const side = sideFromArea(areaCells, cfg);

      out.push({
        ...t,
        txid,
        vbytes,
        feeRate,
        areaCells,
        side
      });
    }

    return out;
  }

  // --- Build tiles from fee bands (histogram-derived) ---
  // We “shard” each band into chunks so you get many tiles, like goggles.
  function fromFeeBands(bands, scaler, opts = {}) {
    const cfg = {
      // cap total tiles (performance)
      MAX_TILES: Number.isFinite(opts.maxTiles) ? opts.maxTiles : 520,

      // chunking
      TARGET_CHUNK_VB: Number.isFinite(opts.targetChunkVb) ? opts.targetChunkVb : 12_000,
      MIN_CHUNK_VB: Number.isFinite(opts.minChunkVb) ? opts.minChunkVb : 900,
      MAX_CHUNKS_PER_BAND: Number.isFinite(opts.maxChunksPerBand) ? opts.maxChunksPerBand : 28,

      // side shaping
      minSide: Number.isFinite(opts.minSide) ? opts.minSide : 1,
      maxSide: Number.isFinite(opts.maxSide) ? opts.maxSide : 22,
      sideGamma: Number.isFinite(opts.sideGamma) ? opts.sideGamma : 0.92,
      sideK: Number.isFinite(opts.sideK) ? opts.sideK : 1.0,

      // deterministic seed (stabilizes txids across refreshes)
      seed: Number.isFinite(opts.seed) ? opts.seed : 0,
    };

    const rows = (Array.isArray(bands) ? bands : [])
      .map(b => ({
        feeRate: n(b?.feeRate ?? b?.fee ?? (Array.isArray(b) ? b[0] : NaN), NaN),
        vbytes: n(b?.vbytes ?? (Array.isArray(b) ? b[1] : NaN), NaN),
      }))
      .filter(r => Number.isFinite(r.feeRate) && Number.isFinite(r.vbytes) && r.vbytes > 0);

    // high fee first (goggles vibe)
    rows.sort((a, b) => b.feeRate - a.feeRate);

    const out = [];
    let serial = 0;

    for (const band of rows) {
      if (out.length >= cfg.MAX_TILES) break;

      const vb = Math.max(1, Math.round(band.vbytes));
      const feeRate = band.feeRate;

      // choose chunk count: proportional to band size but bounded
      let chunks = Math.round(vb / cfg.TARGET_CHUNK_VB);
      chunks = clamp(chunks, 1, cfg.MAX_CHUNKS_PER_BAND);

      // compute chunk size, enforce minimum
      let chunkVb = Math.max(cfg.MIN_CHUNK_VB, Math.floor(vb / chunks));
      chunks = clamp(Math.round(vb / chunkVb), 1, cfg.MAX_CHUNKS_PER_BAND);

      for (let i = 0; i < chunks && out.length < cfg.MAX_TILES; i++) {
        const isLast = (i === chunks - 1);
        const vbi = isLast ? (vb - chunkVb * (chunks - 1)) : chunkVb;
        const vbytes = Math.max(1, Math.round(vbi));

        const areaCells = areaFromVBytes(vbytes, scaler);
        const side = sideFromArea(areaCells, cfg);

        // stable-ish txid
        const txid = `band:${feeRate}:${cfg.seed}:${serial++}:${i}`;

        out.push({
          txid,
          feeRate,
          vbytes,
          areaCells,
          side
        });
      }
    }

    return out;
  }

  NS.Tiler = { fromTxs, fromFeeBands };
})();
