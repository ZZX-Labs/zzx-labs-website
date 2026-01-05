// __partials/widgets/satoshi-quote/widget.js
// Unified-runtime version: random, non-repeating rotation

(function () {
  const ID = "satoshi-quote";

  // rotation interval (ms)
  const INTERVAL = 45_000; // change freely (e.g. 30_000, 60_000)

  function normalizeQuotes(data) {
    // Your quotes.json is an ARRAY of objects with at least { text }
    // Some entries have dates, categories, post_id, email_id, etc.
    // We normalize into a minimal, safe shape.
    if (!Array.isArray(data)) return [];

    return data
      .map(q => {
        if (!q || typeof q !== "object") return null;
        const text = q.text?.trim();
        if (!text) return null;

        // Optional metadata
        const date = q.date ? `(${q.date})` : "";
        const src = "Satoshi Nakamoto";

        return {
          text,
          src: date ? `${src} ${date}` : src,
          link: "https://satoshi.nakamotoinstitute.org/quotes/"
        };
      })
      .filter(Boolean);
  }

  function pickDifferent(arr, lastIdx) {
    if (arr.length <= 1) return { item: arr[0] || null, idx: 0 };

    let idx;
    do {
      idx = Math.floor(Math.random() * arr.length);
    } while (idx === lastIdx);

    return { item: arr[idx], idx };
  }

  window.ZZXWidgets.register(ID, {
    mount(slotEl) {
      this.card = slotEl.querySelector('[data-w="satoshi-quote"]');
      this.quoteEl = this.card?.querySelector("[data-quote]");
      this.srcEl = this.card?.querySelector("[data-src]");
      this.linkEl = this.card?.querySelector("[data-link]");

      this.quotes = [];
      this.lastIdx = -1;
      this._t = null;
    },

    async start(ctx) {
      if (!this.card) return;

      const QUOTES_URL = "/__partials/widgets/satoshi-quote/quotes.json";

      try {
        const raw = await ctx.fetchJSON(QUOTES_URL);
        this.quotes = normalizeQuotes(raw);
      } catch {
        this.quotes = [];
      }

      // hard fallback (never empty)
      if (!this.quotes.length) {
        this.quotes = [
          {
            text: "The root problem with conventional currency is all the trust that's required to make it work.",
            src: "Satoshi Nakamoto (2009)",
            link: "https://p2pfoundation.ning.com/forum/topics/bitcoin-open-source"
          }
        ];
      }

      const render = () => {
        const { item, idx } = pickDifferent(this.quotes, this.lastIdx);
        if (!item) return;

        this.lastIdx = idx;

        if (this.quoteEl) this.quoteEl.textContent = `“${item.text}”`;
        if (this.srcEl) this.srcEl.textContent = item.src;
        if (this.linkEl) this.linkEl.href = item.link;
      };

      // initial render
      render();

      // rotation
      this._t = setInterval(render, INTERVAL);
    },

    stop() {
      if (this._t) clearInterval(this._t);
      this._t = null;
    }
  });
})();
