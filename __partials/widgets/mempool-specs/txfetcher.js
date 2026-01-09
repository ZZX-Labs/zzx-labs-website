// __partials/widgets/mempool-specs/txfetcher.js
// DROP-IN COMPLETE REPLACEMENT
//
// Purpose:
// - Single throttled snapshot fetcher for mempool-specs
// - Uses mempool.space API ONLY
// - No polling storms, no duplicate fetches
// - Abort-safe, cache-aware
//
// Exposes:
//   window.ZZXMempoolSpecs.TxFetcher

(function () {
  "use strict";

  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});
  const BASE = "https://mempool.space/api";

  function now() { return Date.now(); }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function throttle(minMs) {
    let last = 0;
    return async () => {
      const t = now();
      const wait = Math.max(0, minMs - (t - last));
      if (wait) await sleep(wait);
      last = now();
    };
  }

  async function fetchText(url, signal) {
    const r = await fetch(url, { cache: "no-store", signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  }

  async function fetchJSON(url, signal) {
    const r = await fetch(url, { cache: "no-store", signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  class TxFetcher {
    constructor(opts = {}) {
      this.base = String(opts.base || BASE);
      this.minIntervalMs = Number(opts.minIntervalMs || 15_000);

      this._lastAt = 0;
      this._cached = null;
      this._inflight = null;
      this._gate = throttle(Math.max(500, this.minIntervalMs / 3));
    }

    _url(path) {
      return this.base.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "");
    }

    async snapshot({ force = false } = {}) {
      const t = now();
      if (!force && (t - this._lastAt) < this.minIntervalMs && this._cached) {
        return this._cached;
      }

      if (this._inflight) return this._inflight;

      const ac = new AbortController();
      const signal = ac.signal;

      this._inflight = (async () => {
        await this._gate();

        const out = {
          at: now(),
          tipHeight: null,
          tipHash: null,
          mempool: null,
          feeHistogram: null
        };

        try {
          const h = await fetchText(this._url("blocks/tip/height"), signal);
          const n = parseInt(h.trim(), 10);
          if (Number.isFinite(n)) out.tipHeight = n;
        } catch {}

        try {
          const h = await fetchText(this._url("blocks/tip/hash"), signal);
          if (h && h.length > 32) out.tipHash = h.trim();
        } catch {}

        try {
          const mem = await fetchJSON(this._url("mempool"), signal);
          if (mem && typeof mem === "object") {
            out.mempool = mem;
            if (Array.isArray(mem.fee_histogram)) {
              out.feeHistogram = mem.fee_histogram;
            }
          }
        } catch {}

        this._cached = out;
        this._lastAt = out.at;
        return out;
      })();

      try {
        return await this._inflight;
      } finally {
        this._inflight = null;
      }
    }
  }

  NS.TxFetcher = TxFetcher;
})();
