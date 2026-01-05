// __partials/widgets/btc-notabletxs/widget.js
// Unified-runtime adapter (NO UI / layout / behavior changes)

(function () {
  const ID = "btc-notabletxs";
  const MEMPOOL = "https://mempool.space/api";

  const CANDIDATES = [
    `${MEMPOOL}/mempool/recent`,
    `${MEMPOOL}/v1/mempool/recent`,
    `${MEMPOOL}/mempool/txids`
  ];

  function fmtBTC(btc) {
    if (!Number.isFinite(btc)) return "—";
    if (btc >= 1) return btc.toFixed(4);
    return btc.toFixed(8);
  }

  function shortHex(h) {
    const s = String(h || "");
    if (s.length <= 18) return s;
    return s.slice(0, 10) + "…" + s.slice(-6);
  }

  async function tryJSON(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  window.ZZXWidgets.register(ID, {
    mount(slotEl) {
      this._root = slotEl;
      this._items = [];
      this._page = 0;
      this._pageSize = 6;
      this._last = 0;
    },

    async start() {
      const root = this._root;
      if (!root) return;

      root.querySelector("[data-prev]")?.addEventListener("click", () => {
        this._page = Math.max(0, this._page - 1);
        this.render();
      });

      root.querySelector("[data-next]")?.addEventListener("click", () => {
        const maxPage = Math.max(
          0,
          Math.ceil(this._items.length / this._pageSize) - 1
        );
        this._page = Math.min(maxPage, this._page + 1);
        this.render();
      });

      await this.update(true);
    },

    async fetchRecent() {
      for (const u of CANDIDATES) {
        try {
          const data = await tryJSON(u);

          if (Array.isArray(data) && data.length && typeof data[0] === "object") {
            return data.map(t => ({
              txid: t.txid || t.txId || t.hash,
              fee: Number(t.fee),
              vsize: Number(t.vsize || (t.weight ? t.weight / 4 : NaN)),
              value: Number(t.value)
            })).filter(x => x.txid);
          }

          if (Array.isArray(data) && data.length && typeof data[0] === "string") {
            return data.slice(0, 60).map(txid => ({
              txid,
              fee: NaN,
              vsize: NaN,
              value: NaN
            }));
          }
        } catch {}
      }
      return [];
    },

    render() {
      const root = this._root;
      if (!root) return;

      const host = root.querySelector("[data-list]");
      const meta = root.querySelector("[data-meta]");
      if (!host || !meta) return;

      const total = this._items.length;
      const maxPage = Math.max(0, Math.ceil(total / this._pageSize) - 1);
      this._page = Math.min(this._page, maxPage);

      const start = this._page * this._pageSize;
      const slice = this._items.slice(start, start + this._pageSize);

      host.innerHTML = "";

      for (const it of slice) {
        const feeRate =
          Number.isFinite(it.fee) &&
          Number.isFinite(it.vsize) &&
          it.vsize > 0
            ? it.fee / it.vsize
            : NaN;

        const feeTxt = Number.isFinite(feeRate)
          ? `${feeRate.toFixed(1)} sat/vB`
          : "—";

        const url = `https://mempool.space/tx/${it.txid}`;

        const row = document.createElement("div");
        row.className = "row";
        row.innerHTML = `
          <span class="k">tx</span>
          <span class="v">
            <a href="${url}" target="_blank" rel="noopener noreferrer">
              ${shortHex(it.txid)} · ${feeTxt}
            </a>
          </span>
        `;
        host.appendChild(row);
      }

      if (!slice.length) {
        host.innerHTML =
          `<div class="row"><span class="k">tx</span><span class="v">no data</span></div>`;
      }

      meta.textContent =
        `page ${this._page + 1}/${maxPage + 1} · items ${total}`;
    },

    async update(force = false) {
      const now = Date.now();
      if (!force && now - this._last < 20_000) return;
      this._last = now;

      try {
        this._items = await this.fetchRecent();
      } catch {
        this._items = [];
      }
      this.render();
    },

    tick() {
      this.update(false);
    },

    stop() {}
  });
})();
