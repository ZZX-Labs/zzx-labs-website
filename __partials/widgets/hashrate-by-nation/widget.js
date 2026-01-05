// __partials/widgets/hashrate-by-nation/widget.js
// NEW WIDGET: Hashrate-by-Nation (unified-runtime native)
//
// Design goals:
// - Works with your unified runtime: ZZXWidgets.register + ctx.fetchJSON + ctx.urlFor
// - No external data dependency (no CORS/API fragility)
// - Reads a local dataset you control:
//   /__partials/widgets/hashrate-by-nation/hashrate-by-nation.json
// - Renders into your existing widget.html structure using data-* hooks
// - Safe, silent-fail behavior (never breaks the page)
//
// Expected dataset shape (you can generate/update however you want):
// {
//   "updated": "2026-01-04",
//   "unit": "EH/s",
//   "items": [
//     {"nation":"United States","ehs": 85.12,"share": 0.348},
//     {"nation":"Kazakhstan","ehs": 12.03,"share": 0.049}
//   ]
// }

(function () {
  const ID = "hashrate-by-nation";

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function fmtEH(x) {
    const n = Number(x);
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  }

  function fmtPct(x) {
    const n = Number(x);
    if (!Number.isFinite(n)) return "—";
    return (n * 100).toFixed(1) + "%";
  }

  window.ZZXWidgets.register(ID, {
    mount(slotEl) {
      this._root = slotEl;
      this._data = null;
      this._page = 0;
      this._pageSize = 8;
    },

    async start(ctx) {
      this._ctx = ctx || null;

      const root = this._root;
      if (!root) return;

      // Optional pager buttons if present in your HTML
      root.querySelector("[data-prev]")?.addEventListener("click", () => {
        this._page = Math.max(0, this._page - 1);
        this.render();
      });

      root.querySelector("[data-next]")?.addEventListener("click", () => {
        const total = Array.isArray(this._data?.items) ? this._data.items.length : 0;
        const maxPage = Math.max(0, Math.ceil(total / this._pageSize) - 1);
        this._page = Math.min(maxPage, this._page + 1);
        this.render();
      });

      await this.load();
      this.render();
    },

    async load() {
      const ctx = this._ctx;

      const url = ctx?.urlFor
        ? ctx.urlFor("/__partials/widgets/hashrate-by-nation/hashrate-by-nation.json")
        : "/__partials/widgets/hashrate-by-nation/hashrate-by-nation.json";

      try {
        this._data = ctx?.fetchJSON
          ? await ctx.fetchJSON(url)
          : await (await fetch(url, { cache: "no-store" })).json();
      } catch {
        this._data = { updated: null, unit: "EH/s", items: [] };
      }
    },

    render() {
      const root = this._root;
      if (!root) return;

      // These hooks are intentionally generic:
      // - [data-updated] optional
      // - [data-unit] optional
      // - [data-list] required
      // - [data-meta] optional
      const updatedEl = root.querySelector("[data-updated]");
      const unitEl = root.querySelector("[data-unit]");
      const listEl = root.querySelector("[data-list]");
      const metaEl = root.querySelector("[data-meta]");

      if (!listEl) return;

      const unit = this._data?.unit || "EH/s";
      const updated = this._data?.updated || "—";

      if (updatedEl) updatedEl.textContent = updated;
      if (unitEl) unitEl.textContent = unit;

      const items = Array.isArray(this._data?.items) ? this._data.items.slice() : [];

      // Normalize + sort by hashrate descending (stable)
      const norm = items
        .map((x) => ({
          nation: x?.nation ?? x?.country ?? "—",
          ehs: Number(x?.ehs ?? x?.hashrate_ehs ?? x?.hashrate ?? NaN),
          share: Number(x?.share ?? x?.ratio ?? NaN),
        }))
        .filter((x) => x.nation && (Number.isFinite(x.ehs) || Number.isFinite(x.share)))
        .sort((a, b) => (Number.isFinite(b.ehs) ? b.ehs : -1) - (Number.isFinite(a.ehs) ? a.ehs : -1));

      const total = norm.length;
      const maxPage = Math.max(0, Math.ceil(total / this._pageSize) - 1);
      this._page = Math.min(this._page, maxPage);

      const start = this._page * this._pageSize;
      const slice = norm.slice(start, start + this._pageSize);

      // Render as rows compatible with your existing “btc-card kv list” styling
      if (!slice.length) {
        listEl.innerHTML = `<div class="row"><span class="k">nation</span><span class="v">no data</span></div>`;
      } else {
        listEl.innerHTML = slice.map((it) => {
          const left = esc(it.nation);
          const right = `${fmtEH(it.ehs)} ${esc(unit)} · ${fmtPct(it.share)}`;
          return `<div class="row"><span class="k">nation</span><span class="v">${left} · ${right}</span></div>`;
        }).join("");
      }

      if (metaEl) {
        metaEl.textContent = `page ${this._page + 1}/${maxPage + 1} · items ${total}`;
      }
    },

    stop() {}
  });
})();
