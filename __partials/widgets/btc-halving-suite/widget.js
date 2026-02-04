// __partials/widgets/btc-halving-suite/widget.js
// DROP-IN: unified-runtime compatible, no UI changes.
// Uses mempool.space. Uses AllOrigins fallback if ctx.fetchText is not available.

(function () {
  "use strict";

  const W = window;
  const ID = "btc-halving-suite";
  const MEMPOOL = "https://mempool.space/api";
  const AO_RAW = "https://api.allorigins.win/raw?url=";

  const HALVING_INTERVAL = 210000;
  const INITIAL_REWARD = 50;     // BTC
  const MAX_SUPPLY = 21000000;   // BTC

  function fmtBTC(x) {
    if (!Number.isFinite(x)) return "—";
    return x.toLocaleString(undefined, { maximumFractionDigits: 8 });
  }

  function rewardAtHeight(height) {
    const era = Math.floor(height / HALVING_INTERVAL);
    return INITIAL_REWARD / Math.pow(2, era);
  }

  function totalMinedAtHeight(height) {
    let remainingBlocks = height;
    let era = 0;
    let total = 0;

    while (remainingBlocks > 0) {
      const blocksThisEra = Math.min(remainingBlocks, HALVING_INTERVAL);
      const r = INITIAL_REWARD / Math.pow(2, era);
      if (r <= 0) break;
      total += blocksThisEra * r;
      remainingBlocks -= blocksThisEra;
      era++;
    }
    return total;
  }

  function q(root, sel) { return root ? root.querySelector(sel) : null; }

  async function fetchTextDirect(url) {
    const r = await fetch(url, { cache: "no-store", credentials: "omit", redirect: "follow" });
    const t = await r.text();
    if (!r.ok) throw new Error("HTTP " + r.status);
    return t;
  }

  async function fetchTextDirectThenAO(url) {
    try {
      return await fetchTextDirect(url);
    } catch (e1) {
      const ao = AO_RAW + encodeURIComponent(String(url));
      try {
        return await fetchTextDirect(ao);
      } catch (e2) {
        throw new Error("fetch failed: " + String(e1?.message || e1) + " | " + String(e2?.message || e2));
      }
    }
  }

  async function getTipHeight(ctx) {
    const url = `${MEMPOOL}/blocks/tip/height`;
    if (ctx && typeof ctx.fetchText === "function") {
      return await ctx.fetchText(url);
    }
    return await fetchTextDirectThenAO(url);
  }

  async function update(root, ctx, state, force) {
    const now = Date.now();
    if (!force && now - (state.last || 0) < 15_000) return;
    state.last = now;

    if (!root) return;

    const tipEl = q(root, "[data-tip]");
    const rEl   = q(root, "[data-reward]");
    const hEl   = q(root, "[data-halving]");
    const mEl   = q(root, "[data-mined]");
    const remEl = q(root, "[data-remain]");

    try {
      const tipTxt = await getTipHeight(ctx);
      const tip = parseInt(String(tipTxt).trim(), 10);
      if (!Number.isFinite(tip)) throw new Error("bad tip");

      const era = Math.floor(tip / HALVING_INTERVAL);
      const nextHalvingHeight = (era + 1) * HALVING_INTERVAL;
      const blocksToHalving = Math.max(0, nextHalvingHeight - tip);

      const reward = rewardAtHeight(tip);
      const mined = totalMinedAtHeight(tip);
      const remain = Math.max(0, MAX_SUPPLY - mined);

      if (tipEl) tipEl.textContent = String(tip);
      if (rEl) rEl.textContent = `${fmtBTC(reward)} BTC`;
      if (hEl) hEl.textContent = `#${era} → ${blocksToHalving.toLocaleString()} blocks`;
      if (mEl) mEl.textContent = `${fmtBTC(mined)} BTC`;
      if (remEl) remEl.textContent = `${fmtBTC(remain)} BTC`;
    } catch {
      if (tipEl) tipEl.textContent = "—";
      if (rEl) rEl.textContent = "—";
      if (hEl) hEl.textContent = "—";
      if (mEl) mEl.textContent = "—";
      if (remEl) remEl.textContent = "—";
    }
  }

  function boot(root, ctx) {
    if (!root) return;

    const state = (root.__zzxBHS = root.__zzxBHS || { last: 0 });

    // If legacy runtime ticks, it will call update(); if not, we self-refresh safely.
    update(root, ctx, state, true);

    if (root.__zzxBHSTimer) {
      clearInterval(root.__zzxBHSTimer);
      root.__zzxBHSTimer = null;
    }

    // conservative self-refresh (won’t hurt even if tick exists; update() is throttled)
    root.__zzxBHSTimer = setInterval(() => update(root, ctx, state, false), 15_000);
  }

  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (root, ctx) => boot(root, ctx));
    return;
  }

  if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, {
      mount(slotEl) { this._root = slotEl; this._state = { last: 0 }; },
      async start(ctx) { this._ctx = ctx; await update(this._root, this._ctx, this._state, true); },
      async update(force=false) { await update(this._root, this._ctx, this._state, force); },
      tick() { this.update(false); },
      stop() {}
    });
  }
})();
