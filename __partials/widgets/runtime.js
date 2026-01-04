// __partials/widgets/runtime.js
(function () {
  const W = window;
  if (W.__ZZX_WIDGETS_RUNTIME_BOOTED) return;
  W.__ZZX_WIDGETS_RUNTIME_BOOTED = true;

  function $(sel, root = document) { return root.querySelector(sel); }

  async function boot() {
    const Core = W.ZZXWidgetsCore;
    if (!Core) return console.warn("ZZXWidgetsCore missing");

    const prefix = Core.getPrefix();

    // 1) Ensure core CSS first
    Core.ensureCSS(Core.join(prefix, "/__partials/widgets/_core/widget-core.css"), "widgets-core");

    // 2) Load runtime.html into #btc-ticker mount (or whatever your ticker-loader uses)
    // You are mounting the entire HUD fragment somewhere already. Here we only ensure slots get built.
    const rail = document.getElementById("btc-rail") || $("[data-hud-root]");
    if (!rail) return; // ticker-loader will retry later

    // 3) Load widgets manifest
    const manifestUrl = Core.join(prefix, "/__partials/widgets/manifest.json");
    const manifest = await Core.fetchJSON(manifestUrl);

    // 4) Boot HUD state machine
    Core.ensureJS(Core.join(prefix, "/__partials/widgets/hud-state.js"), "hud-state");
    // wait a tick for hud-state global to exist
    await new Promise(r => setTimeout(r, 0));
    if (W.ZZXHudState) W.ZZXHudState.boot(manifest.defaultMode || "full");

    // 5) Build slots based on manifest
    const list = Array.isArray(manifest.widgets) ? manifest.widgets.slice() : [];
    list.sort((a, b) => (a.priority ?? 9999) - (b.priority ?? 9999));

    const slotClass = manifest.slotClass || "btc-slot";
    const enabled = list.filter(w => w && w.id && w.enabled !== false);

    rail.innerHTML = "";
    for (const w of enabled) {
      const slot = document.createElement("div");
      slot.className = slotClass;
      slot.dataset.widget = w.id;
      slot.setAttribute("data-widget", w.id);
      rail.appendChild(slot);
    }

    // 6) Load each widget: widget.html -> slot, widget.css -> head, widget.js -> body
    for (const w of enabled) {
      const id = w.id;
      const base = `/__partials/widgets/${id}`;

      const cssHref = Core.join(prefix, `${base}/widget.css`);
      const jsSrc   = Core.join(prefix, `${base}/widget.js`);
      const htmlUrl = Core.join(prefix, `${base}/widget.html`);

      // runtime widget may have no css/html? (yours does)
      try { Core.ensureCSS(cssHref, `w-${id}`); } catch (_) {}
      try { Core.ensureJS(jsSrc, `w-${id}`); } catch (_) {}

      const slot = rail.querySelector(`[data-widget="${id}"]`);
      if (!slot) continue;

      try {
        const html = await Core.fetchText(htmlUrl);
        slot.innerHTML = html;
      } catch (e) {
        slot.innerHTML = `<div class="btc-card"><div class="btc-card__title">${w.title || id}</div><div class="btc-card__sub">widget.html missing</div></div>`;
        console.warn("Widget html load failed:", id, e);
      }
    }
  }

  // Retry logic: partials/ticker-loader may mount late
  let tries = 0;
  const max = 30;

  async function tryBootLoop() {
    tries++;
    try { await boot(); } catch (e) { console.warn("runtime boot error:", e); }
    const rail = document.getElementById("btc-rail") || document.querySelector("[data-hud-root]");
    if (rail || tries >= max) return;
    setTimeout(tryBootLoop, 350);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tryBootLoop, { once: true });
  } else {
    tryBootLoop();
  }
})();
