// __partials/widgets/tip/widget.js
(function () {
  const Core = window.ZZXWidgetsCore;
  if (!Core) return;

  const API = "https://mempool.space/api";
  let inflight = false;

  async function update(root) {
    if (inflight) return;
    inflight = true;
    try {
      const r = await fetch(`${API}/blocks/tip/height`, { cache: "no-store" });
      if (!r.ok) throw new Error(`tip height HTTP ${r.status}`);
      const txt = await r.text();
      const h = parseInt(String(txt).trim(), 10);
      root.querySelector("[data-height]").textContent = Number.isFinite(h) ? String(h) : "—";
      root.querySelector("[data-sub]").textContent = "mempool.space";
    } catch (e) {
      root.querySelector("[data-sub]").textContent = `error: ${String(e?.message || e)}`;
    } finally {
      inflight = false;
    }
  }

  Core.onMount("tip", (root) => {
    update(root);
    setInterval(() => update(root), 15_000);
  });
})();
