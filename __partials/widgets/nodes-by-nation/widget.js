(function () {
  window.ZZXWidgets.register("nodes-by-nation", {
    mount(slotEl) {
      this.card = slotEl.querySelector('[data-w="nodes-by-nation"]');
      this.totalEl = this.card?.querySelector("[data-total]");
      this.reachEl = this.card?.querySelector("[data-reach]");
      this.unreachEl = this.card?.querySelector("[data-unreach]");
      this.listEl = this.card?.querySelector("[data-list]");
    },
    start(ctx) {
      const run = async () => {
        if (!this.card) return;

        // totals from latest snapshot
        let total = NaN, reach = NaN, unreach = NaN;
        try {
          const snap = await ctx.util.jgetAllOrigins(ctx.api.BITNODES_LATEST);
          total = Number(snap?.total_nodes ?? snap?.total ?? snap?.count);
          reach = Number(snap?.reachable_nodes ?? snap?.reachable ?? snap?.total_reachable);
          unreach = (Number.isFinite(total) && Number.isFinite(reach)) ? (total - reach) : NaN;
        } catch {}

        if (this.totalEl) this.totalEl.textContent = Number.isFinite(total) ? ctx.util.fmtBig(total) : "—";
        if (this.reachEl) this.reachEl.textContent = Number.isFinite(reach) ? ctx.util.fmtBig(reach) : "—";
        if (this.unreachEl) this.unreachEl.textContent = Number.isFinite(unreach) ? ctx.util.fmtBig(unreach) : "—";

        // countries list from countries endpoint
        try {
          const data = await ctx.util.jgetAllOrigins(ctx.api.BITNODES_COUNTRIES);

          // bitnodes countries endpoint often returns:
          // { countries: { US: 1234, DE: 456, ... } } OR directly { US: 1234, ... }
          const map = (data?.countries && typeof data.countries === "object") ? data.countries :
                      (data && typeof data === "object") ? data : null;

          const pairs = map ? Object.entries(map)
            .map(([cc, n]) => [String(cc).toUpperCase(), Number(n)])
            .filter(([, n]) => Number.isFinite(n))
            .sort((a,b)=>b[1]-a[1])
            .slice(0, 10)
            : [];

          if (this.listEl) {
            this.listEl.innerHTML = "";
            for (const [cc, n] of pairs) {
              const row = document.createElement("div");
              row.className = "row";
              row.innerHTML = `<span class="cc">${cc}</span><span class="n">${ctx.util.fmtBig(n)}</span>`;
              this.listEl.appendChild(row);
            }
            if (!pairs.length) {
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
    stop() { if (this._t) clearInterval(this._t); this._t = null; }
  });
})();
