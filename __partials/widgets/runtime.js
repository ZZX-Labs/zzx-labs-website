// __partials/widgets/runtime.js
// ZZX Widgets Runtime — SINGLE orchestrator (DROP-IN REPLACEMENT)
//
// Goals:
// 1) Read manifest.json and mount each widget into its [data-widget-slot="<id>"] slot.
// 2) Mount order: widget.html → widget.css → widget.js (JS runs AFTER DOM exists).
// 3) Provide ONE unified legacy-compatible registry so existing widget scripts keep working
//    (object-method "this" binding preserved; ctx.api provided).
// 4) Prefix-safe URL joins (prevents accidental protocol-relative //__partials/... bugs).
// 5) Avoid racing header/nav/footer injection: waits briefly for zzx:partials-ready / #zzx-header.
//
// IMPORTANT:
// - This file is the parent runtime orchestrator under __partials/widgets/ (NOT runtime/widget.js).
// - It does NOT touch your partials loader. It only listens for readiness.

(function () {
  const W = window;

  // Prevent double boot
  if (W.__ZZX_WIDGETS_RUNTIME_BOOTED) return;
  W.__ZZX_WIDGETS_RUNTIME_BOOTED = true;

  // ---------------------------
  // Prefix + URL helpers
  // ---------------------------
  function getPrefix() {
    const p1 = W.ZZX?.PREFIX;
    if (typeof p1 === "string" && p1.length) return p1;

    const p2 = document.documentElement?.getAttribute("data-zzx-prefix");
    if (typeof p2 === "string" && p2.length) return p2;

    return "."; // safe default
  }

  // join(prefix, "/__partials/x") -> "<prefix>/__partials/x" (NEVER "//__partials/x")
  function join(prefix, absOrRel) {
    if (!absOrRel) return absOrRel;
    const s = String(absOrRel);

    if (/^https?:\/\//i.test(s)) return s;     // external
    if (!s.startsWith("/")) return s;          // already relative
    if (prefix === "/") return s;              // domain root hosting

    const p = String(prefix || ".").replace(/\/+$/, ""); // strip trailing slashes
    if (!p || p === ".") return s;             // root-relative is fine on zzx-labs.io

    // Ensure we do NOT create protocol-relative URLs:
    // - if p somehow becomes "" this would return "/__partials/.."
    return p + s;
  }

  function urlFor(absPath) {
    return join(getPrefix(), absPath);
  }

  function assetVersionQS() {
    // Preserve ?v=... if present in meta, otherwise empty.
    const meta = document.querySelector('meta[name="asset-version"]')?.getAttribute("content");
    if (!meta) return "";
    return `?v=${encodeURIComponent(meta)}`;
  }

  // ---------------------------
  // Low-level loaders
  // ---------------------------
  function ensureCSSOnce(key, href) {
    const k = String(key).replace(/[^a-z0-9_-]/gi, "_");
    const sel = `link[data-zzx-css="${k}"]`;
    if (document.querySelector(sel)) return;

    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute("data-zzx-css", k);
    document.head.appendChild(l);
  }

  function ensureScriptOnce(key, src) {
    const k = String(key).replace(/[^a-z0-9_-]/gi, "_");
    const sel = `script[data-zzx-js="${k}"]`;
    if (document.querySelector(sel)) return Promise.resolve(true);

    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = src;
      s.defer = true; // keep order relative to DOM readiness
      s.setAttribute("data-zzx-js", k);
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

  // ---------------------------
  // Wait for partials/header readiness (prevents widgets rendering above header)
  // ---------------------------
  function waitForPartialsReady(timeoutMs = 2500) {
    return new Promise((resolve) => {
      const t0 = performance.now();

      // If header host exists AND has content, we're good.
      const isReadyNow = () => {
        const host = document.getElementById("zzx-header");
        if (host && host.childNodes && host.childNodes.length > 0) return true;
        return false;
      };

      if (isReadyNow()) return resolve(true);

      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        try { window.removeEventListener("zzx:partials-ready", onEvt); } catch (_) {}
        resolve(!!ok);
      };

      const onEvt = () => finish(true);
      window.addEventListener("zzx:partials-ready", onEvt, { once: true });

      (function poll() {
        if (done) return;
        if (isReadyNow()) return finish(true);
        if (performance.now() - t0 >= timeoutMs) return finish(false);
        setTimeout(poll, 60);
      })();
    });
  }

  // ---------------------------
  // Unified registry (ONE registry, exposed via legacy names)
  // ---------------------------
  const REG = (W.__ZZX_REGISTRY_SINGLETON = W.__ZZX_REGISTRY_SINGLETON || {
    defs: new Map(),        // id -> def (object or function)
    booted: new Set(),      // ids already booted
  });

  // Provide a single per-boot context that all widgets can share.
  // This is where ctx.api lives (fixes "ctx.api undefined").
  function buildCtx() {
    // If you already define a richer API map elsewhere, we honor it.
    // Merge our defaults behind it (user values win).
    const DEFAULT_API = {
      // Coinbase spot / candles (common widgets)
      COINBASE_SPOT: "https://api.coinbase.com/v2/prices/BTC-USD/spot",
      COINBASE_CANDLES_15M: "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=900",
      COINBASE_CANDLES_1H: "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600",

      // Mempool.space (common widgets)
      MEMPOOL: "https://mempool.space/api",
    };

    const api = Object.assign({}, DEFAULT_API, (W.ZZX_API || {}));

    const ctx = {
      api,
      theme: W.ZZXTheme || null,
      fetchText,
      fetchJSON,
      now: () => Date.now(),
      // Convenience: prefix-aware URL builder
      urlFor,
    };

    return ctx;
  }

  // Resolve the "root" element each widget should operate on.
  // We try explicit root markers first, then fall back to slot itself.
  function resolveWidgetRoot(id, slot) {
    if (!slot) return null;

    // Common patterns
    const byExact =
      slot.querySelector(`[data-widget-root="${id}"]`) ||
      slot.querySelector(`.zzx-widget[data-widget-id="${id}"]`);

    if (byExact) return byExact;

    // Generic "this is the widget root" marker
    const generic = slot.querySelector("[data-widget-root]") || slot.querySelector(".zzx-widget");
    if (generic) return generic;

    // first child if exists (keeps querySelector working for widgets that assume wrapper)
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

    // prevent repeat boots (unless slot reset explicitly by state reset logic elsewhere)
    if (REG.booted.has(wid)) return true;

    const root = resolveWidgetRoot(wid, slot);

    try {
      if (typeof def === "function") {
        // Function widget: def(root, ctx)
        def(root, ctx);
      } else if (def && typeof def === "object") {
        // Object widget: preserve 'this' binding
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
    // Boot only widgets that have slots mounted (best signal is data-mount-ready)
    const slots = Array.from(document.querySelectorAll("[data-widget-slot]"));
    for (const slot of slots) {
      const id = slot.getAttribute("data-widget-slot") || slot.getAttribute("data-widget-id");
      if (!id) continue;
      if (slot.dataset.mountReady !== "1") continue;
      bootOne(id, slot, ctx);
    }
  }

  // Expose registry under all legacy names (ONE implementation)
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

  // ---------------------------
  // Manifest-driven mounting
  // ---------------------------
  function slotEl(id) {
    return document.querySelector(`[data-widget-slot="${id}"]`);
  }

  function renderHTMLFail(slot, id, msg) {
    slot.innerHTML =
      `<div class="btc-card">
         <div class="btc-card__title">${escapeHTML(id)}</div>
         <div class="btc-card__sub">${escapeHTML(msg || "HTML load failed")}</div>
       </div>`;
  }

  function escapeHTML(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function mountWidget(id, ctx) {
    const slot = slotEl(id);
    if (!slot) return;

    // prevent double-mount
    if (slot.dataset.mounted === "1") return;
    slot.dataset.mounted = "1";

    const qs = assetVersionQS();
    const base = `/__partials/widgets/${id}`;

    const htmlUrl = urlFor(`${base}/widget.html${qs}`);
    const cssUrl  = urlFor(`${base}/widget.css${qs}`);
    const jsUrl   = urlFor(`${base}/widget.js${qs}`);

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

    // 3) JS (load AFTER DOM exists)
    const ok = await ensureScriptOnce(`wjs:${id}`, jsUrl);
    if (!ok) {
      console.warn(`[HUD] ${id} js failed to load: ${jsUrl}`);
      // keep slot visible; widget may still be static
      return;
    }

    // 4) If widget registered itself (common legacy pattern), boot it immediately.
    // This preserves object-method 'this' binding (fixes intel cache issues).
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

    // After all scripts have had a chance to register, start anything that prefers start()
    // (idempotent; boots only mounted slots)
    try { W.__ZZX_WIDGETS.start(); } catch (_) {}
  }

  async function loadManifest() {
    const qs = assetVersionQS();
    const manifestUrl = urlFor(`/__partials/widgets/manifest.json${qs}`);

    try {
      return await fetchJSON(manifestUrl);
    } catch (e) {
      console.warn("[HUD] manifest.json failed:", e);

      // fallback: mount whatever slots exist in DOM
      return {
        widgets: Array.from(document.querySelectorAll("[data-widget-slot]")).map(el => ({
          id: el.getAttribute("data-widget-slot"),
          enabled: true,
          priority: 9999,
        })),
      };
    }
  }

  // ---------------------------
  // Boot
  // ---------------------------
  async function boot() {
    // Wait briefly so header/nav/footer injection can occur first
    // (prevents "widgets show before header").
    await waitForPartialsReady(2500);

    // Build shared ctx (fixes ctx.api undefined)
    const ctx = buildCtx();

    const manifest = await loadManifest();
    await mountAllFromManifest(manifest, ctx);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
