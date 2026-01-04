// static/js/modules/ticker-loader.js
// DROP-IN REPLACEMENT
//
// Boots the entire HUD stack reliably (core CSS+JS, HUD state, runtime),
// prefix-aware (works from any depth / GH Pages / subpaths),
// and mounts the runtime shell into #btc-ticker (never overwrites #ticker-container).
//
// HARD REQUIREMENTS (fixes “HTML loads but widget JS never loads data”):
//  1) Load _core/widget-core.css
//  2) Load hud-state.js
//  3) Load _core/widget-core.js (this defines window.ZZXWidgets.register + Core.onMount)
//  4) Mount runtime.html into #btc-ticker
//  5) Load runtime.js (which mounts all widgets from manifest)
//
// ALSO:
//  - waits for partials-loader to publish window.ZZX.PREFIX (or zzx:partials-ready event)
//  - retries safely if mount nodes appear later (partials injected after initial paint)

(function () {
  const W = window;

  if (W.__ZZX_TICKER_LOADER_BOOTED) return;
  W.__ZZX_TICKER_LOADER_BOOTED = true;

  // ---------- prefix-aware URL builder ----------
  function getPrefix() {
    const p = W.ZZX?.PREFIX;
    return (typeof p === "string" && p.length) ? p : ".";
  }

  function join(prefix, path) {
    if (!path) return path;
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    if (prefix === "/") return path;           // hosted at domain root
    if (!path.startsWith("/")) return path;    // already relative
    return prefix.replace(/\/+$/, "") + path;
  }

  function hrefs(prefixOverride) {
    const prefix = (typeof prefixOverride === "string" && prefixOverride.length)
      ? prefixOverride
      : getPrefix();

    return {
      CORE_CSS: join(prefix, "/__partials/widgets/_core/widget-core.css"),
      HUD_STATE_JS: join(prefix, "/__partials/widgets/hud-state.js"),
      CORE_JS: join(prefix, "/__partials/widgets/_core/widget-core.js"),
      RUNTIME_HTML: join(prefix, "/__partials/widgets/runtime.html"),
      RUNTIME_JS: join(prefix, "/__partials/widgets/runtime.js"),
    };
  }

  // ---------- injectors ----------
  function ensureCSS(href, marker) {
    const sel = `link[data-zzx-css="${marker}"]`;
    if (document.querySelector(sel)) return true;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute("data-zzx-css", marker);
    document.head.appendChild(l);
    return true;
  }

  function ensureScriptOnce(src, marker) {
    const sel = `script[data-zzx-js="${marker}"]`;
    if (document.querySelector(sel)) return Promise.resolve(true);

    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = src;
      s.defer = true;
      s.setAttribute("data-zzx-js", marker);
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.body.appendChild(s);
    });
  }

  async function mountRuntimeShell(runtimeHtmlUrl) {
    const container = document.getElementById("ticker-container");
    const mount = document.getElementById("btc-ticker");
    if (!container || !mount) return false;

    // already mounted and non-empty
    if (container.dataset.tickerLoaded === "1" && mount.innerHTML.trim().length) return true;

    // prevent overlapping loads
    if (container.dataset.tickerLoading === "1") return false;
    container.dataset.tickerLoading = "1";

    try {
      const r = await fetch(runtimeHtmlUrl, { cache: "no-store" });
      if (!r.ok) throw new Error(`runtime.html HTTP ${r.status}`);
      const html = await r.text();

      // IMPORTANT: mount only. never touch container.innerHTML.
      mount.innerHTML = html;

      container.dataset.tickerLoaded = "1";
      return true;
    } finally {
      container.dataset.tickerLoading = "0";
    }
  }

  // ---------- readiness gates ----------
  function prefixLooksReady() {
    // partials-loader sets window.ZZX.PREFIX, but on some pages the first boot can race it.
    // We consider ready if it's a non-empty string.
    const p = W.ZZX?.PREFIX;
    return (typeof p === "string" && p.length > 0);
  }

  function waitForPrefix(timeoutMs = 1200) {
    if (prefixLooksReady()) return Promise.resolve(getPrefix());

    return new Promise((resolve) => {
      let done = false;

      const onEvt = (e) => {
        if (done) return;
        done = true;
        cleanup();
        const p = e?.detail?.prefix;
        resolve((typeof p === "string" && p.length) ? p : getPrefix());
      };

      const pollStart = performance.now();
      const poll = () => {
        if (done) return;
        if (prefixLooksReady()) {
          done = true;
          cleanup();
          resolve(getPrefix());
          return;
        }
        if (performance.now() - pollStart >= timeoutMs) {
          done = true;
          cleanup();
          resolve(getPrefix());
          return;
        }
        setTimeout(poll, 60);
      };

      const cleanup = () => {
        try { W.removeEventListener("zzx:partials-ready", onEvt); } catch (_) {}
      };

      W.addEventListener("zzx:partials-ready", onEvt, { once: true });
      poll();
    });
  }

  // ---------- boot + retry strategy ----------
  let mo = null;
  let retryTimer = null;
  let inflight = false;

  async function tryBootOnce(prefixOverride) {
    if (inflight) return false;
    inflight = true;

    const { CORE_CSS, HUD_STATE_JS, CORE_JS, RUNTIME_HTML, RUNTIME_JS } = hrefs(prefixOverride);

    try {
      ensureCSS(CORE_CSS, "widgets-core");

      // Need mount nodes (#ticker-container + #btc-ticker)
      const mounted = await mountRuntimeShell(RUNTIME_HTML);
      if (!mounted) return false;

      // CRITICAL: dependency order
      const okHud  = await ensureScriptOnce(HUD_STATE_JS, "hud-state");
      const okCore = await ensureScriptOnce(CORE_JS, "widgets-core");
      const okRun  = await ensureScriptOnce(RUNTIME_JS, "widgets-runtime");

      if (!okHud || !okCore || !okRun) {
        // allow retries (do not permanently brick the mount)
        const container = document.getElementById("ticker-container");
        if (container) container.dataset.tickerLoaded = "0";
        return false;
      }

      return true;
    } catch (e) {
      console.warn("[ZZX HUD] loader error:", e);
      const container = document.getElementById("ticker-container");
      if (container) container.dataset.tickerLoaded = "0";
      return false;
    } finally {
      inflight = false;
    }
  }

  function startWatching(prefixOverride) {
    if (mo) return;

    if (!retryTimer) {
      retryTimer = setInterval(async () => {
        const ok = await tryBootOnce(prefixOverride);
        if (ok) stopWatching();
      }, 700);
    }

    mo = new MutationObserver(async () => {
      const ok = await tryBootOnce(prefixOverride);
      if (ok) stopWatching();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  function stopWatching() {
    if (mo) { mo.disconnect(); mo = null; }
    if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
  }

  async function boot() {
    // wait for prefix (or timeout to ".")
    const prefix = await waitForPrefix(1200);

    // attempt once immediately
    const ok = await tryBootOnce(prefix);

    // if the mount nodes come later (partials injection / slow), watch + retry
    if (!ok) startWatching(prefix);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
