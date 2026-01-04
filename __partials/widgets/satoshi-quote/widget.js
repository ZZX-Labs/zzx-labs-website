(function () {
  window.ZZXWidgets.register("satoshi-quote", {
    mount(slotEl) {
      this.card = slotEl.querySelector('[data-w="satoshi-quote"]');
      this.qEl = this.card?.querySelector("[data-quote]");
      this.srcEl = this.card?.querySelector("[data-src]");
      this.linkEl = this.card?.querySelector("[data-link]");
      this.quotes = null;
    },
    start(ctx) {
      const QUOTES_URL = "/__partials/widgets/satoshi-quote/quotes.json";

      const normalize = (arr) => {
        // Accepts your file in whatever shape:
        // - [{q,src,url}, ...]
        // - [{quote, source, link}, ...]
        // - or even raw strings -> treated as quote text
        const out = [];
        for (const it of (Array.isArray(arr) ? arr : [])) {
          if (typeof it === "string") {
            out.push({ q: it, src: "Satoshi", url: "https://satoshi.nakamotoinstitute.org/quotes/" });
          } else if (it && typeof it === "object") {
            const q = it.q ?? it.quote ?? it.text ?? it.body;
            const src = it.src ?? it.source ?? it.meta ?? "Satoshi";
            const url = it.url ?? it.link ?? it.href ?? "https://satoshi.nakamotoinstitute.org/quotes/";
            if (q) out.push({ q: String(q), src: String(src), url: String(url) });
          }
        }
        return out;
      };

      const render = (item) => {
        if (!this.card) return;
        if (this.qEl) this.qEl.textContent = `“${item?.q || "—"}”`;
        if (this.srcEl) this.srcEl.textContent = item?.src || "Satoshi";
        if (this.linkEl) this.linkEl.href = item?.url || "https://satoshi.nakamotoinstitute.org/quotes/";
      };

      const pick = () => {
        if (!Array.isArray(this.quotes) || !this.quotes.length) return null;
        return this.quotes[Math.floor(Math.random() * this.quotes.length)];
      };

      const load = async () => {
        try {
          const data = await ctx.util.jget(QUOTES_URL);
          const quotes = normalize(data);
          if (quotes.length) this.quotes = quotes;
        } catch {}
        if (!this.quotes) {
          this.quotes = [
            {
              q: "The root problem with conventional currency is all the trust that's required to make it work.",
              src: "Satoshi (2009)",
              url: "https://p2pfoundation.ning.com/forum/topics/bitcoin-open-source"
            },
            {
              q: "Lost coins only make everyone else's coins worth slightly more. Think of it as a donation to everyone.",
              src: "Satoshi (2010)",
              url: "https://satoshi.nakamotoinstitute.org/quotes/"
            }
          ];
        }
      };

      const run = async () => {
        if (!this.quotes) await load();
        const it = pick();
        if (it) render(it);
      };

      run();
      this._t = setInterval(run, 30_000); // “few moments”
    },
    stop() { if (this._t) clearInterval(this._t); this._t = null; }
  });
})();
