// __partials/widgets/intel/widget.js
// Intel = NEWS ONLY (HN, AP, Wired, Ars, 404 Media)
// FIXED: unified-runtime compatible + CORS-safe RSS via AllOrigins fallback when needed.

(function () {
  "use strict";

  const W = window;
  const ID = "intel";

  const CFG = {
    ROTATE_MS: 60_000,
    TIMEOUT_MS: 20_000,
    AO_RAW: "https://api.allorigins.win/raw?url=",
  };

  const SOURCES = [
    { name: "HN",    type: "hn",  query: "bitcoin OR lightning OR mempool OR satoshi" },
    { name: "AP",    type: "rss", url: "https://apnews.com/hub/bitcoin?rss=1" },
    { name: "WIRED", type: "rss", url: "https://www.wired.com/feed/tag/cryptocurrency/latest/rss" },
    { name: "ARS",   type: "rss", url: "https://feeds.arstechnica.com/arstechnica/technology-lab" },
    { name: "404",   type: "rss", url: "https://www.404media.co/rss/" },
  ];

  function q(root, sel) { return root ? root.querySelector(sel) : null; }

  function withTimeout(p, ms, label) {
    let t = null;
    const to = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error((label || "timeout") + " after " + ms + "ms")), ms);
    });
    return Promise.race([p, to]).finally(() => clearTimeout(t));
  }

  async function fetchJSONAny(ctx, url) {
    if (ctx && typeof ctx.fetchJSON === "function") return await ctx.fetchJSON(url);
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  async function fetchTextAny(ctx, url) {
    if (ctx && typeof ctx.fetchText === "function") return await ctx.fetchText(url);
    const r = await fetch(url, { cache: "no-store" });
    const t = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return t;
  }

  async function fetchRSSText(ctx, url) {
    // Try direct first (may fail due to CORS), then AllOrigins.
    try {
      return await withTimeout(fetchTextAny(ctx, url), CFG.TIMEOUT_MS, "rss direct");
    } catch {
      const ao = CFG.AO_RAW + encodeURIComponent(String(url));
      return await withTimeout(fetchTextAny(ctx, ao), CFG.TIMEOUT_MS, "rss allorigins");
    }
  }

  function parseRSS(xml) {
    const doc = new DOMParser().parseFromString(String(xml || ""), "text/xml");
    const items = Array.from(doc.querySelectorAll("item")).slice(0, 16);
    return items.map(it => ({
      title: (it.querySelector("title")?.textContent || "").trim(),
      url: (it.querySelector("link")?.textContent || "").trim(),
      ts: Date.parse(it.querySelector("pubDate")?.textContent || "") || 0
    })).filter(x => x.title && x.url);
  }

  async function fetchHN(ctx, query) {
    const url =
      "https://hn.algolia.com/api/v1/search?" +
      new URLSearchParams({ query, tags: "story", hitsPerPage: "8" });

    const data = await withTimeout(fetchJSONAny(ctx, url), CFG.TIMEOUT_MS, "hn");
    const hits = Array.isArray(data?.hits) ? data.hits : [];
    return hits.slice(0, 8).map(h => ({
      title: h.title || h.story_title || "—",
      url: h.url || h.story_url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      ts: h.created_at_i ? h.created_at_i * 1000 : 0
    })).filter(x => x.title && x.url);
  }

  function render(listEl, srcName, items) {
    if (!listEl) return;

    listEl.innerHTML = "";

    if (!items || !items.length) {
      listEl.innerHTML =
        `<div class="btc-news__item">
          <span class="btc-news__src">${srcName}</span>
          <a href="#" tabindex="-1">no items</a>
        </div>`;
      return;
    }

    for (const it of items.slice(0, 6)) {
      const row = document.createElement("div");
      row.className = "btc-news__item";

      const tag = document.createElement("span");
      tag.className = "btc-news__src";
      tag.textContent = srcName;

      const a = document.createElement("a");
      a.href = it.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = it.title;

      row.appendChild(tag);
      row.appendChild(a);
      listEl.appendChild(row);
    }
  }

  W.ZZXWidgets.register(ID, {
    mount(slotEl) {
      this._root = slotEl;
      this._list = q(slotEl, "[data-list]");
      this._ctx = null;
      this._idx = 0;
      this._t = null;
    },

    async start(ctx) {
      this._ctx = ctx;
      await this._rotate();
      this._t = setInterval(() => { this._rotate(); }, CFG.ROTATE_MS);
    },

    async _rotate() {
      const src = SOURCES[this._idx % SOURCES.length];
      this._idx++;

      try {
        let items = [];
        if (src.type === "hn") {
          items = await fetchHN(this._ctx, src.query);
        } else {
          const xml = await fetchRSSText(this._ctx, src.url);
          items = parseRSS(xml);
        }
        items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
        render(this._list, src.name, items);
      } catch {
        render(this._list, src.name, []);
      }
    },

    stop() {
      if (this._t) clearInterval(this._t);
      this._t = null;
    }
  });
})();
