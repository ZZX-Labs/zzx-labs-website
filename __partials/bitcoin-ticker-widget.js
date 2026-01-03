// __partials/bitcoin-ticker-widget.js
// Updates the embedded BTC widget safely (idempotent, mount-aware)

(function () {
  const API_URL = "https://api.coinbase.com/v2/prices/spot?currency=USD";
  let timer = null;

  function qs(id) { return document.getElementById(id); }

  async function updateOnce() {
    const btcValue  = qs("btc-value");
    const mbtcValue = qs("mbtc-value");
    const ubtcValue = qs("ubtc-value");
    const satsValue = qs("sats-value");

    // Not mounted (or got replaced) — skip quietly
    if (!btcValue || !mbtcValue || !ubtcValue || !satsValue) return;

    try {
      const r = await fetch(API_URL, { cache: "no-store" });
      const j = await r.json();
      const btc = parseFloat(j?.data?.amount);
      if (!Number.isFinite(btc)) return;

      const mbtc = btc * 0.001;
      const ubtc = btc * 0.000001;
      const sat  = btc * 0.00000001;

      btcValue.textContent  = btc.toFixed(2);
      mbtcValue.textContent = mbtc.toFixed(2);
      ubtcValue.textContent = ubtc.toFixed(4);
      satsValue.textContent = sat.toFixed(6);
    } catch (e) {
      console.warn("[ticker] price fetch failed:", e);
    }
  }

  function start() {
    if (timer) return;
    updateOnce();
    timer = setInterval(updateOnce, 250);
  }

  // Start immediately; safe even if widget arrives slightly later
  start();
})();
