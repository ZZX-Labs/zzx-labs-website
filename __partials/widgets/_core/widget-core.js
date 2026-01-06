// __partials/widgets/_core/widget-core.js
// ZZX Widgets Core — MANIFEST-DRIVEN MOUNTER (DROP-IN REPLACEMENT)
//
// This version fixes the actual breakpoints you described WITHOUT adding new files:
// 1) Your wrapper HTML uses data-widget-slot="id" but your CSS targets .btc-slot[data-widget="id"].
//    Core now ALWAYS mirrors the id onto data-widget so existing CSS applies reliably.
// 2) You deleted runtime/*, but manifest/HTML still reference "runtime".
//    Core now treats "runtime" as BUILT-IN (no network fetch), providing HUD controls.
// 3) Your widgets register via window.ZZXWidgets.register("id", { mount(), start(ctx) })
//    Core now boots those correctly by calling mount(root) then start(ctx) with a real ctx.
// 4) Core provides ctx.fetchJSON + ctx.api.COINBASE_SPOT so bitcoin-ticker works consistently.
//
// No external fonts. No new orchestrators. No runtime.js.

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
    let p = W.ZZX?.PREFIX;
    if (typeof p === "string") p = p.trim();
    if (!p) p = D.documentElement?.getAttribute("data-zzx-prefix") || "";
    p = String(p || "").trim().replace(/\/+$/, "");
    if (p === "." || p === "./") return "";
    return p;
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
  //   A) [data-widget-slot="id"]         (your wrapper)
  //   B) .btc-slot[data-widget="id"]     (legacy)
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

    // CRITICAL: mirror to data-widget so your existing CSS rules match
    // (your wrapper uses data-widget-slot; your CSS uses data-widget)
    try { slot.setAttribute("data-widget", id); } catch (_) {}

    let w =
      slot.querySelector?.(`[data-widget-root="${id}"]`) ||
      slot.querySelector?.(`.zzx-widget[data-widget-id="${id}"]`);

    if (w) return w;

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
      // head keeps execution ordering more predictable vs body
      (D.head || D.documentElement).appendChild(s);
    });
  }

  // ----------------------------
  // Lifecycle: Core.onMount + internal fire
  // ----------------------------
  const _mountHooks = []; // {id|null, fn}

  function onMount(a, b) {
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
  // Context (what widgets expect)
  // ----------------------------
  const ctx = {
    // allow widgets to call ctx.fetchJSON(url)
    fetchJSON: async (u) => fetchJSON(url(u)),
    fetchText: async (u) => fetchText(url(u)),

    // canonical API endpoints (can be overridden elsewhere)
    api: Object.assign(
      {
        COINBASE_SPOT: "https://api.coinbase.com/v2/prices/spot?currency=USD",
      },
      W.ZZX?.api || W.ZZX?.API || {}
    ),
  };

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

  // IMPORTANT: support object-style widgets: { mount(root), start(ctx), stop() }
  function legacyBootOne(id) {
    const wid = String(id || "").trim();
    const def = _legacyDefs.get(wid);
    if (!def) return false;

    const root = getWidgetRoot(wid);
    if (!root) return false;

    if (root.dataset.zzxLegacyBoot === "1") return true;
    root.dataset.zzxLegacyBoot = "1";

    try {
      // function-style widgets: fn(root, core)
      if (typeof def === "function") {
        def(root, W.ZZXWidgetsCore);
        return true;
      }

      // object-style widgets (your current pattern)
      if (def && typeof def.mount === "function") {
        try { def.mount(root, W.ZZXWidgetsCore); } catch (_) {}
      }

      if (def && typeof def.start === "function") {
        def.start(ctx, W.ZZXWidgetsCore);
        return true;
      }

      // older aliases
      if (def && typeof def.boot === "function") { def.boot(root, W.ZZXWidgetsCore); return true; }
      if (def && typeof def.init === "function") { def.init(root, W.ZZXWidgetsCore); return true; }

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

  // ----------------------------
  // Built-in runtime bar (NO runtime/ folder needed)
  // ----------------------------
  function mountRuntimeBuiltIn(wrapper) {
    if (!wrapper) return;
    if (wrapper.dataset.zzxRuntimeBuiltIn === "1") return;
    wrapper.dataset.zzxRuntimeBuiltIn = "1";

    wrapper.innerHTML = `
      <div class="btc-card">
        <div class="btc-card__title">HUD</div>
        <div style="display:flex;flex-wrap:wrap;gap:.45rem;justify-content:center;align-items:center">
          <button type="button" class="zzx-widgets__btn" data-zzx-hud="full">Full</button>
          <button type="button" class="zzx-widgets__btn" data-zzx-hud="ticker-only">Ticker</button>
          <button type="button" class="zzx-widgets__btn" data-zzx-hud="hidden">Hide</button>
          <button type="button" class="zzx-widgets__btn" data-zzx-hud="reset">Reset</button>
        </div>
      </div>
    `;

    const bind = (sel, fn) => {
      const b = wrapper.querySelector(sel);
      if (!b) return;
      if (b.dataset.zzxBound === "1") return;
      b.dataset.zzxBound = "1";
      b.addEventListener("click", fn);
    };

    bind('[data-zzx-hud="full"]',       () => W.ZZXHUD?.write?.("full"));
    bind('[data-zzx-hud="ticker-only"]',() => W.ZZXHUD?.write?.("ticker-only"));
    bind('[data-zzx-hud="hidden"]',     () => W.ZZXHUD?.write?.("hidden"));
    bind('[data-zzx-hud="reset"]',      () => W.ZZXHUD?.reset?.());
  }

  async function mountWidget(id) {
    const slot = slotEl(id);
    if (!slot) return;

    const wrapper = ensureWidgetWrapper(slot, id);
    if (!wrapper) return;

    // If the shell reinjects, wrapper may be new. Guard per-wrapper instance.
    if (wrapper.dataset.zzxMounted === "1") return;
    wrapper.dataset.zzxMounted = "1";

    // Built-in runtime (no fetches, no 404 spam)
    if (id === "runtime") {
      mountRuntimeBuiltIn(wrapper);

      // still apply/refresh HUD state once hud-state exists
      try { W.ZZXHUD?.write?.(W.ZZXHUD?.read?.().mode || "full"); } catch (_) {}
      return;
    }

    const { html, css, js } = widgetUrls(id);

    // 1) HTML
    try {
      const markup = await fetchText(html);
      wrapper.innerHTML = markup;
      slot.setAttribute("data-widget-id", id);
      slot.dataset.mountReady = "1";
    } catch (e) {
      slot.dataset.mountReady = "0";
      renderSlotError(wrapper, id, `HTML load failed (${e?.message || "unknown"})`);
      console.warn(`[HUD] ${id} html failed:`, e);
      return;
    }

    // 2) CSS
    try { ensureCSSOnce(`wcss:${id}`, css); } catch (e) {
      console.warn(`[HUD] ${id} css inject failed:`, e);
    }

    // 3) JS (must run AFTER HTML exists)
    const ok = await ensureScriptOnce(`wjs:${id}`, js);
    if (!ok) console.warn(`[HUD] ${id} js failed to load: ${js}`);

    // 4) Fire lifecycle hooks
    try { fireMount(id, getWidgetRoot(id)); } catch (_) {}

    // 5) Boot legacy-registered widgets (mount/start)
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
    // Shared primitives
    try { ensureCSSOnce("btc-wrapper", url(`/__partials/bitcoin-ticker-widget.css${assetVersionQS()}`)); } catch (_) {}
    try { ensureCSSOnce("zzx-core-css", url(`/__partials/widgets/_core/widget-core.css${assetVersionQS()}`)); } catch (_) {}

    const okShell = await waitForHudShell();
    if (!okShell) {
      console.warn("[HUD] core: no widget slots found (HUD shell not mounted?)");
      return;
    }

    let manifest = null;
    try {
      manifest = await fetchJSON(MANIFEST_URL);
    } catch (e) {
      console.warn("[HUD] manifest.json failed:", e);
      const fallback = [
        ...qsa("[data-widget-slot]").map((el) => el.getAttribute("data-widget-slot")),
        ...qsa(".btc-slot[data-widget]").map((el) => el.getAttribute("data-widget")),
      ].filter(Boolean);

      manifest = {
        widgets: fallback.map((id) => ({ id, enabled: true, priority: 999 })),
      };
    }

    await mountAllFromManifest(manifest);

    // Start all registered widgets (now that their scripts have loaded)
    try { W.__ZZX_WIDGETS?.start?.(); } catch (_) {}
    try { W.ZZXWidgets?.start?.(); } catch (_) {}
    try { W.ZZXWidgetRegistry?.start?.(); } catch (_) {}
  }

  // ----------------------------
  // Observe reinjections (HUD shell replaced)
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
    __version: "core-manifest-mounter-1.0.3",

    // paths
    getPrefix,
    url,
    widgetBase,

    // ctx
    ctx,

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
