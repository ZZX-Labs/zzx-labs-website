// __partials/widgets/runtime.js
// ZZX Widgets Runtime — SINGLE orchestrator (DROP-IN, HUD FIXED)
//
// Goals:
// 1) Read manifest.json and mount each widget into its [data-widget-slot="<id>"] slot.
// 2) Mount order: widget.html → widget.css → widget.js (JS runs AFTER DOM exists).
// 3) Provide ONE unified legacy-compatible registry so existing widget scripts keep working
//    (object-method "this" binding preserved; ctx.api provided).
// 4) Prefix-safe URL joins (prevents accidental protocol-relative //__partials/... bugs).
// 5) Avoid racing header/nav/footer injection: waits briefly for partials readiness.
//
// HUD FIXES:
// - HUD buttons ACTUALLY change state (full / ticker / hidden / reset)
// - State persisted + restored
// - Handle shows only in hidden mode
// - Works even if window.ZZXHUD is missing (shim)
// - Delegated binding = no double-bind, works for late-injected DOM

(function () {
  "use strict";

  const W = window;

  // Prevent double boot
  if (W.__ZZX_WIDGETS_RUNTIME_BOOTED) return;
  W.__ZZX_WIDGETS_RUNTIME_BOOTED = true;

  const D = document;

  /* ---------------------------
   * HUD (minimal, deterministic)
   * ------------------------- */
  const HUD_STORAGE_KEY = "zzx.hud.mode";
  const HUD_DEFAULT_MODE = "full";

  const qs  = (s, r) => (r || D).querySelector(s);
  const qsa = (s, r) => Array.from((r || D).querySelectorAll(s));

  function normalizeMode(m) {
    const s = String(m || "").toLowerCase();
    if (s === "full" || s === "ticker" || s === "hidden") return s;
    // tolerate older aliases
    if (s === "visible") return "full";
    return HUD_DEFAULT_MODE;
  }

  function hudReadRaw() {
    try {
      return normalizeMode(localStorage.getItem(HUD_STORAGE_KEY) || HUD_DEFAULT_MODE);
    } catch (_) {
      return HUD_DEFAULT_MODE;
    }
  }

  function hudWriteRaw(mode) {
    const m = normalizeMode(mode);
    try { localStorage.setItem(HUD_STORAGE_KEY, m); } catch (_) {}
    return { mode: m };
  }

  function ensureZZXHUD() {
    if (W.ZZXHUD && typeof W.ZZXHUD.read === "function" && typeof W.ZZXHUD.write === "function") {
      if (!W.ZZXHUD.normalize) W.ZZXHUD.normalize = normalizeMode;
      if (!W.ZZXHUD.reset) {
        W.ZZXHUD.reset = function () { return this.write(HUD_DEFAULT_MODE); };
      }
      return W.ZZXHUD;
    }

    // Shim so HUD is never dead
    W.ZZXHUD = {
      normalize: normalizeMode,
      read()  { return { mode: hudReadRaw() }; },
      write(m){ return hudWriteRaw(m); },
      reset() { return hudWriteRaw(HUD_DEFAULT_MODE); }
    };

    return W.ZZXHUD;
  }

  function applyHUDMode(mode) {
    const m = normalizeMode(mode);

    const root   = qs("[data-hud-root]");
    const handle = qs("[data-hud-handle]");

    if (root) root.setAttribute("data-hud-state", m);
    if (handle) handle.style.display = (m === "hidden") ? "flex" : "none";

    const lbl = qs("[data-runtime-mode]");
    if (lbl) lbl.textContent = m;
  }

  function currentHUDMode() {
    ensureZZXHUD();
    try { return normalizeMode(W.ZZXHUD.read()?.mode); }
    catch (_) { return HUD_DEFAULT_MODE; }
  }

  function setHUDMode(mode) {
    ensureZZXHUD();
    const res = W.ZZXHUD.write(mode);
    const m = normalizeMode(res?.mode || mode);
    applyHUDMode(m);
    return m;
  }

  function resetHUDMode() {
    ensureZZXHUD();
    const res = W.ZZXHUD.reset();
    const m = normalizeMode(res?.mode || HUD_DEFAULT_MODE);
    applyHUDMode(m);
    return m;
  }

  function bindOnce(target, key, evt, fn, opts) {
    if (!target) return;
    const k = "__zzx_bound_" + key;
    if (target[k]) return;
    target[k] = true;
    target.addEventListener(evt, fn, opts);
  }

  function bindHUDControls() {
    ensureZZXHUD();

    // delegated clicks for:
    // - [data-hud-mode="full|ticker|hidden"]
    // - [data-hud-action="reset"]
    // - [data-hud-show]
    // - [data-hud-handle]
    bindOnce(D, "hud_click", "click", (ev) => {
      const t = ev.target;

      const modeBtn = t?.closest?.("[data-hud-mode]");
      if (modeBtn) {
        ev.preventDefault?.();
        setHUDMode(modeBtn.getAttribute("data-hud-mode"));
        return;
      }

      const resetBtn = t?.closest?.('[data-hud-action="reset"]');
      if (resetBtn) {
        ev.preventDefault?.();
        resetHUDMode();
        return;
      }

      const showBtn = t?.closest?.("[data-hud-show]");
      if (showBtn) {
        ev.preventDefault?.();
        setHUDMode("full");
        return;
      }

      const handle = t?.closest?.("[data-hud-handle]");
      if (handle) {
        ev.preventDefault?.();
        setHUDMode("full");
        return;
      }
    });

    // ESC hides HUD unless Credits modal is open
    bindOnce(W, "hud_esc", "keydown", (e) => {
      if (e.key !== "Escape") return;

      const cm = D.getElementById("zzx-credits-modal");
      if (cm && !cm.hidden) return;

      if (currentHUDMode() !== "hidden") setHUDMode("hidden");
    });

    // restore persisted state immediately
    applyHUDMode(currentHUDMode());
  }

  /* ---------------------------
   * Prefix + URL helpers
   * ------------------------- */
  function getPrefix() {
    const p1 = W.ZZX?.PREFIX;
    if (typeof p1 === "string" && p1.length) return p1;

    const p2 = D.documentElement?.getAttribute("data-zzx-prefix");
    if (typeof p2 === "string" && p2.length) return p2;

    return ".";
  }

  function join(prefix, absOrRel) {
    if (!absOrRel) return absOrRel;
    const s = String(absOrRel);

    if (/^https?:\/\//i.test(s)) return s;
    if (!s.startsWith("/")) return s;
    if (prefix === "/") return s;

    const p = String(prefix || ".").replace(/\/+$/, "");
    if (!p || p === ".") return s;

    return p + s;
  }

  function urlFor(absPath) {
    return join(getPrefix(), absPath);
  }

  function assetVersionQS() {
    const meta = D.querySelector('meta[name="asset-version"]')?.getAttribute("content");
    if (!meta) return "";
    return `?v=${encodeURIComponent(meta)}`;
  }

  /* ---------------------------
   * Low-level loaders
   * ------------------------- */
  function ensureCSSOnce(key, href) {
    const k = String(key).replace(/[^a-z0-9_-]/gi, "_");
    const sel = `link[data-zzx-css="${k}"]`;
    if (D.querySelector(sel)) return;

    const l = D.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute("data-zzx-css", k);
    D.head.appendChild(l);
  }

  function ensureScriptOnce(key, src) {
    const k = String(key).replace(/[^a-z0-9_-]/gi, "_");
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

  /* ---------------------------
   * Wait for partials/header readiness
   * IMPORTANT: listen for BOTH event names
   * - your partials loader emits "zzx:partials:ready"
   * - older code sometimes emits "zzx:partials-ready"
   * ------------------------- */
  function waitForPartialsReady(timeoutMs = 2500) {
    return new Promise((resolve) => {
      const t0 = performance.now();

      const isReadyNow = () => {
        const host = D.getElementById("zzx-header");
        return !!(host && host.childNodes && host.childNodes.length > 0);
      };

      if (isReadyNow()) return resolve(true);

      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        try { W.removeEventListener("zzx:partials-ready", onEvt); } catch (_) {}
        try { W.removeEventListener("zzx:partials:ready", onEvt); } catch (_) {}
        resolve(!!ok);
      };

      const onEvt = () => finish(true);
      W.addEventListener("zzx:partials-ready", onEvt, { once: true });
      W.addEventListener("zzx:partials:ready", onEvt, { once: true });

      (function poll() {
        if (done) return;
        if (isReadyNow()) return finish(true);
        if (performance.now() - t0 >= timeoutMs) return finish(false);
        setTimeout(poll, 60);
      })();
    });
  }

  /* ---------------------------
   * Unified registry (ONE registry, exposed via legacy names)
   * ------------------------- */
  const REG = (W.__ZZX_REGISTRY_SINGLETON = W.__ZZX_REGISTRY_SINGLETON || {
    defs: new Map(),
    booted: new Set(),
  });

  function buildCtx() {
    const DEFAULT_API = {
      COINBASE_SPOT: "https://api.coinbase.com/v2/prices/BTC-USD/spot",
      COINBASE_CANDLES_15M: "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=900",
      COINBASE_CANDLES_1H: "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600",
      MEMPOOL: "https://mempool.space/api",
    };

    const api = Object.assign({}, DEFAULT_API, (W.ZZX_API || {}));

    return {
      api,
      theme: W.ZZXTheme || null,
      fetchText,
      fetchJSON,
      now: () => Date.now(),
      urlFor,
    };
  }

  function resolveWidgetRoot(id, slot) {
    if (!slot) return null;

    const byExact =
      slot.querySelector(`[data-widget-root="${id}"]`) ||
      slot.querySelector(`.zzx-widget[data-widget-id="${id}"]`);

    if (byExact) return byExact;

    const generic = slot.querySelector("[data-widget-root]") || slot.querySelector(".zzx-widget");
    if (generic) return generic;

    if (slot.firstElementChild) return slot.firstElementChild;
    return slot;
  }

  function register(id, def) {
    const wid = String(id || "").trim();
    if (!wid) return false;
    REG.defs.set(wid, def);
    return true;
  }

  function bootOne(id, slot, ctx) {
    const wid = String(id || "").trim();
    if (!wid) return false;

    const def = REG.defs.get(wid);
    if (!def) return false;

    if (REG.booted.has(wid)) return true;

    const root = resolveWidgetRoot(wid, slot);

    try {
      if (typeof def === "function") {
        def(root, ctx);
      } else if (def && typeof def === "object") {
        const fn = def.start || def.init || def.boot;
        if (typeof fn === "function") fn.call(def, root, ctx);
      }
      REG.booted.add(wid);
      return true;
    } catch (e) {
      console.warn(`[HUD] widget boot failed for ${wid}`, e);
      return false;
    }
  }

  function startAllMounted(ctx) {
    const slots = Array.from(D.querySelectorAll("[data-widget-slot]"));
    for (const slot of slots) {
      const id = slot.getAttribute("data-widget-slot") || slot.getAttribute("data-widget-id");
      if (!id) continue;
      if (slot.dataset.mountReady !== "1") continue;
      bootOne(id, slot, ctx);
    }
  }

  W.__ZZX_WIDGETS = W.__ZZX_WIDGETS || {};
  W.__ZZX_WIDGETS.register = register;
  W.__ZZX_WIDGETS.start = function () {
    const ctx = buildCtx();
    startAllMounted(ctx);
    return true;
  };

  W.ZZXWidgets = W.ZZXWidgets || {};
  W.ZZXWidgets.register = register;
  W.ZZXWidgets.start = W.__ZZX_WIDGETS.start;

  W.ZZXWidgetRegistry = W.ZZXWidgetRegistry || {};
  W.ZZXWidgetRegistry.register = register;
  W.ZZXWidgetRegistry.start = W.__ZZX_WIDGETS.start;

  /* ---------------------------
   * Manifest-driven mounting
   * ------------------------- */
  function slotEl(id) {
    return D.querySelector(`[data-widget-slot="${id}"]`);
  }

  function escapeHTML(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderHTMLFail(slot, id, msg) {
    slot.innerHTML =
      `<div class="btc-card">
         <div class="btc-card__title">${escapeHTML(id)}</div>
         <div class="btc-card__sub">${escapeHTML(msg || "HTML load failed")}</div>
       </div>`;
  }

  async function mountWidget(id, ctx) {
    const slot = slotEl(id);
    if (!slot) return;

    if (slot.dataset.mounted === "1") return;
    slot.dataset.mounted = "1";

    const ver = assetVersionQS();
    const base = `/__partials/widgets/${id}`;

    const htmlUrl = urlFor(`${base}/widget.html${ver}`);
    const cssUrl  = urlFor(`${base}/widget.css${ver}`);
    const jsUrl   = urlFor(`${base}/widget.js${ver}`);

    // 1) HTML
    try {
      const html = await fetchText(htmlUrl);
      slot.innerHTML = html;
      slot.setAttribute("data-widget-id", id);
      slot.dataset.mountReady = "1";
    } catch (e) {
      slot.dataset.mountReady = "0";
      console.warn(`[HUD] ${id} html failed`, e);
      renderHTMLFail(slot, id, e?.message || "HTML load failed");
      return;
    }

    // 2) CSS (non-fatal if missing)
    try { ensureCSSOnce(`wcss:${id}`, cssUrl); } catch (_) {}

    // 3) JS
    const ok = await ensureScriptOnce(`wjs:${id}`, jsUrl);
    if (!ok) {
      console.warn(`[HUD] ${id} js failed to load: ${jsUrl}`);
      return;
    }

    // 4) If widget registered itself, boot it now
    bootOne(id, slot, ctx);
  }

  async function mountAllFromManifest(manifest, ctx) {
    const widgets = (manifest?.widgets || [])
      .filter(w => w && w.id)
      .slice()
      .sort((a, b) => (a.priority ?? 9999) - (b.priority ?? 9999));

    for (const w of widgets) {
      const slot = slotEl(w.id);
      if (!slot) continue;

      if (w.enabled === false) {
        slot.style.display = "none";
        continue;
      }
      slot.style.display = "";

      await mountWidget(w.id, ctx);
    }

    try { W.__ZZX_WIDGETS.start(); } catch (_) {}
  }

  async function loadManifest() {
    const ver = assetVersionQS();
    const manifestUrl = urlFor(`/__partials/widgets/manifest.json${ver}`);

    try {
      return await fetchJSON(manifestUrl);
    } catch (e) {
      console.warn("[HUD] manifest.json failed:", e);
      return {
        widgets: Array.from(D.querySelectorAll("[data-widget-slot]")).map(el => ({
          id: el.getAttribute("data-widget-slot"),
          enabled: true,
          priority: 9999,
        })),
      };
    }
  }

  /* ---------------------------
   * Boot
   * ------------------------- */
  async function boot() {
    // Wait so header/nav/footer + runtime partials likely exist first
    await waitForPartialsReady(2500);

    // Bind HUD controls early (delegated, works even if HUD DOM appears later)
    bindHUDControls();

    // Build shared ctx
    const ctx = buildCtx();

    // Mount widgets
    const manifest = await loadManifest();
    await mountAllFromManifest(manifest, ctx);

    // Re-apply HUD state after widgets mount (in case HUD DOM arrived from runtime.html)
    applyHUDMode(currentHUDMode());
  }

  if (D.readyState === "loading") {
    D.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
