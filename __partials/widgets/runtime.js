// __partials/widgets/runtime.js
// ZZX Widgets Runtime (DROP-IN REPLACEMENT)
//
// PURPOSE
// - Mount widgets from manifest WITHOUT rewriting 30+ widget scripts.
// - Guarantee the legacy APIs exist by ensuring widget-core.js loads FIRST.
// - After each widget.js loads, explicitly boot it (covers widgets that only register).
//
// FIXES YOUR CURRENT FAILURE MODE
// - Many widgets render HTML/CSS but never fetch data because their widget.js:
//     (a) registers into ZZXWidgets / ZZXWidgetRegistry, and
//     (b) expects someone to call start()/bootOne().
// - Some pages load runtime.js directly (via /__partials/script.js) without core:
//     => runtime now self-loads /__partials/widgets/_core/widget-core.js before any widget.js.
//
// ALSO FIXES
// - hashrate-by-nation “HTML load failed” when folder name != manifest id:
//   runtime will try directory aliases automatically (dash/underscore/nodash/camel).
//
// DOES NOT
// - Remove/replace any of your existing APIs.
// - Change your ticker-loader / partials-loader strategy.

(function () {
  const W = window;

  if (W.__ZZX_WIDGETS_RUNTIME_BOOTED) return;
  W.__ZZX_WIDGETS_RUNTIME_BOOTED = true;

  // ---------------- prefix helpers ----------------
  function getPrefix() {
    const p = W.ZZX?.PREFIX;
    if (typeof p === "string" && p.length) return p;
    const p2 = document.documentElement?.getAttribute("data-zzx-prefix");
    if (typeof p2 === "string" && p2.length) return p2;
    return ".";
  }

  function join(prefix, path) {
    if (!path) return path;
    if (/^https?:\/\//i.test(path)) return path;
    if (prefix === "/") return path;
    if (!path.startsWith("/")) return path;
    return prefix.replace(/\/+$/, "") + path;
  }

  function urlFor(absPath) {
    return join(getPrefix(), absPath);
  }

  // ---------------- tiny loaders ----------------
  function ensureCSSOnce(key, href) {
    const k = String(key);
    const sel = `link[data-zzx-css="${k}"]`;
    if (document.querySelector(sel)) return;

    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute("data-zzx-css", k);
    document.head.appendChild(l);
  }

  function ensureScriptOnce(key, src) {
    return new Promise((resolve) => {
      const k = String(key);
      const sel = `script[data-zzx-js="${k}"]`;
      if (document.querySelector(sel)) return resolve(true);

      const s = document.createElement("script");
      s.src = src;
      s.defer = true;
      s.async = false; // predictable order
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

  // ---------------- ensure core (ONLY) ----------------
  async function ensureCoreLoaded() {
    // This is the canonical compatibility layer. Do NOT duplicate shims here.
    if (W.ZZXWidgetsCore && W.ZZXWidgetsCore.__zzx_ok) return true;

    const coreUrl = urlFor("/__partials/widgets/_core/widget-core.js");
    const ok = await ensureScriptOnce("zzx-core", coreUrl);

    // Even if it failed, don’t hard-crash HUD; just warn.
    if (!ok) console.warn("[HUD] failed to load core:", coreUrl);
    return ok;
  }

  // ---------------- HUD state ----------------
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

  // ---------------- widget base resolution (aliases) ----------------
  // Manifest id might be "hashrate-by-nation" but folder could be:
  // - hashrate-by-nation
  // - hashrate_by_nation
  // - hashratebynation
  // - hashrateByNation
  const _baseCache = new Map();

  function candidateDirs(id) {
    const raw = String(id || "").trim();
    if (!raw) return [];

    const underscore = raw.replaceAll("-", "_");
    const nodash = raw.replaceAll("-", "");
    const camel = raw.replace(/[-_]+([a-zA-Z0-9])/g, (_, c) => String(c).toUpperCase());

    const out = [];
    for (const d of [raw, underscore, nodash, camel]) {
      if (d && !out.includes(d)) out.push(d);
    }
    return out;
  }

  async function resolveBaseDir(id) {
    if (_baseCache.has(id)) return _baseCache.get(id);

    const dirs = candidateDirs(id);
    const attempted = [];

    for (const dir of dirs) {
      const base = `/__partials/widgets/${dir}`;
      const htmlUrl = urlFor(`${base}/widget.html`);
      attempted.push(htmlUrl);

      try {
        await fetchText(htmlUrl);
        _baseCache.set(id, base);
        return base;
      } catch (_) {}
    }

    const err = new Error(`widget.html not found for "${id}"`);
    err.attempted = attempted;
    _baseCache.set(id, null);
    throw err;
  }

  function escapeHTML(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ---------------- widget mount ----------------
  function slotEl(id) {
    return document.querySelector(`[data-widget-slot="${id}"]`);
  }

  async function mountWidget(id) {
    const slot = slotEl(id);
    if (!slot) return;

    if (slot.dataset.mounted === "1") return;
    slot.dataset.mounted = "1";

    let base;
    try {
      base = await resolveBaseDir(id);
    } catch (e) {
      console.warn(`[HUD] ${id} html failed`, e);
      slot.innerHTML =
        `<div class="btc-card">
           <div class="btc-card__title">${escapeHTML(id)}</div>
           <div class="btc-card__value">HTML load failed</div>
           <div class="btc-card__sub">${escapeHTML(e?.message || "missing widget.html")}</div>
         </div>`;
      try {
        if (e?.attempted?.length) slot.setAttribute("data-hud-debug-attempted", e.attempted.join(" | "));
      } catch (_) {}
      return;
    }

    const htmlUrl = urlFor(`${base}/widget.html`);
    const cssUrl  = urlFor(`${base}/widget.css`);
    const jsUrl   = urlFor(`${base}/widget.js`);

    // 1) HTML
    try {
      const html = await fetchText(htmlUrl);
      slot.innerHTML = html;
      slot.setAttribute("data-widget-id", id);
      slot.setAttribute("data-widget-base", base);
    } catch (e) {
      console.warn(`[HUD] ${id} html failed`, e);
      slot.innerHTML =
        `<div class="btc-card">
           <div class="btc-card__title">${escapeHTML(id)}</div>
           <div class="btc-card__sub">HTML load failed</div>
         </div>`;
      return;
    }

    // 2) CSS (browser will silently skip if 404)
    try { ensureCSSOnce(`wcss:${id}`, cssUrl); } catch (_) {}

    // 3) JS (after mount)
    const okJS = await ensureScriptOnce(`wjs:${id}`, jsUrl);
    if (!okJS) console.warn(`[HUD] ${id} js failed to load:`, jsUrl);

    // 4) CRITICAL: boot widget after its JS loads (covers "register-only" widgets)
    // This is safe even if the widget self-boots via Core.onMount.
    try { W.__ZZX_WIDGETS?.bootOne?.(id); } catch (_) {}
    try { W.ZZXWidgets?.start?.(); } catch (_) {}           // harmless if already started
    try { W.ZZXWidgetRegistry?.start?.(); } catch (_) {}    // alias safety
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

    // 5) Final start pass (covers widgets that register late)
    try { W.__ZZX_WIDGETS?.start?.(); } catch (_) {}
    try { W.ZZXWidgets?.start?.(); } catch (_) {}
    try { W.ZZXWidgetRegistry?.start?.(); } catch (_) {}
  }

  // ---------------- controls ----------------
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

        // Clear + remount (also clear base cache so aliases can re-resolve)
        _baseCache.clear();

        root.querySelectorAll("[data-widget-slot]").forEach((el) => {
          el.dataset.mounted = "0";
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

  // ---------------- boot ----------------
  async function bootWidgets(_force) {
    // Ensure base CSS exists even in the “runtime loaded directly” path
    try { ensureCSSOnce("widgets-core-css", urlFor("/__partials/widgets/_core/widget-core.css")); } catch (_) {}

    // MUST load core shim before any widget.js loads
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

    await mountAll(manifest);
  }

  async function boot() {
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
