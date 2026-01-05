// __partials/widgets/lightning/widget.js
// Unified-runtime adapter (NO UI / layout / behavior changes)

(function () {
  const ID = "lightning";

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
      this.card = slotEl.querySelector('[data-w="lightning"]');
      this._t = null;
    },

    start(ctx) {
      const MEMPOOL = ctx.api.MEMPOOL;
      const card = this.card;
      if (!card) return;

      const valEl = card.querySelector("[data-val]");
      const subEl = card.querySelector("[data-sub]");

      const candidates = [
        `${MEMPOOL}/v1/lightning/statistics`,
        `${MEMPOOL}/v1/lightning`,
        `${MEMPOOL}/v1/lightning/network`,
      ];

      const render = (v, s) => {
        if (valEl) valEl.textContent = v;
        if (subEl) subEl.textContent = s;
      };

      const run = async () => {
        let ln = null;

        for (const u of candidates) {
          try {
            ln = await ctx.fetchJSON(u);
            if (ln && typeof ln === "object") break;
          } catch {}
        }

        if (!ln || typeof ln !== "object") {
          render("—", "capacity");
          return;
        }

        const cap   = Number(ln?.capacity ?? ln?.total_capacity ?? ln?.totalCapacity ?? ln?.network_capacity ?? ln?.totalLiquidity);
        const nodes = Number(ln?.nodes ?? ln?.node_count ?? ln?.nodeCount);
        const chans = Number(ln?.channels ?? ln?.channel_count ?? ln?.channelCount);

        if (Number.isFinite(cap)) {
          render(fmtBig(cap), "BTC cap");
        } else if (Number.isFinite(nodes)) {
          render(fmtBig(nodes), "LN nodes");
        } else if (Number.isFinite(chans)) {
          render(fmtBig(chans), "channels");
        } else {
          render("—", "capacity");
        }
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
