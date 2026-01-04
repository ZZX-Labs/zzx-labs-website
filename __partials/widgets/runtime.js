// __partials/widgets/runtime.js
// Boots HUD controls + mounts all enabled widgets (manifest-driven).
// CRITICAL: ensures hud-state.js + _core/widget-core.js load BEFORE widget JS.

(function () {
  const W = window;
  if (W.__ZZX_WIDGETS_RUNTIME_BOOTED) return;
  W.__ZZX_WIDGETS_RUNTIME_BOOTED = true;

  // prefix-aware helpers (runtime must work before core loads)
  function getPrefix() {
    const p = W.ZZX?.PREFIX;
    return (typeof p === "string" && p.length) ? p : ".";
  }
  function join(prefix, path) {
    if (!path) return path;
    if (prefix === "/" || /^https?:\/\//i.test(path)) return path;
    if (!path.startsWith("/")) return path;
    return prefix.replace(/\/+$/, "") + path;
  }
  function url(path) {
    return join(getPrefix(), path);
  }

  const qs = (s, r = document) => r.querySelector(s);

  function hudRoot() { return qs("[data-hud-root]"); }
  function hudHandle() { return qs("[data-hud-handle]"); }
  function rail() { return document.getElementById("zzx-widgets-rail"); }

  async function ensureScriptOnce(globalName, src, tagAttr) {
    if (globalName && W[globalName]) return;

    if (tagAttr && document.querySelector(`script[${tagAttr}="1"]`)) return;

    await new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = src;
      s.defer = true;
      if (tagAttr) s.setAttribute(tagAttr, "1");
      s.onload = resolve;
      s.onerror = resolve;
      document.head.appendChild(s);
    });
  }

  async function ensureHudState() {
    await ensureScriptOnce("ZZXHUD", url("/__partials/widgets/hud-state.js"), "data-zzx-hudstate");
  }

  async function ensureCore() {
    await ensureScriptOnce("ZZXWidgetsCore", url("/__partials/widgets/_core/widget-core.js"), "data-zzx-widgetcore");
  }

  function applyMode(mode) {
    const root = hudRoot();
    const handle = hudHandle();
    if (root) root.setAttribute("data-mode", mode);
    if (handle) handle.hidden = (mode !== "hidden");
  }

  function readModeOrDefault() {
    try {
      const s = W.ZZXHUD?.read?.();
      return W.ZZXHUD?.normalize ? W.ZZXHUD.normalize(s?.mode) : (s?.mode || "full");
    } catch (_) {
      return "full";
    }
  }

  function setMode(mode) {
    const m = W.ZZXHUD?.normalize ? W.ZZXHUD.normalize(mode) : (mode || "full");
    W.ZZXHUD?.write?.(m);
    applyMode(m);
    return m;
  }

  function resetMode() {
    W.ZZXHUD?.reset?.();
    applyMode("full");
    return "full";
  }

  function bindControlsOnce() {
    const root = hudRoot();
    if (!root || root.__zzxBound) return;
    root.__zzxBound = true;

    root.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      const mode = btn.getAttribute("data-zzx-mode");
      const action = btn.getAttribute("data-zzx-action");

      if (mode) setMode(mode);
      if (action === "reset") {
        resetMode();
        mountAllWidgets(true);
      }
    });

    const showBtn = qs("[data-hud-show]");
    if (showBtn && !showBtn.__zzxBound) {
      showBtn.__zzxBound = true;
      showBtn.addEventListener("click", () => setMode("full"));
    }
  }

  async function fetchText(href) {
    const r = await fetch(href, { cache: "no-store" });
    if (!r.ok) throw new Error(`fetch ${href} HTTP ${r.status}`);
    return await r.text();
  }

  const LOADED_CSS = new Set();
  const LOADED_JS = new Set();

  function ensureWidgetCSS(href) {
    if (!href || LOADED_CSS.has(href)) return;
    if (document.querySelector(`link[data-zzx-widget-css="${CSS.escape(href)}"]`)) {
      LOADED_CSS.add(href);
      return;
    }
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute("data-zzx-widget-css", href);
    document.head.appendChild(l);
    LOADED_CSS.add(href);
  }

  async function ensureWidgetJS(src) {
    if (!src || LOADED_JS.has(src)) return;
    if (document.querySelector(`script[data-zzx-widget-js="${CSS.escape(src)}"]`)) {
      LOADED_JS.add(src);
      return;
    }
    await new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = src;
      s.defer = true;
      s.setAttribute("data-zzx-widget-js", src);
      s.onload = resolve;
      s.onerror = resolve;
      document.body.appendChild(s);
    });
    LOADED_JS.add(src);
  }

  async function mountWidget(id, slotEl) {
    const base = `/__partials/widgets/${id}`;
    const htmlHref = url(`${base}/widget.html`);
    const cssHref  = url(`${base}/widget.css`);
    const jsSrc    = url(`${base}/widget.js`);

    ensureWidgetCSS(cssHref);

    const html = await fetchText(htmlHref);

    slotEl.className = "zzx-widget";
    slotEl.setAttribute("data-widget-id", id);
    slotEl.innerHTML = html;

    await ensureWidgetJS(jsSrc);
  }

  async function loadManifest() {
    const mHref = url("/__partials/widgets/manifest.json");
    const txt = await fetchText(mHref);
    const obj = JSON.parse(txt);
    const widgets = Array.isArray(obj?.widgets) ? obj.widgets : [];
    return { widgets };
  }

  async function mountAllWidgets(force = false) {
    const r = rail();
    if (!r) return;

    if (!force && r.dataset.mounted === "1") return;
    r.dataset.mounted = "0";

    const Core = W.ZZXWidgetsCore;

    try {
      const { widgets } = await loadManifest();

      const enabled = widgets
        .filter(w => w && w.id && w.enabled !== false)
        .filter(w => String(w.id) !== "runtime")
        .sort((a, b) => (Number(a.priority ?? 9999) - Number(b.priority ?? 9999)));

      r.innerHTML = "";

      for (const w of enabled) {
        const slot = document.createElement("div");
        r.appendChild(slot);

        try {
          await mountWidget(String(w.id), slot);

          // If a widget exposes an init hook, call it (optional pattern)
          // Many of your older widgets self-boot; this does not break them.
          const initName = `ZZXWidget_${String(w.id).replace(/[^a-z0-9_]/gi, "_")}_init`;
          if (typeof W[initName] === "function") {
            try { W[initName](); } catch (e) { Core?.warn?.("init fail", w.id, e); }
          }
        } catch (e) {
          slot.className = "zzx-widget";
          slot.setAttribute("data-widget-id", String(w.id));
          slot.innerHTML = `
            <div class="zzx-card">
              <div class="zzx-card__title">${String(w.title || w.id)}</div>
              <div class="zzx-card__value">—</div>
              <div class="zzx-card__sub">widget load failed</div>
            </div>
          `;
          console.warn("[ZZX widgets] mount failed:", w.id, e);
        }
      }

      r.dataset.mounted = "1";
    } catch (e) {
      console.warn("[ZZX widgets] manifest/runtime failed:", e);
      r.innerHTML = `
        <div class="zzx-card" style="max-width:720px">
          <div class="zzx-card__title">Bitcoin HUD</div>
          <div class="zzx-card__value">—</div>
          <div class="zzx-card__sub">runtime failed to load manifest.json</div>
        </div>
      `;
    }
  }

  async function boot() {
    await ensureHudState();
    await ensureCore();              // <-- THIS is the missing piece that killed all widgets

    const mode = readModeOrDefault();
    applyMode(mode);
    bindControlsOnce();

    await mountAllWidgets(false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
