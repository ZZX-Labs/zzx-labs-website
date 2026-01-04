// __partials/widgets/runtime.js
// Loads manifest + mounts widgets into #zzx-widgets-rail
// Also guarantees _core + hud-state are loaded once.

(function () {
  const W = window;

  // prevent double boot across reinjections
  if (W.__ZZX_WIDGETS_RUNTIME_BOOTED) return;
  W.__ZZX_WIDGETS_RUNTIME_BOOTED = true;

  function prefix() {
    const p = W.ZZX?.PREFIX;
    return (typeof p === "string" && p.length) ? p : ".";
  }

  function join(path) {
    const p = prefix();
    if (p === "/" || /^https?:\/\//i.test(path)) return path;
    if (!path.startsWith("/")) return path;
    return p.replace(/\/+$/, "") + path;
  }

  const CORE_JS   = join("/__partials/widgets/_core/widget-core.js");
  const HUD_JS    = join("/__partials/widgets/hud-state.js");
  const MANIFEST  = join("/__partials/widgets/manifest.json");

  async function ensureCoreLoaded() {
    if (!W.ZZXWidgetsCore) {
      await new Promise((resolve) => {
        const s = document.createElement("script");
        s.src = CORE_JS;
        s.defer = true;
        s.onload = () => resolve();
        s.onerror = () => resolve();
        document.body.appendChild(s);
      });
    }
    if (!W.ZZXHUD) {
      await new Promise((resolve) => {
        const s = document.createElement("script");
        s.src = HUD_JS;
        s.defer = true;
        s.onload = () => resolve();
        s.onerror = () => resolve();
        document.body.appendChild(s);
      });
    }
  }

  function applyMode(mode) {
    const shell = document.querySelector('[data-zzx-widgets="1"]') || document.querySelector(".zzx-widgets");
    const handle = document.querySelector("[data-hud-handle]");
    if (shell) shell.setAttribute("data-hud-state", mode);
    if (handle) handle.hidden = (mode !== "hidden");
  }

  async function mountWidget(id) {
    const Core = W.ZZXWidgetsCore;
    const rail = document.getElementById("zzx-widgets-rail");
    if (!rail) return;

    const slot = rail.querySelector(`[data-widget-id="${id}"]`);
    if (slot && slot.dataset.mounted === "1") return;

    const wrap = slot || document.createElement("div");
    wrap.className = "zzx-widget";
    wrap.setAttribute("data-widget-id", id);

    // URLs
    const base = join(`/__partials/widgets/${id}`);
    const htmlUrl = `${base}/widget.html`;
    const cssUrl  = `${base}/widget.css`;
    const jsUrl   = `${base}/widget.js`;

    // CSS first
    Core.ensureCSS(cssUrl, `w-${id}`);

    // HTML
    let html = "";
    try {
      html = await Core.fetchText(htmlUrl);
    } catch (e) {
      html = `<div class="zzx-card"><div class="zzx-card__title">${id}</div><div class="zzx-card__sub">missing widget.html</div></div>`;
    }
    wrap.innerHTML = html;
    wrap.dataset.mounted = "1";

    if (!slot) rail.appendChild(wrap);

    // JS last
    Core.ensureJS(jsUrl, `w-${id}`);
  }

  async function mountFromManifest(force = false) {
    const Core = W.ZZXWidgetsCore;
    const rail = document.getElementById("zzx-widgets-rail");
    if (!rail) return;

    // If already built and not forcing, skip
    if (!force && rail.dataset.built === "1") return;

    let manifest;
    try {
      manifest = await Core.fetchJSON(MANIFEST);
    } catch (e) {
      manifest = { version: 1, widgets: [] };
    }

    const list = Array.isArray(manifest.widgets) ? manifest.widgets.slice() : [];

    // sort by priority if present, otherwise keep order
    list.sort((a, b) => {
      const ap = Number.isFinite(a?.priority) ? a.priority : 9999;
      const bp = Number.isFinite(b?.priority) ? b.priority : 9999;
      return ap - bp;
    });

    // clear rail and re-create stable slots
    rail.innerHTML = "";
    for (const w of list) {
      const id = String(w.id || "").trim();
      if (!id) continue;

      const enabled = (w.enabled !== false); // default true
      if (!enabled) continue;

      const slot = document.createElement("div");
      slot.className = "zzx-widget";
      slot.setAttribute("data-widget-id", id);
      rail.appendChild(slot);

      // mount actual widget contents
      await mountWidget(id);
    }

    rail.dataset.built = "1";
  }

  function bindControlsOnce() {
    const shell = document.querySelector('[data-zzx-widgets="1"]');
    if (!shell || shell.__bound) return;
    shell.__bound = true;

    shell.addEventListener("click", async (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      const mode = btn.getAttribute("data-zzx-mode");
      const action = btn.getAttribute("data-zzx-action");

      if (mode) {
        const s = W.ZZXHUD.setMode(mode);
        applyMode(s.mode);
      }

      if (action === "reset") {
        const s = W.ZZXHUD.reset();
        applyMode(s.mode);
        // rebuild widgets after reset (safe)
        await mountFromManifest(true);
      }

      if (action === "show") {
        const s = W.ZZXHUD.setMode("full");
        applyMode(s.mode);
      }
    });

    // external handle button
    const showBtn = document.querySelector("[data-hud-show]");
    if (showBtn && !showBtn.__bound) {
      showBtn.__bound = true;
      showBtn.addEventListener("click", () => {
        const s = W.ZZXHUD.setMode("full");
        applyMode(s.mode);
      });
    }
  }

  async function boot(force = false) {
    await ensureCoreLoaded();

    // apply persisted mode immediately (before mounting)
    const s = W.ZZXHUD.read();
    applyMode(s.mode);

    // mount widgets
    await mountFromManifest(force);

    // bind controls
    bindControlsOnce();
  }

  // expose rebind
  W.ZZXWidgetsRuntime = {
    rebind(force = false) { return boot(force); }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => boot(false), { once: true });
  } else {
    boot(false);
  }
})();
