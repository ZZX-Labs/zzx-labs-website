(function () {
  window.ZZXWidgets.register("tip-drift", {
    mount(slotEl) {
      this.card = slotEl.querySelector('[data-w="tip-drift"]');
      this.sinceEl = this.card?.querySelector("[data-since]");
      this.avgEl = this.card?.querySelector("[data-avg]");
    },
    start(ctx) {
      const MEMPOOL = ctx.api.MEMPOOL;

      const run = async () => {
        const card = this.card;
        if (!card) return;

        try {
          const heightText = await ctx.util.tget(`${MEMPOOL}/blocks/tip/height`);
          const h = parseInt(String(heightText).trim(), 10);
          ctx.util.setCard(card, Number.isFinite(h) ? String(h) : "—", "height");

          const blocks = await ctx.util.jget(`${MEMPOOL}/blocks`);
          const arr = Array.isArray(blocks) ? blocks : [];
          const tip = arr[0];
          const tsTip = Number(tip?.timestamp);

          if (Number.isFinite(tsTip) && this.sinceEl) {
            const sinceSec = Math.max(0, Math.round(Date.now()/1000 - tsTip));
            this.sinceEl.textContent = `+${(sinceSec/60).toFixed(1)}m`;
          }

          // avg interval over last 6 blocks
          const N = 6;
          const ts = arr.slice(0, N).map(b => Number(b?.timestamp)).filter(Number.isFinite);
          if (ts.length >= 2 && this.avgEl) {
            const diffs = [];
            for (let i = 0; i < ts.length - 1; i++) diffs.push(ts[i] - ts[i+1]);
            const avgSec = diffs.reduce((a,x)=>a+x,0) / diffs.length;
            const avgMin = avgSec / 60;
            const delta10 = avgMin - 10;
            this.avgEl.textContent = `avg ${avgMin.toFixed(1)}m (Δ10 ${delta10>=0?"+":""}${delta10.toFixed(1)}m)`;
          }
        } catch {
          ctx.util.setCard(card, "—", "height");
          if (this.sinceEl) this.sinceEl.textContent = "—";
          if (this.avgEl) this.avgEl.textContent = "—";
        }
      };

      run();
      this._t = setInterval(run, 15_000);
    },
    stop() { if (this._t) clearInterval(this._t); this._t = null; }
  });
})();
