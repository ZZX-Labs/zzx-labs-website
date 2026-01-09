// __partials/widgets/mempool-specs/adapter.js
// DROP-IN COMPLETE REPLACEMENT
//
// Purpose:
// - Normalize mempool.space snapshot payloads into a stable internal shape
// - Keeps widget.js + plotter logic clean
//
// Input (any of):
//   - /api/mempool
//   - snapshot object from TxFetcher
//
// Output:
// {
//   tipHeight: number | null,
//   count: number | null,
//   vbytes: number | null,
//   feeHistogram: Array<[feeRate:number, vbytes:number]>
// }
//
// Exposes:
//   window.ZZXMempoolSpecs.Adapter.parse(payload)

(function () {
  "use strict";

  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});
  const Adapter = {};

  function n(x) {
    const v = Number(x);
    return Number.isFinite(v) ? v : null;
  }

  Adapter.parse = function parse(payload) {
    if (!payload || typeof payload !== "object") {
      return {
        tipHeight: null,
        count: null,
        vbytes: null,
        feeHistogram: [],
      };
    }

    // Case: TxFetcher snapshot
    if (payload.feeHistogram || payload.mempool) {
      return {
        tipHeight: n(payload.tipHeight),
        count: n(payload.mempool?.count),
        vbytes: n(payload.mempool?.vbytes),
        feeHistogram: Array.isArray(payload.feeHistogram)
          ? payload.feeHistogram
          : [],
      };
    }

    // Case: raw /api/mempool response
    return {
      tipHeight: null,
      count: n(payload.count),
      vbytes: n(payload.vbytes),
      feeHistogram: Array.isArray(payload.fee_histogram)
        ? payload.fee_histogram
        : [],
    };
  };

  NS.Adapter = Adapter;
})();
