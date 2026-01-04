// __partials/credits/loader.js
// ZZX Credits Loader (DROP-IN REPLACEMENT)
// - Safe as classic script OR module
// - Prefix-aware (works from any depth / GH Pages subpaths)
// - Loads: /__partials/credits/credits.css + /__partials/credits/credits.js
// - Injects a small "Credits" toggle button/icon into the footer (or body fallback)
// - Toggles a credits panel anchored near the footer
// - Persists open/closed state in localStorage
// - Never hard-crashes the page if assets are missing

(() => {
  const W = window;

  // Prevent double-boot
  if (W.__ZZX_CREDITS_LOADER_BOOTED) return;
  W.__ZZX_CREDITS_LOADER_BOOTED = true;

  const STATE_KEY = "zzx.credits.open";

  // ---------- prefix-aware join ----------
  function getPrefix() {
    const p1 = W.ZZX?.PREFIX;
    if (typeof p1 === "string" && p1.length) return p1;

    const p2 = document.documentElement?.getAttribute("data-zzx-prefix");
    if (typeof p2 === "string" && p2.length) return p2;

    return ".";
  }

  function join(prefix, path) {
    if (!path) return path;
    if (/^https?:\/\//i.test(path)) return path;
    if (prefix === "/") return path;
    if (!path.startsWith("/")) return path;
    return prefix.replace(/\/+$/, "") + path;
  }

  // ---------- cache-bust passthrough ----------
  function getQuerySuffix() {
    try {
      const src = document.currentScript?.getAttribute("src") || "";
      const q = src.includes("?") ? src.slice(src.indexOf("?")) : "";
      if (q) return q;

      const meta = document.querySelector('meta[name="asset-version"]')?.getAttribute("content");
      return meta ? `?v=${encodeURIComponent(meta)}` : "";
    } catch (_) {
      return "";
    }
  }

  // ---------- helpers ----------
  function escapeHTML(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function readOpen() {
    try { return localStorage.getItem(STATE_KEY) === "1"; } catch (_) { return false; }
  }
  function writeOpen(isOpen) {
    try { localStorage.setItem(STATE_KEY, isOpen ? "1" : "0"); } catch (_) {}
  }

  // ---------- loaders ----------
  function ensureCSSOnce(id, href) {
    const sel = `link[data-zzx-credits-css="${id}"]`;
    if (document.querySelector(sel)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute("data-zzx-credits-css", id);
    document.head.appendChild(l);
  }

  function ensureJSOnce(id, src) {
    const sel = `script[data-zzx-credits-js="${id}"]`;
    if (document.querySelector(sel)) return Promise.resolve(true);

    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = src;
      s.defer = true;
      s.setAttribute("data-zzx-credits-js", id);
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false); // non-fatal
      document.body.appendChild(s);
    });
  }

  // ---------- mount targets ----------
  function getFooterOrBody() {
    return document.getElementById("zzx-footer") || document.querySelector("footer") || document.body;
  }

  function ensureMountNodes() {
    // Host: where the toggle button lives
    let host = document.querySelector("[data-zzx-credits-host]");
    if (!host) {
      host = document.createElement("div");
      host.setAttribute("data-zzx-credits-host", "1");
      // Prefer footer so it appears "near/or part of the footer"
      getFooterOrBody().appendChild(host);
    }

    // Panel mount: where credits.js will render content
    let panel = document.getElementById("zzx-credits");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "zzx-credits";
      panel.setAttribute("data-zzx-credits-panel", "1");
      // Keep it adjacent to host (footer region)
      host.appendChild(panel);
    } else {
      // Ensure it is marked for our toggling, without moving it around
      panel.setAttribute("data-zzx-credits-panel", "1");
    }

    return { host, panel };
  }

  function ensureToggleButton(host) {
    let btn = host.querySelector("[data-zzx-credits-toggle]");
    if (btn) return btn;

    btn = document.createElement("button");
    btn.type = "button";
    btn.className = "zzx-credits__toggle";
    btn.setAttribute("data-zzx-credits-toggle", "1");
    btn.setAttribute("aria-controls", "zzx-credits");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("title", "Credits");

    // Icon-only button; CSS will make it look clean
    // (SVG inline so you don’t depend on any image paths)
    btn.innerHTML = `
      <span class="zzx-credits__toggleIcon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 22a10 10 0 1 0-10-10 10 10 0 0 0 10 10Z" stroke="currentColor" stroke-width="1.6"/>
          <path d="M12 11.2v5.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          <path d="M12 7.4h.01" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
        </svg>
      </span>
      <span class="zzx-credits__toggleText">Credits</span>
    `;

    host.insertBefore(btn, host.firstChild);
    return btn;
  }

  function setPanelOpen(panel, btn, isOpen) {
    panel.toggleAttribute("hidden", !isOpen);
    btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    writeOpen(isOpen);
  }

  function renderFail(panel, msg) {
    panel.innerHTML =
      `<div class="zzx-credits__fail">
         <div class="zzx-credits__failTitle">Credits</div>
         <div class="zzx-credits__failMsg">${escapeHTML(msg)}</div>
       </div>`;
  }

  async function boot() {
    const prefix = getPrefix();
    const qs = getQuerySuffix();

    const CSS_URL = join(prefix, `/__partials/credits/credits.css${qs}`);
    const JS_URL  = join(prefix, `/__partials/credits/credits.js${qs}`);

    // CSS preferred but optional
    try { ensureCSSOnce("v1", CSS_URL); } catch (_) {}

    const { host, panel } = ensureMountNodes();
    const btn = ensureToggleButton(host);

    // Default state: closed
    const open = readOpen();
    setPanelOpen(panel, btn, open);

    // Bind click once
    if (!btn.__zzxBound) {
      btn.__zzxBound = true;
      btn.addEventListener("click", async () => {
        const nowOpen = !(panel.hasAttribute("hidden") ? false : true);
        // toggle
        const nextOpen = !nowOpen;
        setPanelOpen(panel, btn, nextOpen);

        // lazy-load credits.js on first open
        if (nextOpen && panel.dataset.zzxCreditsLoaded !== "1") {
          panel.dataset.zzxCreditsLoaded = "loading";
          const ok = await ensureJSOnce("v1", JS_URL);
          if (ok) {
            panel.dataset.zzxCreditsLoaded = "1";
          } else {
            panel.dataset.zzxCreditsLoaded = "0";
            renderFail(panel, "credits.js failed to load");
          }
        }
      });
    }

    // If we start open, load immediately so the panel is populated
    if (open && panel.dataset.zzxCreditsLoaded !== "1") {
      panel.dataset.zzxCreditsLoaded = "loading";
      const ok = await ensureJSOnce("v1", JS_URL);
      if (ok) {
        panel.dataset.zzxCreditsLoaded = "1";
      } else {
        panel.dataset.zzxCreditsLoaded = "0";
        renderFail(panel, "credits.js failed to load");
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
