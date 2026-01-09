// __partials/widgets/mempool-specs/adapter.js
// DROP-IN COMPLETE REPLACEMENT (FIXED + MORE PERMISSIVE)
//
// Purpose:
// - Normalize *either* TxFetcher.snapshot() output *or* raw mempool.space payloads
//   into one stable internal shape used by widget.js / tiler / binfill / renderer.
//
// Accepts (any of):
//   - TxFetcher snapshot: { tipHeight, tipHash, mempool:{count,vbytes,...}, feeHistogram:[...] }
//   - Raw /api/mempool:  { count, vbytes, fee_histogram:[...] }
//   - Raw /api/v1/fees/mempool-blocks (if you ever use it): array of blocks w/ feeRange, etc. (best-effort)
//
// Returns:
// {
//   tipHeight: number|null,
//   tipHash: string|null,
//   count: number|null,
//   vbytes: number|null,
//   feeHistogram: Array<[feeRate:number, vbytes:number]>
// }
//
// Exposes:
//   window.ZZXMempoolSpecs.Adapter.parse(payload)
(function () {
  "use strict";

  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});
  const Adapter = (NS.Adapter = NS.Adapter || {});

  function num(x) {
    const v = Number(x);
    return Number.isFinite(v) ? v : null;
  }

  function str(x) {
    const s = (x == null) ? "" : String(x);
    return s ? s : null;
  }

  function normalizeHistogram(hist) {
    const out = [];
    const arr = Array.isArray(hist) ? hist : [];

    for (const row of arr) {
      if (Array.isArray(row) && row.length >= 2) {
        const fee = Number(row[0]);
        const vb  = Number(row[1]);
        if (Number.isFinite(fee) && Number.isFinite(vb) && vb > 0) out.push([fee, vb]);
      } else if (row && typeof row === "object") {
        const fee = Number(row.feeRate ?? row.fee ?? row.rate ?? row[0]);
        const vb  = Number(row.vbytes ?? row.vb ?? row.size ?? row[1]);
        if (Number.isFinite(fee) && Number.isFinite(vb) && vb > 0) out.push([fee, vb]);
      }
    }

    // fee desc is convenient for block picking (highest first)
    out.sort((a, b) => b[0] - a[0]);
    return out;
  }

  // Optional best-effort: if someone passes mempool-blocks style structures,
  // we can synthesize a crude histogram. Safe to ignore if shape doesn't match.
  function histogramFromMempoolBlocks(blocks) {
    if (!Array.isArray(blocks) || !blocks.length) return [];
    // Each entry often has: { feeRange:[low,high], blockSize, blockVSize, nTx, ... }
    // We'll approximate each "block" as one band at its midpoint fee with its vsize.
    const out = [];
    for (const b of blocks) {
      if (!b || typeof b !== "object") continue;
      const fr = Array.isArray(b.feeRange) ? b.feeRange : null;
      const low = fr ? Number(fr[0]) : NaN;
      const high = fr ? Number(fr[1]) : NaN;
      const fee = (Number.isFinite(low) && Number.isFinite(high)) ? ((low + high) / 2) : NaN;

      const vb = Number(b.blockVSize ?? b.vsize ?? b.vbytes ?? b.size);
      if (Number.isFinite(fee) && Number.isFinite(vb) && vb > 0) out.push([fee, vb]);
    }
    out.sort((a, b) => b[0] - a[0]);
    return out;
  }

  Adapter.parse = function parse(payload) {
    // default
    const out = {
      tipHeight: null,
      tipHash: null,
      count: null,
      vbytes: null,
      feeHistogram: [],
    };

    if (!payload) return out;

    // If payload is already an adapter output, normalize lightly and return
    if (payload && typeof payload === "object" && Array.isArray(payload.feeHistogram)) {
      out.tipHeight = num(payload.tipHeight);
      out.tipHash = str(payload.tipHash);
      out.count = num(payload.count);
      out.vbytes = num(payload.vbytes);
      out.feeHistogram = normalizeHistogram(payload.feeHistogram);
      return out;
    }

    // TxFetcher snapshot shape
    if (payload && typeof payload === "object" && (payload.mempool || payload.feeHistogram || payload.fee_histogram)) {
      out.tipHeight = num(payload.tipHeight);
      out.tipHash = str(payload.tipHash);

      const mem = payload.mempool && typeof payload.mempool === "object" ? payload.mempool : null;

      // mempool snapshot usually: {count, vbytes, total_fee, ...}
      out.count = num(mem?.count ?? payload.count);
      out.vbytes = num(mem?.vbytes ?? payload.vbytes);

      // histogram key drift
      out.feeHistogram = normalizeHistogram(
        payload.feeHistogram ??
        payload.fee_histogram ??
        mem?.fee_histogram ??
        mem?.feeHistogram
      );

      // If someone passed mempool-blocks array as "mempool"
      if (!out.feeHistogram.length && Array.isArray(payload.mempool)) {
        out.feeHistogram = histogramFromMempoolBlocks(payload.mempool);
      }

      return out;
    }

    // Raw /api/mempool response
    if (payload && typeof payload === "object") {
      out.count = num(payload.count);
      out.vbytes = num(payload.vbytes);
      out.feeHistogram = normalizeHistogram(payload.fee_histogram ?? payload.feeHistogram);
      return out;
    }

    // Unknown
    return out;
  };
})();
