// __partials/widgets/runtime/widget.js
(function () {
  const W = window;
  W.ZZXWidgets = W.ZZXWidgets || {};

  const HUD_KEY = "zzx.hud.state";
  const ORDER_KEY = "zzx.hud.order"; // optional later

  function getState() {
    try {
      const v = localStorage.getItem(HUD_KEY);
      if (v === "full" || v === "ticker-only" || v === "hidden") return v;
    } catch {}
    return "full";
  }

  function setState(rootEl, state) {
    rootEl.setAttribute("data-hud-state", state);
    try { localStorage.setItem(HUD_KEY, state); } catch {}
    // toggle recover visibility is handled by CSS + [data-hud-state]
    const rec = rootEl.querySelector("[data-zzx-recover]");
    if (rec) rec.hidden = (state !== "hidden");
  }

  // prefix-aware join
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

  async function fetchJSON(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
    return await r.json();
  }
  async function fetchText(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
    return await r.text();
  }

  function ensureCSS(href, key) {
    if (document.querySelector(`link[data-zzx-css="${key}"]`)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute("data-zzx-css", key);
    document.head.appendChild(l);
  }

  function ensureJS(src, key) {
    if (document.querySelector(`script[data-zzx-js="${key}"]`)) return;
    const s = document.createElement("script");
    s.src = src;
    s.defer = true;
    s.setAttribute("data-zzx-js", key);
    document.body.appendChild(s);
  }

  async function mountWidget(widgetId, railEl) {
    const prefix = getPrefix();
    const base = join(prefix, `/__partials/widgets/${widgetId}`);
    const htmlURL = `${base}/widget.html`;
    const cssURL  = `${base}/widget.css`;
    const jsURL   = `${base}/widget.js`;

    // inject CSS/JS once
    ensureCSS(cssURL, `w:${widgetId}`);
    ensureJS(jsURL, `w:${widgetId}`);

    // create host wrapper for the widget
    let host = railEl.querySelector(`[data-widget-id="${widgetId}"]`);
    if (!host) {
      host = document.createElement("div");
      host.setAttribute("data-widget-id", widgetId);
      // you can add common card sizing here if you want:
      host.className = "btc-slot";
      railEl.appendChild(host);
    }

    // load html once into host
    if (!host.dataset.zzxMounted) {
      const html = await fetchText(htmlURL);
      host.innerHTML = html;
      host.dataset.zzxMounted = "1";
      // if widget-core exists, let it init; else widget can self-init on load
      if (W.ZZXWidgetCore?.notifyMounted) W.ZZXWidgetCore.notifyMounted(widgetId, host);
    }
  }

  async function mountAll(rootSlotEl) {
    const prefix = getPrefix();
    const rail = rootSlotEl.querySelector("#zzx-widgets-rail");
    if (!rail) return;

    const manifestURL = join(prefix, "/__partials/widgets/manifest.json");
    const mf = await fetchJSON(manifestURL);
    const list = Array.isArray(mf?.widgets) ? mf.widgets.slice() : [];

    // sort by priority if present
    list.sort((a, b) => (Number(a.priority) || 0) - (Number(b.priority) || 0));

    for (const w of list) {
      if (!w?.id) continue;
      if (w.enabled === false) continue;
      await mountWidget(w.id, rail);
    }
  }

  W.ZZXWidgets["runtime"] = {
    async init(slot) {
      // apply saved state immediately
      setState(slot, getState());

      // bind bar buttons
      slot.querySelectorAll("[data-zzx-mode]").forEach(btn => {
        if (btn.__bound) return;
        btn.__bound = true;
        btn.addEventListener("click", () => setState(slot, btn.getAttribute("data-zzx-mode")));
      });

      // reset = back to full + (later) reset order/layout/user prefs
      const reset = slot.querySelector('[data-zzx-action="reset"]');
      if (reset && !reset.__bound) {
        reset.__bound = true;
        reset.addEventListener("click", () => {
          try { localStorage.removeItem(HUD_KEY); } catch {}
          setState(slot, "full");
        });
      }

      // recover show button
      const show = slot.querySelector('[data-zzx-action="show"]');
      if (show && !show.__bound) {
        show.__bound = true;
        show.addEventListener("click", () => setState(slot, "full"));
      }

      // mount all widgets into rail
      await mountAll(slot);
    }
  };
})();
