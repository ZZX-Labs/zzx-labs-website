// __partials/widgets/btc-lost/widget.js
// FIXED: unified-runtime compatible (NO UI / layout / behavior changes)

(function () {
  const ID = "btc-lost";

  function fmtBTC(x) {
    if (!Number.isFinite(x)) return "—";
    return x.toLocaleString(undefined, { maximumFractionDigits: 8 });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  window.ZZXWidgets.register(ID, {
    mount(slotEl) {
      this._root = slotEl;
    },

    async start(ctx) {
      this._ctx = ctx;
      this._data = null;
      this._page = 0;
      this._pageSize = 6;

      const root = this._root;
      if (!root) return;

      root.querySelector("[data-prev]")?.addEventListener("click", () => {
        this._page = Math.max(0, this._page - 1);
        this.render();
      });
      root.querySelector("[data-next]")?.addEventListener("click", () => {
        const maxPage = Math.max(
          0,
          Math.ceil((this._data?.items?.length || 0) / this._pageSize) - 1
        );
        this._page = Math.min(maxPage, this._page + 1);
        this.render();
      });

      await this.load();
      this.render();
    },

    async load() {
      const ctx = this._ctx;
      const url = ctx?.urlFor
        ? ctx.urlFor("/__partials/widgets/btc-lost/btc-lost.json")
        : "/__partials/widgets/btc-lost/btc-lost.json";

      try {
        if (ctx?.fetchJSON) {
          this._data = await ctx.fetchJSON(url);
        } else {
          const r = await fetch(url, { cache: "no-store" });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          this._data = await r.json();
        }
      } catch {
        this._data = { updated: null, unit: "BTC", items: [] };
      }
    },

    render() {
      const root = this._root;
      if (!root) return;

      const totalEl = root.querySelector("[data-total]");
      const updEl = root.querySelector("[data-updated]");
      const list = root.querySelector("[data-list]");
      const meta = root.querySelector("[data-meta]");
      if (!list || !meta) return;

      const items = Array.isArray(this._data?.items) ? this._data.items : [];
      const total = items.reduce((a, x) => a + (Number(x?.btc) || 0), 0);

      if (totalEl) totalEl.textContent = `${fmtBTC(total)} BTC`;
      if (updEl) updEl.textContent = this._data?.updated || "—";

      const maxPage = Math.max(0, Math.ceil(items.length / this._pageSize) - 1);
      this._page = Math.min(this._page, maxPage);

      const start = this._page * this._pageSize;
      const slice = items.slice(start, start + this._pageSize);

      list.innerHTML = slice.map((it) => {
        const label = escapeHtml(it.label || "—");
        const btc = fmtBTC(Number(it.btc));
        const src = it.source ? String(it.source) : "";
        const when = it.when ? ` (${escapeHtml(it.when)})` : "";
        const right = src
          ? `<a href="${src}" target="_blank" rel="noopener noreferrer">${btc} BTC</a>`
          : `${btc} BTC`;
        return `<div class="row"><span class="k">lost</span><span class="v">${label}${when} · ${right}</span></div>`;
      }).join("");

      if (!slice.length) {
        list.innerHTML = `<div class="row"><span class="k">lost</span><span class="v">no data</span></div>`;
      }

      meta.textContent = `page ${this._page + 1}/${maxPage + 1} · items ${items.length}`;
    },

    stop() {}
  });
})();
