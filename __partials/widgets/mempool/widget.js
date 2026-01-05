// __partials/widgets/mempool/widget.js
// Unified-runtime adapter (NO UI / layout / behavior changes)

(function () {
  const ID = "mempool";

  function fmtBig(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    if (x >= 1e9) return (x / 1e9).toFixed(2) + "B";
    if (x >= 1e6) return (x / 1e6).toFixed(2) + "M";
    if (x >= 1e3) return (x / 1e3).toFixed(2) + "K";
    return x.toLocaleString();
  }

  window.ZZXWidgets.register(ID, {
    mount(slotEl) {
      this.card = slotEl.querySelector('[data-w="mempool"]');
      this._t = null;
    },

    start(ctx) {
      const MEMPOOL = ctx.api.MEMPOOL;
      const card = this.card;
      if (!card) return;

      const valEl = card.querySelector("[data-val]");
      const subEl = card.querySelector("[data-sub]");

      const run = async () => {
        try {
          const m = await ctx.fetchJSON(`${MEMPOOL}/mempool`);
          const count = Number(m?.count);
          if (valEl) valEl.textContent = Number.isFinite(count) ? fmtBig(count) : "—";
          if (subEl) subEl.textContent = "tx";
        } catch {
          if (valEl) valEl.textContent = "—";
          if (subEl) subEl.textContent = "tx";
        }
      };

      run();
      this._t = setInterval(run, 15_000);
    },

    stop() {
      if (this._t) clearInterval(this._t);
      this._t = null;
    }
  });
})();
