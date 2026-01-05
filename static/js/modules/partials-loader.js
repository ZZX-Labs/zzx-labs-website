// /partials-loader.js
// ZZX Partials Loader — works from any depth, no server rewrites needed.
// FRAME-FIRST ORDER (required):
//   1) header + nav (composed)
//   2) footer
//   3) credits toggle button attached inside footer (right side), credits panel loaded + hidden
//   4) runtime loaded last
//   5) emit events so widget-core/HUD can safely start AFTER the frame exists
//
// Events:
//   - "zzx:frame:ready"   after header/nav/footer + credits button/panel are ready
//   - "zzx:partials:ready" after runtime is injected
//
// Notes:
// - Minimal change policy: preserves your existing prefix-probing strategy and URL rewriting.
// - Does NOT move or delete any content. Only appends a single small button + credits panel node.

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
  // Credits button + panel (must be attached AFTER footer loads)
  // ---------------------------------------------------------------------------
  const CREDITS_ICON_CANDIDATES = [
    "/static/images/icons/credits.png",
    "/static/images/credits.png",
    "/static/icons/credits.png",
    "/static/credits.png"
  ];

  function ensureCreditsNodes(prefix, footerHost) {
    if (!footerHost) return { ok: false, reason: "no_footer_host" };

    // Panel container (hidden by default)
    let panel = document.getElementById("zzx-credits-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "zzx-credits-panel";
      panel.style.display = "none";
      panel.style.position = "relative";
      panel.style.zIndex = "1";
      footerHost.appendChild(panel);
    }

    // Toggle button (placed at end of footer content; visually right in most footers)
    let btn = footerHost.querySelector("[data-credits-toggle]");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("data-credits-toggle", "1");
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-controls", "zzx-credits-panel");
      btn.title = "Credits";

      // minimal inline style to avoid CSS dependency / layout breakage
      btn.style.marginLeft = "12px";
      btn.style.display = "inline-flex";
      btn.style.alignItems = "center";
      btn.style.justifyContent = "center";
      btn.style.padding = "0";
      btn.style.border = "0";
      btn.style.background = "transparent";
      btn.style.cursor = "pointer";
      btn.style.lineHeight = "0";
      btn.style.verticalAlign = "middle";

      const img = document.createElement("img");
      img.alt = "Credits";
      img.width = 20;
      img.height = 20;
      img.decoding = "async";
      img.loading = "eager";
      img.style.display = "block";
      img.style.opacity = "0.92";

      const txt = document.createElement("span");
      txt.textContent = "Credits";
      txt.style.display = "none";
      txt.style.fontSize = "12px";
      txt.style.opacity = "0.9";
      txt.style.lineHeight = "1";

      btn.appendChild(img);
      btn.appendChild(txt);

      // Insert rightmost: try to find a footer text container; else append to host.
      // (No structural rewrites; this avoids wrecking your footer layout.)
      const target =
        footerHost.querySelector("footer") ||
        footerHost.querySelector(".footer") ||
        footerHost.querySelector("[data-footer]") ||
        footerHost;

      target.appendChild(btn);

      const setOpen = (on) => {
        panel.style.display = on ? "" : "none";
        panel.setAttribute("data-open", on ? "1" : "0");
        btn.setAttribute("aria-expanded", on ? "true" : "false");
      };

      setOpen(false);

      btn.addEventListener("click", () => {
        const open = panel.getAttribute("data-open") === "1";
        setOpen(!open);
      });

      // icon discovery
      (async () => {
        const tryList = CREDITS_ICON_CANDIDATES.map(u => absToPrefix(u, prefix));
        for (const src of tryList) {
          try {
            await new Promise((resolve, reject) => {
              const t = new Image();
              t.onload = resolve;
              t.onerror = reject;
              t.src = src;
            });
            img.src = src;
            return;
          } catch (_) {}
        }
        img.style.display = "none";
        txt.style.display = "inline";
      })();
    }

    return { ok: true, panelId: "zzx-credits-panel" };
  }

  async function loadCreditsIntoPanel(prefix) {
    const panel = document.getElementById("zzx-credits-panel");
    if (!panel) return { ok: false, reason: "no_panel" };

    // credits location candidates (matches your current partials pattern)
    const candidates = [
      join(prefix, PARTIALS_DIR, "credits/credits.html"),
      join(prefix, PARTIALS_DIR, "credits/credits.html").replace(/\/+$/, ""),
      join(prefix, PARTIALS_DIR, "credits.html"),
      join(prefix, "credits.html")
    ];

    for (const url of candidates) {
      try {
        const html = await loadHTML(url);
        const wrap = document.createElement("div");
        wrap.innerHTML = html;
        rewriteAbsoluteURLs(wrap, prefix);
        panel.replaceChildren(...wrap.childNodes);
        panel.setAttribute("data-credits-source", url);
        return { ok: true, url };
      } catch (_) {}
    }

    // no crash: leave empty
    panel.replaceChildren();
    return { ok: false, reason: "fetch_failed" };
  }

  // ---------------------------------------------------------------------------
  // Runtime (HUD + widgets) must load LAST
  // ---------------------------------------------------------------------------
  async function loadRuntime(prefix) {
    // runtime location candidates
    const candidates = [
      join(prefix, PARTIALS_DIR, "runtime/runtime.html"),
      join(prefix, PARTIALS_DIR, "runtime.html"),
      join(prefix, "runtime.html")
    ];

    // Host node
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

    // 2) Attach credits toggle button to footer (after footer exists)
    const creditsNodes = ensureCreditsNodes(prefix, footerHost);

    // 3) Load credits content into hidden panel (still before runtime)
    const creditsLoad = await loadCreditsIntoPanel(prefix);

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

    // Signal: frame is stable now
    window.dispatchEvent(new CustomEvent("zzx:frame:ready", {
      detail: {
        prefix,
        header: headerHost.getAttribute("data-partial-source") || null,
        footer: footerHost.getAttribute("data-partial-source") || null,
        credits: { nodes: creditsNodes, load: creditsLoad }
      }
    }));

    // 4) Load runtime LAST (HUD + widgets depend on frame)
    const runtime = await loadRuntime(prefix);

    // Signal: runtime is ready — widget core/HUD should start now
    window.dispatchEvent(new CustomEvent("zzx:partials:ready", {
      detail: { prefix, runtime }
    }));

    // Debug surface
    window.ZZXPartials = window.ZZXPartials || {};
    window.ZZXPartials.lastResults = {
      prefix,
      credits: { nodes: creditsNodes, load: creditsLoad },
      runtime
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => boot().catch(e => console.warn("partials boot failed:", e)));
  } else {
    boot().catch(e => console.warn("partials boot failed:", e));
  }
})();
