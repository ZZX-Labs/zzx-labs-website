(function () {
  const ID = "btc-lost";

  function fmtBTC(x){
    if (!Number.isFinite(x)) return "—";
    return x.toLocaleString(undefined, { maximumFractionDigits: 8 });
  }
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  window.ZZXWidgetRegistry.register(ID, {
    _root: null,
    _core: null,
    _data: null,
    _page: 0,
    _pageSize: 6,

    async init({ root, core }) {
      this._root = root;
      this._core = core;

      root.querySelector("[data-prev]")?.addEventListener("click", () => {
        this._page = Math.max(0, this._page - 1);
        this.render();
      });
      root.querySelector("[data-next]")?.addEventListener("click", () => {
        const maxPage = Math.max(0, Math.ceil((this._data?.items?.length || 0) / this._pageSize) - 1);
        this._page = Math.min(maxPage, this._page + 1);
        this.render();
      });

      await this.load();
      this.render();
    },

    async load() {
      const prefix = this._core.getPrefix();
      const url = this._core.join(prefix, `/__partials/widgets/btc-lost/btc-lost.json`);
      try {
        this._data = await this._core.fetchJSON(url);
      } catch {
        this._data = { updated: null, unit:"BTC", items: [] };
      }
    },

    render() {
      const totalEl = this._root.querySelector("[data-total]");
      const updEl = this._root.querySelector("[data-updated]");
      const list = this._root.querySelector("[data-list]");
      const meta = this._root.querySelector("[data-meta]");
      if (!list || !meta) return;

      const items = Array.isArray(this._data?.items) ? this._data.items : [];
      const total = items.reduce((a, x) => a + (Number(x?.btc) || 0), 0);

      if (totalEl) totalEl.textContent = `${fmtBTC(total)} BTC`;
      if (updEl) updEl.textContent = this._data?.updated || "—";

      const maxPage = Math.max(0, Math.ceil(items.length / this._pageSize) - 1);
      this._page = Math.min(this._page, maxPage);

      const start = this._page * this._pageSize;
      const slice = items.slice(start, start + this._pageSize);

      list.innerHTML = slice.map(it => {
        const label = escapeHtml(it.label || "—");
        const btc = fmtBTC(Number(it.btc));
        const src = it.source ? String(it.source) : "";
        const when = it.when ? ` (${escapeHtml(it.when)})` : "";
        const right = src ? `<a href="${src}" target="_blank" rel="noopener noreferrer">${btc} BTC</a>` : `${btc} BTC`;
        return `<div class="row"><span class="k">lost</span><span class="v">${label}${when} · ${right}</span></div>`;
      }).join("");

      if (!slice.length) {
        list.innerHTML = `<div class="row"><span class="k">lost</span><span class="v">no data</span></div>`;
      }

      meta.textContent = `page ${this._page + 1}/${maxPage + 1} · items ${items.length}`;
    },

    tick(){},
    destroy(){}
  });
})();
