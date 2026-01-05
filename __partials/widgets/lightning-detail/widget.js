// __partials/widgets/lightning-detail/widget.js
// Unified-runtime adapter (NO UI / layout / behavior changes)

(function () {
  const ID = "lightning-detail";

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
      this.card = slotEl.querySelector('[data-w="lightning-detail"]');
      this.capEl = this.card?.querySelector("[data-cap]");
      this.nodesEl = this.card?.querySelector("[data-nodes]");
      this.chansEl = this.card?.querySelector("[data-chans]");
      this._t = null;
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
          try {
            ln = await ctx.fetchJSON(u);
            if (ln && typeof ln === "object") break;
          } catch {}
        }

        const cap = Number(
          ln?.capacity ??
          ln?.total_capacity ??
          ln?.totalCapacity ??
          ln?.network_capacity ??
          ln?.totalLiquidity
        );

        const nodes = Number(
          ln?.nodes ??
          ln?.node_count ??
          ln?.nodeCount
        );

        const chans = Number(
          ln?.channels ??
          ln?.channel_count ??
          ln?.channelCount
        );

        if (this.capEl)   this.capEl.textContent   = Number.isFinite(cap)   ? `${fmtBig(cap)} BTC` : "—";
        if (this.nodesEl) this.nodesEl.textContent = Number.isFinite(nodes) ? fmtBig(nodes) : "—";
        if (this.chansEl) this.chansEl.textContent = Number.isFinite(chans) ? fmtBig(chans) : "—";
      };

      run();
      this._t = setInterval(run, 60_000);
    },

    stop() {
      if (this._t) clearInterval(this._t);
      this._t = null;
    }
  });
})();
