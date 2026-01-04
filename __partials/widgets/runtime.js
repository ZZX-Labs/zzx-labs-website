// __partials/widgets/runtime.js
// HARD-FIX: never exit early if Core isn't ready yet.
// - waits for window.ZZXWidgetsCore
// - mounts widgets from manifest.json
// - loads each widget's html/css/js
// - supports legacy widgets (that just run on load) AND mount-registered widgets

(function () {
  const W = window;

  // prevent duplicate boot loops
  if (W.__ZZX_WIDGETS_RUNTIME_BOOTED) return;
  W.__ZZX_WIDGETS_RUNTIME_BOOTED = true;

  const MANIFEST_PATH = "/__partials/widgets/manifest.json";
  const WIDGETS_BASE = "/__partials/widgets";

  function waitForCore(timeoutMs = 8000, intervalMs = 25) {
    return new Promise((resolve, reject) => {
      const t0 = performance.now();
      (function poll() {
        if (W.ZZXWidgetsCore) return resolve(W.ZZXWidgetsCore);
        if (performance.now() - t0 > timeoutMs) return reject(new Error("ZZXWidgetsCore not ready"));
        setTimeout(poll, intervalMs);
      })();
    });
  }

  function hudRoot(Core) { return Core.qs('[data-hud-root]'); }
  function hudHandle(Core) { return Core.qs('[data-hud-handle]'); }
  function rail(Core) { return Core.qs("#zzx-widgets-rail"); }

  function applyMode(Core, mode) {
    const root = hudRoot(Core);
    const handle = hudHandle(Core);
    if (root) root.setAttribute("data-hud-mode", mode);
    if (handle) handle.hidden = (mode !== "hidden");
  }

  function bindBarOnce(Core) {
    const root = hudRoot(Core);
    if (!root || root.__zzxBound) return;
    root.__zzxBound = true;

    root.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      if (btn.hasAttribute("data-hud-setmode")) {
        const mode = btn.getAttribute("data-hud-setmode");
        const s = W.ZZXHUD?.setMode(mode) || { mode: "full" };
        applyMode(Core, s.mode);
      }

      if (btn.hasAttribute("data-hud-reset")) {
        const s = W.ZZXHUD?.reset() || { mode: "full" };
        applyMode(Core, s.mode);
        // full remount
        mountAll(Core, true).catch(err => console.warn("[ZZX] remount error:", err));
      }
    });

    const showBtn = Core.qs("[data-hud-show]");
    if (showBtn && !showBtn.__zzxBound) {
      showBtn.__zzxBound = true;
      showBtn.addEventListener("click", () => {
        const s = W.ZZXHUD?.setMode("full") || { mode: "full" };
        applyMode(Core, s.mode);
      });
    }
  }

  function widgetURL(Core, id, file) {
    return Core.asset(`${WIDGETS_BASE}/${id}/${file}`);
  }

  async function loadWidget(Core, def, cacheBust) {
    const id = String(def?.id || "").trim();
    if (!id) return;
    if (def.enabled === false) return;

    const host = document.createElement("div");
    host.className = "zzx-widget";
    host.setAttribute("data-widget-id", id);
    host.setAttribute("data-widget-root", id);

    rail(Core).appendChild(host);

    // CSS (best-effort)
    try {
      Core.ensureLinkOnce(`widget-css:${id}`, widgetURL(Core, id, "widget.css"));
    } catch (_) {}

    // HTML (required)
    try {
      const html = await Core.fetchText(widgetURL(Core, id, "widget.html"));
      host.innerHTML = html;
    } catch (e) {
      console.warn(`[ZZX] ${id} html failed`, e);
      host.innerHTML = `<div class="zzx-card"><div class="zzx-card__title">${def.title || id}</div><div class="zzx-card__sub">widget.html failed</div></div>`;
      return;
    }

    // JS (required for data)
    try {
      // cache-bust so updates actually apply while you iterate
      const js = widgetURL(Core, id, `widget.js?v=${encodeURIComponent(cacheBust)}`);
      await Core.ensureScriptOnce(`widget-js:${id}`, js);
    } catch (e) {
      console.warn(`[ZZX] ${id} js failed`, e);
      return;
    }

    // Mount hook (optional)
    // Preferred: window.ZZXWidgetMount[id].mount(host, Core)
    try {
      const m = W.ZZXWidgetMount?.[id];
      if (m && typeof m.mount === "function") {
        m.mount(host, Core);
      } else {
        // Legacy compatibility: if widget.js is written "run immediately",
        // it can find its DOM under host. We also dispatch an event.
        host.dispatchEvent(new CustomEvent("zzx:widget-mounted", { bubbles: true, detail: { id, host } }));
      }
    } catch (e) {
      console.warn(`[ZZX] ${id} mount error`, e);
    }
  }

  async function mountAll(Core, force = false) {
    const r = rail(Core);
    if (!r) return;

    if (r.dataset.mounted === "1" && !force) return;

    r.innerHTML = "";
    r.dataset.mounted = "0";

    let manifest;
    try {
      manifest = await Core.fetchJSON(Core.asset(MANIFEST_PATH));
    } catch (e) {
      console.warn("[ZZX] manifest.json failed", e);
      r.innerHTML = `<div class="zzx-card"><div class="zzx-card__title">HUD</div><div class="zzx-card__sub">manifest.json failed</div></div>`;
      return;
    }

    const list = Array.isArray(manifest?.widgets) ? manifest.widgets.slice() : [];
    list.sort((a, b) => (Number(a.priority) || 0) - (Number(b.priority) || 0));

    const cacheBust = Date.now().toString(36);

    // sequential to avoid API stampede and race bugs
    for (const def of list) {
      // eslint-disable-next-line no-await-in-loop
      await loadWidget(Core, def, cacheBust);
    }

    r.dataset.mounted = "1";
  }

  async function boot() {
    let Core;
    try {
      Core = await waitForCore();
    } catch (e) {
      console.warn("[ZZX] runtime cannot start:", e);
      return;
    }

    // Bind bar + apply persisted mode
    bindBarOnce(Core);
    const s = W.ZZXHUD?.read() || { mode: "full" };
    applyMode(Core, s.mode);

    // Mount all widgets
    await mountAll(Core, false);

    // expose for manual poke if needed
    W.ZZXWidgetsRuntime = {
      rebind: (force) => mountAll(Core, !!force),
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
