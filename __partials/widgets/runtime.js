// __partials/widgets/runtime.js
(function () {
  const W = window;

  // single instance, rebind-safe
  if (W.ZZXWidgetsRuntime) {
    W.ZZXWidgetsRuntime.rebind(false);
    return;
  }

  const CoreBoot = {
    inited: false,
    loading: false,
  };

  function getPrefix() {
    const p = W.ZZX?.PREFIX;
    return (typeof p === "string" && p.length) ? p : ".";
  }

  function join(prefix, path) {
    if (!path) return path;
    if (prefix === "/" || /^https?:\/\//.test(path)) return path;
    if (!path.startsWith("/")) return path;
    return prefix.replace(/\/+$/, "") + path;
  }

  const PATHS = {
    coreCSS: "/__partials/widgets/_core/widget-core.css",
    coreJS:  "/__partials/widgets/_core/widget-core.js",
    hudJS:   "/__partials/widgets/hud-state.js",
    manifest:"/__partials/widgets/manifest.json",
  };

  function ensureCSS(href, key) {
    const sel = `link[data-zzx-css="${key}"]`;
    if (document.querySelector(sel)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute("data-zzx-css", key);
    document.head.appendChild(l);
  }

  function ensureJS(src, key) {
    const sel = `script[data-zzx-js="${key}"]`;
    if (document.querySelector(sel)) return;
    const s = document.createElement("script");
    s.src = src;
    s.defer = true;
    s.setAttribute("data-zzx-js", key);
    document.body.appendChild(s);
  }

  async function fetchJSON(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.json();
  }

  async function fetchText(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.text();
  }

  function slots() {
    return Array.from(document.querySelectorAll('.btc-slot[data-widget]'));
  }

  function hudRoot() {
    return document.querySelector('[data-hud-root]') || document.getElementById("btc-rail");
  }

  function handle() {
    return document.querySelector('[data-hud-handle]');
  }

  function widgetBase(id) {
    return `/__partials/widgets/${id}`;
  }

  function widgetURLs(prefix, id) {
    const base = widgetBase(id);
    return {
      html: join(prefix, `${base}/widget.html`),
      css: join(prefix, `${base}/widget.css`),
      js:  join(prefix, `${base}/widget.js`),
    };
  }

  async function bootCore(prefix) {
    if (CoreBoot.inited || CoreBoot.loading) return;
    CoreBoot.loading = true;

    ensureCSS(join(prefix, PATHS.coreCSS), "widgets-core");
    ensureJS(join(prefix, PATHS.coreJS), "widgets-core");
    ensureJS(join(prefix, PATHS.hudJS), "hud-state");

    // wait a beat for Core globals
    await new Promise(r => setTimeout(r, 25));

    CoreBoot.inited = true;
    CoreBoot.loading = false;
  }

  function applyMode() {
    const root = hudRoot();
    const h = handle();
    if (!root || !W.ZZXHUD) return;

    const s = W.ZZXHUD.read();
    root.setAttribute("data-mode", s.mode);
    if (h) h.hidden = (s.mode !== "hidden");
  }

  async function mountOne(prefix, slot, manifest) {
    const id = slot.getAttribute("data-widget");
    if (!id) return;

    // enabled?
    const entry = (manifest.widgets || []).find(w => w.id === id);
    const defaultEnabled = entry ? !!entry.enabled : true;

    // if HUD overrides exist, respect them; otherwise use manifest
    const enabled = W.ZZXHUD ? W.ZZXHUD.isEnabled(id, defaultEnabled) : defaultEnabled;

    // slot-level disable means: clear and hide slot
    if (!enabled) {
      slot.innerHTML = "";
      slot.style.display = "none";
      return;
    }
    slot.style.display = "";

    // prevent remount storms (but allow reinjection if emptied)
    if (slot.dataset.mounted === "1" && slot.innerHTML.trim().length) return;
    slot.dataset.mounted = "1";

    // runtime widget is just another widget; no special-casing here
    const { html, css, js } = widgetURLs(prefix, id);

    // css/js once per widget id
    ensureCSS(css, `wcss:${id}`);
    ensureJS(js,  `wjs:${id}`);

    // html into slot
    const frag = await fetchText(html);
    slot.innerHTML = frag;

    // mark widget root
    const root = slot.firstElementChild;
    if (root) root.classList.add("zzx-widget");
    if (root) root.setAttribute("data-widget", id);
  }

  async function mountAll(force) {
    const prefix = getPrefix();
    await bootCore(prefix);

    // wait until core is present (Core helpers are optional)
    await new Promise(r => setTimeout(r, 25));

    const manifest = await fetchJSON(join(prefix, PATHS.manifest));

    // default mode from manifest if none saved
    if (W.ZZXHUD) {
      const s = W.ZZXHUD.read();
      if (!s.mode && manifest.defaultMode) W.ZZXHUD.setMode(manifest.defaultMode);
    }

    applyMode();

    const list = slots();
    for (const slot of list) {
      if (force) slot.dataset.mounted = "0";
      await mountOne(prefix, slot, manifest);
    }

    // re-apply after mounts (runtime widget binds show/hide)
    applyMode();
  }

  const runtime = {
    async rebind(force) {
      try { await mountAll(!!force); } catch (e) { console.warn("[widgets runtime]", e); }
    },
  };

  W.ZZXWidgetsRuntime = runtime;

  // initial boot + reinjection watcher
  async function boot() {
    await runtime.rebind(false);

    // Observe DOM changes and rebind if the hud root or slots get replaced
    const mo = new MutationObserver(() => runtime.rebind(false));
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
