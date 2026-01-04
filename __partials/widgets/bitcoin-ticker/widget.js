(function () {
  window.ZZXWidgets.register("bitcoin-ticker", {
    mount(slotEl) { this.root = slotEl; },
    start(ctx) {
      const SPOT = ctx.api.COINBASE_SPOT;

      const tick = async () => {
        const root = this.root;
        if (!root) return;
        const a = root.querySelector("[data-btc]");
        const b = root.querySelector("[data-mbtc]");
        const c = root.querySelector("[data-ubtc]");
        const d = root.querySelector("[data-sat]");
        if (!a || !b || !c || !d) return;

        try {
          const data = await ctx.util.jget(SPOT);
          const btc = parseFloat(data?.data?.amount);
          if (!Number.isFinite(btc)) return;

          a.textContent = btc.toFixed(2);
          b.textContent = (btc * 0.001).toFixed(2);
          c.textContent = (btc * 0.000001).toFixed(4);
          d.textContent = (btc * 0.00000001).toFixed(6);
        } catch {}
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
