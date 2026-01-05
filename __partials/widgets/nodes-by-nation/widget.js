// __partials/widgets/nodes-by-nation/widget.js
// Unified-runtime fix + nation ranking + flag emoji + TOR exclusion (nation list only)
//
// Notes:
// - Replaces legacy ctx.util.* calls in your current file :contentReference[oaicite:0]{index=0}
// - HTML unchanged :contentReference[oaicite:1]{index=1}
// - CSS unchanged :contentReference[oaicite:2]{index=2}
//
// Requirements implemented:
// - TOR is excluded ONLY from the nation listing (not from global totals).
// - Each row shows: global rank position + flag emoji + CC + node count.
// - Default shows top 10 (same as your current behavior), but supports "all":
//     - If the widget root has attribute: data-all="1" → show all countries
//     - Or: data-limit="25" → show that many

(function () {
  const ID = "nodes-by-nation";

  function fmtBig(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    if (x >= 1e9) return (x / 1e9).toFixed(2) + "B";
    if (x >= 1e6) return (x / 1e6).toFixed(2) + "M";
    if (x >= 1e3) return (x / 1e3).toFixed(2) + "K";
    return x.toLocaleString();
  }

  // Convert ISO-3166 alpha-2 country code to flag emoji
  function flagEmoji(cc) {
    const s = String(cc || "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(s)) return "🏳️";
    const A = 0x1f1e6; // regional indicator A
    return String.fromCodePoint(A + (s.charCodeAt(0) - 65), A + (s.charCodeAt(1) - 65));
  }

  function isTorCode(cc) {
    const s = String(cc || "").toUpperCase();
    // Be conservative: exclude only clearly non-nation tor-like buckets.
    return s === "TOR" || s === "ONION" || s === "ZZ" || s === "XX";
  }

  function readLimit(card) {
    const all = card?.getAttribute("data-all");
    if (all === "1" || all === "true") return Infinity;
    const lim = Number(card?.getAttribute("data-limit"));
    if (Number.isFinite(lim) && lim > 0) return lim;
    return 10; // matches your current slice(0, 10)
  }

  window.ZZXWidgets.register(ID, {
    mount(slotEl) {
      this.card = slotEl.querySelector('[data-w="nodes-by-nation"]');
      this.totalEl = this.card?.querySelector("[data-total]");
      this.reachEl = this.card?.querySelector("[data-reach]");
      this.unreachEl = this.card?.querySelector("[data-unreach]");
      this.listEl = this.card?.querySelector("[data-list]");
      this._t = null;
    },

    start(ctx) {
      const run = async () => {
        if (!this.card) return;

        // totals from latest snapshot (TOR not excluded here)
        let total = NaN, reach = NaN, unreach = NaN;
        try {
          const snap = await ctx.fetchJSON(ctx.api.BITNODES_LATEST);
          total = Number(snap?.total_nodes ?? snap?.total ?? snap?.count ?? snap?.nodes_total);
          reach = Number(snap?.reachable_nodes ?? snap?.reachable ?? snap?.total_reachable ?? snap?.reachable_total);
          unreach = (Number.isFinite(total) && Number.isFinite(reach)) ? (total - reach) : NaN;
        } catch {}

        if (this.totalEl) this.totalEl.textContent = Number.isFinite(total) ? fmtBig(total) : "—";
        if (this.reachEl) this.reachEl.textContent = Number.isFinite(reach) ? fmtBig(reach) : "—";
        if (this.unreachEl) this.unreachEl.textContent = Number.isFinite(unreach) ? fmtBig(unreach) : "—";

        // countries list (TOR excluded ONLY here)
        try {
          const data = await ctx.fetchJSON(ctx.api.BITNODES_COUNTRIES);

          // common shapes:
          // { countries: { US: 1234, DE: 456, ... } } OR { US: 1234, ... }
          const map =
            (data?.countries && typeof data.countries === "object") ? data.countries :
            (data && typeof data === "object") ? data :
            null;

          const limit = readLimit(this.card);

          const pairs = map
            ? Object.entries(map)
                .map(([cc, n]) => [String(cc).toUpperCase(), Number(n)])
                .filter(([cc, n]) => Number.isFinite(n) && cc)
                .filter(([cc]) => !isTorCode(cc))            // <-- TOR exclusion only here
                .sort((a, b) => b[1] - a[1])
            : [];

          const view = (limit === Infinity) ? pairs : pairs.slice(0, limit);

          if (this.listEl) {
            this.listEl.innerHTML = "";

            let rank = 0;
            for (const [cc, n] of view) {
              rank += 1;

              const row = document.createElement("div");
              row.className = "row";

              // Position number + flag emoji + CC
              const left = `${rank}. ${flagEmoji(cc)} ${cc}`;
              const right = fmtBig(n);

              row.innerHTML = `<span class="cc">${left}</span><span class="n">${right}</span>`;
              this.listEl.appendChild(row);
            }

            if (!view.length) {
              const row = document.createElement("div");
              row.className = "row";
              row.innerHTML = `<span class="cc">—</span><span class="n">—</span>`;
              this.listEl.appendChild(row);
            }
          }
        } catch {
          if (this.listEl) {
            this.listEl.innerHTML = `<div class="row"><span class="cc">—</span><span class="n">—</span></div>`;
          }
        }
      };

      run();
      this._t = setInterval(run, 60_000);
    },

    stop() {
      if (this._t) clearInterval(this._t);
      this._t = null;
    }
  });
})();
