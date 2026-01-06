// __partials/widgets/bitcoin-ticker/widget.js
// DROP-IN: compatible with widget-core.js (NO runtime dependency)
// - Works with Core.onMount() (preferred) OR legacy ZZXWidgets.register()
// - Survives HUD reinjection (clears prior interval on the new root)

(function () {
  "use strict";

  const W = window;

  const DEFAULTS = {
    COINBASE_SPOT: "https://api.coinbase.com/v2/prices/BTC-USD/spot",
  };

  function getSpotUrl() {
    const u =
      (W.ZZX_API && typeof W.ZZX_API.COINBASE_SPOT === "string" && W.ZZX_API.COINBASE_SPOT) ||
      "";
    return u || DEFAULTS.COINBASE_SPOT;
  }

  function boot(root, core) {
    if (!root) return;

    const a = root.querySelector("[data-btc]");
    const b = root.querySelector("[data-mbtc]");
    const c = root.querySelector("[data-ubtc]");
    const d = root.querySelector("[data-sat]");
    if (!a || !b || !c || !d) return;

    // kill any previous timer tied to THIS root
    if (root.__zzxTickerTimer) {
      clearInterval(root.__zzxTickerTimer);
      root.__zzxTickerTimer = null;
    }

    const SPOT = getSpotUrl();

    const fetchJSON =
      core && typeof core.fetchJSON === "function"
        ? (u) => core.fetchJSON(u) // core.url() leaves https URLs untouched
        : async (u) => {
            const r = await fetch(u, { cache: "no-store" });
            if (!r.ok) throw new Error("HTTP " + r.status);
            return await r.json();
          };

    async function tick() {
      try {
        const data = await fetchJSON(SPOT);
        const amt = data && data.data && data.data.amount;
        const btc = parseFloat(amt);
        if (!Number.isFinite(btc)) return;

        // USD value of 1 unit (BTC / mBTC / μBTC / sat)
        a.textContent = btc.toFixed(2);
        b.textContent = (btc * 1e-3).toFixed(2);  // 1 mBTC = 0.001 BTC
        c.textContent = (btc * 1e-6).toFixed(4);  // 1 μBTC = 0.000001 BTC
        d.textContent = (btc * 1e-8).toFixed(6);  // 1 sat  = 0.00000001 BTC
      } catch (_) {
        // ignore transient network errors; keep last good numbers
      }
    }

    tick();
    root.__zzxTickerTimer = setInterval(tick, 250);
  }

  // Preferred: core lifecycle (fires AFTER widget HTML is injected)
  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount("bitcoin-ticker", function (root, core) {
      boot(root, core);
    });
    return;
  }

  // Fallback: legacy registry (core creates this shim even without runtime.js)
  if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register("bitcoin-ticker", function (root, core) {
      boot(root, core);
    });
  }
})();
