// __partials/widgets/tip/widget.js
// Block (Height) Clock = chain tip height (mempool.space) — unified-runtime fix
//
// Your current file is legacy Core.onMount and will not run in unified runtime :contentReference[oaicite:0]{index=0}.
// HTML stays unchanged :contentReference[oaicite:1]{index=1}.
// CSS stays unchanged :contentReference[oaicite:2]{index=2}.
//
// Behavior preserved:
// - polls every 15s
// - displays tip height in [data-height]
// - subline shows "mempool.space" or error

(function () {
  const ID = "tip";
  const API = "https://mempool.space/api";

  let inflight = false;

  async function update(root) {
    if (!root || inflight) return;
    inflight = true;

    try {
      const r = await fetch(`${API}/blocks/tip/height`, { cache: "no-store" });
      if (!r.ok) throw new Error(`tip height HTTP ${r.status}`);
      const txt = await r.text();
      const h = parseInt(String(txt).trim(), 10);

      const hEl = root.querySelector("[data-height]");
      const sEl = root.querySelector("[data-sub]");

      if (hEl) hEl.textContent = Number.isFinite(h) ? String(h) : "—";
      if (sEl) sEl.textContent = "mempool.space";
    } catch (e) {
      const sEl = root.querySelector("[data-sub]");
      if (sEl) sEl.textContent = `error: ${String(e?.message || e)}`;
    } finally {
      inflight = false;
    }
  }

  window.ZZXWidgets.register(ID, {
    mount(slotEl) {
      // widget root is the card itself in your HTML :contentReference[oaicite:3]{index=3}
      this._root = slotEl.querySelector('[data-widget-root="tip"]') || slotEl;
      this._t = null;
    },

    start() {
      const root = this._root;
      if (!root) return;

      update(root);
      this._t = setInterval(() => update(root), 15_000);
    },

    stop() {
      if (this._t) clearInterval(this._t);
      this._t = null;
    }
  });
})();
