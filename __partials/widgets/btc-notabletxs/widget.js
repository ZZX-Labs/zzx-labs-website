// __partials/widgets/btc-notabletxs/widget.js
// DROP-IN (unified-runtime compatible; NO UI/layout/behavior changes)
// - Uses ctx.fetchJSON if provided (so you can AO-fallback centrally)
// - Otherwise falls back to direct fetch() (still mempool.space only)

(function () {
  "use strict";

  const W = window;
  const ID = "btc-notabletxs";
  const MEMPOOL = "https://mempool.space/api";

  const CANDIDATES = [
    `${MEMPOOL}/mempool/recent`,
    `${MEMPOOL}/v1/mempool/recent`,
    `${MEMPOOL}/mempool/txids`,
  ];

  const PAGE_SIZE = 6;
  const MIN_REFRESH_MS = 20_000;

  function q(root, sel) { return root ? root.querySelector(sel) : null; }

  function shortHex(h) {
    const s = String(h || "");
    if (s.length <= 18) return s;
    return s.slice(0, 10) + "…" + s.slice(-6);
  }

  async function tryJSONWithCtx(ctx, url) {
    // preferred path: your shared runtime fetch layer
    if (ctx && typeof ctx.fetchJSON === "function") {
      return await ctx.fetchJSON(url);
    }

    // fallback: direct fetch
    const r = await fetch(url, { cache: "no-store", credentials: "omit", redirect: "follow" });
    const t = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return JSON.parse(String(t).trim());
  }

  async function fetchRecent(ctx) {
    for (const u of CANDIDATES) {
      try {
        const data = await tryJSONWithCtx(ctx, u);

        if (Array.isArray(data) && data.length && typeof data[0] === "object") {
          return data.map((t) => ({
            txid: t.txid || t.txId || t.hash,
            fee: Number(t.fee),
            vsize: Number(t.vsize || (t.weight ? (t.weight / 4) : NaN)),
            value: Number(t.value),
          })).filter((x) => x.txid);
        }

        if (Array.isArray(data) && data.length && typeof data[0] === "string") {
          return data.slice(0, 60).map((txid) => ({
            txid,
            fee: NaN,
            vsize: NaN,
            value: NaN,
          }));
        }
      } catch (_) { /* try next */ }
    }
    return [];
  }

  function render(root, state) {
    const host = q(root, "[data-list]");
    const meta = q(root, "[data-meta]");
    if (!host || !meta) return;

    const total = state.items.length;
    const maxPage = Math.max(0, Math.ceil(total / state.pageSize) - 1);
    state.page = Math.min(state.page, maxPage);

    const start = state.page * state.pageSize;
    const slice = state.items.slice(start, start + state.pageSize);

    host.innerHTML = "";

    for (const it of slice) {
      const feeRate =
        Number.isFinite(it.fee) && Number.isFinite(it.vsize) && it.vsize > 0
          ? (it.fee / it.vsize)
          : NaN;

      const feeTxt = Number.isFinite(feeRate) ? `${feeRate.toFixed(1)} sat/vB` : "—";
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
      host.innerHTML = `<div class="row"><span class="k">tx</span><span class="v">no data</span></div>`;
    }

    meta.textContent = `page ${state.page + 1}/${maxPage + 1} · items ${total}`;
  }

  async function update(root, ctx, state, force) {
    const now = Date.now();
    if (!force && (now - state.last) < MIN_REFRESH_MS) return;
    state.last = now;

    try {
      state.items = await fetchRecent(ctx);
    } catch {
      state.items = [];
    }

    render(root, state);
  }

  function wire(root, ctx, state) {
    const prev = q(root, "[data-prev]");
    const next = q(root, "[data-next]");

    if (prev && prev.dataset.zzxBound !== "1") {
      prev.dataset.zzxBound = "1";
      prev.addEventListener("click", () => {
        state.page = Math.max(0, state.page - 1);
        render(root, state);
      });
    }

    if (next && next.dataset.zzxBound !== "1") {
      next.dataset.zzxBound = "1";
      next.addEventListener("click", () => {
        const maxPage = Math.max(0, Math.ceil(state.items.length / state.pageSize) - 1);
        state.page = Math.min(maxPage, state.page + 1);
        render(root, state);
      });
    }
  }

  function boot(root, ctx) {
    if (!root) return;

    const state = (root.__zzxNotableState = root.__zzxNotableState || {
      items: [],
      page: 0,
      pageSize: PAGE_SIZE,
      last: 0,
    });

    wire(root, ctx, state);
    update(root, ctx, state, true);

    if (root.__zzxNotableTimer) {
      clearInterval(root.__zzxNotableTimer);
      root.__zzxNotableTimer = null;
    }

    // Only self-tick if your core isn’t handling global ticks.
    if (!W.ZZXWidgetsCore?.usesGlobalTick) {
      root.__zzxNotableTimer = setInterval(() => update(root, ctx, state, false), MIN_REFRESH_MS);
    }
  }

  // Unified runtime preferred
  if (W.ZZXWidgetsCore?.onMount) {
    W.ZZXWidgetsCore.onMount(ID, (root, ctx) => boot(root, ctx || W.ZZXWidgetsCore?.ctx));
    return;
  }

  // Legacy runtime fallback
  if (W.ZZXWidgets?.register) {
    W.ZZXWidgets.register(ID, {
      mount(slotEl) {
        this._root = slotEl;
        this._items = [];
        this._page = 0;
        this._pageSize = PAGE_SIZE;
        this._last = 0;
      },

      async start(ctx) {
        this._ctx = ctx;

        const root = this._root;
        if (!root) return;

        root.querySelector("[data-prev]")?.addEventListener("click", () => {
          this._page = Math.max(0, this._page - 1);
          this.render();
        });

        root.querySelector("[data-next]")?.addEventListener("click", () => {
          const maxPage = Math.max(0, Math.ceil(this._items.length / this._pageSize) - 1);
          this._page = Math.min(maxPage, this._page + 1);
          this.render();
        });

        await this.update(true);
      },

      async fetchRecent() {
        return await fetchRecent(this._ctx);
      },

      render() {
        render(this._root, {
          items: this._items,
          page: this._page,
          pageSize: this._pageSize,
          last: this._last,
        });
      },

      async update(force = false) {
        const now = Date.now();
        if (!force && now - this._last < MIN_REFRESH_MS) return;
        this._last = now;

        try {
          this._items = await this.fetchRecent();
        } catch {
          this._items = [];
        }
        this.render();
      },

      tick() { this.update(false); },
      stop() {}
    });
  }
})();
