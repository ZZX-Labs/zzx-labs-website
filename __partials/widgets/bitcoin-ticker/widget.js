// __partials/widgets/bitcoin-ticker/widget.js
// DROP-IN: compatible with core-widget.js (NO runtime dependency)

(function () {
  "use strict";

  const W = window;

  const DEFAULTS = {
    COINBASE_SPOT: "https://api.coinbase.com/v2/prices/BTC-USD/spot",
  };

  function getSpotUrl() {
    // Prefer user-provided API map if you have it
    const u = W.ZZX_API && typeof W.ZZX_API.COINBASE_SPOT === "string" ? W.ZZX_API.COINBASE_SPOT : "";
    return u || DEFAULTS.COINBASE_SPOT;
  }

  function boot(root, core) {
    if (!root) return;

    const a = root.querySelector("[data-btc]");
    const b = root.querySelector("[data-mbtc]");
    const c = root.querySelector("[data-ubtc]");
    const d = root.querySelector("[data-sat]");
    if (!a || !b || !c || !d) return;

    // avoid double intervals if reinjected
    if (root.__zzxTickerTimer) {
      clearInterval(root.__zzxTickerTimer);
      root.__zzxTickerTimer = null;
    }

    const SPOT = getSpotUrl();

    // Use core.fetchJSON if available (it accepts absolute URLs too)
    const fetchJSON = (core && typeof core.fetchJSON === "function")
      ? (u) => core.fetchJSON(u)
      : async (u) => {
          const r = await fetch(u, { cache: "no-store" });
          if (!r.ok) throw new Error("HTTP " + r.status);
          return await r.json();
        };

    async function tick() {
      try {
        const data = await fetchJSON(SPOT);
        const btc = parseFloat(data && data.data && data.data.amount);
        if (!Number.isFinite(btc)) return;

        // USD value of 1 unit (BTC / mBTC / μBTC / sat)
        a.textContent = btc.toFixed(2);
        b.textContent = (btc * 1e-3).toFixed(2);     // 1 mBTC = 0.001 BTC
        c.textContent = (btc * 1e-6).toFixed(4);     // 1 μBTC = 0.000001 BTC
        d.textContent = (btc * 1e-8).toFixed(6);     // 1 sat = 0.00000001 BTC
      } catch (_) {
        // network hiccup -> keep last values
      }
    }

    tick();
    root.__zzxTickerTimer = setInterval(tick, 250);
  }

  // Preferred: core lifecycle (fires AFTER HTML is injected)
  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount("bitcoin-ticker", (root, core) => boot(root, core));
    return;
  }

  // Fallback: legacy shim path (core-widget.js creates ZZXWidgets.register)
  if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    // Register as a FUNCTION so legacyBootOne calls it with (root, core)
    W.ZZXWidgets.register("bitcoin-ticker", function (root, core) {
      boot(root, core);
    });
  }
})();
