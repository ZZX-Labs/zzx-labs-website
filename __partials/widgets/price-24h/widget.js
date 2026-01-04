(function () {
  window.ZZXWidgets.register("price-24h", {
    mount(slotEl) { this.card = slotEl.querySelector('[data-w="price-24h"]'); },
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
          const closes = last96.map(r => Number(r?.[4])).filter(Number.isFinite);
          if (closes.length < 2) return;

          const first = closes[0];
          const last = closes[closes.length - 1];
          const changePct = (first !== 0) ? ((last - first) / first) * 100 : NaN;

          ctx.util.setCard(card, ctx.util.fmtUSD(last), Number.isFinite(changePct) ? `${changePct.toFixed(2)}%` : "—");
          ctx.util.drawSpark(card, closes);
        } catch {}
      };

      run();
      this._t = setInterval(run, 60_000);
    },
    stop() { if (this._t) clearInterval(this._t); this._t = null; }
  });
})();
