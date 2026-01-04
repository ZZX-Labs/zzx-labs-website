(function () {
  const ID = "btc-news";

  const SOURCES = [
    // HN Algolia is easy + fast
    { name: "HN", type: "hn" },

    // RSS sources via AllOrigins (CORS-safe)
    // You can add AP/Wired if you have RSS endpoints you like.
    { name: "CoinDesk", type: "rss", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
    { name: "Bitcoin Magazine", type: "rss", url: "https://bitcoinmagazine.com/.rss/full/" }
  ];

  function parseRSS(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, "text/xml");
    const items = Array.from(doc.querySelectorAll("item")).slice(0, 10);
    return items.map(it => ({
      title: (it.querySelector("title")?.textContent || "").trim(),
      url: (it.querySelector("link")?.textContent || "").trim()
    })).filter(x => x.title && x.url);
  }

  async function fetchHN(core) {
    const q = "bitcoin OR satoshi OR lightning OR bips";
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story`;
    const data = await core.fetchJSON(url);
    const hits = Array.isArray(data?.hits) ? data.hits : [];
    return hits.slice(0, 12).map(h => ({
      title: h.title || h.story_title || "—",
      url: h.url || h.story_url || `https://news.ycombinator.com/item?id=${h.objectID}`
    })).filter(x => x.title && x.url);
  }

  function packTrack(items) {
    // one long line: "• A • B • C"
    return items.map(x => `• <a href="${x.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(x.title)}</a>`).join("  ");
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }

  window.ZZXWidgetRegistry.register(ID, {
    _root: null,
    _core: null,
    _i: 0,
    _cache: new Map(), // srcName -> items
    _lastSwap: 0,

    async init({ root, core }) {
      this._root = root;
      this._core = core;
      await this.swapSource(); // prime
    },

    async swapSource() {
      const src = SOURCES[this._i % SOURCES.length];
      this._i++;

      const srcEl = this._root.querySelector("[data-src]");
      const trackEl = this._root.querySelector("[data-track]");
      if (!srcEl || !trackEl) return;

      srcEl.textContent = src.name;

      try {
        let items = this._cache.get(src.name);
        if (!items || !items.length) {
          if (src.type === "hn") {
            items = await fetchHN(this._core);
          } else {
            const xml = await this._core.fetchAllOriginsText(src.url);
            items = parseRSS(xml);
            // light bitcoin-only filter
            items = items.filter(x => /bitcoin|btc|satoshi|lightning|bip/i.test(x.title));
          }
          this._cache.set(src.name, items);
        }
        trackEl.innerHTML = packTrack(items.slice(0, 8)) || "no items";
        // restart marquee animation
        trackEl.style.animation = "none";
        trackEl.offsetHeight; // reflow
        trackEl.style.animation = "";
      } catch {
        trackEl.textContent = "news fetch error";
      }
    },

    tick() {
      // rotate source every ~30s
      const now = Date.now();
      if (now - this._lastSwap < 30_000) return;
      this._lastSwap = now;
      this.swapSource();
    },

    destroy() {}
  });
})();
