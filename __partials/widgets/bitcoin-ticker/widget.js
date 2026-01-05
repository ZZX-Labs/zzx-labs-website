// __partials/widgets/bitcoin-ticker/widget.js
// FIXED: aligned to unified ZZX runtime ctx (NO behavior changes)

(function () {
  window.ZZXWidgets.register("bitcoin-ticker", {
    mount(slotEl) {
      this.root = slotEl;
    },

    start(ctx) {
      if (!this.root || !ctx || !ctx.api) return;

      const SPOT = ctx.api.COINBASE_SPOT;
      const root = this.root;

      const a = root.querySelector("[data-btc]");
      const b = root.querySelector("[data-mbtc]");
      const c = root.querySelector("[data-ubtc]");
      const d = root.querySelector("[data-sat]");
      if (!a || !b || !c || !d) return;

      const tick = async () => {
        try {
          const data = await ctx.fetchJSON(SPOT);
          const btc = parseFloat(data?.data?.amount);
          if (!Number.isFinite(btc)) return;

          a.textContent = btc.toFixed(2);
          b.textContent = (btc * 0.001).toFixed(2);
          c.textContent = (btc * 0.000001).toFixed(4);
          d.textContent = (btc * 0.00000001).toFixed(6);
        } catch {
          // network hiccup → ignore, keep last good value
        }
      };

      tick();
      this._t = setInterval(tick, 250);
    },

    stop() {
      if (this._t) clearInterval(this._t);
      this._t = null;
    }
  });
})();
