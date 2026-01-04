(function () {
  const ID = "btc-halving-suite";
  const MEMPOOL = "https://mempool.space/api";

  function fmtBTC(x){
    if (!Number.isFinite(x)) return "—";
    return x.toLocaleString(undefined, { maximumFractionDigits: 8 });
  }

  // Consensus constants
  const HALVING_INTERVAL = 210000;
  const INITIAL_REWARD = 50; // BTC
  const MAX_SUPPLY = 21000000;

  function rewardAtHeight(height){
    const era = Math.floor(height / HALVING_INTERVAL);
    return INITIAL_REWARD / Math.pow(2, era);
  }

  function totalMinedAtHeight(height){
    // Sum rewards for all full eras + partial current era
    let remaining = height; // blocks already mined (roughly)
    let era = 0;
    let total = 0;

    while (remaining > 0) {
      const blocksThisEra = Math.min(remaining, HALVING_INTERVAL);
      const r = INITIAL_REWARD / Math.pow(2, era);
      if (r <= 0) break;
      total += blocksThisEra * r;
      remaining -= blocksThisEra;
      era++;
    }
    return total;
  }

  window.ZZXWidgetRegistry.register(ID, {
    _root: null,
    _core: null,
    _last: 0,

    async init({ root, core }) {
      this._root = root;
      this._core = core;
      await this.update();
    },

    async update() {
      const now = Date.now();
      if (now - this._last < 15_000) return;
      this._last = now;

      const tipEl = this._root.querySelector("[data-tip]");
      const rEl   = this._root.querySelector("[data-reward]");
      const hEl   = this._root.querySelector("[data-halving]");
      const mEl   = this._root.querySelector("[data-mined]");
      const remEl = this._root.querySelector("[data-remain]");

      try {
        const tipTxt = await this._core.fetchText(`${MEMPOOL}/blocks/tip/height`);
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
      }
    },

    tick() { this.update(); },
    destroy() {}
  });
})();
