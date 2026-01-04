(function () {
  window.ZZXWidgets.register("nodes", {
    mount(slotEl) { this.card = slotEl.querySelector('[data-w="nodes"]'); },
    start(ctx) {
      const run = async () => {
        const card = this.card;
        if (!card) return;

        try {
          const data = await ctx.util.jgetAllOrigins(ctx.api.BITNODES_LATEST);

          const total = Number(data?.total_nodes ?? data?.total ?? data?.count);
          const reachable = Number(data?.reachable_nodes ?? data?.reachable ?? data?.total_reachable);
          const show = Number.isFinite(reachable) ? reachable : (Number.isFinite(total) ? total : NaN);

          ctx.util.setCard(card, Number.isFinite(show) ? ctx.util.fmtBig(show) : "—", "reachable");
        } catch {
          ctx.util.setCard(card, "—", "reachable");
        }
      };

      run();
      this._t = setInterval(run, 60_000);
    },
    stop() { if (this._t) clearInterval(this._t); this._t = null; }
  });
})();
