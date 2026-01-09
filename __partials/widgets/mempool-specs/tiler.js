// __partials/widgets/mempool-specs/tiler.js
// DROP-IN (NEW)
//
// Purpose:
// - Convert "tx-like" inputs into drawable tile objects for Sorter.packSquares.
// - Centralizes scaling decisions (side from vbytes + optional fee/value nudges).
// - Works with BOTH sources:
//    A) histogram bands (pseudo-txs)  -> already have {feeRate, vbytes}
//    B) real tx objects (future)      -> may have {fee, vsize/weight, feeRate, value, ...}
//
// Contract output (per tile):
//   {
//     txid: string,
//     feeRate: number,   // sat/vB
//     vbytes: number,    // vB
//     feeSat: number,    // sat
//     feeUsd: number,    // USD (optional; if btcUsd provided or tx has feeUsd)
//     side: number       // integer grid-cells (REQUIRED by Sorter.packSquares)
//   }
//
// Exposes:
//   window.ZZXMempoolSpecs.Tiler
//     - fromHistogramBands(pickedBands, scaler, { seed, btcUsd })
//     - fromTxList(txs, scaler, { btcUsd })
//
(function () {
  "use strict";

  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});
  const ScalerC = NS.Scaler;

  function n2(x){ const v = Number(x); return Number.isFinite(v) ? v : NaN; }
  function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }

  // Fast stable-ish hash for ids
  function hash32(s, seed=0){
    const str = String(s ?? "");
    let h = (seed >>> 0) ^ 0x9e3779b9;
    for (let i=0;i<str.length;i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
    return h >>> 0;
  }

  function ensureScaler(scaler){
    if (scaler && typeof scaler.sideCellsFromTx === "function") return scaler;
    // fallback to default scaler if missing/miswired
    return new ScalerC();
  }

  // -----------------------------
  // Helpers: normalize tx fields
  // -----------------------------
  function normFeeRate(tx){
    // prefer explicit
    const fr =
      n2(tx?.feeRate) ??
      n2(tx?.feerate) ??
      n2(tx?.fee_rate) ??
      NaN;
    return Number.isFinite(fr) ? fr : NaN;
  }

  function normVBytes(tx){
    // common names: vsize, vbytes, size (sometimes bytes), weight
    const vb =
      n2(tx?.vbytes) ??
      n2(tx?.vsize) ??
      n2(tx?.virtual_size) ??
      NaN;

    if (Number.isFinite(vb) && vb > 0) return vb;

    const w = n2(tx?.weight);
    if (Number.isFinite(w) && w > 0) return w / 4;

    // last resort: raw bytes-ish (overestimates if already vB)
    const sz = n2(tx?.size) ?? n2(tx?.bytes) ?? NaN;
    if (Number.isFinite(sz) && sz > 0) return sz;

    return NaN;
  }

  function normFeeSat(tx){
    // mempool /tx returns fee in sats as "fee"
    const fs =
      n2(tx?.feeSat) ??
      n2(tx?.fee_sat) ??
      n2(tx?.fee) ??
      NaN;
    return Number.isFinite(fs) ? fs : NaN;
  }

  function calcFeeSatFromRate(fr, vb){
    if (!Number.isFinite(fr) || !Number.isFinite(vb)) return NaN;
    // sat/vB * vB
    return fr * vb;
  }

  function calcFeeUsd(feeSat, btcUsd){
    if (!Number.isFinite(feeSat) || feeSat <= 0) return NaN;
    if (!Number.isFinite(btcUsd) || btcUsd <= 0) return NaN;
    // sat -> BTC -> USD
    return (feeSat / 1e8) * btcUsd;
  }

  // -----------------------------
  // A) Histogram bands -> tiles
  // pickedBands: [{feeRate, vbytes}] from computeNextBlockFromHistogram
  // We split each band into chunks to create a field of mixed tile sizes.
  // -----------------------------
  function fromHistogramBands(pickedBands, scaler, opts = {}) {
    const s = ensureScaler(scaler);
    const seed = Number.isFinite(opts.seed) ? opts.seed : 0;
    const btcUsd = n2(opts.btcUsd);

    const out = [];
    let n = 0;

    // Tune: more tiles = richer mosaic but heavier packing
    const MAX_TILES = 900;         // raise from 420 to get mempool-goggles feel
    const MIN_CHUNK_VB = 280;      // allows small tiles (important for texture)
    const TARGET_CHUNK_VB = 2200;  // avg tile size

    const bands = Array.isArray(pickedBands) ? pickedBands : [];

    for (const band of bands) {
      const fr = n2(band?.feeRate);
      const vbTotal = n2(band?.vbytes);
      if (!Number.isFinite(fr) || !Number.isFinite(vbTotal) || vbTotal <= 0) continue;

      // Chunk count proportional to volume, capped.
      let chunks = Math.round(vbTotal / TARGET_CHUNK_VB);
      chunks = clamp(chunks, 1, 160);

      // Distribute remainder with small jitter so tiles aren't uniform
      const base = Math.max(MIN_CHUNK_VB, Math.floor(vbTotal / chunks));
      let rem = Math.max(0, Math.floor(vbTotal - base * chunks));

      for (let i = 0; i < chunks; i++) {
        if (out.length >= MAX_TILES) break;

        // jitter ±25% plus remainder spread
        const jitter = ((hash32(`${fr}:${seed}:${i}`, seed) % 51) - 25) / 100; // [-0.25, +0.25]
        let vbi = Math.floor(base * (1 + jitter));

        // spread remainder (adds 1..N vB to first tiles)
        if (rem > 0) {
          const add = Math.min(rem, Math.max(1, Math.floor(base * 0.15)));
          vbi += add;
          rem -= add;
        }

        vbi = Math.max(MIN_CHUNK_VB, vbi);

        const feeSat = calcFeeSatFromRate(fr, vbi);
        const feeUsd = calcFeeUsd(feeSat, btcUsd);

        const tx = {
          txid: `band:${fr}:${seed}:${n++}:${i}`,
          feeRate: fr,
          vbytes: vbi,
          feeSat,
          feeUsd
        };

        const side = s.sideCellsFromTx(tx);

        out.push({
          ...tx,
          side
        });
      }

      if (out.length >= MAX_TILES) break;
    }

    return out;
  }

  // -----------------------------
  // B) Real tx list -> tiles (future-ready)
  // txs: array of mempool tx objects (or your own normalized list)
  // -----------------------------
  function fromTxList(txs, scaler, opts = {}) {
    const s = ensureScaler(scaler);
    const btcUsd = n2(opts.btcUsd);

    const src = Array.isArray(txs) ? txs : [];
    const out = [];

    for (const raw of src) {
      if (!raw) continue;

      const txid = String(raw.txid ?? raw.hash ?? raw.id ?? "");
      const vb = normVBytes(raw);
      if (!Number.isFinite(vb) || vb <= 0) continue;

      let fr = normFeeRate(raw);

      // if no feeRate, compute from fee and vbytes
      const feeSat0 = normFeeSat(raw);
      if (!Number.isFinite(fr) || fr <= 0) {
        if (Number.isFinite(feeSat0) && feeSat0 > 0) fr = feeSat0 / vb;
      }

      let feeSat = feeSat0;
      if (!Number.isFinite(feeSat) || feeSat <= 0) feeSat = calcFeeSatFromRate(fr, vb);

      // feeUsd: respect raw feeUsd if supplied; else compute
      let feeUsd = n2(raw.feeUsd);
      if (!Number.isFinite(feeUsd) || feeUsd <= 0) feeUsd = calcFeeUsd(feeSat, btcUsd);

      const tx = {
        txid: txid || `tx:${out.length}:${hash32(JSON.stringify(raw).slice(0,120))}`,
        feeRate: Number.isFinite(fr) ? fr : 0,
        vbytes: vb,
        feeSat: Number.isFinite(feeSat) ? feeSat : 0,
        feeUsd: Number.isFinite(feeUsd) ? feeUsd : NaN
      };

      const side = s.sideCellsFromTx(tx);
      out.push({ ...tx, side });
    }

    return out;
  }

  NS.Tiler = {
    fromHistogramBands,
    fromTxList
  };
})();
