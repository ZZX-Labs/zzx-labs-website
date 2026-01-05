// __partials/widgets/price-24h/widget.js
// FIXED + EXTENDED: unified-runtime compatible + +/- percent change w/ color
//
// Your current file uses ctx.util.jget / setCard / fmtUSD / drawSpark, which do not
// exist in unified runtime :contentReference[oaicite:0]{index=0}.
// HTML stays unchanged :contentReference[oaicite:1]{index=1}, CSS stays unchanged :contentReference[oaicite:2]{index=2}.
//
// Behavior:
// - Uses Coinbase 15m candles (ctx.api.COINBASE_CANDLES_15M)
// - Computes last price (last close) and 24h % change from first->last close over last 96 candles
// - Subline becomes: "+1.23%" or "-1.23%" (always signed when finite)
// - Color: green for +, red for -, neutral for 0/unknown
// - No layout changes; uses inline style on [data-sub] only (safe + minimal)

(function () {
  const ID = "price-24h";

  function fmtUSD(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtSignedPct(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    const sign = x > 0 ? "+" : (x < 0 ? "−" : ""); // U+2212 minus for nicer typography
    return `${sign}${Math.abs(x).toFixed(2)}%`;
  }

  function setSubColor(el, pct) {
    if (!el) return;

    // default / neutral
    el.style.color = "";
    el.style.fontWeight = "";

    const x = Number(pct);
    if (!Number.isFinite(x) || x === 0) return;

    // Match your palette semantics:
    // - green for positive
    // - red for negative
    el.style.color = (x > 0) ? "#c0d674" : "#ff4d4d";
    el.style.fontWeight = "700";
  }

  window.ZZXWidgets.register(ID, {
    mount(slotEl) {
      this.card = slotEl.querySelector('[data-w="price-24h"]');
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
          // unified runtime fetch
          const candles = await ctx.fetchJSON(URL);

          if (!Array.isArray(candles) || candles.length < 2) {
            if (valEl) valEl.textContent = "—";
            if (subEl) subEl.textContent = "—";
            setSubColor(subEl, NaN);
            return;
          }

          // Coinbase candles: [time, low, high, open, close, volume]
          // Returned newest-first; normalize to oldest-first
          const rows = candles.slice().reverse();

          // 24h @ 15m granularity = 96 candles
          const last96 = rows.slice(-96);
          const closes = last96.map(r => Number(r?.[4])).filter(Number.isFinite);

          if (closes.length < 2) {
            if (valEl) valEl.textContent = "—";
            if (subEl) subEl.textContent = "—";
            setSubColor(subEl, NaN);
            return;
          }

          const first = closes[0];
          const last = closes[closes.length - 1];
          const changePct = (first !== 0) ? ((last - first) / first) * 100 : NaN;

          if (valEl) valEl.textContent = fmtUSD(last);

          const pctTxt = fmtSignedPct(changePct);
          if (subEl) subEl.textContent = pctTxt;

          setSubColor(subEl, changePct);
        } catch {
          if (valEl) valEl.textContent = "—";
          if (subEl) subEl.textContent = "—";
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
