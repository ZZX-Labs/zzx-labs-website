(function () {
  window.ZZXWidgets.register("intel", {
    mount(slotEl) {
      this.card = slotEl.querySelector('[data-w="intel"]');
      this.list = this.card?.querySelector("[data-list]");
      this.cache = { ts: 0, items: [] };
    },
    start(ctx) {
      const repos = [
        "bitcoin/bitcoin",
        "bitcoin/bips",
        "lightning/bolts",
        "lightningnetwork/lnd",
      ];

      const render = (items) => {
        if (!this.list) return;
        this.list.innerHTML = "";
        const out = (items || []).slice(0, 8);

        for (const it of out) {
          const row = document.createElement("div");
          row.className = "btc-news__item";

          const src = document.createElement("span");
          src.className = "btc-news__src";
          src.textContent = it.source || "src";

          const a = document.createElement("a");
          a.href = it.url || "#";
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = it.title || "—";

          row.appendChild(src);
          row.appendChild(a);
          this.list.appendChild(row);
        }

        if (!out.length) {
          const row = document.createElement("div");
          row.className = "btc-news__item";
          row.innerHTML = `<span class="btc-news__src">intel</span><a href="#" tabindex="-1">no items</a>`;
          this.list.appendChild(row);
        }
      };

      const ghLatest = async (repo) => {
        const url = `${ctx.api.GH}/repos/${repo}/commits?per_page=1`;
        const arr = await ctx.util.jget(url, { headers: { "Accept": "application/vnd.github+json" } });
        const c = Array.isArray(arr) ? arr[0] : null;
        const msg = String(c?.commit?.message || "").split("\n")[0].slice(0, 90);
        return {
          source: "GH",
          title: `${repo.split("/")[1]}: ${msg || "update"}`,
          url: c?.html_url || `https://github.com/${repo}`,
          ts: c?.commit?.author?.date ? Date.parse(c.commit.author.date) : 0,
        };
      };

      const run = async () => {
        const now = Date.now();
        if (this.cache.items.length && (now - this.cache.ts) < 60_000) {
          render(this.cache.items);
          return;
        }

        const items = [];

        // GH: 2 repos/minute round-robin
        try {
          const idx = Math.floor(now / 60_000) % repos.length;
          const batch = [repos[idx], repos[(idx + 1) % repos.length]];
          for (const repo of batch) items.push(await ghLatest(repo));
        } catch {}

        // HN
        try {
          const data = await ctx.util.jget(ctx.api.HN_QUERY);
          const hits = Array.isArray(data?.hits) ? data.hits : [];
          const hn = hits.slice(0, 4).map(h => ({
            source: "HN",
            title: h.title || h.story_title || "—",
            url: h.url || h.story_url || `https://news.ycombinator.com/item?id=${h.objectID}`,
            ts: h.created_at_i ? (h.created_at_i * 1000) : 0,
          }));
          items.push(...hn);
        } catch {}

        items.sort((a,b)=>(b.ts||0)-(a.ts||0));
        this.cache.ts = now;
        this.cache.items = items;
        render(items);
      };

      run();
      this._t = setInterval(run, 60_000);
    },
    stop() { if (this._t) clearInterval(this._t); this._t = null; }
  });
})();
