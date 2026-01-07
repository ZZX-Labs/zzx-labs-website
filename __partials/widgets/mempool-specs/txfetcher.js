// __partials/widgets/mempool-specs/txfetcher.js
// TxFetcher for mempool-specs
// - Fetches: tip height (and hash if available), mempool snapshot, fee histogram
// - Optional: fetches block/tip transactions when endpoints are available
// - Throttled + abort-safe
// - Works with unified runtime ctx if passed (ctx.fetchJSON / ctx.fetchText / ctx.api.MEMPOOL)
// - Falls back to plain fetch for standalone use
//
// Exposes: window.ZZXMempoolSpecs.TxFetcher

(function () {
  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});
  const DEFAULT_BASE = "https://mempool.space/api";

  function nowMs() { return Date.now(); }

  function sleep(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }

  async function fetchText(url, signal) {
    const r = await fetch(url, { cache: "no-store", signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  }

  async function fetchJSON(url, signal) {
    const r = await fetch(url, { cache: "no-store", signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  // Very conservative; avoids hammering remote endpoints
  function makeThrottle(minIntervalMs) {
    let last = 0;
    return async function throttle() {
      const t = nowMs();
      const wait = Math.max(0, minIntervalMs - (t - last));
      if (wait) await sleep(wait);
      last = nowMs();
    };
  }

  class TxFetcher {
    constructor(opts = {}) {
      this.base =
        (opts.base && String(opts.base)) ||
        (opts.ctx?.api?.MEMPOOL ? String(opts.ctx.api.MEMPOOL) : DEFAULT_BASE);

      this.ctx = opts.ctx || null;

      // cadence controls
      this.minIntervalMs = Number.isFinite(opts.minIntervalMs) ? opts.minIntervalMs : 15_000;

      // internal state
      this._lastAt = 0;
      this._inflight = null;
      this._cached = null;

      // throttle gate
      this._throttle = makeThrottle(Math.max(250, Math.min(5_000, this.minIntervalMs / 4)));
    }

    _url(path) {
      if (!path.startsWith("/")) path = "/" + path;
      return this.base.replace(/\/+$/, "") + path;
    }

    async _ctxText(url, signal) {
      // unified core sometimes uses (url, opts) rather than (url, signal)
      if (this.ctx?.fetchText) return await this.ctx.fetchText(url, { signal });
      return await fetchText(url, signal);
    }

    async _ctxJSON(url, signal) {
      if (this.ctx?.fetchJSON) return await this.ctx.fetchJSON(url, { signal });
      return await fetchJSON(url, signal);
    }

    // --- Public: fetch a “snapshot” for mempool-specs ---
    // Returns:
    // {
    //   at: ms epoch,
    //   tipHeight: number|null,
    //   tipHash: string|null,
    //   mempool: object|null,
    //   feeHistogram: array|null
    // }
    async snapshot({ force = false } = {}) {
      const t = nowMs();

      if (!force && (t - this._lastAt) < this.minIntervalMs) {
        return this._cached || {
          at: this._lastAt || 0,
          tipHeight: null,
          tipHash: null,
          mempool: null,
          feeHistogram: null,
        };
      }

      // Coalesce concurrent calls
      if (this._inflight) return await this._inflight;

      const ac = new AbortController();
      const signal = ac.signal;

      this._inflight = (async () => {
        await this._throttle();

        const out = {
          at: nowMs(),
          tipHeight: null,
          tipHash: null,
          mempool: null,
          feeHistogram: null,
        };

        // Tip height
        try {
          const txt = await this._ctxText(this._url("/blocks/tip/height"), signal);
          const h = parseInt(String(txt).trim(), 10);
          if (Number.isFinite(h)) out.tipHeight = h;
        } catch {}

        // Tip hash (endpoint exists on many mempool deployments; fail-soft)
        try {
          const txt = await this._ctxText(this._url("/blocks/tip/hash"), signal);
          const s = String(txt).trim();
          if (s && s.length >= 32) out.tipHash = s;
        } catch {}

        // Mempool snapshot (includes fee_histogram)
        try {
          const mem = await this._ctxJSON(this._url("/mempool"), signal);
          if (mem && typeof mem === "object") {
            out.mempool = mem;
            if (Array.isArray(mem.fee_histogram)) out.feeHistogram = mem.fee_histogram;
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

    // --- Optional: fetch a block’s txids (for “block/0” style visuals) ---
    // Robust: tries several plausible endpoints.
    // If unsupported, returns [] without throwing.
    async blockTxids({ hash = null, height = null } = {}) {
      const ac = new AbortController();
      const signal = ac.signal;

      const tryUrls = [];

      if (hash) {
        tryUrls.push(this._url(`/block/${hash}/txids`));
        tryUrls.push(this._url(`/block/${hash}/txid`));
        tryUrls.push(this._url(`/block/${hash}/txs`));
      }

      // if only height provided, attempt resolve to hash via /block-height/<h>
      if (!hash && Number.isFinite(height)) {
        try {
          const txt = await this._ctxText(this._url(`/block-height/${height}`), signal);
          const h = String(txt).trim();
          if (h && h.length >= 32) {
            return await this.blockTxids({ hash: h });
          }
        } catch {}
      }

      for (const u of tryUrls) {
        try {
          const data = await this._ctxJSON(u, signal);
          if (Array.isArray(data) && data.length && typeof data[0] === "string") return data;

          if (Array.isArray(data) && data.length && typeof data[0] === "object" && data[0]?.txid) {
            return data.map(x => x.txid).filter(Boolean);
          }
        } catch {
          try {
            const txt = await this._ctxText(u, signal);
            const parsed = JSON.parse(txt);
            if (Array.isArray(parsed)) return parsed;
          } catch {}
        }
      }

      return [];
    }

    // --- Optional: fetch a block’s “header-like” info ---
    async blockInfo({ hash = null, height = null } = {}) {
      const ac = new AbortController();
      const signal = ac.signal;

      let h = hash;

      if (!h && Number.isFinite(height)) {
        try {
          const txt = await this._ctxText(this._url(`/block-height/${height}`), signal);
          const s = String(txt).trim();
          if (s && s.length >= 32) h = s;
        } catch {}
      }

      if (!h) return null;

      const tryUrls = [
        this._url(`/block/${h}`),
        this._url(`/block/${h}/header`),
      ];

      for (const u of tryUrls) {
        try {
          const info = await this._ctxJSON(u, signal);
          if (info && typeof info === "object") return info;
        } catch {}
      }

      return null;
    }
  }

  NS.TxFetcher = TxFetcher;
})();
