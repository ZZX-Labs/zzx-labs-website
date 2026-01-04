// static/js/modules/ticker-loader.js
// HARD-FIX: enforce load order so runtime never runs before widget-core exists.
// - prefix-aware
// - mounts runtime.html into #btc-ticker only
// - loads core -> hud-state -> runtime (strict order, no defer races)
// - retries until mounts exist (partials-loader injection delay safe)

(function () {
  const W = window;
  if (W.__ZZX_TICKER_LOADER_BOOTED) return;
  W.__ZZX_TICKER_LOADER_BOOTED = true;

  // -------- prefix-aware URL builder --------
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

  function hrefs() {
    const prefix = getPrefix();
    return {
      CORE_CSS: join(prefix, "/__partials/widgets/_core/widget-core.css"),
      CORE_JS: join(prefix, "/__partials/widgets/_core/widget-core.js"),
      HUD_STATE_JS: join(prefix, "/__partials/widgets/hud-state.js"),
      HUD_HTML: join(prefix, "/__partials/widgets/runtime.html"),
      HUD_RUNTIME_JS: join(prefix, "/__partials/widgets/runtime.js"),
    };
  }

  // -------- inject helpers --------
  function ensureCSSOnce(href) {
    if (document.querySelector('link[data-zzx-core-css="1"]')) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute("data-zzx-core-css", "1");
    document.head.appendChild(l);
  }

  function loadScriptOnce(key, src) {
    const sel = `script[data-zzx-script="${key}"]`;
    const existing = document.querySelector(sel);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      // IMPORTANT: no defer here. We want deterministic execution timing.
      s.async = true; // load async, but we await onload in a strict chain
      s.setAttribute("data-zzx-script", key);
      s.onload = () => resolve(s);
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.body.appendChild(s);
    });
  }

  async function mountHUDShell(HUD_HTML) {
    const container = document.getElementById("ticker-container");
    const mount = document.getElementById("btc-ticker");
    if (!container || !mount) return false;

    // prevent overlapping loads
    if (container.dataset.hudLoading === "1") return false;

    // already mounted?
    if (container.dataset.hudLoaded === "1" && mount.innerHTML.trim().length) {
      return true;
    }

    container.dataset.hudLoading = "1";
    try {
      const r = await fetch(HUD_HTML, { cache: "no-store" });
      if (!r.ok) throw new Error(`runtime.html HTTP ${r.status}`);
      const html = await r.text();
      mount.innerHTML = html;
      container.dataset.hudLoaded = "1";
      return true;
    } finally {
      container.dataset.hudLoading = "0";
    }
  }

  async function bootOnce() {
    const { CORE_CSS, CORE_JS, HUD_STATE_JS, HUD_HTML, HUD_RUNTIME_JS } = hrefs();

    // 1) CSS first (so UI isn't naked)
    ensureCSSOnce(CORE_CSS);

    // 2) Ensure HUD shell is mounted (bar + rail exist)
    const mounted = await mountHUDShell(HUD_HTML);
    if (!mounted) return false;

    // 3) HARD ORDER: core -> hud-state -> runtime
    await loadScriptOnce("zzx-widget-core", CORE_JS);
    await loadScriptOnce("zzx-hud-state", HUD_STATE_JS);
    await loadScriptOnce("zzx-widgets-runtime", HUD_RUNTIME_JS);

    return true;
  }

  // -------- retry/watch --------
  let mo = null;
  let timer = null;

  async function tryBoot() {
    try {
      const ok = await bootOnce();
      return !!ok;
    } catch (e) {
      console.warn("[ZZX HUD] boot error:", e);
      return false;
    }
  }

  function startWatching() {
    if (!timer) {
      timer = setInterval(async () => {
        const ok = await tryBoot();
        if (ok) stopWatching();
      }, 650);
    }

    if (!mo) {
      mo = new MutationObserver(async () => {
        const ok = await tryBoot();
        if (ok) stopWatching();
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  function stopWatching() {
    if (timer) { clearInterval(timer); timer = null; }
    if (mo) { mo.disconnect(); mo = null; }
  }

  async function boot() {
    const ok = await tryBoot();
    if (!ok) startWatching();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
