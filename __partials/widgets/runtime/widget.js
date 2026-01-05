// __partials/widgets/runtime.js
// ZZX Widgets Runtime — SINGLE orchestrator (FINAL, HUD-FIXED)
//
// FIXES:
// - HUD buttons now ACTUALLY change state
// - Full / Ticker / Hide / Reset work deterministically
// - State restored on reload
// - bitcoin-ticker stays visible in ticker-only
// - No layout / CSS / HTML changes
// - No widget logic touched

(function () {
  const W = window;
  const D = document;

  if (W.__ZZX_WIDGETS_RUNTIME_BOOTED) return;
  W.__ZZX_WIDGETS_RUNTIME_BOOTED = true;

  /* ------------------------------------------------------------------ */
  /* Prefix + helpers                                                    */
  /* ------------------------------------------------------------------ */

  function getPrefix() {
    return (
      W.ZZX?.PREFIX ||
      document.documentElement?.getAttribute("data-zzx-prefix") ||
      "."
    );
  }

  function join(prefix, p) {
    if (!p) return p;
    if (/^https?:\/\//i.test(p)) return p;
    if (!p.startsWith("/")) return p;
    if (prefix === "/") return p;
    const s = String(prefix || ".").replace(/\/+$/, "");
    return (!s || s === ".") ? p : s + p;
  }

  function urlFor(p) {
    return join(getPrefix(), p);
  }

  const qsVersion = (() => {
    const v = document.querySelector('meta[name="asset-version"]')?.content;
    return v ? `?v=${encodeURIComponent(v)}` : "";
  })();

  /* ------------------------------------------------------------------ */
  /* Low-level loaders                                                   */
  /* ------------------------------------------------------------------ */

  function ensureCSSOnce(key, href) {
    if (document.querySelector(`link[data-zzx-css="${key}"]`)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.dataset.zzxCss = key;
    document.head.appendChild(l);
  }

  function ensureJSOnce(key, src) {
    if (document.querySelector(`script[data-zzx-js="${key}"]`)) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = src;
      s.defer = true;
      s.dataset.zzxJs = key;
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.body.appendChild(s);
    });
  }

  async function fetchText(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return r.text();
  }

  async function fetchJSON(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return r.json();
  }

  /* ------------------------------------------------------------------ */
  /* Wait for header / partials                                          */
  /* ------------------------------------------------------------------ */

  function waitForHeader(timeout = 2500) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      (function poll() {
        const h = document.getElementById("zzx-header");
        if (h && h.children.length) return resolve(true);
        if (performance.now() - t0 > timeout) return resolve(false);
        setTimeout(poll, 60);
      })();
    });
  }

  /* ------------------------------------------------------------------ */
  /* HUD STATE → DOM                                                     */
  /* ------------------------------------------------------------------ */

  function applyHUDMode(mode) {
    const root   = D.querySelector("[data-hud-root]");
    const handle = D.querySelector("[data-hud-handle]");
    if (!root) return;

    root.setAttribute("data-hud-state", mode);

    if (handle) {
      handle.style.display = (mode === "hidden") ? "flex" : "none";
    }
  }

  function bindHUDControls() {
    if (!W.ZZXHUD) return;

    // mode buttons
    D.querySelectorAll("[data-hud-mode]").forEach(btn => {
      btn.addEventListener("click", () => {
        const m = btn.getAttribute("data-hud-mode");
        const s = W.ZZXHUD.write(m);
        applyHUDMode(s.mode);
      });
    });

    // reset
    const reset = D.querySelector("[data-hud-action='reset']");
    if (reset) {
      reset.addEventListener("click", () => {
        const s = W.ZZXHUD.reset();
        applyHUDMode(s.mode);
      });
    }

    // show handle
    const show = D.querySelector("[data-hud-show]");
    if (show) {
      show.addEventListener("click", () => {
        const s = W.ZZXHUD.write("full");
        applyHUDMode(s.mode);
      });
    }

    // restore persisted state
    const init = W.ZZXHUD.read();
    applyHUDMode(init.mode);
  }

  /* ------------------------------------------------------------------ */
  /* Widget registry (UNCHANGED logic)                                   */
  /* ------------------------------------------------------------------ */

  const REG = (W.__ZZX_REGISTRY_SINGLETON ||= {
    defs: new Map(),
    booted: new Set(),
  });

  function register(id, def) {
    REG.defs.set(id, def);
  }

  function bootOne(id, slot, ctx) {
    if (REG.booted.has(id)) return;
    const def = REG.defs.get(id);
    if (!def) return;

    const root =
      slot.querySelector("[data-widget-root]") ||
      slot.firstElementChild ||
      slot;

    try {
      if (typeof def === "function") def(root, ctx);
      else if (def.start) def.start.call(def, root, ctx);
      REG.booted.add(id);
    } catch (e) {
      console.warn("[HUD widget]", id, e);
    }
  }

  W.__ZZX_WIDGETS ||= {};
  W.__ZZX_WIDGETS.register = register;
  W.__ZZX_WIDGETS.start = function () {
    const ctx = {
      api: {
        COINBASE_SPOT: "https://api.coinbase.com/v2/prices/BTC-USD/spot",
        MEMPOOL: "https://mempool.space/api",
        ...(W.ZZX_API || {}),
      },
      fetchJSON,
      fetchText,
      urlFor,
      now: () => Date.now(),
    };

    document.querySelectorAll("[data-widget-slot]").forEach(slot => {
      if (slot.dataset.mountReady !== "1") return;
      const id = slot.getAttribute("data-widget-slot");
      bootOne(id, slot, ctx);
    });
  };

  /* ------------------------------------------------------------------ */
  /* Mount widgets from manifest                                         */
  /* ------------------------------------------------------------------ */

  async function mountWidgets() {
    const manifest = await fetchJSON(
      urlFor(`/__partials/widgets/manifest.json${qsVersion}`)
    );

    const widgets = manifest.widgets
      .filter(w => w.enabled !== false)
      .sort((a, b) => (a.priority ?? 9999) - (b.priority ?? 9999));

    for (const w of widgets) {
      const slot = document.querySelector(`[data-widget-slot="${w.id}"]`);
      if (!slot || slot.dataset.mounted === "1") continue;
      slot.dataset.mounted = "1";

      try {
        slot.innerHTML = await fetchText(
          urlFor(`/__partials/widgets/${w.id}/widget.html${qsVersion}`)
        );
        slot.dataset.mountReady = "1";
      } catch (e) {
        slot.dataset.mountReady = "0";
        slot.innerHTML = `<div class="btc-card"><div>${w.id}</div><div>load failed</div></div>`;
        continue;
      }

      ensureCSSOnce(`css:${w.id}`,
        urlFor(`/__partials/widgets/${w.id}/widget.css${qsVersion}`)
      );

      await ensureJSOnce(`js:${w.id}`,
        urlFor(`/__partials/widgets/${w.id}/widget.js${qsVersion}`)
      );
    }

    W.__ZZX_WIDGETS.start();
  }

  /* ------------------------------------------------------------------ */
  /* BOOT                                                               */
  /* ------------------------------------------------------------------ */

  (async function boot() {
    await waitForHeader();
    bindHUDControls();
    await mountWidgets();
  })();

})();
