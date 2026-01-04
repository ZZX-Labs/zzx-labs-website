(function () {
  window.ZZXWidgets.register("fees", {
    mount(slotEl) { this.card = slotEl.querySelector('[data-w="fees"]'); },
    start(ctx) {
      const MEMPOOL = ctx.api.MEMPOOL;

      const run = async () => {
        const card = this.card;
        if (!card) return;
        try {
          const f = await ctx.util.jget(`${MEMPOOL}/v1/fees/recommended`);
          const H = Number(f?.fastestFee);
          const M = Number(f?.halfHourFee);
          const L = Number(f?.hourFee);
          const txt = (Number.isFinite(H) && Number.isFinite(M) && Number.isFinite(L))
            ? `H:${H}  M:${M}  L:${L}`
            : "—";
          ctx.util.setCard(card, txt, "sat/vB");
        } catch {
          ctx.util.setCard(card, "—", "sat/vB");
        }
      };

      run();
      this._t = setInterval(run, 15_000);
    },
    stop() { if (this._t) clearInterval(this._t); this._t = null; }
  });
})();
