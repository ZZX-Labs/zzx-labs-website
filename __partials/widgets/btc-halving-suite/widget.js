// __partials/widgets/btc-halving-suite/widget.js
// FIXED: unified-runtime compatible (NO UI / logic changes)

(function () {
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

  window.ZZXWidgets.register(ID, {
    mount(slotEl) {
      this._root = slotEl;
      this._last = 0;
    },

    async start(ctx) {
      this._ctx = ctx;
      await this.update(true);
    },

    async update(force = false) {
      const now = Date.now();
      if (!force && now - this._last < 15_000) return;
      this._last = now;

      const root = this._root;
      if (!root) return;

      const tipEl = root.querySelector("[data-tip]");
      const rEl   = root.querySelector("[data-reward]");
      const hEl   = root.querySelector("[data-halving]");
      const mEl   = root.querySelector("[data-mined]");
      const remEl = root.querySelector("[data-remain]");

      try {
        const tipTxt = await this._ctx.fetchText(`${MEMPOOL}/blocks/tip/height`);
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
    },

    tick() {
      this.update(false);
    },

    stop() {}
  });
})();
