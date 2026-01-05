// __partials/widgets/hashrate/widget.js
// Unified-runtime adapter (NO UI / layout / behavior changes)

(function () {
  const ID = "hashrate";

  window.ZZXWidgets.register(ID, {
    mount(slotEl) {
      this.card = slotEl.querySelector('[data-w="hashrate"]');
      this._t = null;
    },

    start(ctx) {
      const MEMPOOL = ctx.api.MEMPOOL;
      const card = this.card;
      if (!card) return;

      const valEl = card.querySelector("[data-val]");
      const subEl = card.querySelector("[data-sub]");

      const candidates = [
        `${MEMPOOL}/v1/mining/hashrate/3d`,
        `${MEMPOOL}/v1/mining/hashrate/7d`,
        `${MEMPOOL}/v1/mining/hashrate`,
      ];

      const render = (v) => {
        if (valEl) valEl.textContent = v;
        if (subEl) subEl.textContent = "EH/s";
      };

      const run = async () => {
        for (const u of candidates) {
          try {
            const data = await ctx.fetchJSON(u);
            let seriesEH = [];

            if (Array.isArray(data)) {
              seriesEH = data
                .map(x => Number(x?.hashrate ?? x?.avgHashrate ?? x?.value))
                .filter(Number.isFinite)
                .map(hs => hs / 1e18);
            } else if (data && typeof data === "object") {
              const cur = Number(data?.currentHashrate ?? data?.hashrate ?? data?.value);
              if (Number.isFinite(cur)) seriesEH = [cur / 1e18];
            }

            const lastEH = seriesEH.length
              ? seriesEH[seriesEH.length - 1]
              : NaN;

            render(Number.isFinite(lastEH) ? lastEH.toFixed(2) : "—");
            return;
          } catch {
            // try next candidate
          }
        }

        render("—");
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
