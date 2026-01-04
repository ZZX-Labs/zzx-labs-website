// __partials/widgets/runtime.js
(function () {
  const W = window;

  // one runtime controller
  if (W.__ZZX_WIDGETS_RUNTIME) {
    W.__ZZX_WIDGETS_RUNTIME.rebind();
    return;
  }

  const LS_MODE = "zzx.widgets.mode";
  const LS_DISABLED = "zzx.widgets.disabled"; // optional future

  function $(sel, root = document) { return root.querySelector(sel); }
  function rail() { return document.getElementById("zzx-widgets-rail"); }
  function shell() { return document.querySelector('.zzx-widgets[data-zzx-widgets="1"]'); }

  async function ensureCoreLoaded() {
    if (W.ZZXWidgetsCore) return;
    // load core script (prefix-aware)
    const prefix = W.ZZX?.PREFIX || ".";
    const src = (prefix === "/" ? "" : String(prefix).replace(/\/+$/, "")) + "/__partials/widgets/_core/widget-core.js";

    await new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = src;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => resolve(); // don't hard-fail
      document.body.appendChild(s);
    });
  }

  async function loadManifest() {
    const api = W.ZZXWidgetsCore;
    const url = api.join(api.getPrefix(), "/__partials/widgets/manifest.json");
    return await api.jget(url);
  }

  function applyMode(mode) {
    const sh = shell();
    if (!sh) return;
    sh.dataset.mode = mode;
    try { localStorage.setItem(LS_MODE, mode); } catch (_) {}
  }

  function getSavedMode() {
    try {
      const v = localStorage.getItem(LS_MODE);
      return v || "full";
    } catch (_) {
      return "full";
    }
  }

  function bindControls() {
    const sh = shell();
    if (!sh || sh.__zzxBound) return;
    sh.__zzxBound = true;

    sh.addEventListener("click", (e) => {
      const btn = e.target?.closest?.("[data-zzx-mode],[data-zzx-action]");
      if (!btn) return;

      const mode = btn.getAttribute("data-zzx-mode");
      if (mode) applyMode(mode);

      const act = btn.getAttribute("data-zzx-action");
      if (act === "reset") {
        try { localStorage.removeItem(LS_MODE); } catch (_) {}
        applyMode("full");
      }
    });

    applyMode(getSavedMode());
  }

  async function mountAllWidgets() {
    const api = W.ZZXWidgetsCore;
    const r = rail();
    if (!r) return;

    const manifest = await loadManifest();
    const widgets = Array.isArray(manifest?.widgets) ? manifest.widgets.slice() : [];

    widgets.sort((a, b) => Number(a.priority ?? 9999) - Number(b.priority ?? 9999));

    // clear and rebuild rail (safe; each widget init should be rebind-safe)
    r.innerHTML = "";

    for (const w of widgets) {
      if (!w || !w.id) continue;
      const id = String(w.id);
      const enabled = (w.enabled !== false);

      const host = document.createElement("section");
      host.className = "zzx-widget";
      host.dataset.widget = id;
      host.dataset.enabled = enabled ? "1" : "0";
      host.setAttribute("aria-label", w.title || id);

      // if disabled, still mount container but hide; later user prefs can enable
      if (!enabled) host.style.display = "none";

      // placeholder while HTML loads
      host.innerHTML = `<div class="zzx-card"><div class="zzx-card__title">${w.title || id}</div><div class="zzx-card__sub">loading…</div></div>`;
      r.appendChild(host);

      // load widget assets
      try {
        const html = await api.fetchWidgetHTML(id);
        host.innerHTML = html;
      } catch (_) {
        // keep placeholder
      }

      // inject css once
      try {
        const css = await api.fetchWidgetCSS(id);
        api.ensureStyleTag(id, css);
      } catch (_) {}

      // load js once (widget registers itself)
      api.ensureScriptTag(id);
    }
  }

  // registry: widgets register themselves here
  W.ZZXWidgets = W.ZZXWidgets || {};
  W.ZZXWidgets.registry = W.ZZXWidgets.registry || new Map();

  function initRegisteredWidgets() {
    const api = W.ZZXWidgetsCore;
    const r = rail();
    if (!api || !r) return;

    r.querySelectorAll(".zzx-widget").forEach(host => {
      const id = host.dataset.widget;
      if (!id) return;

      const entry = W.ZZXWidgets.registry.get(id);
      if (!entry || typeof entry.init !== "function") return;

      const tok = api.mountToken(host);
      if (host.__zzxInitedTok === tok) return;
      host.__zzxInitedTok = tok;

      try { entry.init(host, api); } catch (e) { /* keep silent */ }
    });
  }

  let observer = null;
  function watchForWidgetJSReady() {
    if (observer) return;
    observer = new MutationObserver(() => initRegisteredWidgets());
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  const controller = {
    async prime() {
      await ensureCoreLoaded();
      bindControls();
      await mountAllWidgets();

      // init any widgets whose js is already loaded/registered
      initRegisteredWidgets();

      // keep watching for late-loaded widget.js registration
      watchForWidgetJSReady();
    },

    rebind() {
      // if shell exists but rail is empty (reinjection), re-prime
      const r = rail();
      if (!r) return;
      if (!r.children.length) this.prime();
      else initRegisteredWidgets();
    }
  };

  W.__ZZX_WIDGETS_RUNTIME = controller;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => controller.prime(), { once: true });
  } else {
    controller.prime();
  }
})();
