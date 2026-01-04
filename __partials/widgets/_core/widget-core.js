// __partials/widgets/_core/widget-core.js
// ZZX Widgets Core — MANIFEST-DRIVEN MOUNTER (DROP-IN REPLACEMENT)
//
// YOU ASKED FOR THIS ARCHITECTURE:
// - Core reads manifest.json and mounts ALL widgets into their respective slots.
// - Each widget lives at: /__partials/widgets/<id>/widget.html|widget.css|widget.js
// - Widgets can optionally add extra files in their dir; widget.js can import them.
// - We keep legacy shims so existing widget scripts do not break.
// - We do NOT introduce new parallel loaders/registries. Core is the orchestrator.
//
// What this fixes immediately:
// - "HTML loads but JS never binds" due to order/race conditions.
// - Missing globals: window.ZZXWidgets / window.ZZXWidgetRegistry / window.__ZZX_WIDGETS
// - Missing Core.onMount in older widgets.
// - Ensures: HTML -> CSS -> JS order per widget, then fires mount hooks, then boots legacy-registered widgets.
//
// IMPORTANT:
// - This expects your HUD shell (runtime.html) already exists in the DOM and contains
//   [data-widget-slot="..."] elements for each widget id.
// - If runtime.html is injected later (partials loader / ticker loader), Core will wait and retry.

(() => {
  const W = window;

  // Prevent double init
  if (W.ZZXWidgetsCore && W.ZZXWidgetsCore.__zzx_core_mounting) return;

  // ----------------------------
  // Path policy
  // ----------------------------
  // Your prod hosting is at domain root (zzx-labs.io). Root-relative is correct.
  // If you ever need subpath hosting again, set: window.ZZX = { PREFIX: "/subpath" } (no trailing slash)
  function getPrefix() {
    const p = W.ZZX?.PREFIX;
    if (typeof p === "string" && p.length) return p.replace(/\/+$/, "");
    const p2 = document.documentElement?.getAttribute("data-zzx-prefix");
    if (typeof p2 === "string" && p2.length) return p2.replace(/\/+$/, "");
    return ""; // root
  }

  function url(absPathOrUrl) {
    const s = String(absPathOrUrl || "");
    if (!s) return s;
    if (/^https?:\/\//i.test(s)) return s;
    if (!s.startsWith("/")) return s;
    const prefix = getPrefix();
    return prefix ? (prefix + s) : s;
  }

  function widgetBase(id) {
    return `/__partials/widgets/${id}`;
  }

  // ----------------------------
  // Fetch helpers
  // ----------------------------
  async function fetchText(u) {
    const r = await fetch(u, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${u}`);
    return await r.text();
  }

  async function fetchJSON(u) {
    const r = await fetch(u, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${u}`);
    return await r.json();
  }

  // ----------------------------
  // DOM helpers
  // ----------------------------
  function qs(sel, scope) {
    return (scope || document).querySelector(sel);
  }
  function qsa(sel, scope) {
    return Array.from((scope || document).querySelectorAll(sel));
  }

  function slotEl(widgetId) {
    return document.querySelector(`[data-widget-slot="${widgetId}"]`);
  }

  // More robust root resolution for widget boot code
  function getWidgetRoot(widgetId) {
    const slot = slotEl(widgetId);
    if (!slot) return null;

    // Prefer explicit wrapper inside widget HTML if present
    const explicit =
      slot.querySelector(`[data-widget-root="${widgetId}"]`) ||
      slot.querySelector(`.zzx-widget[data-widget-id="${widgetId}"]`);

    return explicit || slot;
  }

  // ----------------------------
  // Asset injectors (dedupe)
  // ----------------------------
  function keyify(k) {
    return String(k).replace(/[^a-z0-9_-]/gi, "_");
  }

  function ensureCSSOnce(key, href) {
    const k = keyify(key);
    const sel = `link[data-zzx-css="${k}"]`;
    if (document.querySelector(sel)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute("data-zzx-css", k);
    document.head.appendChild(l);
  }

  function ensureScriptOnce(key, src) {
    const k = keyify(key);
    const sel = `script[data-zzx-js="${k}"]`;
    if (document.querySelector(sel)) return Promise.resolve(true);

    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = src;
      s.defer = true;
      s.setAttribute("data-zzx-js", k);
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.body.appendChild(s);
    });
  }

  // ----------------------------
  // Lifecycle: Core.onMount + internal fire
  // ----------------------------
  const _mountHooks = []; // {id|null, fn}

  function onMount(a, b, c) {
    // Supports:
    // - onMount(fn)
    // - onMount("id", fn)
    // - onMount("id", fn, {timeoutMs})  (timeout ignored here; runtime order guarantees mount)
    if (typeof a === "function") {
      _mountHooks.push({ id: null, fn: a });
      return;
    }
    if (typeof a === "string" && typeof b === "function") {
      _mountHooks.push({ id: a, fn: b });
    }
  }

  function fireMount(widgetId, root) {
    for (const h of _mountHooks) {
      if (h.id && h.id !== widgetId) continue;
      try {
        h.fn(root, W.ZZXWidgetsCore);
      } catch (e) {
        // Quiet but visible in console
        console.warn(`[HUD] onMount hook error for ${widgetId}`, e);
      }
    }
  }

  // ----------------------------
  // Legacy compatibility: registry shims (NO second orchestrator)
  // ----------------------------
  // Some of your existing widget scripts do:
  //   window.ZZXWidgets.register("fees", { boot(root, Core){...} })
  // or:
  //   window.ZZXWidgetRegistry.register("mempool", (root, Core)=>{...})
  //
  // We'll store these definitions, and Core will boot them *after* mount.
  const _legacyDefs = new Map(); // id -> def

  function legacyRegister(id, def) {
    const wid = String(id || "").trim();
    if (!wid) return false;
    _legacyDefs.set(wid, def);
    return true;
  }

  function legacyBootOne(id) {
    const wid = String(id || "").trim();
    const def = _legacyDefs.get(wid);
    if (!def) return false;

    const root = getWidgetRoot(wid);
    if (!root) return false;

    // prevent double init
    if (root.dataset.zzxLegacyBoot === "1") return true;
    root.dataset.zzxLegacyBoot = "1";

    try {
      if (typeof def === "function") return (def(root, W.ZZXWidgetsCore), true);
      if (typeof def.boot === "function") return (def.boot(root, W.ZZXWidgetsCore), true);
      if (typeof def.init === "function") return (def.init(root, W.ZZXWidgetsCore), true);
      if (typeof def.start === "function") return (def.start(root, W.ZZXWidgetsCore), true);
    } catch (e) {
      console.warn(`[HUD] legacy widget boot failed for ${wid}`, e);
    }
    return true;
  }

  function legacyStartAll() {
    for (const id of _legacyDefs.keys()) legacyBootOne(id);
    return true;
  }

  // Expose legacy globals (aliases)
  W.ZZXWidgets = W.ZZXWidgets || {};
  if (typeof W.ZZXWidgets.register !== "function") W.ZZXWidgets.register = legacyRegister;
  if (typeof W.ZZXWidgets.start !== "function") W.ZZXWidgets.start = legacyStartAll;

  W.ZZXWidgetRegistry = W.ZZXWidgetRegistry || {};
  if (typeof W.ZZXWidgetRegistry.register !== "function") W.ZZXWidgetRegistry.register = legacyRegister;
  if (typeof W.ZZXWidgetRegistry.start !== "function") W.ZZXWidgetRegistry.start = legacyStartAll;

  W.__ZZX_WIDGETS = W.__ZZX_WIDGETS || {};
  if (typeof W.__ZZX_WIDGETS.start !== "function") W.__ZZX_WIDGETS.start = legacyStartAll;

  // ----------------------------
  // Core orchestrator: manifest-driven mounting
  // ----------------------------
  const MANIFEST_URL = url("/__partials/widgets/manifest.json");

  function widgetUrls(id) {
    const base = widgetBase(id);
    return {
      html: url(`${base}/widget.html`),
      css: url(`${base}/widget.css`),
      js:  url(`${base}/widget.js`),
    };
  }

  function renderSlotError(slot, id, msg) {
    if (!slot) return;
    slot.innerHTML = `
      <div class="btc-card">
        <div class="btc-card__title">${escapeHTML(id)}</div>
        <div class="btc-card__sub">${escapeHTML(msg)}</div>
      </div>
    `;
  }

  function escapeHTML(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function mountWidget(id) {
    const slot = slotEl(id);
    if (!slot) return; // no slot on this page (ok)

    // prevent double mount
    if (slot.dataset.zzxMounted === "1") return;
    slot.dataset.zzxMounted = "1";

    const { html, css, js } = widgetUrls(id);

    // 1) HTML
    try {
      const markup = await fetchText(html);
      slot.innerHTML = markup;
      slot.setAttribute("data-widget-id", id);
    } catch (e) {
      // Special hint for your current failure mode:
      // "hashrate-by-nation" says widget.html not found -> directory missing or id mismatch.
      renderSlotError(slot, id, `HTML load failed (${e?.message || "unknown"})`);
      console.warn(`[HUD] ${id} html failed:`, e);
      return;
    }

    // 2) CSS (optional but should exist for consistent appearance)
    try {
      ensureCSSOnce(`wcss:${id}`, css);
    } catch (e) {
      console.warn(`[HUD] ${id} css inject failed:`, e);
    }

    // 3) JS (must run AFTER HTML exists)
    const ok = await ensureScriptOnce(`wjs:${id}`, js);
    if (!ok) {
      console.warn(`[HUD] ${id} js failed to load: ${js}`);
      // Keep going; HTML+CSS still visible.
    }

    // 4) Fire lifecycle hooks (widgets using Core.onMount("id", ...) will boot here)
    try {
      const root = getWidgetRoot(id);
      fireMount(id, root);
    } catch (_) {}

    // 5) Boot legacy-registered widgets (widgets using ZZXWidgets.register(...) boot here)
    try {
      legacyBootOne(id);
    } catch (_) {}
  }

  async function mountAllFromManifest(manifest) {
    const list = (manifest?.widgets || [])
      .filter((w) => w && w.id)
      .slice()
      .sort((a, b) => (a.priority ?? 9999) - (b.priority ?? 9999));

    for (const w of list) {
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

  // ----------------------------
  // Wait for HUD shell (runtime.html) to exist, then mount all
  // ----------------------------
  async function waitForHudShell(timeoutMs = 8000) {
    const t0 = performance.now();
    return new Promise((resolve) => {
      (function tick() {
        // We consider HUD shell "present" if at least one widget slot exists.
        const anySlot = document.querySelector("[data-widget-slot]");
        if (anySlot) return resolve(true);
        if (performance.now() - t0 >= timeoutMs) return resolve(false);
        requestAnimationFrame(tick);
      })();
    });
  }

  async function boot() {
    // If your core CSS isn’t already loaded by ticker-loader, load it here as safety.
    // (This does NOT break anything if already present.)
    try {
      ensureCSSOnce("zzx-core-css", url("/__partials/widgets/_core/widget-core.css"));
    } catch (_) {}

    // Wait for HUD skeleton to exist (it may be injected by your ticker/hud loader)
    const okShell = await waitForHudShell();
    if (!okShell) {
      console.warn("[HUD] core: no widget slots found (runtime.html not mounted?)");
      return;
    }

    // Load manifest and mount
    let manifest = null;
    try {
      manifest = await fetchJSON(MANIFEST_URL);
    } catch (e) {
      console.warn("[HUD] manifest.json failed:", e);
      // Fallback: mount whatever slots exist on the page
      manifest = {
        widgets: qsa("[data-widget-slot]").map((el) => ({
          id: el.getAttribute("data-widget-slot"),
          enabled: true,
          priority: 999,
        })),
      };
    }

    await mountAllFromManifest(manifest);

    // Final: some legacy scripts expect a "start()" call after everything is present.
    // This is now safe and idempotent.
    try { W.__ZZX_WIDGETS?.start?.(); } catch (_) {}
    try { W.ZZXWidgets?.start?.(); } catch (_) {}
    try { W.ZZXWidgetRegistry?.start?.(); } catch (_) {}
  }

  // ----------------------------
  // Public Core API
  // ----------------------------
  W.ZZXWidgetsCore = {
    __zzx_ok: true,
    __zzx_core_mounting: true,
    __version: "core-manifest-mounter-1.0.0",

    // paths
    getPrefix,
    url,
    widgetBase,

    // fetch
    fetchText: (p) => fetchText(url(p)),
    fetchJSON: (p) => fetchJSON(url(p)),

    // dom
    qs,
    qsa,
    getWidgetRoot,

    // lifecycle
    onMount,

    // legacy registry helpers (compat)
    legacyRegister,
    legacyBootOne,
    legacyStartAll,

    // orchestrator (exposed for manual debugging)
    mountWidget,
    boot,
  };

  // Boot once DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
