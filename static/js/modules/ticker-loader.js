// static/js/modules/ticker-loader.js
// ZZX HUD Loader (single source of truth)
// - prefix-aware (works from any depth / GH Pages / subpaths)
// - injects core CSS once
// - mounts runtime.html into #btc-ticker only
// - loads runtime.js once
// - watches DOM until ticker-container + btc-ticker exist

(function () {
  const W = window;
  if (W.__ZZX_TICKER_LOADER_BOOTED) return;
  W.__ZZX_TICKER_LOADER_BOOTED = true;

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

  function hrefs() {
    const prefix = getPrefix();
    return {
      CORE_CSS: join(prefix, "/__partials/widgets/_core/widget-core.css"),
      CORE_JS:  join(prefix, "/__partials/widgets/_core/widget-core.js"),
      HUD_HTML: join(prefix, "/__partials/widgets/runtime.html"),
      HUD_JS:   join(prefix, "/__partials/widgets/runtime.js"),
      HUD_STATE: join(prefix, "/__partials/widgets/hud-state.js"),
    };
  }

  function ensureLinkOnce(href, attrName, attrVal) {
    if (document.querySelector(`link[${attrName}="${attrVal}"]`)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute(attrName, attrVal);
    document.head.appendChild(l);
  }

  function ensureScriptOnce(src, attrName, attrVal) {
    if (document.querySelector(`script[${attrName}="${attrVal}"]`)) return;
    const s = document.createElement("script");
    s.src = src;
    s.defer = true;
    s.setAttribute(attrName, attrVal);
    document.body.appendChild(s);
  }

  async function mountHUD(hrefsObj) {
    const container = document.getElementById("ticker-container");
    const mount = document.getElementById("btc-ticker");
    if (!container || !mount) return false;

    // already mounted?
    if (container.dataset.hudLoaded === "1" && mount.innerHTML.trim().length) {
      ensureScriptOnce(hrefsObj.CORE_JS, "data-zzx-core-js", "1");
      ensureScriptOnce(hrefsObj.HUD_STATE, "data-zzx-hud-state-js", "1");
      ensureScriptOnce(hrefsObj.HUD_JS, "data-zzx-hud-runtime-js", "1");
      return true;
    }

    if (container.dataset.hudLoading === "1") return false;
    container.dataset.hudLoading = "1";

    try {
      const r = await fetch(hrefsObj.HUD_HTML, { cache: "no-store" });
      if (!r.ok) throw new Error(`HUD shell html HTTP ${r.status}`);
      const html = await r.text();

      // IMPORTANT: mount only (never overwrite ticker-container itself)
      mount.innerHTML = html;
      container.dataset.hudLoaded = "1";

      // core + state + runtime
      ensureScriptOnce(hrefsObj.CORE_JS, "data-zzx-core-js", "1");
      ensureScriptOnce(hrefsObj.HUD_STATE, "data-zzx-hud-state-js", "1");
      ensureScriptOnce(hrefsObj.HUD_JS, "data-zzx-hud-runtime-js", "1");

      return true;
    } finally {
      container.dataset.hudLoading = "0";
    }
  }

  async function tryBootOnce() {
    const h = hrefs();
    ensureLinkOnce(h.CORE_CSS, "data-zzx-core-css", "1");
    try {
      return await mountHUD(h);
    } catch (e) {
      console.warn("[ZZX HUD] loader error:", e);
      const container = document.getElementById("ticker-container");
      if (container) container.dataset.hudLoaded = "0";
      return false;
    }
  }

  let mo = null;
  let retry = null;

  function watch() {
    if (!retry) {
      retry = setInterval(async () => {
        const ok = await tryBootOnce();
        if (ok) stop();
      }, 700);
    }
    if (!mo) {
      mo = new MutationObserver(async () => {
        const ok = await tryBootOnce();
        if (ok) stop();
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  function stop() {
    if (retry) { clearInterval(retry); retry = null; }
    if (mo) { mo.disconnect(); mo = null; }
  }

  async function boot() {
    const ok = await tryBootOnce();
    if (!ok) watch();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
