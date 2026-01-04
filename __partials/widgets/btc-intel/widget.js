(function () {
  const ID = "btc-intel";

  const GH = "https://api.github.com";
  const REPOS = [
    "bitcoin/bitcoin",
    "bitcoin/bips",
    "lightning/bolts",
    "lightningnetwork/lnd"
  ];

  const HN_QUERY = "https://hn.algolia.com/api/v1/search?query=bitcoin%20OR%20satoshi%20OR%20lightning%20OR%20bips&tags=story";

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  async function ghLatestCommit(core, repo) {
    const url = `${GH}/repos/${repo}/commits?per_page=1`;
    const data = await core.fetchJSON(url);
    const c = Array.isArray(data) ? data[0] : null;
    const msg = String(c?.commit?.message || "").split("\n")[0].slice(0, 110);
    const when = c?.commit?.author?.date ? Date.parse(c.commit.author.date) : 0;

    return {
      src: "GH",
      k: repo.split("/")[1],
      title: msg || "update",
      url: c?.html_url || `https://github.com/${repo}`,
      ts: when
    };
  }

  async function hnItems(core) {
    const data = await core.fetchJSON(HN_QUERY);
    const hits = Array.isArray(data?.hits) ? data.hits : [];
    return hits.slice(0, 8).map(h => ({
      src: "HN",
      k: "news",
      title: h.title || h.story_title || "—",
      url: h.url || h.story_url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      ts: h.created_at_i ? h.created_at_i * 1000 : 0
    }));
  }

  function render(root, items) {
    const host = root.querySelector("[data-list]");
    if (!host) return;

    host.innerHTML = "";
    if (!items.length) {
      host.innerHTML = `<div class="row"><span class="k">intel</span><span class="v">no items</span></div>`;
      return;
    }

    for (const it of items.slice(0, 10)) {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `
        <span class="k">${escapeHtml(it.src)}</span>
        <span class="v"><a href="${it.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(it.k + ": " + it.title)}</a></span>
      `;
      host.appendChild(row);
    }
  }

  window.ZZXWidgetRegistry.register(ID, {
    _root: null,
    _core: null,
    _last: 0,
    _rr: 0,
    _cache: { ts: 0, items: [] },

    async init({ root, core }) {
      this._root = root;
      this._core = core;
      await this.update(true);
    },

    async update(force=false) {
      const now = Date.now();
      if (!force && now - this._last < 60_000) return;
      this._last = now;

      try {
        // reuse cached for 60s
        if (this._cache.items.length && (now - this._cache.ts) < 60_000) {
          render(this._root, this._cache.items);
          return;
        }

        const items = [];

        // GH: grab 2 repos per refresh in round-robin
        const a = REPOS[this._rr % REPOS.length];
        const b = REPOS[(this._rr + 1) % REPOS.length];
        this._rr += 2;

        try { items.push(await ghLatestCommit(this._core, a)); } catch {}
        try { items.push(await ghLatestCommit(this._core, b)); } catch {}

        // HN
        try { items.push(...await hnItems(this._core)); } catch {}

        items.sort((x, y) => (y.ts || 0) - (x.ts || 0));

        this._cache = { ts: now, items };
        render(this._root, items);
      } catch {
        render(this._root, []);
      }
    },

    tick() { this.update(false); },
    destroy() {}
  });
})();
