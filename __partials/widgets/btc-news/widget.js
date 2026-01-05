// __partials/widgets/btc-news/widget.js
// Unified-runtime adapter (NO UI / layout / behavior changes)

(function () {
  const ID = "btc-news";

  const SOURCES = [
    { name: "HN", type: "hn" },
    { name: "CoinDesk", type: "rss", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
    { name: "Bitcoin Magazine", type: "rss", url: "https://bitcoinmagazine.com/.rss/full/" }
  ];

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function parseRSS(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, "text/xml");
    const items = Array.from(doc.querySelectorAll("item")).slice(0, 16);
    return items.map(it => ({
      title: (it.querySelector("title")?.textContent || "").trim(),
      url: (it.querySelector("link")?.textContent || "").trim()
    })).filter(x => x.title && x.url);
  }

  function isBitcoinTitle(t) {
    return /bitcoin|btc|satoshi|lightning|bip|taproot|mempool|miners|halving|ordinals|ln\b/i.test(t);
  }

  async function fetchHN(ctx) {
    const q = "bitcoin OR satoshi OR lightning OR bips";
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story`;
    const data = await ctx.fetchJSON(url);
    const hits = Array.isArray(data?.hits) ? data.hits : [];
    return hits.slice(0, 14).map(h => ({
      title: h.title || h.story_title || "—",
      url: h.url || h.story_url || `https://news.ycombinator.com/item?id=${h.objectID}`
    })).filter(x => x.title && x.url);
  }

  async function fetchRSSText(url) {
    // Direct fetch; some feeds may block via CORS — fail soft
    const r = await fetch(url);
    if (!r.ok) throw new Error(`RSS HTTP ${r.status}`);
    return await r.text();
  }

  function packTrack(items) {
    return items.map(x =>
      `• <a href="${x.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(x.title)}</a>`
    ).join("  ");
  }

  window.ZZXWidgets.register(ID, {
    mount(slotEl) {
      this._root = slotEl;
      this._i = 0;
      this._cache = new Map();
      this._lastSwap = 0;
    },

    async start(ctx) {
      this._ctx = ctx;
      await this.swapSource();
    },

    async swapSource() {
      const src = SOURCES[this._i % SOURCES.length];
      this._i++;

      const root = this._root;
      if (!root) return;

      const srcEl = root.querySelector("[data-src]");
      const trackEl = root.querySelector("[data-track]");
      if (!srcEl || !trackEl) return;

      srcEl.textContent = src.name;

      try {
        let items = this._cache.get(src.name);

        if (!items || !items.length) {
          if (src.type === "hn") {
            items = await fetchHN(this._ctx);
          } else {
            const xml = await fetchRSSText(src.url);
            items = parseRSS(xml).filter(x => isBitcoinTitle(x.title));
          }
          this._cache.set(src.name, items);
        }

        trackEl.innerHTML = packTrack(items.slice(0, 9)) || "no items";

        // restart marquee animation
        trackEl.style.animation = "none";
        trackEl.offsetHeight;
        trackEl.style.animation = "";
      } catch {
        trackEl.textContent = "news fetch error";
      }
    },

    tick() {
      const now = Date.now();
      if (now - this._lastSwap < 30_000) return;
      this._lastSwap = now;
      this.swapSource();
    },

    stop() {}
  });
})();
