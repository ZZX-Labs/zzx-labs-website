// __partials/widgets/nodes/widget.js
// FIXED + EXTENDED: unified-runtime compatible, plus richer node breakdown.
//
// Your current file only displays a single “reachable” number and it still
// uses ctx.util.* (which does not exist in unified runtime) :contentReference[oaicite:0]{index=0}.
// HTML stays unchanged :contentReference[oaicite:1]{index=1} and CSS stays unchanged :contentReference[oaicite:2]{index=2}.
//
// Output behavior:
// - Primary value: Reachable (preferred), else Total
// - Subline: "reachable X · total Y · tor Z · ipv4 A · ipv6 B · asn C"
// - Robust to schema drift across Bitnodes-like feeds
// - No external helper deps; pure DOM updates; 60s cadence

(function () {
  const ID = "nodes";

  function fmtBig(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    if (x >= 1e9) return (x / 1e9).toFixed(2) + "B";
    if (x >= 1e6) return (x / 1e6).toFixed(2) + "M";
    if (x >= 1e3) return (x / 1e3).toFixed(2) + "K";
    return x.toLocaleString();
  }

  function pickNum(obj, keys) {
    for (const k of keys) {
      const v = Number(obj?.[k]);
      if (Number.isFinite(v)) return v;
    }
    return NaN;
  }

  // Try to derive totals from common Bitnodes-like schemas.
  function normalize(data) {
    const total = pickNum(data, ["total_nodes", "total", "count", "nodes_total"]);
    const reachable = pickNum(data, ["reachable_nodes", "reachable", "total_reachable", "reachable_total"]);

    // Tor / IPv4 / IPv6 counts vary by provider; try common key names.
    const tor = pickNum(data, ["tor_nodes", "tor", "onion", "onion_nodes", "tor_total"]);
    const ipv4 = pickNum(data, ["ipv4_nodes", "ipv4", "ip4", "ipv4_total"]);
    const ipv6 = pickNum(data, ["ipv6_nodes", "ipv6", "ip6", "ipv6_total"]);

    // ASN count: some feeds provide 'asns', 'asn_count', etc.
    const asn = pickNum(data, ["asn_count", "asns", "asnTotal", "asn_total", "distinct_asns"]);

    return { total, reachable, tor, ipv4, ipv6, asn };
  }

  window.ZZXWidgets.register(ID, {
    mount(slotEl) {
      this.card = slotEl.querySelector('[data-w="nodes"]');
      this._t = null;
    },

    start(ctx) {
      const card = this.card;
      if (!card) return;

      const valEl = card.querySelector("[data-val]");
      const subEl = card.querySelector("[data-sub]");

      const render = (valueText, subText) => {
        if (valEl) valEl.textContent = valueText;
        if (subEl) subEl.textContent = subText;
      };

      const run = async () => {
        try {
          // Prefer unified runtime fetch if you later proxy this endpoint.
          // Right now your widget points at ctx.api.BITNODES_LATEST and uses
          // a cross-origin helper that doesn't exist :contentReference[oaicite:3]{index=3}.
          // So: attempt direct JSON fetch first; if it fails due to CORS,
          // you should proxy BITNODES_LATEST through your own API.
          const url = ctx.api.BITNODES_LATEST;
          const data = await ctx.fetchJSON(url);

          const n = normalize(data);

          const show = Number.isFinite(n.reachable) ? n.reachable : n.total;
          const main = Number.isFinite(show) ? fmtBig(show) : "—";

          // Build subline with whatever is available
          const parts = [];

          if (Number.isFinite(n.reachable)) parts.push(`reachable ${fmtBig(n.reachable)}`);
          if (Number.isFinite(n.total)) parts.push(`total ${fmtBig(n.total)}`);
          if (Number.isFinite(n.tor)) parts.push(`tor ${fmtBig(n.tor)}`);
          if (Number.isFinite(n.ipv4)) parts.push(`ipv4 ${fmtBig(n.ipv4)}`);
          if (Number.isFinite(n.ipv6)) parts.push(`ipv6 ${fmtBig(n.ipv6)}`);
          if (Number.isFinite(n.asn)) parts.push(`asn ${fmtBig(n.asn)}`);

          const sub = parts.length ? parts.join(" · ") : "nodes";

          render(main, sub);
        } catch {
          render("—", "nodes");
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
