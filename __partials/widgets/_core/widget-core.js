// __partials/widgets/_core/widget-core.js
(function () {
  const W = window;
  if (W.ZZXWidgetsCore) return;

  function qs(sel, root = document) { return root.querySelector(sel); }
  function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  function getPrefix() {
    // partials-loader sets window.ZZX.PREFIX
    const p = W.ZZX?.PREFIX;
    return (typeof p === "string" && p.length) ? p : ".";
  }

  function join(prefix, path) {
    if (!path) return path;
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    if (prefix === "/") return path;
    if (!path.startsWith("/")) return path;
    return prefix.replace(/\/+$/, "") + path;
  }

  async function fetchText(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.text();
  }

  function ensureCSS(href, key) {
    const id = `zzx-css:${key}`;
    if (document.querySelector(`link[data-zzx-asset="${id}"]`)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute("data-zzx-asset", id);
    document.head.appendChild(l);
  }

  function ensureJS(src, key) {
    const id = `zzx-js:${key}`;
    if (document.querySelector(`script[data-zzx-asset="${id}"]`)) return;
    const s = document.createElement("script");
    s.src = src;
    // IMPORTANT: do NOT rely on defer for dynamically inserted scripts
    s.async = true;
    s.setAttribute("data-zzx-asset", id);
    document.body.appendChild(s);
  }

  // Mount a widget into a slot:
  // - loads widget.html
  // - wraps it in .zzx-widget to match rail layout
  // - ensures widget.css and widget.js are included (once)
  async function mountWidget(widgetId, slotEl) {
    if (!widgetId || !slotEl) return false;

    // If already mounted with content, skip.
    if (slotEl.dataset.mounted === "1" && slotEl.innerHTML.trim().length) return true;

    // Avoid parallel mounts.
    if (slotEl.dataset.mounting === "1") return false;
    slotEl.dataset.mounting = "1";

    const prefix = getPrefix();
    const base = join(prefix, `/__partials/widgets/${widgetId}`);

    const htmlURL = `${base}/widget.html`;
    const cssURL  = `${base}/widget.css`;
    const jsURL   = `${base}/widget.js`;

    try {
      // Load CSS/JS *before* HTML is inserted (CSS for initial paint; JS can run after insert)
      ensureCSS(cssURL, `widget:${widgetId}`);
      const html = await fetchText(htmlURL);

      // Build wrapper
      const wrap = document.createElement("div");
      wrap.className = "zzx-widget";
      wrap.setAttribute("data-widget-id", widgetId);

      // Insert widget HTML into wrapper
      wrap.innerHTML = html;

      // Replace slot contents
      slotEl.innerHTML = "";
      slotEl.appendChild(wrap);

      // Now load widget JS (once). Widget JS should self-boot by querying inside [data-widget-id="..."]
      ensureJS(jsURL, `widget:${widgetId}`);

      // Mark mounted only after success
      slotEl.dataset.mounted = "1";
      return true;
    } catch (e) {
      // rollback so future retries can happen
      slotEl.dataset.mounted = "0";
      slotEl.innerHTML = "";
      console.warn(`[ZZXWidgets] mount failed for ${widgetId}:`, e);
      return false;
    } finally {
      slotEl.dataset.mounting = "0";
    }
  }

  async function mountAllFromDOM(root = document) {
    const slots = qsa(".btc-slot[data-widget]", root);
    let okCount = 0;
    for (const slot of slots) {
      const id = slot.getAttribute("data-widget");
      const ok = await mountWidget(id, slot);
      if (ok) okCount++;
    }
    return okCount;
  }

  W.ZZXWidgetsCore = {
    qs, qsa,
    getPrefix, join,
    ensureCSS, ensureJS,
    mountWidget,
    mountAllFromDOM,
  };
})();
