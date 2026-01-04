(function () {
  window.ZZXWidgets.register("mempool", {
    mount(slotEl) { this.card = slotEl.querySelector('[data-w="mempool"]'); },
    start(ctx) {
      const MEMPOOL = ctx.api.MEMPOOL;

      const run = async () => {
        const card = this.card;
        if (!card) return;
        try {
          const m = await ctx.util.jget(`${MEMPOOL}/mempool`);
          const count = Number(m?.count);
          ctx.util.setCard(card, Number.isFinite(count) ? ctx.util.fmtBig(count) : "—", "tx");
        } catch {
          ctx.util.setCard(card, "—", "tx");
        }
      };

      run();
      this._t = setInterval(run, 15_000);
    },
    stop() { if (this._t) clearInterval(this._t); this._t = null; }
  });
})();
