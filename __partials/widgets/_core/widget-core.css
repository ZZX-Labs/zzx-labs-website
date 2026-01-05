// __partials/widgets/_core/widget-core.js
// ZZX Widgets Core — MANIFEST-DRIVEN MOUNTER (DROP-IN REPLACEMENT)
//
// PRIMARY FIXES FOR YOUR CURRENT FAILURE MODE:
// 1) Guarantees the shared primitives CSS is loaded (btc-card/rail/HUD wrapper styles)
//    BEFORE/while widgets mount, so you don’t get “raw HTML flash then disappear”.
// 2) Wraps each widget mount in a stable container:
//        <div class="zzx-widget zzx-widget--<id>" data-widget-root="<id>" data-widget-id="<id>"> … </div>
//    This gives CSS a reliable target and avoids "display: contents" / slot fragility issues.
// 3) Adds a MutationObserver so if runtime reinjects the HUD shell (or replaces slots),
//    the widgets re-mount (your previous slot.dataset flags would otherwise block).
// 4) Keeps legacy shims (ZZXWidgets / ZZXWidgetRegistry) but does NOT introduce a second orchestrator.
// 5) Maintains the required load order per widget: HTML -> CSS -> JS -> hooks.
//
// EXPECTATIONS:
// - Your HUD skeleton (runtime.html) provides [data-widget-slot="<id>"] for each widget.
// - manifest.json matches your posted structure (version/defaultMode/widgets[]).

(() => {
  const W = window;

  // Prevent double init
  if (W.ZZXWidgetsCore && W.ZZXWidgetsCore.__zzx_core_mounting) return;

  // ----------------------------
  // Path policy
  // ----------------------------
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

  function sanitizeClassToken(s) {
    return String(s || "").trim().replace(/[^a-z0-9_-]/gi, "-").replace(/-+/g, "-");
  }

  // Stable wrapper per widget (gives CSS hooks and prevents slot fragility)
  function ensureWidgetWrapper(slot, widgetId) {
    const id = String(widgetId || "").trim();
    if (!slot || !id) return null;

    // If wrapper already exists, use it.
    let w = slot.querySelector(`[data-widget-root="${id}"]`);
    if (w) return w;

    // Create wrapper
    w = document.createElement("div");
    w.className = `zzx-widget zzx-widget--${sanitizeClassToken(id)}`;
    w.setAttribute("data-widget-root", id);
    w.setAttribute("data-widget-id", id);

    // Do not destroy any existing nodes if present (rare); replace cleanly.
    slot.textContent = "";
    slot.appendChild(w);

    return w;
  }

  // Root resolution for widget boot code
  function getWidgetRoot(widgetId) {
    const slot = slotEl(widgetId);
    if (!slot) return null;
    return (
      slot.querySelector(`[data-widget-root="${widgetId}"]`) ||
      slot.querySelector(`.zzx-widget[data-widget-id="${widgetId}"]`) ||
      slot
    );
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

  function onMount(a, b) {
    // - onMount(fn)
    // - onMount("id", fn)
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
        console.warn(`[HUD] onMount hook error for ${widgetId}`, e);
      }
    }
  }

  // ----------------------------
  // Legacy compatibility: registry shims
  // ----------------------------
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

  function escapeHTML(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderSlotError(wrapper, id, msg) {
    if (!wrapper) return;
    wrapper.innerHTML = `
      <div class="btc-card">
        <div class="btc-card__title">${escapeHTML(id)}</div>
        <div class="btc-card__sub">${escapeHTML(msg)}</div>
      </div>
    `;
  }

  async function mountWidget(id) {
    const slot = slotEl(id);
    if (!slot) return; // no slot on this page (ok)

    // If the slot was replaced, previous dataset flags are irrelevant.
    // Use wrapper flag instead.
    const wrapper = ensureWidgetWrapper(slot, id);
    if (!wrapper) return;

    if (wrapper.dataset.zzxMounted === "1") return;
    wrapper.dataset.zzxMounted = "1";

    const { html, css, js } = widgetUrls(id);

    // 1) HTML -> goes into wrapper (NOT directly into slot)
    try {
      const markup = await fetchText(html);
      wrapper.innerHTML = markup;
    } catch (e) {
      renderSlotError(wrapper, id, `HTML load failed (${e?.message || "unknown"})`);
      console.warn(`[HUD] ${id} html failed:`, e);
      return;
    }

    // 2) CSS (optional, but must be prefixed correctly)
    try {
      ensureCSSOnce(`wcss:${id}`, css);
    } catch (e) {
      console.warn(`[HUD] ${id} css inject failed:`, e);
    }

    // 3) JS (AFTER HTML exists)
    const ok = await ensureScriptOnce(`wjs:${id}`, js);
    if (!ok) {
      console.warn(`[HUD] ${id} js failed to load: ${js}`);
      // keep going; HTML+CSS still visible
    }

    // 4) Fire onMount hooks
    try {
      const root = getWidgetRoot(id);
      fireMount(id, root);
    } catch (_) {}

    // 5) Boot legacy-registered widget defs (if any)
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
  // Wait for HUD shell to exist, then mount all
  // ----------------------------
  async function waitForHudShell(timeoutMs = 8000) {
    const t0 = performance.now();
    return new Promise((resolve) => {
      (function tick() {
        const anySlot = document.querySelector("[data-widget-slot]");
        if (anySlot) return resolve(true);
        if (performance.now() - t0 >= timeoutMs) return resolve(false);
        requestAnimationFrame(tick);
      })();
    });
  }

  // ----------------------------
  // Boot
  // ----------------------------
  async function boot() {
    // SAFETY: ensure shared primitives CSS is present.
    // This is the #1 reason you see “raw HTML / no css” even when JS runs.
    try { ensureCSSOnce("btc-wrapper", url("/__partials/bitcoin-ticker-widget.css")); } catch (_) {}
    try { ensureCSSOnce("zzx-core-css", url("/__partials/widgets/_core/widget-core.css")); } catch (_) {}

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
      // Fallback: mount whatever slots exist
      manifest = {
        widgets: qsa("[data-widget-slot]").map((el) => ({
          id: el.getAttribute("data-widget-slot"),
          enabled: true,
          priority: 999,
        })),
      };
    }

    await mountAllFromManifest(manifest);

    // Some legacy scripts expect a final "start()"
    try { W.__ZZX_WIDGETS?.start?.(); } catch (_) {}
    try { W.ZZXWidgets?.start?.(); } catch (_) {}
    try { W.ZZXWidgetRegistry?.start?.(); } catch (_) {}
  }

  // ----------------------------
  // Re-mount if runtime reinjects/replaces slots
  // ----------------------------
  function observeHud() {
    const mo = new MutationObserver((mutations) => {
      // If any widget slot is added or replaced, ensure it gets mounted.
      for (const m of mutations) {
        if (m.type !== "childList") continue;

        const added = Array.from(m.addedNodes || []);
        if (!added.length) continue;

        // If any new [data-widget-slot] appears, boot/mount (idempotent).
        const hasSlot =
          added.some((n) => n.nodeType === 1 && (n.matches?.("[data-widget-slot]") || n.querySelector?.("[data-widget-slot]")));
        if (hasSlot) {
          // Defer slightly so DOM settles
          setTimeout(() => { try { boot(); } catch (_) {} }, 0);
          break;
        }
      }
    });

    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  // ----------------------------
  // Public Core API
  // ----------------------------
  W.ZZXWidgetsCore = {
    __zzx_ok: true,
    __zzx_core_mounting: true,
    __version: "core-manifest-mounter-1.0.1",

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

    // legacy
    legacyRegister,
    legacyBootOne,
    legacyStartAll,

    // orchestrator
    mountWidget,
    boot,
  };

  // Boot once DOM is ready + observe reinjections
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { boot(); observeHud(); }, { once: true });
  } else {
    boot();
    observeHud();
  }
})();
