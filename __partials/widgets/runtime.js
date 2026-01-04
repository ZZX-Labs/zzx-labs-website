/* __partials/widgets/runtime.js
   Orchestrator:
   - ensures core JS + HUD state are loaded
   - loads manifest
   - mounts each widget into matching .btc-slot[data-widget="id"]
*/
(function () {
  const W = window;

  // prevent double-boot
  if (W.__ZZX_WIDGETS_RUNTIME_BOOTED) return;
  W.__ZZX_WIDGETS_RUNTIME_BOOTED = true;

  function getPrefix() {
    const p = W.ZZX?.PREFIX;
    return (typeof p === "string" && p.length) ? p : ".";
  }
  function join(prefix, path) {
    if (!path) return path;
    if (prefix === "/" || path.startsWith("http://") || path.startsWith("https://")) return path;
    if (!path.startsWith("/")) return path;
    return prefix.replace(/\/+$/, "") + path;
  }
  function url(path) {
    return join(getPrefix(), path);
  }

  function ensureScript(src, key) {
    const attr = `data-zzx-js-${key}`;
    if (document.querySelector(`script[${attr}="1"]`)) return Promise.resolve(true);
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.defer = true;
      s.setAttribute(attr, "1");
      s.onload = () => resolve(true);
      s.onerror = (e) => reject(e);
      document.body.appendChild(s);
    });
  }

  async function ensureCore() {
    // core should already be present because ticker-loader injects core CSS,
    // but we still ensure JS dependencies here.
    const coreJS = url("/__partials/widgets/_core/widget-core.js");
    const hudJS  = url("/__partials/widgets/hud-state.js");

    if (!W.ZZXWidgetsCore) await ensureScript(coreJS, "core");
    if (!W.ZZXHUD) await ensureScript(hudJS, "hud");
    return true;
  }

  async function loadManifest() {
    const Core = W.ZZXWidgetsCore;
    return await Core.fetchJSON("/__partials/widgets/manifest.json");
  }

  function bindHudHandle() {
    const Core = W.ZZXWidgetsCore;
    const btn = Core.qs("[data-hud-show]");
    if (!btn || btn.__bound) return;
    btn.__bound = true;
    btn.addEventListener("click", () => {
      const s = W.ZZXHUD.setMode("full");
      // apply already done by ZZXHUD
      return s;
    });
  }

  async function mountAllWidgets(manifest) {
    const Core = W.ZZXWidgetsCore;

    const list = Array.isArray(manifest?.widgets) ? manifest.widgets.slice() : [];
    list.sort((a, b) => (a.priority ?? 9999) - (b.priority ?? 9999));

    // Mount only those with enabled true AND slot exists
    for (const w of list) {
      if (!w || !w.id) continue;

      const slot = Core.qs(`.btc-slot[data-widget="${CSS.escape(w.id)}"]`);
      if (!slot) continue;

      if (w.enabled === false) {
        // keep slot empty if disabled
        slot.replaceChildren();
        continue;
      }

      try {
        await Core.mountWidget(w.id, slot);
      } catch (e) {
        // show a minimal error card, keep layout stable
        const err = document.createElement("div");
        err.className = "btc-card";
        err.innerHTML = `
          <div class="btc-card__title">${w.title || w.id}</div>
          <div class="btc-card__sub">widget failed to load</div>
          <div class="btc-card__sub" style="opacity:.85;white-space:normal;">${String(e)}</div>
        `;
        slot.replaceChildren(err);
      }
    }
  }

  function applyDefaultMode(manifest) {
    const mode = manifest?.defaultMode || "full";
    if (W.ZZXHUD) W.ZZXHUD.setMode(mode);
  }

  async function boot() {
    await ensureCore();
    bindHudHandle();

    const manifest = await loadManifest();
    applyDefaultMode(manifest);
    await mountAllWidgets(manifest);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  // optional rebind hook
  W.ZZXWidgetsRuntime = {
    rebind: async function (force = false) {
      if (force) {
        // clear mounted flags so everything remounts
        document.querySelectorAll(".btc-slot").forEach(s => {
          s.dataset.mounted = "0";
          s.replaceChildren();
        });
      }
      try {
        await boot();
      } catch (_) {}
    }
  };
})();
