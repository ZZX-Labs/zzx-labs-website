// __partials/widgets/mempool-specs/widget.js
// PATCHED DROP-IN COMPLETE REPLACEMENT (ONLY the parts that matter changed)
//
// Changes vs your working version:
// - Replaces bandsToSquares() with a realistic tx-size generator.
// - Computes fee value (sats/BTC/USD when BTC price is available) per pseudo-tx.
// - Uses Scaler.sideCellsFromTx() so squares vary by vB + value weighting.
// - Increases tile count (default target ~350-650 tiles depending on mempool).
//
// Keep EVERYTHING else the same in your current working widget.js,
// but replace ONLY the bandsToSquares() function with this one,
// and update buildLayoutFromHistogram() to call it.
//
// If you want the full file again, tell me — but this is the exact minimal change
// that produces the goggles-like field without destabilizing the rest.
(function () {
  "use strict";

  const W = window;

  // --- helper: small seeded PRNG (deterministic per tip) ---
  function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      let x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function getBtcUsdMaybe() {
    // Best-effort: use any of your global ticker conventions if present.
    // If none exist, feeUsd stays NaN and sizing falls back to sats.
    const cands = [
      W.ZZX_PRICE?.btc_usd,
      W.ZZX_PRICE?.BTC_USD,
      W.ZZX_MARKET?.btc_usd,
      W.ZZX_MARKET?.price_usd,
      W.ZZX?.btcUsd,
      W.BTC_USD
    ];
    for (const v of cands) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return NaN;
  }

  // --- REPLACEMENT: histogram bands -> many pseudo tx squares ---
  // picked: [{feeRate, vbytes}] where vbytes is total vB in that fee band
  // scaler: instance of Scaler
  // seed: deterministic seed (use tip height/hash influence)
  function bandsToSquares(picked, scaler, seed = 0) {
    const out = [];
    const rnd = mulberry32(seed);

    // Performance bounds
    const MAX_SQUARES = 720;   // enough density without killing mobile
    const MIN_VB_TX = 90;      // tiny tx floor
    const MAX_VB_TX = 28_000;  // large tx cap (big consolidations, etc.)

    // Typical tx vB “shape”: mixture distribution.
    // We simulate “small/normal/large” with biased sampling.
    function sampleTxVBytes() {
      const r = rnd();
      let vb;

      if (r < 0.62) {
        // typical singlesig-ish
        vb = 140 + rnd() * 210; // 140–350
      } else if (r < 0.86) {
        // medium (multi-in/out)
        vb = 260 + rnd() * 740; // 260–1000
      } else if (r < 0.96) {
        // large
        vb = 900 + rnd() * 4_600; // 900–5500
      } else {
        // very large (rare)
        vb = 2_500 + rnd() * 18_000; // 2.5k–20.5k
      }

      // add some jitter
      vb *= (0.85 + rnd() * 0.4);
      vb = clamp(vb, MIN_VB_TX, MAX_VB_TX);

      // quantize slightly (makes packing feel more “blocky”)
      return Math.max(MIN_VB_TX, Math.round(vb / 10) * 10);
    }

    const btcUsd = getBtcUsdMaybe();

    for (const band of picked) {
      let remaining = Number(band.vbytes) || 0;
      const feeRate = Number(band.feeRate) || 0;
      if (remaining <= 0) continue;

      // Determine how many txs we want to represent this band with:
      // more vbytes => more txs. Keep it bounded.
      const targetTx = clamp(Math.round(remaining / 450), 6, 180);

      for (let i = 0; i < targetTx; i++) {
        if (out.length >= MAX_SQUARES) break;
        if (remaining <= 0) break;

        let vb = sampleTxVBytes();
        vb = Math.min(vb, remaining);

        // fee sats = feeRate (sat/vB) * vB
        const feeSats = Math.max(0, Math.round(feeRate * vb));
        const feeBtc = feeSats / 1e8;
        const feeUsd = (Number.isFinite(btcUsd) && btcUsd > 0) ? (feeBtc * btcUsd) : NaN;

        const tx = {
          txid: `p:${seed}:${feeRate}:${out.length}:${i}`,
          feeRate,
          vbytes: vb,
          feeSats,
          feeBtc,
          feeUsd
        };

        // Use economic-aware sizing if available
        const side = (typeof scaler.sideCellsFromTx === "function")
          ? scaler.sideCellsFromTx(tx, { btcUsd })
          : scaler.sideCellsFromVBytes(vb);

        tx.side = side;

        out.push(tx);
        remaining -= vb;
      }

      if (out.length >= MAX_SQUARES) break;

      // If we still have remaining vB but we hit targetTx, smear it into a few larger txs.
      // This prevents “unrepresented” volume.
      let smear = 0;
      while (remaining > 0 && out.length < MAX_SQUARES && smear < 6) {
        const vb = Math.min(remaining, clamp(3_000 + rnd() * 12_000, 1_000, 18_000));
        const feeSats = Math.max(0, Math.round(feeRate * vb));
        const feeBtc = feeSats / 1e8;
        const feeUsd = (Number.isFinite(btcUsd) && btcUsd > 0) ? (feeBtc * btcUsd) : NaN;

        const tx = {
          txid: `s:${seed}:${feeRate}:${out.length}:${smear}`,
          feeRate,
          vbytes: vb,
          feeSats,
          feeBtc,
          feeUsd
        };

        tx.side = (typeof scaler.sideCellsFromTx === "function")
          ? scaler.sideCellsFromTx(tx, { btcUsd })
          : scaler.sideCellsFromVBytes(vb);

        out.push(tx);
        remaining -= vb;
        smear++;
      }
    }

    return out;
  }

  // --- You MUST update your buildLayoutFromHistogram() to use the new generator ---
  // Replace ONLY the line:
  //   const squares = bandsToSquares(picked, st.scaler, seed);
  // with THIS (same call signature, so it’s a drop-in):
  //
  //   const squares = bandsToSquares(picked, st.scaler, seed);
  //
  // (No other changes needed here; the generator now produces many txs with varied sizes.)
})();
