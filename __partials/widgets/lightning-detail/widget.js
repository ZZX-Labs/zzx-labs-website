(function () {
  window.ZZXWidgets.register("lightning-detail", {
    mount(slotEl) {
      this.card = slotEl.querySelector('[data-w="lightning-detail"]');
      this.capEl = this.card?.querySelector("[data-cap]");
      this.nodesEl = this.card?.querySelector("[data-nodes]");
      this.chansEl = this.card?.querySelector("[data-chans]");
    },
    start(ctx) {
      const MEMPOOL = ctx.api.MEMPOOL;
      const candidates = [
        `${MEMPOOL}/v1/lightning/statistics`,
        `${MEMPOOL}/v1/lightning`,
        `${MEMPOOL}/v1/lightning/network`,
      ];

      const run = async () => {
        if (!this.card) return;

        let ln = null;
        for (const u of candidates) {
          try { ln = await ctx.util.jget(u); break; } catch {}
        }

        const cap = Number(ln?.capacity ?? ln?.total_capacity ?? ln?.totalCapacity ?? ln?.network_capacity ?? ln?.totalLiquidity);
        const nodes = Number(ln?.nodes ?? ln?.node_count ?? ln?.nodeCount);
        const chans = Number(ln?.channels ?? ln?.channel_count ?? ln?.channelCount);

        if (this.capEl) this.capEl.textContent = Number.isFinite(cap) ? `${ctx.util.fmtBig(cap)} BTC` : "—";
        if (this.nodesEl) this.nodesEl.textContent = Number.isFinite(nodes) ? ctx.util.fmtBig(nodes) : "—";
        if (this.chansEl) this.chansEl.textContent = Number.isFinite(chans) ? ctx.util.fmtBig(chans) : "—";
      };

      run();
      this._t = setInterval(run, 60_000);
    },
    stop() { if (this._t) clearInterval(this._t); this._t = null; }
  });
})();
