// /partials-loader.js
// ZZX Partials Loader — works from any depth, no server rewrites needed.
// FRAME-FIRST ORDER (required):
//   1) header + nav (composed)
//   2) footer
//   3) credits controller loaded AFTER footer (binds to #footer-credits-btn)
//   4) runtime loaded last
//   5) emit events so widget-core/HUD can safely start AFTER the frame exists
//
// Events:
//   - "zzx:frame:ready"    after header/nav/footer + credits controller are ready
//   - "zzx:partials:ready" after runtime is injected
//
// IMPORTANT (per your requirements):
// - DOES NOT inject any credits link, panel, host, toggle, or image icon.
// - DOES NOT touch header/nav/ticker/footer markup besides injecting the partial HTML.
// - Credits are handled ONLY by __partials/credits/credits.js bound to #footer-credits-btn (ⓘ Credits).

(function () {
  const PARTIALS_DIR = "__partials";

  const PATHS = [
    ".", "..", "../..", "../../..",
    "../../../..", "../../../../..", "../../../../../..", "../../../../../../..",
    "/" // final attempt: site root (only works if hosted at domain root)
  ];

  // ---------------------------------------------------------------------------
  // Probe + prefix
  // ---------------------------------------------------------------------------
  async function probe(url) {
    try {
      const r = await fetch(url, { method: "GET", cache: "no-store" });
      return r.ok;
    } catch (_) {
      return false;
    }
  }

  async function validateOrRecomputePrefix(cached) {
    if (cached) {
      const ok = await probe(join(cached, PARTIALS_DIR, "header/header.html"));
      if (ok) return cached;
      sessionStorage.removeItem("zzx.partials.prefix");
    }

    for (const p of PATHS) {
      const url = join(p, PARTIALS_DIR, "header/header.html");
      if (await probe(url)) {
        sessionStorage.setItem("zzx.partials.prefix", p);
        return p;
      }
    }

    return ".";
  }

  async function findPrefix() {
    const cached = sessionStorage.getItem("zzx.partials.prefix");
    return await validateOrRecomputePrefix(cached);
  }

  function join(...segs) {
    return segs
      .filter(Boolean)
      .map((s, i) => {
        if (i === 0) return s === "/" ? "/" : s.replace(/\/+$/, "");
        return s.replace(/^\/+/, "");
      })
      .join("/");
  }

  function absToPrefix(url, prefix) {
    if (prefix === "/" || !url.startsWith("/")) return url;
    return prefix.replace(/\/+$/, "") + url;
  }

  function rewriteAbsoluteURLs(root, prefix) {
    if (prefix !== "/") {
      root.querySelectorAll('[href^="/"]').forEach(a => {
        const v = a.getAttribute("href");
        if (v) a.setAttribute("href", absToPrefix(v, prefix));
      });
      root.querySelectorAll('[src^="/"]').forEach(el => {
        const v = el.getAttribute("src");
        if (v) el.setAttribute("src", absToPrefix(v, prefix));
      });
    }
  }

  async function loadHTML(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`Failed to fetch ${url}: ${r.status}`);
    return await r.text();
  }

  // ---------------------------------------------------------------------------
  // Compose header + nav
  // ---------------------------------------------------------------------------
  function injectNavIntoHeader(headerHTML, navHTML) {
    const marker = "<!-- navbar Here -->";
    if (headerHTML.includes(marker)) return headerHTML.replace(marker, navHTML);

    const idx = headerHTML.lastIndexOf("</div>");
    if (idx !== -1) {
      return headerHTML.slice(0, idx) + "\n" + navHTML + "\n" + headerHTML.slice(idx);
    }
    return headerHTML + "\n" + navHTML;
  }

  function initNavUX(scope = document) {
    const toggle = scope.querySelector("#navbar-toggle");
    const links = scope.querySelector("#navbar-links");
    const body = document.body;

    if (toggle && links && !toggle.__bound_click) {
      toggle.__bound_click = true;
      toggle.addEventListener("click", () => {
        const isOpen = links.classList.toggle("open");
        toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
        links.setAttribute("aria-hidden", isOpen ? "false" : "true");
        body.classList.toggle("no-scroll", isOpen);
      });
    }

    scope.querySelectorAll(".submenu-toggle").forEach(btn => {
      if (btn.__bound_click) return;
      btn.__bound_click = true;
      btn.addEventListener("click", () => {
        const ul = btn.nextElementSibling;
        if (ul && ul.classList.contains("submenu")) {
          ul.classList.toggle("open");
          btn.classList.toggle("open");
        }
      });
    });
  }

  function waitForSitewideInit(timeoutMs = 1200, intervalMs = 60) {
    return new Promise(resolve => {
      const t0 = performance.now();
      (function poll() {
        if (window.ZZXSite && typeof window.ZZXSite.initNav === "function") return resolve(true);
        if (performance.now() - t0 >= timeoutMs) return resolve(false);
        setTimeout(poll, intervalMs);
      })();
    });
  }

  // ---------------------------------------------------------------------------
  // Runtime (HUD + widgets) must load LAST
  // ---------------------------------------------------------------------------
  async function loadRuntime(prefix) {
    const candidates = [
      join(prefix, PARTIALS_DIR, "runtime/runtime.html"),
      join(prefix, PARTIALS_DIR, "runtime.html"),
      join(prefix, "runtime.html")
    ];

    let runtimeHost = document.getElementById("zzx-runtime");
    if (!runtimeHost) {
      runtimeHost = document.createElement("div");
      runtimeHost.id = "zzx-runtime";
      document.body.appendChild(runtimeHost);
    }

    for (const url of candidates) {
      try {
        const html = await loadHTML(url);
        const wrap = document.createElement("div");
        wrap.innerHTML = html;
        rewriteAbsoluteURLs(wrap, prefix);
        runtimeHost.replaceChildren(...wrap.childNodes);
        runtimeHost.setAttribute("data-runtime-source", url);
        return { ok: true, url };
      } catch (_) {}
    }

    return { ok: false, reason: "fetch_failed" };
  }

  // ---------------------------------------------------------------------------
  // Optional ticker (duplicate-safe)
  // ---------------------------------------------------------------------------
  async function maybeLoadTicker(prefix) {
    if (window.__ZZX_TICKER_LOADED || document.querySelector('script[data-zzx-ticker]')) return;

    const tc = document.getElementById("ticker-container");
    if (!tc) return;

    try {
      const html = await loadHTML(join(prefix, "bitcoin/ticker/ticker.html"));
      tc.innerHTML = html;

      const s = document.createElement("script");
      s.src = join(prefix, "bitcoin/ticker/ticker.js") + `?v=${Date.now()}`;
      s.defer = true;
      s.setAttribute("data-zzx-ticker", "1");
      document.body.appendChild(s);

      window.__ZZX_TICKER_LOADED = true;
      tc.dataset.tickerLoaded = "1";
    } catch (e) {
      console.warn("Ticker load failed:", e);
    }
  }

  // ---------------------------------------------------------------------------
  // Credits controller loader (AFTER footer)
  // ---------------------------------------------------------------------------
  function loadScriptOnce(src, dataAttr) {
    return new Promise((resolve) => {
      // De-dupe by marker OR by pathname
      if (dataAttr && document.querySelector(`script[${dataAttr}="1"]`)) return resolve({ ok: true, deduped: true });

      const abs = new URL(src, location.href).href;
      const absPath = new URL(abs).pathname;

      if ([...document.scripts].some(sc => {
        try { return new URL(sc.src).pathname === absPath; }
        catch { return false; }
      })) return resolve({ ok: true, deduped: true });

      const s = document.createElement("script");
      s.src = abs;
      s.defer = true;
      if (dataAttr) s.setAttribute(dataAttr, "1");
      s.onload = () => resolve({ ok: true });
      s.onerror = () => resolve({ ok: false });
      document.head.appendChild(s);
    });
  }

  // ---------------------------------------------------------------------------
  // Boot (STRICT ORDER)
  // ---------------------------------------------------------------------------
  async function boot() {
    const prefix = await findPrefix();
    window.ZZX = Object.assign({}, window.ZZX || {}, { PREFIX: prefix });

    // Ensure header/footer host nodes exist (frame anchors)
    let headerHost = document.getElementById("zzx-header");
    if (!headerHost) {
      headerHost = document.createElement("div");
      headerHost.id = "zzx-header";
      document.body.prepend(headerHost);
    }

    let footerHost = document.getElementById("zzx-footer");
    if (!footerHost) {
      footerHost = document.createElement("div");
      footerHost.id = "zzx-footer";
      document.body.appendChild(footerHost);
    }

    // 1) Load header + nav + footer FIRST (strict)
    const [headerHTML, navHTML, footerHTML] = await Promise.all([
      loadHTML(join(prefix, PARTIALS_DIR, "header/header.html")),
      loadHTML(join(prefix, PARTIALS_DIR, "nav/nav.html")),
      loadHTML(join(prefix, PARTIALS_DIR, "footer/footer.html"))
    ]);

    const composedHeader = injectNavIntoHeader(headerHTML, navHTML);

    const headerWrap = document.createElement("div");
    headerWrap.innerHTML = composedHeader;
    rewriteAbsoluteURLs(headerWrap, prefix);
    headerHost.replaceChildren(...headerWrap.childNodes);

    const footerWrap = document.createElement("div");
    footerWrap.innerHTML = footerHTML;
    rewriteAbsoluteURLs(footerWrap, prefix);
    footerHost.replaceChildren(...footerWrap.childNodes);

    // 2) Credits controller AFTER footer exists (binds to #footer-credits-btn)
    //    IMPORTANT: no panels, no anchors, no injected buttons, no icons here.
    const creditsSrc = join(prefix, PARTIALS_DIR, "credits/credits.js") + `?v=${Date.now()}`;
    const creditsLoad = await loadScriptOnce(creditsSrc, "data-zzx-credits");

    // Nav UX (prefer sitewide initializer; fallback if absent)
    const hasSitewide = await waitForSitewideInit();
    if (hasSitewide) {
      window.ZZXSite.initNav(headerHost);
      if (typeof window.ZZXSite.autoInit === "function") window.ZZXSite.autoInit();
    } else {
      initNavUX(headerHost);
    }

    // Optional ticker can load anytime after header exists (kept here)
    await maybeLoadTicker(prefix);

    // Signal: frame is stable now (includes credits controller status)
    window.dispatchEvent(new CustomEvent("zzx:frame:ready", {
      detail: {
        prefix,
        credits: creditsLoad
      }
    }));

    // 3) Load runtime LAST (HUD + widgets depend on frame)
    const runtime = await loadRuntime(prefix);

    window.dispatchEvent(new CustomEvent("zzx:partials:ready", {
      detail: { prefix, runtime }
    }));

    // Debug surface
    window.ZZXPartials = window.ZZXPartials || {};
    window.ZZXPartials.lastResults = { prefix, credits: creditsLoad, runtime };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => boot().catch(e => console.warn("partials boot failed:", e)));
  } else {
    boot().catch(e => console.warn("partials boot failed:", e));
  }
})();
