// __partials/widgets/high-low-24h/widget.js
(function () {
  const Core = window.ZZXWidgetsCore;
  if (!Core) return;

  const CANDLES = "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600"; // 1h
  let inflight = false;

  function fmt(n) {
    return Number.isFinite(n) ? n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : "—";
  }

  async function update(root) {
    if (inflight) return;
    inflight = true;
    try {
      const r = await fetch(CANDLES, { cache: "no-store" });
      if (!r.ok) throw new Error(`candles HTTP ${r.status}`);
      const arr = await r.json();
      if (!Array.isArray(arr) || !arr.length) throw new Error("candles empty");

      // each row: [time, low, high, open, close, volume]
      const rows = arr.slice(0, 24); // last 24 hours (approx)
      let hi = -Infinity, lo = Infinity;
      for (const x of rows) {
        const low = Number(x?.[1]);
        const high = Number(x?.[2]);
        if (Number.isFinite(high)) hi = Math.max(hi, high);
        if (Number.isFinite(low)) lo = Math.min(lo, low);
      }

      root.querySelector("[data-hi]").textContent = fmt(hi);
      root.querySelector("[data-lo]").textContent = fmt(lo);
      root.querySelector("[data-sub]").textContent = "Coinbase Exchange (1h candles)";
    } catch (e) {
      root.querySelector("[data-sub]").textContent = `error: ${String(e?.message || e)}`;
    } finally {
      inflight = false;
    }
  }

  Core.onMount("high-low-24h", (root) => {
    update(root);
    setInterval(() => update(root), 60_000);
  });
})();
