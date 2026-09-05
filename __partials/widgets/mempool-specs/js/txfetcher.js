// __partials/widgets/mempool-specs/txfetcher.js
// DROP-IN COMPLETE REPLACEMENT (TX-CARD READY)
//
// What this enables (without causing API storms):
// - A single, throttled data layer for mempool-specs.
// - Snapshot basics (tip height/hash, mempool summary, fee_histogram).
// - Tip block txids (for “real tx tiles” instead of histogram tiles).
// - Per-tx detail fetch with caching + concurrency limits.
// - A clean handoff to tx-card.js: you’ll pass the returned tx objects to your
//   renderer/overlay layer, which will wire clicks to TxCard.open(tx, meta).
//
// IMPORTANT DESIGN POINT:
// TxFetcher should NOT create DOM overlays itself (that’s renderer/tx-card.js).
// TxFetcher’s job is to provide tx data efficiently and consistently.
//
// Exposes:
//   window.ZZXMempoolSpecs.TxFetcher
//     - snapshot({force, signal})
//     - tipTxids({force, limit, signal}) -> { at, tipHeight, tipHash, txids:[] }
//     - tx(txid, {force, signal})        -> tx object (mempool.space /tx/{txid})
//     - txBatch(txids, {limit, concurrency, signal}) -> Map(txid -> tx)
//     - blockHashByHeight(height, {signal}) -> hash|null
//
// Data returned from /tx/{txid} (mempool.space) typically includes:
//   txid, version, locktime, size, weight, fee, status{confirmed,block_height,block_hash,block_time}, vin/vout...
// You can compute:
//   vbytes = Math.ceil(weight/4)
//   feeRate = fee / vbytes   (sats/vB)
//   confirmations from tipHeight - status.block_height + 1 (if confirmed)
//
// This file uses ctx.fetchText/ctx.fetchJSON when provided (so it benefits from your fetch.js:
// direct → allorigins → cache). If ctx is absent, it falls back to direct fetch.
//
// ----
// Wiring to tx-card.js (example in renderer, NOT here):
//   const tx = await fetcher.tx(txid);
//   window.ZZXMempoolSpecsTxCard?.open({ tx, tipHeight: snap.tipHeight, btcUsd });
// ----

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

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  // Small concurrency pool for txBatch
  async function pool(items, concurrency, fn, signal) {
    const out = new Array(items.length);
    let i = 0;

    async function worker() {
      while (true) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const idx = i++;
        if (idx >= items.length) return;
        out[idx] = await fn(items[idx], idx);
      }
    }

    const n = Math.max(1, Math.min(concurrency || 4, 12));
    const ws = [];
    for (let k = 0; k < n; k++) ws.push(worker());
    await Promise.all(ws);
    return out;
  }

  // Normalize mempool tx into a handy “card + renderer” object (non-destructive)
  function decorateTx(tx, { tipHeight = null, btcUsd = null } = {}) {
    if (!tx || typeof tx !== "object") return tx;

    const weight = Number(tx.weight);
    const vbytes = Number.isFinite(weight) && weight > 0 ? Math.ceil(weight / 4) : Number(tx.size) || null;

    const fee = Number(tx.fee);
    const feeRate = (Number.isFinite(fee) && Number.isFinite(vbytes) && vbytes > 0)
      ? (fee / vbytes)
      : null;

    const confirmed = !!tx.status?.confirmed;
    const blockHeight = Number(tx.status?.block_height);
    const confirmations = (confirmed && Number.isFinite(tipHeight) && Number.isFinite(blockHeight))
      ? Math.max(0, tipHeight - blockHeight + 1)
      : (confirmed ? null : 0);

    // btc amount heuristic: sum(vout.value) in sats (if present)
    let satsOut = null;
    if (Array.isArray(tx.vout)) {
      let s = 0;
      for (const o of tx.vout) {
        const v = Number(o?.value);
        if (Number.isFinite(v)) s += v;
      }
      satsOut = s;
    }

    const btcOut = Number.isFinite(satsOut) ? (satsOut / 1e8) : null;
    const usdOut = (Number.isFinite(btcOut) && Number.isFinite(btcUsd)) ? (btcOut * btcUsd) : null;

    const feeBtc = Number.isFinite(fee) ? (fee / 1e8) : null;
    const feeUsd = (Number.isFinite(feeBtc) && Number.isFinite(btcUsd)) ? (feeBtc * btcUsd) : null;

    return {
      ...tx,
      __zzx: {
        vbytes: Number.isFinite(vbytes) ? vbytes : null,
        feeRate: Number.isFinite(feeRate) ? feeRate : null, // sats/vB
        confirmations: Number.isFinite(confirmations) ? confirmations : null,
        satsOut: Number.isFinite(satsOut) ? satsOut : null,
        btcOut,
        usdOut,
        feeBtc,
        feeUsd,
        tipHeight: Number.isFinite(tipHeight) ? tipHeight : null,
        btcUsd: Number.isFinite(btcUsd) ? btcUsd : null,
      }
    };
  }

  class TxFetcher {
    constructor(opts = {}) {
      this.base =
        (opts.base && String(opts.base)) ||
        (opts.ctx?.api?.MEMPOOL ? String(opts.ctx.api.MEMPOOL) : DEFAULT_BASE);

      this.ctx = opts.ctx || null;

      // snapshot cadence floor
      this.minIntervalMs = Number.isFinite(opts.minIntervalMs) ? opts.minIntervalMs : 15_000;

      // tx fetch controls
      this.txTtlMs = Number.isFinite(opts.txTtlMs) ? opts.txTtlMs : 3 * 60_000; // 3 min
      this.txConcurrency = Number.isFinite(opts.txConcurrency) ? opts.txConcurrency : 5;
      this.maxTxids = Number.isFinite(opts.maxTxids) ? opts.maxTxids : 420;     // visual safety cap

      // caches
      this._snapAt = 0;
      this._snap = null;
      this._snapInflight = null;

      this._tipTxidsAt = 0;
      this._tipTxids = null;
      this._tipTxidsInflight = null;

      this._txCache = new Map();       // txid -> { t, v }
      this._txInflight = new Map();    // txid -> Promise

      // gates (prevents stampede)
      const gateMs = Math.max(500, Math.floor(this.minIntervalMs / 3));
      this._gateSnap = makeThrottle(gateMs);
      this._gateTx   = makeThrottle(250); // per-tx gate (still coalesced)
    }

    _url(path) {
      const p = String(path || "").replace(/^\/+/, "");
      return this.base.replace(/\/+$/, "") + "/" + p;
    }

    async _text(url, { signal } = {}) {
      if (this.ctx && typeof this.ctx.fetchText === "function") {
        const r = await this.ctx.fetchText(url, { signal });
        // ctx.fetchText may return {ok,text,from} or raw text depending on your integration;
        // accept both.
        return (r && typeof r === "object" && "text" in r) ? r.text : r;
      }
      return await fetchTextDirect(url, { signal });
    }

    async _json(url, { signal } = {}) {
      if (this.ctx && typeof this.ctx.fetchJSON === "function") {
        const r = await this.ctx.fetchJSON(url, { signal });
        return (r && typeof r === "object" && "json" in r) ? r.json : r;
      }
      return await fetchJSONDirect(url, { signal });
    }

    // --- snapshot: tip height/hash + mempool summary + fee_histogram ---
    async snapshot({ force = false, signal: userSignal = null } = {}) {
      const t = now();

      if (!force && this._snap && (t - this._snapAt) < this.minIntervalMs) {
        return this._snap;
      }
      if (this._snapInflight) return await this._snapInflight;

      const internal = new AbortController();
      const signal = mergeSignals(userSignal, internal.signal);

      this._snapInflight = (async () => {
        await this._gateSnap();

        const out = {
          at: now(),
          tipHeight: null,
          tipHash: null,
          mempool: null,
          feeHistogram: null
        };

        try {
          const txt = await this._text(this._url("blocks/tip/height"), { signal });
          const n = parseInt(String(txt).trim(), 10);
          if (Number.isFinite(n)) out.tipHeight = n;
        } catch (_) {}

        try {
          const txt = await this._text(this._url("blocks/tip/hash"), { signal });
          const s = String(txt || "").trim();
          if (s && s.length >= 32) out.tipHash = s;
        } catch (_) {}

        try {
          const mem = await this._json(this._url("mempool"), { signal });
          if (mem && typeof mem === "object") {
            out.mempool = mem;
            if (Array.isArray(mem.fee_histogram)) out.feeHistogram = mem.fee_histogram;
            else if (Array.isArray(mem.feeHistogram)) out.feeHistogram = mem.feeHistogram; // drift-safe
          }
        } catch (_) {}

        const hasUseful =
          Number.isFinite(out.tipHeight) ||
          !!out.tipHash ||
          !!out.mempool ||
          (Array.isArray(out.feeHistogram) && out.feeHistogram.length);

        if (hasUseful) {
          this._snap = out;
          this._snapAt = out.at;
          return out;
        }

        // fall back to last-good snap if we have it
        if (this._snap) return this._snap;

        // else cache empty to avoid tight error loops
        this._snap = out;
        this._snapAt = out.at;
        return out;
      })();

      try {
        return await this._snapInflight;
      } finally {
        this._snapInflight = null;
      }
    }

    // --- helper: height -> hash ---
    async blockHashByHeight(height, { signal = null } = {}) {
      const h = Number(height);
      if (!Number.isFinite(h) || h <= 0) return null;

      try {
        const txt = await this._text(this._url(`block-height/${h}`), { signal });
        const s = String(txt || "").trim();
        return (s && s.length >= 32) ? s : null;
      } catch {
        return null;
      }
    }

    // --- tip txids: used to build real tiles (block construction) ---
    async tipTxids({ force = false, limit = null, signal: userSignal = null } = {}) {
      const t = now();
      const max = clamp(Number(limit ?? this.maxTxids) || this.maxTxids, 1, this.maxTxids);

      if (!force && this._tipTxids && (t - this._tipTxidsAt) < this.minIntervalMs) {
        // return same object but sliced deterministically
        return { ...this._tipTxids, txids: (this._tipTxids.txids || []).slice(0, max) };
      }
      if (this._tipTxidsInflight) {
        const r = await this._tipTxidsInflight;
        return { ...r, txids: (r.txids || []).slice(0, max) };
      }

      const internal = new AbortController();
      const signal = mergeSignals(userSignal, internal.signal);

      this._tipTxidsInflight = (async () => {
        // leverage snapshot gate to prevent multi-mount stampede
        const snap = await this.snapshot({ force, signal });

        const out = {
          at: now(),
          tipHeight: snap.tipHeight ?? null,
          tipHash: snap.tipHash ?? null,
          txids: []
        };

        // Need tip hash to fetch block txids
        let tipHash = out.tipHash;
        if (!tipHash && Number.isFinite(out.tipHeight)) {
          tipHash = await this.blockHashByHeight(out.tipHeight, { signal });
          out.tipHash = tipHash;
        }

        if (!tipHash) {
          // Can't fetch txids; cache what we have
          this._tipTxids = out;
          this._tipTxidsAt = out.at;
          return out;
        }

        // Best endpoint: /block/<hash>/txids (array of strings)
        try {
          const txids = await this._json(this._url(`block/${tipHash}/txids`), { signal });
          if (Array.isArray(txids)) out.txids = txids.filter(x => typeof x === "string");
        } catch (_) {
          // fallback: /block/<hash>/txs (array of tx objects with txid)
          try {
            const txs = await this._json(this._url(`block/${tipHash}/txs`), { signal });
            if (Array.isArray(txs)) {
              out.txids = txs.map(x => x?.txid).filter(Boolean);
              // Also prime cache with partial objects if present
              for (const tx of txs) {
                if (tx?.txid) this._txCache.set(tx.txid, { t: now(), v: tx });
              }
            }
          } catch (_) {}
        }

        // Cap to safety max
        out.txids = (out.txids || []).slice(0, max);

        this._tipTxids = out;
        this._tipTxidsAt = out.at;
        return out;
      })();

      try {
        const r = await this._tipTxidsInflight;
        return { ...r, txids: (r.txids || []).slice(0, max) };
      } finally {
        this._tipTxidsInflight = null;
      }
    }

    // --- fetch one tx (cached + coalesced) ---
    async tx(txid, { force = false, signal: userSignal = null, tipHeight = null, btcUsd = null } = {}) {
      const id = String(txid || "").trim();
      if (!id) throw new Error("txid required");

      const t = now();

      // cache hit
      const hit = this._txCache.get(id);
      if (!force && hit && (t - hit.t) < this.txTtlMs) {
        return decorateTx(hit.v, { tipHeight, btcUsd });
      }

      // coalesce inflight per txid
      const inF = this._txInflight.get(id);
      if (inF) return decorateTx(await inF, { tipHeight, btcUsd });

      const internal = new AbortController();
      const signal = mergeSignals(userSignal, internal.signal);

      const p = (async () => {
        await this._gateTx();

        const data = await this._json(this._url(`tx/${id}`), { signal });
        // cache raw
        this._txCache.set(id, { t: now(), v: data });
        return data;
      })();

      this._txInflight.set(id, p);

      try {
        const v = await p;
        return decorateTx(v, { tipHeight, btcUsd });
      } finally {
        this._txInflight.delete(id);
      }
    }

    // --- fetch many txs (bounded concurrency, returns Map) ---
    async txBatch(txids, { limit = null, concurrency = null, signal: userSignal = null, force = false, tipHeight = null, btcUsd = null } = {}) {
      const ids0 = Array.isArray(txids) ? txids : [];
      const ids = ids0.map(x => String(x || "").trim()).filter(Boolean);

      const max = clamp(Number(limit ?? this.maxTxids) || this.maxTxids, 1, this.maxTxids);
      const pick = ids.slice(0, max);

      const internal = new AbortController();
      const signal = mergeSignals(userSignal, internal.signal);

      const conc = clamp(Number(concurrency ?? this.txConcurrency) || this.txConcurrency, 1, 10);

      const results = await pool(
        pick,
        conc,
        async (id) => {
          try {
            const t = await this.tx(id, { force, signal, tipHeight, btcUsd });
            return { id, tx: t };
          } catch {
            return { id, tx: null };
          }
        },
        signal
      );

      const m = new Map();
      for (const r of results) {
        if (r && r.id) m.set(r.id, r.tx);
      }
      return m;
    }
  }

  NS.TxFetcher = TxFetcher;
})();
