// __partials/widgets/volume-24h/widget.js
// FIXED + EXTENDED: unified-runtime compatible + +/- percent change (green/red)
//
// Your current file still uses ctx.util.jget/setCard/fmtBig/drawSpark which do not
// exist in unified runtime :contentReference[oaicite:0]{index=0}.
// HTML stays unchanged :contentReference[oaicite:1]{index=1}.
// CSS stays unchanged :contentReference[oaicite:2]{index=2}.
//
// What we do (same data source as price-24h):
// - Use Coinbase 15m candles (BTC-USD, granularity=900s)
// - Compute USD volume per candle = volume(BTC) * close(USD)
// - Total 24h USD volume = sum of last 96 candles
// - 24h % change = compare current 24h total vs previous 24h total
//   (96-candle window vs the prior 96-candle window)
// - Subline becomes: "+1.23%" or "−1.23%" (always signed when finite)
// - Color: green for +, red for − (inline only; no CSS changes)
// - Updates every 60s

(function () {
  const ID = "volume-24h";

  function fmtBig(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    if (x >= 1e12) return (x / 1e12).toFixed(2) + "T";
    if (x >= 1e9) return (x / 1e9).toFixed(2) + "B";
    if (x >= 1e6) return (x / 1e6).toFixed(2) + "M";
    if (x >= 1e3) return (x / 1e3).toFixed(2) + "K";
    return x.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function fmtSignedPct(p) {
    const x = Number(p);
    if (!Number.isFinite(x)) return "—";
    const sign = x > 0 ? "+" : (x < 0 ? "−" : "");
    return `${sign}${Math.abs(x).toFixed(2)}%`;
  }

  function setSubColor(el, pct) {
    if (!el) return;
    el.style.color = "";
    el.style.fontWeight = "";

    const x = Number(pct);
    if (!Number.isFinite(x) || x === 0) return;

    el.style.color = (x > 0) ? "#c0d674" : "#ff4d4d";
    el.style.fontWeight = "700";
  }

  window.ZZXWidgets.register(ID, {
    mount(slotEl) {
      this.card = slotEl.querySelector('[data-w="volume-24h"]');
      this._t = null;
    },

    start(ctx) {
      const URL = ctx.api.COINBASE_CANDLES_15M;

      const run = async () => {
        const card = this.card;
        if (!card) return;

        const valEl = card.querySelector("[data-val]");
        const subEl = card.querySelector("[data-sub]");

        try {
          const candles = await ctx.fetchJSON(URL);
          if (!Array.isArray(candles) || candles.length < 200) {
            // need enough data for current 24h and previous 24h
            if (valEl) valEl.textContent = "—";
            if (subEl) subEl.textContent = "USD";
            setSubColor(subEl, NaN);
            return;
          }

          // Coinbase candles: [time, low, high, open, close, volume]
          // newest-first; normalize oldest-first
          const rows = candles.slice().reverse();

          const WINDOW = 96; // 24h at 15m
          const last192 = rows.slice(-2 * WINDOW);
          if (last192.length < 2 * WINDOW) {
            if (valEl) valEl.textContent = "—";
            if (subEl) subEl.textContent = "USD";
            setSubColor(subEl, NaN);
            return;
          }

          const prev = last192.slice(0, WINDOW);
          const cur  = last192.slice(WINDOW);

          function sumUsdVol(block) {
            let total = 0;
            for (const r of block) {
              const vbtc = Number(r?.[5]);
              const close = Number(r?.[4]);
              if (!Number.isFinite(vbtc) || !Number.isFinite(close)) continue;
              total += vbtc * close;
            }
            return total;
          }

          const prevTot = sumUsdVol(prev);
          const curTot  = sumUsdVol(cur);

          const pct = (Number.isFinite(prevTot) && prevTot > 0)
            ? ((curTot - prevTot) / prevTot) * 100
            : NaN;

          if (valEl) valEl.textContent = `$${fmtBig(curTot)}`;

          // Subline is percent change (per your request), color coded.
          if (subEl) subEl.textContent = fmtSignedPct(pct);
          setSubColor(subEl, pct);
        } catch {
          if (valEl) valEl.textContent = "—";
          if (subEl) subEl.textContent = "USD";
          setSubColor(subEl, NaN);
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
