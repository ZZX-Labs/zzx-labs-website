// __partials/widgets/btc-halving-suite/widget.js
// DROP-IN (unified-runtime compatible; no UI/logic changes)
// - Works with either ZZXWidgetsCore.onMount(...) OR legacy ZZXWidgets.register(...)
// - Keeps your ctx.fetchText(...) path (so mempool.space is fetched through your shared fetch layer)

(function () {
  "use strict";

  const W = window;
  const ID = "btc-halving-suite";
  const MEMPOOL = "https://mempool.space/api";

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

  async function update(root, ctx, state, force) {
    const now = Date.now();
    if (!force && now - (state.last || 0) < 15_000) return;
    state.last = now;

    if (!root) return;

    const tipEl = root.querySelector("[data-tip]");
    const rEl   = root.querySelector("[data-reward]");
    const hEl   = root.querySelector("[data-halving]");
    const mEl   = root.querySelector("[data-mined]");
    const remEl = root.querySelector("[data-remain]");

    try {
      if (!ctx || typeof ctx.fetchText !== "function") {
        throw new Error("missing ctx.fetchText");
      }

      const tipTxt = await ctx.fetchText(`${MEMPOOL}/blocks/tip/height`);
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

    // If you have a central scheduler calling widget tick(), we just do one update here.
    // If not, we self-schedule a conservative interval (same behavior as most of your other widgets).
    update(root, ctx, state, true);

    if (root.__zzxBHSTimer) {
      clearInterval(root.__zzxBHSTimer);
      root.__zzxBHSTimer = null;
    }

    // Only create our own timer if your core isn’t providing tick().
    // (If core exists, prefer core tick loop.)
    if (!W.ZZXWidgetsCore?.usesGlobalTick) {
      root.__zzxBHSTimer = setInterval(() => update(root, ctx, state, false), 15_000);
    }
  }

  // Unified runtime preferred
  if (W.ZZXWidgetsCore?.onMount) {
    W.ZZXWidgetsCore.onMount(ID, (root, ctx) => boot(root, ctx || W.ZZXWidgetsCore?.ctx));
    return;
  }

  // Legacy runtime fallback (keeps your previous structure)
  if (W.ZZXWidgets?.register) {
    W.ZZXWidgets.register(ID, {
      mount(slotEl) {
        this._root = slotEl;
        this._last = 0;
      },
      async start(ctx) {
        this._ctx = ctx;
        await update(this._root, this._ctx, this, true);
      },
      async update(force = false) {
        await update(this._root, this._ctx, this, force);
      },
      tick() {
        this.update(false);
      },
      stop() {}
    });
  }
})();
