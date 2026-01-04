(function () {
  window.ZZXWidgets.register("volume-24h", {
    mount(slotEl) { this.card = slotEl.querySelector('[data-w="volume-24h"]'); },
    start(ctx) {
      const URL = ctx.api.COINBASE_CANDLES_15M;

      const run = async () => {
        const card = this.card;
        if (!card) return;

        try {
          const candles = await ctx.util.jget(URL);
          if (!Array.isArray(candles) || candles.length < 2) return;

          const rows = candles.slice().reverse();
          const last96 = rows.slice(-96); // 24h @ 15m

          let totalUsd = 0;
          const volsUsd = [];

          for (const r of last96) {
            const vbtc = Number(r?.[5]);
            const close = Number(r?.[4]);
            if (!Number.isFinite(vbtc) || !Number.isFinite(close)) continue;
            const v = vbtc * close;
            totalUsd += v;
            volsUsd.push(v);
          }

          ctx.util.setCard(card, `$${ctx.util.fmtBig(totalUsd)}`, "USD");
          ctx.util.drawSpark(card, volsUsd);
        } catch {}
      };

      run();
      this._t = setInterval(run, 60_000);
    },
    stop() { if (this._t) clearInterval(this._t); this._t = null; }
  });
})();
