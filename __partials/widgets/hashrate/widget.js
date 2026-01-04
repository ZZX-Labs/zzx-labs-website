(function () {
  window.ZZXWidgets.register("hashrate", {
    mount(slotEl) { this.card = slotEl.querySelector('[data-w="hashrate"]'); },
    start(ctx) {
      const MEMPOOL = ctx.api.MEMPOOL;
      const candidates = [
        `${MEMPOOL}/v1/mining/hashrate/3d`,
        `${MEMPOOL}/v1/mining/hashrate/7d`,
        `${MEMPOOL}/v1/mining/hashrate`,
      ];

      const run = async () => {
        const card = this.card;
        if (!card) return;

        for (const u of candidates) {
          try {
            const data = await ctx.util.jget(u);
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

            const lastEH = seriesEH.length ? seriesEH[seriesEH.length - 1] : NaN;
            ctx.util.setCard(card, Number.isFinite(lastEH) ? lastEH.toFixed(2) : "—", "EH/s");
            if (seriesEH.length >= 2) ctx.util.drawSpark(card, seriesEH.slice(-96));
            return;
          } catch {}
        }

        ctx.util.setCard(card, "—", "EH/s");
      };

      run();
      this._t = setInterval(run, 15_000);
    },
    stop() { if (this._t) clearInterval(this._t); this._t = null; }
  });
})();
