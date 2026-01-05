// __partials/widgets/high-low-24h/widget.js
// Unified-runtime adapter (NO UI / layout / behavior changes)

(function () {
  const ID = "high-low-24h";
  const CANDLES =
    "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600"; // 1h

  let inflight = false;

  function fmt(n) {
    return Number.isFinite(n)
      ? n.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })
      : "—";
  }

  async function update(root) {
    if (inflight || !root) return;
    inflight = true;

    try {
      const r = await fetch(CANDLES, { cache: "no-store" });
      if (!r.ok) throw new Error(`candles HTTP ${r.status}`);
      const arr = await r.json();
      if (!Array.isArray(arr) || !arr.length) throw new Error("candles empty");

      // rows: [time, low, high, open, close, volume]
      const rows = arr.slice(0, 24); // ~24h
      let hi = -Infinity;
      let lo = Infinity;

      for (const x of rows) {
        const low = Number(x?.[1]);
        const high = Number(x?.[2]);
        if (Number.isFinite(high)) hi = Math.max(hi, high);
        if (Number.isFinite(low)) lo = Math.min(lo, low);
      }

      const hiEl = root.querySelector("[data-hi]");
      const loEl = root.querySelector("[data-lo]");
      const subEl = root.querySelector("[data-sub]");

      if (hiEl) hiEl.textContent = fmt(hi);
      if (loEl) loEl.textContent = fmt(lo);
      if (subEl) subEl.textContent = "Coinbase Exchange (1h candles)";
    } catch (e) {
      const subEl = root.querySelector("[data-sub]");
      if (subEl) subEl.textContent = `error: ${String(e?.message || e)}`;
    } finally {
      inflight = false;
    }
  }

  window.ZZXWidgets.register(ID, {
    mount(slotEl) {
      this._root = slotEl;
      this._t = null;
    },

    start() {
      const root = this._root;
      if (!root) return;

      update(root);
      this._t = setInterval(() => update(root), 60_000);
    },

    stop() {
      if (this._t) clearInterval(this._t);
      this._t = null;
    }
  });
})();
