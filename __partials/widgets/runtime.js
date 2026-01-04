// __partials/widgets/runtime.js
// ZZX Widgets Runtime
// - mounts all widgets listed in /__partials/widgets/manifest.json
// - loads each widget's widget.html + widget.css + widget.js
// - calls widget mount() if provided
// - binds the single HUD control bar in runtime.html
// - NEVER creates a second bar (fixes your duplicate bar problem)

(function () {
  const Core = window.ZZXWidgetsCore;
  if (!Core) return;

  const W = window;

  const MANIFEST_URL = Core.asset("/__partials/widgets/manifest.json");
  const WIDGETS_BASE = "/__partials/widgets";

  const state = {
    mounted: false,
    mounting: false,
    cacheBust: Date.now().toString(36),
  };

  function hudRoot() { return Core.qs('[data-hud-root]'); }
  function hudHandle() { return Core.qs('[data-hud-handle]'); }
  function rail() { return Core.qs("#zzx-widgets-rail"); }

  function applyMode(mode) {
    const root = hudRoot();
    const handle = hudHandle();

    if (root) root.setAttribute("data-hud-mode", mode);
    if (handle) handle.hidden = (mode !== "hidden");
  }

  function bindHudControlsOnce() {
    const root = hudRoot();
    if (!root || root.__zzxBound) return;
    root.__zzxBound = true;

    root.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      if (btn.hasAttribute("data-hud-setmode")) {
        const mode = btn.getAttribute("data-hud-setmode");
        const s = window.ZZXHUD?.setMode(mode) || { mode: "full" };
        applyMode(s.mode);
      }

      if (btn.hasAttribute("data-hud-reset")) {
        const s = window.ZZXHUD?.reset() || { mode: "full" };
        applyMode(s.mode);
        // hard rebind: remount widgets
        rebind(true);
      }
    });

    const showBtn = Core.qs("[data-hud-show]");
    if (showBtn && !showBtn.__zzxBound) {
      showBtn.__zzxBound = true;
      showBtn.addEventListener("click", () => {
        const s = window.ZZXHUD?.setMode("full") || { mode: "full" };
        applyMode(s.mode);
      });
    }
  }

  function widgetPath(id, filename) {
    return Core.asset(`${WIDGETS_BASE}/${id}/${filename}`);
  }

  async function loadWidgetHTML(id, host) {
    const html = await Core.fetchText(widgetPath(id, "widget.html"));
    host.innerHTML = html;
  }

  async function loadWidgetCSS(id) {
    const href = widgetPath(id, "widget.css");
    Core.ensureLinkOnce(`widget-css:${id}`, href);
  }

  async function loadWidgetJS(id) {
    // cache-bust to defeat stale GH pages caching when you’re iterating
    const src = widgetPath(id, `widget.js?v=${encodeURIComponent(state.cacheBust)}`);
    await Core.ensureScriptOnce(`widget-js:${id}`, src);
  }

  function callWidgetMountIfAny(id, host) {
    // Preferred: window.ZZXWidgetMount[id].mount(host, Core)
    const m = W.ZZXWidgetMount?.[id];
    if (m && typeof m.mount === "function") {
      try { m.mount(host, Core); return true; } catch (e) { console.warn(`[ZZX] mount fail ${id}`, e); }
    }

    // Fallback: window.ZZXWidget_${id}.mount(host, Core)
    const alt = W[`ZZXWidget_${id}`];
    if (alt && typeof alt.mount === "function") {
      try { alt.mount(host, Core); return true; } catch (e) { console.warn(`[ZZX] mount fail ${id}`, e); }
    }

    // Legacy fallback: custom event hook for old widgets that self-listen
    try {
      host.dispatchEvent(new CustomEvent("zzx:widget-mounted", { bubbles: true, detail: { id, host } }));
    } catch (_) {}

    return false;
  }

  function buildSlot(id) {
    const slot = document.createElement("div");
    slot.className = "zzx-widget";
    slot.setAttribute("data-widget-id", id);
    // keep a consistent mount root for widget code
    slot.setAttribute("data-widget-root", id);
    return slot;
  }

  async function mountOne(def) {
    const id = String(def?.id || "").trim();
    if (!id) return;

    const enabled = (def.enabled !== false);
    if (!enabled) return;

    const host = buildSlot(id);
    rail().appendChild(host);

    // Load widget assets in order: css → html → js → mount()
    try {
      await loadWidgetCSS(id);
    } catch (e) {
      console.warn(`[ZZX] ${id} css load failed`, e);
    }

    try {
      await loadWidgetHTML(id, host);
    } catch (e) {
      console.warn(`[ZZX] ${id} html load failed`, e);
      host.innerHTML = `<div class="zzx-card"><div class="zzx-card__title">${def.title || id}</div><div class="zzx-card__sub">widget.html failed</div></div>`;
      return;
    }

    try {
      await loadWidgetJS(id);
    } catch (e) {
      console.warn(`[ZZX] ${id} js load failed`, e);
      // still leave HTML visible
      return;
    }

    // Give the script a tick to register globals if it uses defer
    await new Promise(r => setTimeout(r, 0));
    callWidgetMountIfAny(id, host);
  }

  async function mountAll() {
    if (state.mounting) return;
    state.mounting = true;

    const r = rail();
    if (!r) { state.mounting = false; return; }

    // Clear previous widgets (but keep rail)
    r.innerHTML = "";

    let manifest;
    try {
      manifest = await Core.fetchJSON(MANIFEST_URL);
    } catch (e) {
      console.warn("[ZZX] manifest load failed", e);
      r.innerHTML = `<div class="zzx-card"><div class="zzx-card__title">HUD</div><div class="zzx-card__sub">manifest.json failed</div></div>`;
      state.mounting = false;
      return;
    }

    const list = Array.isArray(manifest?.widgets) ? manifest.widgets.slice() : [];
    list.sort((a, b) => (Number(a.priority) || 0) - (Number(b.priority) || 0));

    // Mount sequentially (avoids stampede + race conditions)
    for (const w of list) {
      // eslint-disable-next-line no-await-in-loop
      await mountOne(w);
    }

    state.mounted = true;
    state.mounting = false;
  }

  async function rebind(force = false) {
    const root = hudRoot();
    const r = rail();
    if (!root || !r) return;

    bindHudControlsOnce();

    // apply persisted mode
    const s = window.ZZXHUD?.read() || { mode: "full" };
    applyMode(s.mode);

    if (!state.mounted || force) {
      await mountAll();
    }
  }

  // expose for debugging/manual rebind
  W.ZZXWidgetsRuntime = { rebind };

  async function boot() {
    await rebind(false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
