// __partials/widgets/price-24h/widget.js
// DROP-IN REPLACEMENT (runtime-free; uses widget-core onMount)
//
// Computes 24h price + % change using Coinbase Exchange 15m candles.
// Updates:
//   [data-w="price-24h"] [data-val]  -> last price (USD)
//   [data-w="price-24h"] [data-sub]  -> change percent + source
//
// Notes:
// - Your existing widget.html is fine: :contentReference[oaicite:0]{index=0}
// - This removes the old dependency on ctx.api / ctx.util (runtime is gone).

(function () {
  "use strict";

  const W = window;

  const Core = W.ZZXWidgetsCore;
  if (!Core || typeof Core.onMount !== "function") return;

  const CANDLES_15M =
    "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=900"; // 15m
  const N = 96; // 24h @ 15m

  function fmtUSD(n) {
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtPct(n) {
    if (!Number.isFinite(n)) return "—";
    const s = (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
    return s;
  }

  async function fetchCandles() {
    // Prefer Core.fetchJSON when available (it is already prefix-safe, but handles absolute URLs too)
    if (Core && typeof Core.fetchJSON === "function") return await Core.fetchJSON(CANDLES_15M);

    const r = await fetch(CANDLES_15M, { cache: "no-store" });
    if (!r.ok) throw new Error("candles HTTP " + r.status);
    return await r.json();
  }

  async function update(root) {
    const card = root?.querySelector?.('[data-w="price-24h"]');
    if (!card) return;

    const valEl = card.querySelector("[data-val]");
    const subEl = card.querySelector("[data-sub]");
    if (!valEl || !subEl) return;

    // simple in-flight lock per card
    if (card.__zzxInflight) return;
    card.__zzxInflight = true;

    try {
      const arr = await fetchCandles();
      if (!Array.isArray(arr) || arr.length < 2) return;

      // Coinbase returns newest-first. Take newest N, then reverse to chronological.
      const sample = arr.slice(0, N).slice().reverse();

      // each row: [time, low, high, open, close, volume]
      const closes = sample.map((r) => Number(r?.[4])).filter(Number.isFinite);
      if (closes.length < 2) return;

      const first = closes[0];
      const last = closes[closes.length - 1];
      const changePct = first !== 0 ? ((last - first) / first) * 100 : NaN;

      valEl.textContent = fmtUSD(last);
      subEl.textContent = `${fmtPct(changePct)} · Coinbase Exchange (15m candles)`;
    } catch (_) {
      // keep last values; avoid noisy UI
    } finally {
      card.__zzxInflight = false;
    }
  }

  Core.onMount("price-24h", (root) => {
    if (!root) return;

    // clear any prior timer if reinjected
    if (root.__zzxTimer) {
      clearInterval(root.__zzxTimer);
      root.__zzxTimer = null;
    }

    update(root);
    root.__zzxTimer = setInterval(() => update(root), 60_000);
  });
})();
