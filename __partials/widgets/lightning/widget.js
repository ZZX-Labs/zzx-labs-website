(function () {
  window.ZZXWidgets.register("lightning", {
    mount(slotEl) { this.card = slotEl.querySelector('[data-w="lightning"]'); },
    start(ctx) {
      const MEMPOOL = ctx.api.MEMPOOL;
      const candidates = [
        `${MEMPOOL}/v1/lightning/statistics`,
        `${MEMPOOL}/v1/lightning`,
        `${MEMPOOL}/v1/lightning/network`,
      ];

      const run = async () => {
        const card = this.card;
        if (!card) return;

        let ln = null;
        for (const u of candidates) {
          try { ln = await ctx.util.jget(u); break; } catch {}
        }
        if (!ln || typeof ln !== "object") {
          ctx.util.setCard(card, "—", "capacity");
          return;
        }

        const cap = Number(ln?.capacity ?? ln?.total_capacity ?? ln?.totalCapacity ?? ln?.network_capacity ?? ln?.totalLiquidity);
        const nodes = Number(ln?.nodes ?? ln?.node_count ?? ln?.nodeCount);
        const chans = Number(ln?.channels ?? ln?.channel_count ?? ln?.channelCount);

        if (Number.isFinite(cap)) ctx.util.setCard(card, ctx.util.fmtBig(cap), "BTC cap");
        else if (Number.isFinite(nodes)) ctx.util.setCard(card, ctx.util.fmtBig(nodes), "LN nodes");
        else if (Number.isFinite(chans)) ctx.util.setCard(card, ctx.util.fmtBig(chans), "channels");
        else ctx.util.setCard(card, "—", "capacity");
      };

      run();
      this._t = setInterval(run, 60_000);
    },
    stop() { if (this._t) clearInterval(this._t); this._t = null; }
  });
})();
