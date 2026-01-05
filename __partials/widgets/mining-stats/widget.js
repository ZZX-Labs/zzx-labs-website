// __partials/widgets/mining-stats/widget.js
// NEW WIDGET: Mining Stats (unified-runtime native)
//
// Design goals:
// - Works with your unified runtime: ZZXWidgets.register + ctx.fetchJSON + ctx.urlFor
// - Uses local JSON datasets you control (no external API dependency)
// - Renders into your widget.html using data-* hooks
// - Zero layout assumptions beyond your existing btc-card "row/k/v" pattern
//
// Data files (local, under this widget folder):
// 1) /__partials/widgets/mining-stats/mining-stats.json
//    {
//      "updated": "2026-01-04",
//      "unit": "BTC/day",
//      "items": {
//        "hashrate_ehs": 510.25,
//        "difficulty": 7.28e13,
//        "block_time_min": 9.8,
//        "blocks_24h": 146,
//        "issuance_btc_24h": 912.5,
//        "subsidy_btc_block": 6.25,
//        "fees_btc_24h": 22.3,
//        "fee_share": 0.023,
//        "next_adjustment_eta": "2026-01-08",
//        "next_adjustment_blocks": 632
//      }
//    }
//
// Optional (if you want richer detail later):
// 2) /__partials/widgets/mining-stats/pools.json   (top pools snapshot)
// 3) /__partials/widgets/mining-stats/blocks.json  (recent blocks)
//
// This widget only requires #1 to work.

(function () {
  const ID = "mining-stats";

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function fmtNum(x, digits = 2) {
    const n = Number(x);
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
  }

  function fmtInt(x) {
    const n = Number(x);
    if (!Number.isFinite(n)) return "—";
    return Math.round(n).toLocaleString();
  }

  function fmtSci(x, sig = 3) {
    const n = Number(x);
    if (!Number.isFinite(n)) return "—";
    // avoid huge scientific strings in UI; keep compact
    if (Math.abs(n) >= 1e9) return n.toExponential(sig);
    return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function fmtPct(x, digits = 1) {
    const n = Number(x);
    if (!Number.isFinite(n)) return "—";
    return (n * 100).toFixed(digits) + "%";
  }

  window.ZZXWidgets.register(ID, {
    mount(slotEl) {
      this._root = slotEl;
      this._data = null;
      this._last = 0;
      this._t = null;
    },

    async start(ctx) {
      this._ctx = ctx || null;
      await this.load(true);
      this.render();

      // Refresh cadence: 60s (local JSON can be updated by your pipeline)
      this._t = setInterval(() => {
        this.load(false).then(() => this.render()).catch(() => {});
      }, 60_000);
    },

    async load(force) {
      const now = Date.now();
      if (!force && now - this._last < 15_000) return;
      this._last = now;

      const ctx = this._ctx;
      const url = ctx?.urlFor
        ? ctx.urlFor("/__partials/widgets/mining-stats/mining-stats.json")
        : "/__partials/widgets/mining-stats/mining-stats.json";

      try {
        this._data = ctx?.fetchJSON
          ? await ctx.fetchJSON(url)
          : await (await fetch(url, { cache: "no-store" })).json();
      } catch {
        this._data = { updated: null, unit: null, items: {} };
      }
    },

    render() {
      const root = this._root;
      if (!root) return;

      const updatedEl = root.querySelector("[data-updated]");
      const listEl = root.querySelector("[data-list]");
      const metaEl = root.querySelector("[data-meta]");
      if (!listEl) return;

      const updated = this._data?.updated || "—";
      const it = (this._data?.items && typeof this._data.items === "object") ? this._data.items : {};

      if (updatedEl) updatedEl.textContent = updated;

      // Assemble rows (keep concise + stable ordering)
      const rows = [
        ["hashrate",  `${fmtNum(it.hashrate_ehs, 2)} EH/s`],
        ["difficulty", `${fmtSci(it.difficulty, 3)}`],
        ["block time", `${fmtNum(it.block_time_min, 1)} min`],
        ["blocks/24h", `${fmtInt(it.blocks_24h)}`],
        ["subsidy", `${fmtNum(it.subsidy_btc_block, 2)} BTC/block`],
        ["issuance/24h", `${fmtNum(it.issuance_btc_24h, 2)} BTC`],
        ["fees/24h", `${fmtNum(it.fees_btc_24h, 2)} BTC`],
        ["fee share", `${fmtPct(it.fee_share, 1)}`],
        ["next adj", `${esc(it.next_adjustment_eta || "—")} · ${fmtInt(it.next_adjustment_blocks)} blocks`],
      ];

      listEl.innerHTML = rows.map(([k, v]) =>
        `<div class="row"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`
      ).join("");

      if (metaEl) metaEl.textContent = "source: local mining-stats.json";
    },

    stop() {
      if (this._t) clearInterval(this._t);
      this._t = null;
    }
  });
})();
