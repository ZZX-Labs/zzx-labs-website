// __partials/widgets/intel/widget.js
// Intel = NEWS ONLY (HN, AP, Wired, Ars, 404 Media)

(function () {
  const ID = "intel";

  const SOURCES = [
    {
      name: "HN",
      type: "hn",
      query: "bitcoin OR lightning OR mempool OR satoshi"
    },
    {
      name: "AP",
      type: "rss",
      url: "https://apnews.com/hub/bitcoin?rss=1"
    },
    {
      name: "WIRED",
      type: "rss",
      url: "https://www.wired.com/feed/tag/cryptocurrency/latest/rss"
    },
    {
      name: "ARS",
      type: "rss",
      url: "https://feeds.arstechnica.com/arstechnica/technology-lab"
    },
    {
      name: "404",
      type: "rss",
      url: "https://www.404media.co/rss/"
    }
  ];

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function parseRSS(xml) {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    return Array.from(doc.querySelectorAll("item")).map(it => ({
      title: it.querySelector("title")?.textContent?.trim(),
      url: it.querySelector("link")?.textContent?.trim(),
      ts: Date.parse(it.querySelector("pubDate")?.textContent || "") || 0
    })).filter(x => x.title && x.url);
  }

  async function fetchHN(query) {
    const url =
      "https://hn.algolia.com/api/v1/search?" +
      new URLSearchParams({
        query,
        tags: "story",
        hitsPerPage: 8
      });
    const data = await fetch(url).then(r => r.json());
    return (data.hits || []).map(h => ({
      title: h.title || h.story_title,
      url: h.url || h.story_url ||
        `https://news.ycombinator.com/item?id=${h.objectID}`,
      ts: h.created_at_i ? h.created_at_i * 1000 : 0
    }));
  }

  async function fetchRSS(url) {
    const txt = await fetch(url, { cache: "no-store" }).then(r => r.text());
    return parseRSS(txt);
  }

  window.ZZXWidgets.register(ID, {
    mount(slotEl) {
      this.card = slotEl.querySelector('[data-w="intel"]');
      this.list = this.card?.querySelector("[data-list]");
      this._idx = 0;
      this._t = null;
    },

    async start() {
      const render = (src, items) => {
        if (!this.list) return;
        this.list.innerHTML = "";

        if (!items.length) {
          this.list.innerHTML =
            `<div class="btc-news__item">
              <span class="btc-news__src">${src}</span>
              <a href="#" tabindex="-1">no items</a>
            </div>`;
          return;
        }

        for (const it of items.slice(0, 6)) {
          const row = document.createElement("div");
          row.className = "btc-news__item";

          const tag = document.createElement("span");
          tag.className = "btc-news__src";
          tag.textContent = src;

          const a = document.createElement("a");
          a.href = it.url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = it.title;

          row.appendChild(tag);
          row.appendChild(a);
          this.list.appendChild(row);
        }
      };

      const rotate = async () => {
        const src = SOURCES[this._idx % SOURCES.length];
        this._idx++;

        try {
          let items = [];
          if (src.type === "hn") {
            items = await fetchHN(src.query);
          } else {
            items = await fetchRSS(src.url);
          }
          items.sort((a, b) => b.ts - a.ts);
          render(src.name, items);
        } catch {
          render(src.name, []);
        }
      };

      rotate();
      this._t = setInterval(rotate, 60_000);
    },

    stop() {
      if (this._t) clearInterval(this._t);
      this._t = null;
    }
  });
})();
