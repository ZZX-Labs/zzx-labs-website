// __partials/widgets/runtime.js
// ZZX Widgets Runtime — SINGLE orchestrator (DROP-IN REPLACEMENT)
//
// THIS IS THE “MAKE IT WORK” VERSION.
// - Canonical HUD modes: full | ticker-only | hidden (NO "ticker" anywhere)
// - Delegated HUD binding: hide never strands you; handle reappears deterministically
// - Widget URLs are always /__partials/... (prefix-joined) so no ../ 404 ever
// - If widget JS fails, you get an error card with the failing URL
// - Slots: [data-widget-slot="<id>"] (matches your wrapper)
// - Manifest-driven order + enable flags

(function () {
  "use strict";

  const W = window;
  const D = document;

  if (W.__ZZX_WIDGETS_RUNTIME_BOOTED) return;
  W.__ZZX_WIDGETS_RUNTIME_BOOTED = true;

  const qs  = (s, r) => (r || D).querySelector(s);
  const qsa = (s, r) => Array.from((r || D).querySelectorAll(s));

  // ---------------------------
  // Prefix-safe URL + version
  // ---------------------------
  function getPrefix() {
    const p1 = W.ZZX?.PREFIX;
    if (typeof p1 === "string" && p1.length) return p1;
    const p2 = D.documentElement?.getAttribute("data-zzx-prefix");
    if (typeof p2 === "string" && p2.length) return p2;
    return "";
  }

  function urlFor(absPathOrUrl) {
    const s = String(absPathOrUrl || "");
    if (!s) return s;
    if (/^https?:\/\//i.test(s)) return s;
    if (!s.startsWith("/")) return s;
    const p = String(getPrefix()).replace(/\/+$/, "");
    if (!p || p === "." || p === "/") return s;
    return p + s;
  }

  function assetVersion() {
    const v = D.querySelector('meta[name="asset-version"]')?.getAttribute("content");
    return (v || "").trim();
  }

  function withV(u) {
    const v = assetVersion();
    if (!v) return u;
    try {
      const U = new URL(u, location.href);
      if (!U.searchParams.has("v")) U.searchParams.set("v", v);
      return U.href;
    } catch {
      return u;
    }
  }

  // ---------------------------
  // HUD (canonical: full | ticker-only | hidden)
  // ---------------------------
  const HUD_DEFAULT = "full";

  function normalizeMode(m) {
    const s = String(m || "").trim().toLowerCase();

    if (s === "full" || s === "ticker-only" || s === "hidden") return s;

    // legacy/alias tolerance
    if (s === "ticker") return "ticker-only";
    if (s === "ticker_only") return "ticker-only";
    if (s === "tickeronly") return "ticker-only";
    if (s === "visible") return "full";

    return HUD_DEFAULT;
  }

  function ensureHUD() {
    if (W.ZZXHUD && typeof W.ZZXHUD.read === "function" && typeof W.ZZXHUD.write === "function") {
      // force normalize API if missing
      if (typeof W.ZZXHUD.normalize !== "function") W.ZZXHUD.normalize = normalizeMode;

      // wrap write/read to guarantee canonical strings
      const _read = W.ZZXHUD.read.bind(W.ZZXHUD);
      const _write = W.ZZXHUD.write.bind(W.ZZXHUD);

      W.ZZXHUD.read = function () {
        const r = _read();
        return { mode: normalizeMode(r && r.mode) };
      };
      W.ZZXHUD.write = function (m) {
        const r = _write(normalizeMode(m));
        return { mode: normalizeMode(r && r.mode) };
      };
      if (typeof W.ZZXHUD.reset !== "function") {
        W.ZZXHUD.reset = function () {
          try { return this.write(HUD_DEFAULT); } catch { return { mode: HUD_DEFAULT }; }
        };
      }

      return W.ZZXHUD;
    }

    // fallback (should not be used if hud-state.js loads)
    const KEY = "zzx.hud.mode";
    W.ZZXHUD = {
      normalize: normalizeMode,
      read() {
        try { return { mode: normalizeMode(localStorage.getItem(KEY)) }; }
        catch { return { mode: HUD_DEFAULT }; }
      },
      write(mode) {
        const m = normalizeMode(mode);
        try { localStorage.setItem(KEY, m); } catch (_) {}
        return { mode: m };
      },
      reset() {
        try { localStorage.removeItem(KEY); } catch (_) {}
        return { mode: HUD_DEFAULT };
      }
    };
    return W.ZZXHUD;
  }

  function applyHUDMode(mode) {
    const m = normalizeMode(mode);
    const root   = qs("[data-hud-root]");
    const handle = qs("[data-hud-handle]");

    if (root) root.setAttribute("data-hud-state", m);

    // IMPORTANT: your wrapper CSS defaults the handle to display:none,
    // so JS MUST toggle it, or "Hide" strands you.
    if (handle) handle.style.display = (m === "hidden") ? "flex" : "none";

    const lbl = qs("[data-runtime-mode]");
    if (lbl) lbl.textContent = m;
  }

  function currentMode() {
    ensureHUD();
    try { return normalizeMode(W.ZZXHUD.read()?.mode); }
    catch { return HUD_DEFAULT; }
  }

  function setMode(mode) {
    ensureHUD();
    const res = W.ZZXHUD.write(mode);
    const m = normalizeMode(res?.mode || mode);
    applyHUDMode(m);
    return m;
  }

  function resetMode() {
    ensureHUD();
    const res = W.ZZXHUD.reset();
    const m = normalizeMode(res?.mode || HUD_DEFAULT);
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

  function bindHUDDelegated() {
    ensureHUD();

    bindOnce(D, "hud_click", "click", (ev) => {
      const t = ev.target;

      const modeBtn = t?.closest?.("[data-hud-mode]");
      if (modeBtn) {
        ev.preventDefault?.();
        setMode(modeBtn.getAttribute("data-hud-mode"));
        return;
      }

      const resetBtn = t?.closest?.('[data-hud-action="reset"]');
      if (resetBtn) {
        ev.preventDefault?.();
        resetMode();
        return;
      }

      const showBtn = t?.closest?.("[data-hud-show]");
      if (showBtn) {
        ev.preventDefault?.();
        const cur = currentMode();
        setMode(cur === "hidden" ? "full" : "hidden");
        return;
      }

      const handle = t?.closest?.("[data-hud-handle]");
      if (handle) {
        ev.preventDefault?.();
        setMode("full");
      }
    });

    // Apply persisted state immediately
    applyHUDMode(currentMode());
  }

  // ---------------------------
  // Load helpers
  // ---------------------------
  function keyify(k) {
    return String(k).replace(/[^a-z0-9_-]/gi, "_");
  }

  function ensureCSSOnce(key, href) {
    const k = keyify(key);
    if (D.querySelector(`link[data-zzx-css="${k}"]`)) return;
    const l = D.createElement("link");
    l.rel = "stylesheet";
    l.href = withV(href);
    l.setAttribute("data-zzx-css", k);
    D.head.appendChild(l);
  }

  function ensureScriptOnce(key, src) {
    const k = keyify(key);
    if (D.querySelector(`script[data-zzx-js="${k}"]`)) return Promise.resolve(true);

    return new Promise((resolve) => {
      const s = D.createElement("script");
      s.src = withV(src);
      s.defer = true;
      s.setAttribute("data-zzx-js", k);
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      D.head.appendChild(s);
    });
  }

  async function fetchText(u) {
    const r = await fetch(withV(u), { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${u}`);
    return await r.text();
  }

  async function fetchJSON(u) {
    const r = await fetch(withV(u), { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${u}`);
    return await r.json();
  }

  // ---------------------------
  // Registry + boot (compat)
  // ---------------------------
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

    return {
      api: Object.assign({}, DEFAULT_API, (W.ZZX_API || {})),
      fetchText,
      fetchJSON,
      now: () => Date.now(),
      urlFor,
      theme: W.ZZXTheme || null,
    };
  }

  function resolveWidgetRoot(id, slot) {
    if (!slot) return null;
    return (
      slot.querySelector?.(`[data-widget-root="${id}"]`) ||
      slot.querySelector?.(`.zzx-widget[data-widget-id="${id}"]`) ||
      slot.querySelector?.("[data-widget-root]") ||
      slot.querySelector?.(".zzx-widget") ||
      slot.firstElementChild ||
      slot
    );
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
    if (REG.booted.has(wid)) return true;

    const def = REG.defs.get(wid);
    if (!def) return false;

    const root = resolveWidgetRoot(wid, slot);

    try {
      if (typeof def === "function") def(root, ctx);
      else if (def && typeof def === "object") {
        const fn = def.start || def.init || def.boot;
        if (typeof fn === "function") fn.call(def, root, ctx);
      }
      REG.booted.add(wid);
      return true;
    } catch (e) {
      console.warn(`[ZZX runtime] widget boot failed for ${wid}`, e);
      return false;
    }
  }

  W.__ZZX_WIDGETS = W.__ZZX_WIDGETS || {};
  W.__ZZX_WIDGETS.register = register;
  W.__ZZX_WIDGETS.start = function () {
    const ctx = buildCtx();
    const slots = qsa("[data-widget-slot]").filter(s => s.dataset.mountReady === "1");
    for (const slot of slots) {
      const id = slot.getAttribute("data-widget-slot");
      if (id) bootOne(id, slot, ctx);
    }
    return true;
  };

  W.ZZXWidgets = W.ZZXWidgets || {};
  W.ZZXWidgets.register = register;
  W.ZZXWidgets.start = W.__ZZX_WIDGETS.start;

  W.ZZXWidgetRegistry = W.ZZXWidgetRegistry || {};
  W.ZZXWidgetRegistry.register = register;
  W.ZZXWidgetRegistry.start = W.__ZZX_WIDGETS.start;

  // ---------------------------
  // Error rendering
  // ---------------------------
  function escapeHTML(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderFail(slot, id, msg, url) {
    if (!slot) return;
    slot.innerHTML = `
      <div class="btc-card">
        <div class="btc-card__title">${escapeHTML(id)}</div>
        <div class="btc-card__sub">${escapeHTML(msg || "failed")}</div>
        ${url ? `<div class="btc-card__sub" style="opacity:.85">${escapeHTML(url)}</div>` : ``}
      </div>
    `;
  }

  // ---------------------------
  // Manifest mounting
  // ---------------------------
  function slotEl(id) {
    return D.querySelector(`[data-widget-slot="${id}"]`);
  }

  async function loadManifest() {
    const u = W.__ZZX_WIDGETS_MANIFEST_URL
      ? urlFor(W.__ZZX_WIDGETS_MANIFEST_URL)
      : urlFor("/__partials/widgets/manifest.json");
    return await fetchJSON(u);
  }

  async function mountWidget(id, ctx) {
    const slot = slotEl(id);
    if (!slot) return;

    if (slot.dataset.mounted === "1") return;
    slot.dataset.mounted = "1";

    const base = `/__partials/widgets/${id}`;
    const htmlUrl = urlFor(`${base}/widget.html`);
    const cssUrl  = urlFor(`${base}/widget.css`);
    const jsUrl   = urlFor(`${base}/widget.js`);

    // HTML
    try {
      const html = await fetchText(htmlUrl);
      slot.innerHTML = html;
      slot.dataset.mountReady = "1";
      slot.setAttribute("data-widget-id", id);
    } catch (e) {
      slot.dataset.mountReady = "0";
      renderFail(slot, id, e?.message || "HTML load failed", htmlUrl);
      return;
    }

    // CSS
    try { ensureCSSOnce(`wcss:${id}`, cssUrl); } catch (_) {}

    // JS
    const ok = await ensureScriptOnce(`wjs:${id}`, jsUrl);
    if (!ok) {
      renderFail(slot, id, "JS failed to load (404 / wrong path)", jsUrl);
      return;
    }

    // Boot if registered
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

  // ---------------------------
  // Boot
  // ---------------------------
  async function boot() {
    // HARD: always ensure wrapper primitives CSS exists (fixes raw ticker)
    try { ensureCSSOnce("btc-wrapper", urlFor("/__partials/bitcoin-ticker-widget.css")); } catch (_) {}

    bindHUDDelegated();

    const ctx = buildCtx();

    let manifest;
    try {
      manifest = await loadManifest();
    } catch (e) {
      console.warn("[ZZX runtime] manifest failed; mounting existing slots:", e);
      manifest = {
        widgets: qsa("[data-widget-slot]").map(el => ({
          id: el.getAttribute("data-widget-slot"),
          enabled: true,
          priority: 9999
        }))
      };
    }

    await mountAllFromManifest(manifest, ctx);

    // re-apply persisted mode after mounts
    applyHUDMode(currentMode());
  }

  if (D.readyState === "loading") {
    D.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
