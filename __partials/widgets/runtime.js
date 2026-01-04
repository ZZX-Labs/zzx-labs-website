// __partials/widgets/runtime.js
// ZZX Widgets Runtime (DROP-IN REPLACEMENT)
//
// Purpose: make your existing widget scripts work again WITHOUT rewriting every widget.
//
// What this fixes (based on your console):
// - "window.ZZXWidgets is undefined"  (many widgets call ZZXWidgets.register)
// - "window.ZZXWidgetRegistry is undefined" (some widgets call ZZXWidgetRegistry.register)
// - "Core.onMount is not a function" (some widgets call ZZXWidgetsCore.onMount)
// - runtime loaded directly from /__partials/script.js (without core) => now runtime self-loads core
//
// Rules respected:
// - Prefix-aware fetch (works from any depth)
// - manifest-driven mounting
// - HTML -> CSS -> JS load order
// - Single HUD bar + safe hide/show
//
// NOTE: This file intentionally adds compatibility shims. It does NOT remove your existing APIs.

(function () {
  const W = window;

  if (W.__ZZX_WIDGETS_RUNTIME_BOOTED) return;
  W.__ZZX_WIDGETS_RUNTIME_BOOTED = true;

  // ---------- prefix helpers ----------
  function getPrefix() {
    const p = W.ZZX?.PREFIX;
    if (typeof p === "string" && p.length) return p;

    const p2 = document.documentElement?.getAttribute("data-zzx-prefix");
    if (typeof p2 === "string" && p2.length) return p2;

    return ".";
  }

  function join(prefix, path) {
    if (!path) return path;
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    if (prefix === "/") return path;
    if (!path.startsWith("/")) return path;
    return prefix.replace(/\/+$/, "") + path;
  }

  function urlFor(pathAbs) {
    return join(getPrefix(), pathAbs);
  }

  // ---------- tiny loaders ----------
  function ensureCSSOnce(id, href) {
    const sel = `link[data-zzx-css="${id}"]`;
    if (document.querySelector(sel)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute("data-zzx-css", id);
    document.head.appendChild(l);
  }

  function ensureScriptOnce(id, src) {
    return new Promise((resolve) => {
      const sel = `script[data-zzx-js="${id}"]`;
      if (document.querySelector(sel)) return resolve(true);

      const s = document.createElement("script");
      s.src = src;
      s.defer = true;
      s.setAttribute("data-zzx-js", id);
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.body.appendChild(s);
    });
  }

  async function fetchText(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.text();
  }

  async function fetchJSON(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.json();
  }

  // ---------- compatibility layer ----------
  // Widgets in your tree use a mix of:
  // - window.ZZXWidgets.register(...)
  // - window.ZZXWidgetRegistry.register(...)
  // - window.__ZZX_WIDGETS?.start?.()
  // - window.ZZXWidgetsCore.onMount(...)
  //
  // This runtime makes all of those exist and work.

  function ensureCoreAndShims() {
    // If core exists, still ensure shims
    if (!W.ZZXWidgetsCore) {
      // core should be at /__partials/widgets/_core/widget-core.js
      // (load it before any widget.js runs)
    }

    // onMount shim for Core
    // - supports Core.onMount(fn)
    // - supports Core.onMount(widgetId, fn)
    if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount !== "function") {
      const mountHooks = []; // { id?: string, fn: Function }

      W.ZZXWidgetsCore.onMount = function (a, b) {
        if (typeof a === "function") {
          mountHooks.push({ id: null, fn: a });
          return;
        }
        if (typeof a === "string" && typeof b === "function") {
          mountHooks.push({ id: a, fn: b });
        }
      };

      // fire helper used by runtime after it mounts HTML
      W.ZZXWidgetsCore.__fireMount = function (widgetId, widgetRootOrSlot) {
        for (const h of mountHooks) {
          if (h.id && h.id !== widgetId) continue;
          try { h.fn(widgetRootOrSlot, widgetId); } catch (e) { console.warn("[HUD] onMount hook error", widgetId, e); }
        }
      };
    }

    // Unified registry for widget initializers
    const REG = (W.__ZZX_WIDGET_REGISTRY = W.__ZZX_WIDGET_REGISTRY || {
      started: false,
      inits: new Map(), // id -> fn(root, Core)
    });

    function resolveWidgetRoot(id) {
      // Prefer explicit mounted marker first:
      // runtime sets data-widget-id on the SLOT itself.
      const slot = document.querySelector(`[data-widget-slot="${id}"]`);
      if (!slot) return null;
      // If widget HTML includes its own wrapper, root might be first child; otherwise slot is fine.
      return slot;
    }

    function runInit(id) {
      const fn = REG.inits.get(id);
      if (typeof fn !== "function") return;
      const root = resolveWidgetRoot(id);
      if (!root) return;

      // Prevent double-init per slot
      if (root.dataset.zzxInitDone === "1") return;
      root.dataset.zzxInitDone = "1";

      try { fn(root, W.ZZXWidgetsCore || null); } catch (e) { console.warn("[HUD] widget init error", id, e); }
    }

    function startAll() {
      REG.started = true;
      for (const id of REG.inits.keys()) runInit(id);
    }

    // window.ZZXWidgets shim
    if (!W.ZZXWidgets) {
      W.ZZXWidgets = {
        register(id, fn) {
          if (!id || typeof fn !== "function") return;
          REG.inits.set(String(id), fn);
          if (REG.started) runInit(String(id));
        },
        start() {
          startAll();
        },
      };
    } else {
      // Ensure required methods exist
      if (typeof W.ZZXWidgets.register !== "function") {
        W.ZZXWidgets.register = function (id, fn) {
          if (!id || typeof fn !== "function") return;
          REG.inits.set(String(id), fn);
          if (REG.started) runInit(String(id));
        };
      }
      if (typeof W.ZZXWidgets.start !== "function") {
        W.ZZXWidgets.start = function () {
          startAll();
        };
      }
    }

    // window.ZZXWidgetRegistry shim (alias)
    if (!W.ZZXWidgetRegistry) {
      W.ZZXWidgetRegistry = {
        register: W.ZZXWidgets.register,
        start: W.ZZXWidgets.start,
      };
    } else {
      if (typeof W.ZZXWidgetRegistry.register !== "function") {
        W.ZZXWidgetRegistry.register = W.ZZXWidgets.register;
      }
      if (typeof W.ZZXWidgetRegistry.start !== "function") {
        W.ZZXWidgetRegistry.start = W.ZZXWidgets.start;
      }
    }

    // window.__ZZX_WIDGETS shim (older boot call in /__partials/script.js)
    if (!W.__ZZX_WIDGETS) {
      W.__ZZX_WIDGETS = {
        start: W.ZZXWidgets.start,
      };
    } else {
      if (typeof W.__ZZX_WIDGETS.start !== "function") {
        W.__ZZX_WIDGETS.start = W.ZZXWidgets.start;
      }
    }

    // expose internal helpers (non-breaking)
    W.__ZZX_WIDGETS_RUNTIME = W.__ZZX_WIDGETS_RUNTIME || {};
    W.__ZZX_WIDGETS_RUNTIME._runInit = runInit;
    W.__ZZX_WIDGETS_RUNTIME._startAll = startAll;
  }

  async function ensureCoreLoaded() {
    // Many pages load runtime.js directly without core.
    // If any widget expects ZZXWidgetsCore / registry shims, we must load core first.
    const needCore = !W.ZZXWidgetsCore;
    if (!needCore) {
      ensureCoreAndShims();
      return true;
    }

    const coreUrl = urlFor("/__partials/widgets/_core/widget-core.js");
    const ok = await ensureScriptOnce("zzx-widgets-core", coreUrl);

    // Even if core fails, install shims so ZZXWidgets.register exists (best effort)
    ensureCoreAndShims();

    return ok;
  }

  // ---------- state (HUD mode) ----------
  const STATE_KEY = "zzx.hud.mode";

  function readMode() {
    try {
      const m = localStorage.getItem(STATE_KEY);
      return (m === "full" || m === "ticker-only" || m === "hidden") ? m : "full";
    } catch (_) {
      return "full";
    }
  }

  function setMode(mode) {
    if (!(mode === "full" || mode === "ticker-only" || mode === "hidden")) mode = "full";
    try { localStorage.setItem(STATE_KEY, mode); } catch (_) {}

    const root = document.querySelector("[data-hud-root]");
    const handle = document.querySelector("[data-hud-handle]");
    if (root) root.setAttribute("data-hud-state", mode);

    // handle ALWAYS present; show button only when hidden
    if (handle) handle.style.display = (mode === "hidden") ? "flex" : "none";
  }

  function resetState() {
    try { localStorage.removeItem(STATE_KEY); } catch (_) {}
    setMode("full");
  }

  // ---------- widget mount ----------
  function slotEl(id) {
    return document.querySelector(`[data-widget-slot="${id}"]`);
  }

  async function loadWidgetJS(id, jsUrl) {
    // Do not block the entire HUD if one widget JS fails.
    // But we DO want the console warning.
    const ok = await ensureScriptOnce(`w:${id}`, jsUrl);
    if (!ok) console.warn(`[HUD] ${id} js failed to load: ${jsUrl}`);
    return ok;
  }

  async function mountWidget(id) {
    const slot = slotEl(id);
    if (!slot) return;

    // prevent double mount
    if (slot.dataset.mounted === "1") return;
    slot.dataset.mounted = "1";

    const base = `/__partials/widgets/${id}`;
    const htmlUrl = urlFor(`${base}/widget.html`);
    const cssUrl = urlFor(`${base}/widget.css`);
    const jsUrl = urlFor(`${base}/widget.js`);

    // 1) HTML
    try {
      const html = await fetchText(htmlUrl);
      slot.innerHTML = html;
      slot.setAttribute("data-widget-id", id);
    } catch (e) {
      slot.innerHTML =
        `<div class="btc-card">
           <div class="btc-card__title">${id}</div>
           <div class="btc-card__sub">HTML load failed</div>
         </div>`;
      console.warn(`[HUD] ${id} html failed`, e);
      return;
    }

    // 2) CSS
    try {
      ensureCSSOnce(`wcss:${id}`, cssUrl);
    } catch (_) {}

    // 3) JS (after mount)
    await loadWidgetJS(id, jsUrl);

    // 4) Fire Core.onMount hooks (compat for widgets using Core.onMount)
    try {
      const Core = W.ZZXWidgetsCore;
      if (Core && typeof Core.__fireMount === "function") {
        Core.__fireMount(id, slot);
      }
    } catch (_) {}

    // 5) If widget registered itself via ZZXWidgets.register, run it now (and/or at start()).
    // Some widget scripts register but rely on start() being called later.
    try {
      if (W.__ZZX_WIDGETS_RUNTIME && typeof W.__ZZX_WIDGETS_RUNTIME._runInit === "function") {
        W.__ZZX_WIDGETS_RUNTIME._runInit(id);
      }
    } catch (_) {}
  }

  async function mountAll(manifest) {
    const widgets = (manifest?.widgets || [])
      .filter((w) => w && w.id)
      .slice()
      .sort((a, b) => (a.priority ?? 9999) - (b.priority ?? 9999));

    for (const w of widgets) {
      const slot = slotEl(w.id);
      if (!slot) continue;

      if (w.enabled === false) {
        slot.style.display = "none";
        continue;
      } else {
        slot.style.display = "";
      }

      await mountWidget(w.id);
    }
  }

  // ---------- controls ----------
  function bindControls() {
    const root = document.querySelector("[data-hud-root]");
    if (!root || root.__boundControls) return;
    root.__boundControls = true;

    root.addEventListener("click", async (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      const mode = btn.getAttribute("data-hud-mode");
      const action = btn.getAttribute("data-hud-action");

      if (mode) setMode(mode);

      if (action === "reset") {
        resetState();

        // clear + remount
        root.querySelectorAll("[data-widget-slot]").forEach((el) => {
          el.dataset.mounted = "0";
          el.dataset.zzxInitDone = "0";
          el.innerHTML = "";
          el.style.display = "";
        });

        await bootWidgets(true);
      }
    });

    const showBtn = document.querySelector("[data-hud-show]");
    if (showBtn && !showBtn.__boundShow) {
      showBtn.__boundShow = true;
      showBtn.addEventListener("click", () => setMode("full"));
    }
  }

  // ---------- boot ----------
  async function bootWidgets(forceRemount = false) {
    // Ensure core loaded BEFORE any widget JS executes
    await ensureCoreLoaded();

    const manifestUrl = urlFor("/__partials/widgets/manifest.json");
    let manifest;

    try {
      manifest = await fetchJSON(manifestUrl);
    } catch (e) {
      console.warn("[HUD] manifest.json failed:", e);
      manifest = {
        widgets: Array.from(document.querySelectorAll("[data-widget-slot]")).map((el) => ({
          id: el.getAttribute("data-widget-slot"),
          enabled: true,
          priority: 999,
        })),
      };
    }

    if (forceRemount) {
      // allow re-init if needed
      try {
        if (W.__ZZX_WIDGET_REGISTRY) W.__ZZX_WIDGET_REGISTRY.started = false;
      } catch (_) {}
    }

    await mountAll(manifest);

    // Final: start registry (covers widgets that only register & never self-run)
    try { W.ZZXWidgets?.start?.(); } catch (_) {}
    try { W.ZZXWidgetRegistry?.start?.(); } catch (_) {}
    try { W.__ZZX_WIDGETS?.start?.(); } catch (_) {}
  }

  async function boot() {
    // Make sure CSS base is available if ticker-loader didn’t inject it.
    // (Non-fatal if missing; but helps in the “runtime loaded directly” path.)
    try {
      ensureCSSOnce("widgets-core-css", urlFor("/__partials/widgets/_core/widget-core.css"));
    } catch (_) {}

    setMode(readMode());
    bindControls();
    await bootWidgets(false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
