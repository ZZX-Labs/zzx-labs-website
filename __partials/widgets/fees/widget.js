// __partials/widgets/fees/widget.js
// Unified-runtime adapter (NO UI / layout / behavior changes)

(function () {
  const ID = "fees";

  window.ZZXWidgets.register(ID, {
    mount(slotEl) {
      this.card = slotEl.querySelector('[data-w="fees"]');
      this._t = null;
    },

    start(ctx) {
      const MEMPOOL = ctx.api.MEMPOOL;
      const card = this.card;
      if (!card) return;

      const valEl = card.querySelector("[data-val]");
      const subEl = card.querySelector("[data-sub]");

      const render = (txt) => {
        if (valEl) valEl.textContent = txt;
        if (subEl) subEl.textContent = "sat/vB";
      };

      const run = async () => {
        try {
          const f = await ctx.fetchJSON(`${MEMPOOL}/v1/fees/recommended`);
          const H = Number(f?.fastestFee);
          const M = Number(f?.halfHourFee);
          const L = Number(f?.hourFee);

          const txt =
            Number.isFinite(H) && Number.isFinite(M) && Number.isFinite(L)
              ? `H:${H}  M:${M}  L:${L}`
              : "—";

          render(txt);
        } catch {
          render("—");
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
