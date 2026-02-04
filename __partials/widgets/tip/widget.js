// __partials/widgets/tip/widget.js
// Tip = chain tip height (mempool.space).
// DROP-IN: unified-runtime compatible + AllOrigins fallback.
// Behavior preserved:
// - refresh every 15s
// - writes height into [data-height]
// - subline shows source or error

(function () {
  "use strict";

  const W = window;
  const ID = "tip";

  const API = "https://mempool.space/api";
  const AO_RAW = "https://api.allorigins.win/raw?url=";

  const REFRESH_MS = 15_000;

  function q(root, sel) { return root ? root.querySelector(sel) : null; }
  function setText(root, sel, v) { const el = q(root, sel); if (el) el.textContent = String(v ?? "—"); }

  async function fetchTextDirect(url) {
    const r = await fetch(url, { cache: "no-store", credentials: "omit", redirect: "follow" });
    const t = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return t;
  }

  async function fetchTextDirectThenAO(url) {
    try {
      return await fetchTextDirect(url);
    } catch (e1) {
      const ao = AO_RAW + encodeURIComponent(String(url));
      try {
        return await fetchTextDirect(ao);
      } catch (e2) {
        throw new Error(`fetch failed: ${String(e1?.message || e1)} | ${String(e2?.message || e2)}`);
      }
    }
  }

  async function getTipText(ctx) {
    const url = `${API}/blocks/tip/height`;
    if (ctx && typeof ctx.fetchText === "function") {
      return await ctx.fetchText(url);
    }
    return await fetchTextDirectThenAO(url);
  }

  async function update(root, ctx, state) {
    if (!root || state.inflight) return;
    state.inflight = true;

    try {
      const txt = await getTipText(ctx);
      const h = parseInt(String(txt).trim(), 10);

      setText(root, "[data-height]", Number.isFinite(h) ? String(h) : "—");
      setText(root, "[data-sub]", "mempool.space");
    } catch (e) {
      // keep height as-is; only mark error
      setText(root, "[data-sub]", `error: ${String(e?.message || e)}`);
    } finally {
      state.inflight = false;
    }
  }

  function boot(slotEl, ctx) {
    const root = slotEl?.querySelector?.('[data-widget-root="tip"]') || slotEl;
    if (!root) return;

    const state = (root.__zzxTipState = root.__zzxTipState || { inflight: false });

    // clear any previous timers
    if (root.__zzxTipTimer) {
      clearInterval(root.__zzxTipTimer);
      root.__zzxTipTimer = null;
    }

    update(root, ctx, state);
    root.__zzxTipTimer = setInterval(() => update(root, ctx, state), REFRESH_MS);
  }

  // Unified runtime
  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (slotEl, ctx) => boot(slotEl, ctx));
    return;
  }

  // Legacy runtime
  if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, {
      mount(slotEl) {
        this._slot = slotEl;
        this._ctx = null;
        this._state = { inflight: false };
        this._t = null;
      },

      start(ctx) {
        this._ctx = ctx;
        const root = this._slot?.querySelector?.('[data-widget-root="tip"]') || this._slot;
        if (!root) return;

        update(root, this._ctx, this._state);
        this._t = setInterval(() => update(root, this._ctx, this._state), REFRESH_MS);
      },

      stop() {
        if (this._t) clearInterval(this._t);
        this._t = null;
      }
    });
  }
})();
