// __partials/widgets/mempool-specs/txfetcher.js
// DROP-IN COMPLETE REPLACEMENT (FIXED)
//
// Fixes vs your draft:
// - Uses injected ctx.fetchText / ctx.fetchJSON when provided (so it benefits from your fetch.js:
//   direct → allorigins → cache). If ctx not provided, falls back to plain fetch.
// - True coalescing: concurrent callers share the same inflight promise.
// - Throttle gate prevents burst storms even when multiple widgets mount.
// - Abort-safe: supports an optional caller signal; internal calls are tied to a merged signal.
// - Cache-aware: returns last-good snapshot when within minInterval and not forced.
//
// Exposes:
//   window.ZZXMempoolSpecs.TxFetcher

(function () {
  "use strict";

  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});
  const DEFAULT_BASE = "https://mempool.space/api";

  function now() { return Date.now(); }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function makeThrottle(minMs) {
    let last = 0;
    return async () => {
      const t = now();
      const wait = Math.max(0, minMs - (t - last));
      if (wait) await sleep(wait);
      last = now();
    };
  }

  // Merge external signal with internal controller (abort either -> abort)
  function mergeSignals(a, b) {
    if (!a && !b) return null;
    if (a && !b) return a;
    if (!a && b) return b;

    const ctrl = new AbortController();
    const onAbort = () => { try { ctrl.abort(); } catch (_) {} };

    if (a.aborted || b.aborted) {
      onAbort();
      return ctrl.signal;
    }

    try { a.addEventListener("abort", onAbort, { once: true }); } catch (_) {}
    try { b.addEventListener("abort", onAbort, { once: true }); } catch (_) {}
    return ctrl.signal;
  }

  // Fallback fetchers (only used if ctx not provided)
  async function fetchTextDirect(url, { signal } = {}) {
    const r = await fetch(url, { cache: "no-store", credentials: "omit", signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  }
  async function fetchJSONDirect(url, { signal } = {}) {
    const r = await fetch(url, { cache: "no-store", credentials: "omit", signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  class TxFetcher {
    constructor(opts = {}) {
      this.base =
        (opts.base && String(opts.base)) ||
        (opts.ctx?.api?.MEMPOOL ? String(opts.ctx.api.MEMPOOL) : DEFAULT_BASE);

      this.ctx = opts.ctx || null;

      this.minIntervalMs = Number.isFinite(opts.minIntervalMs)
        ? opts.minIntervalMs
        : 15_000;

      this._lastAt = 0;
      this._cached = null;
      this._inflight = null;

      // Gate is intentionally smaller than minInterval so multi-mounts don't stampede
      const gateMs = Math.max(500, Math.floor(this.minIntervalMs / 3));
      this._gate = makeThrottle(gateMs);
    }

    _url(path) {
      const p = String(path || "").replace(/^\/+/, "");
      return this.base.replace(/\/+$/, "") + "/" + p;
    }

    async _text(url, { signal } = {}) {
      // Prefer injected ctx (expects signature: (url, {signal}) )
      if (this.ctx && typeof this.ctx.fetchText === "function") {
        return await this.ctx.fetchText(url, { signal });
      }
      return await fetchTextDirect(url, { signal });
    }

    async _json(url, { signal } = {}) {
      if (this.ctx && typeof this.ctx.fetchJSON === "function") {
        return await this.ctx.fetchJSON(url, { signal });
      }
      return await fetchJSONDirect(url, { signal });
    }

    // Public API:
    // snapshot({ force=false, signal? })
    // Returns:
    // {
    //   at: ms epoch,
    //   tipHeight: number|null,
    //   tipHash: string|null,
    //   mempool: object|null,
    //   feeHistogram: array|null
    // }
    async snapshot({ force = false, signal: userSignal = null } = {}) {
      const t = now();

      // Return cache if fresh enough and not forced
      if (!force && this._cached && (t - this._lastAt) < this.minIntervalMs) {
        return this._cached;
      }

      // Coalesce concurrent calls
      if (this._inflight) return await this._inflight;

      // Internal controller so we can abort our own work if needed later
      const internal = new AbortController();
      const signal = mergeSignals(userSignal, internal.signal);

      this._inflight = (async () => {
        // Gate bursty calls
        await this._gate();

        const out = {
          at: now(),
          tipHeight: null,
          tipHash: null,
          mempool: null,
          feeHistogram: null
        };

        // Tip height (plain text int)
        try {
          const txt = await this._text(this._url("blocks/tip/height"), { signal });
          const n = parseInt(String(txt).trim(), 10);
          if (Number.isFinite(n)) out.tipHeight = n;
        } catch (_) {}

        // Tip hash (plain text hash)
        try {
          const txt = await this._text(this._url("blocks/tip/hash"), { signal });
          const s = String(txt || "").trim();
          if (s && s.length >= 32) out.tipHash = s;
        } catch (_) {}

        // Mempool snapshot (JSON, includes fee_histogram)
        try {
          const mem = await this._json(this._url("mempool"), { signal });
          if (mem && typeof mem === "object") {
            out.mempool = mem;
            if (Array.isArray(mem.fee_histogram)) out.feeHistogram = mem.fee_histogram;
            else if (Array.isArray(mem.feeHistogram)) out.feeHistogram = mem.feeHistogram; // drift-safe
          }
        } catch (_) {}

        // Update cache only if we got *something* useful.
        // (We still cache empty to prevent rapid refetch loops, but prefer preserving last-good if present.)
        const hasUseful =
          Number.isFinite(out.tipHeight) ||
          !!out.tipHash ||
          !!out.mempool ||
          (Array.isArray(out.feeHistogram) && out.feeHistogram.length);

        if (hasUseful) {
          this._cached = out;
          this._lastAt = out.at;
          return out;
        }

        // If fetch failed to produce useful data, return last-good cache if available.
        if (this._cached) return this._cached;

        // Else return the empty snapshot (caller will show "unavailable")
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
