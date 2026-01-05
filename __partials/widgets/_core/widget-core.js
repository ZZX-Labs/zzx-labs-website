// __partials/widgets/_core/widget-core.js
// ZZX Widgets Core — MANIFEST-DRIVEN MOUNTER (DROP-IN REPLACEMENT)
//
// KEEPING YOUR ARCHITECTURE EXACTLY:
// - Core reads manifest.json and mounts ALL widgets into their respective slots.
// - Each widget lives at: /__partials/widgets/<id>/widget.html|widget.css|widget.js
// - Core is the orchestrator. No parallel registries/loaders.
// - Preserve legacy shims (ZZXWidgets / ZZXWidgetRegistry / __ZZX_WIDGETS).
//
// FIXES (minimal but decisive):
// 1) ALWAYS load shared primitives CSS so injected widget HTML is styled.
//    This addresses: “raw HTML, no CSS, flashes then disappears”.
//      - /__partials/bitcoin-ticker-widget.css (btc-card primitives + HUD hide/show rules)
//      - /__partials/widgets/_core/widget-core.css (core rail/layout)
// 2) Wrap each mounted widget in a stable container so CSS can target reliably:
//      <div class="zzx-widget zzx-widget--<id>" data-widget-root="<id>" data-widget-id="<id>">...</div>
//    This also prevents slot fragility if widget HTML doesn't provide a root element.
// 3) Add a MutationObserver so if runtime/partials reinject the HUD shell, Core remounts
//    (your old slot.dataset guard blocks remount otherwise).
//
// IMPORTANT:
// - This expects your HUD shell exists and contains either:
//      A) [data-widget-slot="..."] elements (new), OR
//      B) .btc-slot[data-widget="..."] elements (current wrapper)
// - If HUD shell is injected later (partials loader / ticker loader), Core waits & retries.

(() => {
  "use strict";

  const W = window;
  const D = document;

  // Prevent double init
  if (W.ZZXWidgetsCore && W.ZZXWidgetsCore.__zzx_core_mounting) return;

  // ----------------------------
  // Prefix policy
  // ----------------------------
  function getPrefix() {
    const p = W.ZZX?.PREFIX;
    if (typeof p === "string" && p.length) return p.replace(/\/+$/, "");
    const p2 = D.documentElement?.getAttribute("data-zzx-prefix");
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
  // Asset versioning (optional)
  // ----------------------------
  function assetVersionQS() {
    const v = D.querySelector('meta[name="asset-version"]')?.getAttribute("content") || "";
    const vv = String(v).trim();
    return vv ? `?v=${encodeURIComponent(vv)}` : "";
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
    return (scope || D).querySelector(sel);
  }
  function qsa(sel, scope) {
    return Array.from((scope || D).querySelectorAll(sel));
  }

  // Support BOTH slot conventions:
  //   A) [data-widget-slot="id"]
  //   B) .btc-slot[data-widget="id"]
  function slotEl(widgetId) {
    const id = String(widgetId || "").trim();
    if (!id) return null;
    return (
      D.querySelector(`[data-widget-slot="${id}"]`) ||
      D.querySelector(`.btc-slot[data-widget="${id}"]`) ||
      null
    );
  }

  function sanitizeClassToken(s) {
    return String(s || "")
      .trim()
      .replace(/[^a-z0-9_-]/gi, "-")
      .replace(/-+/g, "-");
  }

  // Ensure a stable wrapper exists for each widget mount.
  function ensureWidgetWrapper(slot, widgetId) {
    const id = String(widgetId || "").trim();
    if (!slot || !id) return null;

    // Prefer explicit wrapper already present
    let w =
      slot.querySelector?.(`[data-widget-root="${id}"]`) ||
      slot.querySelector?.(`.zzx-widget[data-widget-id="${id}"]`);

    if (w) return w;

    // Create wrapper and replace slot contents (slot remains)
    w = D.createElement("div");
    w.className = `zzx-widget zzx-widget--${sanitizeClassToken(id)}`;
    w.setAttribute("data-widget-root", id);
    w.setAttribute("data-widget-id", id);

    slot.textContent = "";
    slot.appendChild(w);
    return w;
  }

  function getWidgetRoot(widgetId) {
    const slot = slotEl(widgetId);
    if (!slot) return null;

    const explicit =
      slot.querySelector?.(`[data-widget-root="${widgetId}"]`) ||
      slot.querySelector?.(`.zzx-widget[data-widget-id="${widgetId}"]`);

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
    if (D.querySelector(sel)) return;
    const l = D.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute("data-zzx-css", k);
    D.head.appendChild(l);
  }

  function ensureScriptOnce(key, src) {
    const k = keyify(key);
    const sel = `script[data-zzx-js="${k}"]`;
    if (D.querySelector(sel)) return Promise.resolve(true);

    return new Promise((resolve) => {
      const s = D.createElement("script");
      s.src = src;
      s.defer = true;
      s.setAttribute("data-zzx-js", k);
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      D.body.appendChild(s);
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
      try { h.fn(root, W.ZZXWidgetsCore); }
      catch (e) { console.warn(`[HUD] onMount hook error for ${widgetId}`, e); }
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

    // prevent double init
    if (root.dataset.zzxLegacyBoot === "1") return true;
    root.dataset.zzxLegacyBoot = "1";

    try {
      if (typeof def === "function") { def(root, W.ZZXWidgetsCore); return true; }
      if (typeof def.boot === "function") { def.boot(root, W.ZZXWidgetsCore); return true; }
      if (typeof def.init === "function") { def.init(root, W.ZZXWidgetsCore); return true; }
      if (typeof def.start === "function") { def.start(root, W.ZZXWidgetsCore); return true; }
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
  if (typeof W.__ZZX_WIDGETS.register !== "function") W.__ZZX_WIDGETS.register = legacyRegister;
  if (typeof W.__ZZX_WIDGETS.start !== "function") W.__ZZX_WIDGETS.start = legacyStartAll;

  // ----------------------------
  // Core orchestrator: manifest-driven mounting
  // ----------------------------
  const MANIFEST_URL = url(`/__partials/widgets/manifest.json${assetVersionQS()}`);

  function widgetUrls(id) {
    const base = widgetBase(id);
    const ver = assetVersionQS();
    return {
      html: url(`${base}/widget.html${ver}`),
      css:  url(`${base}/widget.css${ver}`),
      js:   url(`${base}/widget.js${ver}`),
    };
  }

  function escapeHTML(s) {
    return String(s ?? "")
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
        <div class="btc-card__sub">${escapeHTML(msg || "load failed")}</div>
      </div>
    `;
  }

  async function mountWidget(id) {
    const slot = slotEl(id);
    if (!slot) return; // no slot on this page (ok)

    const wrapper = ensureWidgetWrapper(slot, id);
    if (!wrapper) return;

    // wrapper-local mount guard (survives slot reinjection)
    if (wrapper.dataset.zzxMounted === "1") return;
    wrapper.dataset.zzxMounted = "1";

    const { html, css, js } = widgetUrls(id);

    // 1) HTML
    try {
      const markup = await fetchText(html);
      wrapper.innerHTML = markup;
      slot.setAttribute("data-widget-id", id);
      // also mark slot for debugging/compat
      slot.dataset.mountReady = "1";
    } catch (e) {
      slot.dataset.mountReady = "0";
      renderSlotError(wrapper, id, `HTML load failed (${e?.message || "unknown"})`);
      console.warn(`[HUD] ${id} html failed:`, e);
      return;
    }

    // 2) CSS (optional but should exist)
    try { ensureCSSOnce(`wcss:${id}`, css); } catch (e) {
      console.warn(`[HUD] ${id} css inject failed:`, e);
    }

    // 3) JS (must run AFTER HTML exists)
    const ok = await ensureScriptOnce(`wjs:${id}`, js);
    if (!ok) {
      console.warn(`[HUD] ${id} js failed to load: ${js}`);
      // Keep HTML+CSS visible; do not return.
    }

    // 4) Fire lifecycle hooks
    try { fireMount(id, getWidgetRoot(id)); } catch (_) {}

    // 5) Boot legacy-registered widgets
    try { legacyBootOne(id); } catch (_) {}
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
        const anySlot =
          D.querySelector("[data-widget-slot]") ||
          D.querySelector(".btc-slot[data-widget]");
        if (anySlot) return resolve(true);
        if (performance.now() - t0 >= timeoutMs) return resolve(false);
        requestAnimationFrame(tick);
      })();
    });
  }

  async function boot() {
    // CRITICAL: shared primitives that widgets rely on
    try { ensureCSSOnce("btc-wrapper", url(`/__partials/bitcoin-ticker-widget.css${assetVersionQS()}`)); } catch (_) {}
    try { ensureCSSOnce("zzx-core-css", url(`/__partials/widgets/_core/widget-core.css${assetVersionQS()}`)); } catch (_) {}

    const okShell = await waitForHudShell();
    if (!okShell) {
      console.warn("[HUD] core: no widget slots found (HUD shell not mounted?)");
      return;
    }

    // Load manifest and mount
    let manifest = null;
    try {
      manifest = await fetchJSON(MANIFEST_URL);
    } catch (e) {
      console.warn("[HUD] manifest.json failed:", e);
      // Fallback: mount whatever slots exist
      const fallback = [
        ...qsa("[data-widget-slot]").map((el) => el.getAttribute("data-widget-slot")),
        ...qsa(".btc-slot[data-widget]").map((el) => el.getAttribute("data-widget")),
      ].filter(Boolean);

      manifest = {
        widgets: fallback.map((id) => ({
          id,
          enabled: true,
          priority: 999,
        })),
      };
    }

    await mountAllFromManifest(manifest);

    // Final: some legacy scripts expect a start() after everything is present.
    try { W.__ZZX_WIDGETS?.start?.(); } catch (_) {}
    try { W.ZZXWidgets?.start?.(); } catch (_) {}
    try { W.ZZXWidgetRegistry?.start?.(); } catch (_) {}
  }

  // ----------------------------
  // Observe reinjections: if runtime/partials replace HUD slots, remount safely
  // ----------------------------
  function observeHudSlots() {
    if (D.__zzxWidgetCoreObserver) return;

    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type !== "childList") continue;

        const added = Array.from(m.addedNodes || []);
        if (!added.length) continue;

        const hasSlot = added.some((n) => {
          if (n.nodeType !== 1) return false;
          return (
            (typeof n.matches === "function" && (n.matches("[data-widget-slot]") || n.matches(".btc-slot[data-widget]"))) ||
            (typeof n.querySelector === "function" && (n.querySelector("[data-widget-slot]") || n.querySelector(".btc-slot[data-widget]")))
          );
        });

        if (hasSlot) {
          setTimeout(() => { try { boot(); } catch (_) {} }, 0);
          break;
        }
      }
    });

    mo.observe(D.documentElement, { childList: true, subtree: true });
    D.__zzxWidgetCoreObserver = mo;
  }

  // ----------------------------
  // Public Core API
  // ----------------------------
  W.ZZXWidgetsCore = {
    __zzx_ok: true,
    __zzx_core_mounting: true,
    __version: "core-manifest-mounter-1.0.2",

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

    // legacy registry helpers
    legacyRegister,
    legacyBootOne,
    legacyStartAll,

    // orchestrator
    mountWidget,
    boot,
  };

  // Boot once DOM is ready + observe slot reinjections
  if (D.readyState === "loading") {
    D.addEventListener("DOMContentLoaded", () => {
      boot();
      observeHudSlots();
    }, { once: true });
  } else {
    boot();
    observeHudSlots();
  }
})();
