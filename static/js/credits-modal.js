// static/js/credits-modal.js  (DROP-IN REPLACEMENT)
// Prefix-aware + single-source-of-truth footer credits modal loader.
//
// Assumes modal exists in DOM with:
//   #zzx-credits-modal
//   #zzx-credits-body
//   .zzx-credits-x button inside modal
//
// Assumes footer button exists:
//   #footer-credits-btn
//
// Loads:
//   /__partials/credits/credits.html
//   /__partials/credits/credits.css
//   /__partials/credits/credits.js  (module-safe; can be IIFE or module)

(() => {
  "use strict";

  const W = window;

  // Hard stop duplicates (you had multiple credits systems fighting)
  if (W.__ZZX_CREDITS_MODAL_BOOTED) return;
  W.__ZZX_CREDITS_MODAL_BOOTED = true;

  const btn   = document.getElementById("footer-credits-btn");
  const modal = document.getElementById("zzx-credits-modal");
  const body  = document.getElementById("zzx-credits-body");
  const xBtn  = modal ? modal.querySelector(".zzx-credits-x") : null;

  if (!btn || !modal || !body) return;

  // -----------------------------
  // Prefix-aware path handling
  // -----------------------------
  function getPrefix() {
    const p1 = W.ZZX?.PREFIX;
    if (typeof p1 === "string" && p1.length) return p1.replace(/\/+$/, "");
    const p2 = document.documentElement?.getAttribute("data-zzx-prefix");
    if (typeof p2 === "string" && p2.length) return p2.replace(/\/+$/, "");
    return "."; // safe for deep pages
  }

  function join(prefix, path) {
    if (!path) return path;
    const s = String(path);
    if (/^https?:\/\//i.test(s)) return s;
    if (!s.startsWith("/")) return s;
    if (prefix === "/" || prefix === "") return s;
    return prefix + s;
  }

  // Cache-bust propagation (optional): if THIS script has ?v=... reuse it
  function cacheBustSuffix() {
    try {
      const src = document.currentScript?.getAttribute("src") || "";
      if (src.includes("?")) return src.slice(src.indexOf("?"));
    } catch (_) {}
    return "";
  }

  const prefix = getPrefix();
  const qsuf   = cacheBustSuffix();

  const CSS_HREF = join(prefix, `/__partials/credits/credits.css${qsuf}`);
  const HTML_URL = join(prefix, `/__partials/credits/credits.html${qsuf}`);
  const JS_MOD   = join(prefix, `/__partials/credits/credits.js${qsuf}`);

  // -----------------------------
  // One-time asset + content flags
  // -----------------------------
  let htmlLoaded   = false;
  let moduleLoaded = false;
  let loading      = false;

  function ensureCSSOnce(href) {
    // if any existing link ends with credits.css (handles cache-busted hrefs too)
    const exists =
      document.querySelector(`link[rel="stylesheet"][href="${href}"]`) ||
      Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
        .some(l => (l.getAttribute("href") || "").includes("/__partials/credits/credits.css"));

    if (exists) return;

    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute("data-zzx-credits-css", "1");
    document.head.appendChild(l);
  }

  async function ensureCreditsModuleOnce() {
    if (moduleLoaded) return;
    moduleLoaded = true;

    try {
      // Dynamic import executes the file even if it exports nothing.
      // NOTE: If credits.js is NOT served with correct MIME for modules, this will fail.
      await import(JS_MOD);
    } catch (e) {
      moduleLoaded = false; // allow retry next open
      console.warn("[Credits] credits.js failed to import:", e);
    }
  }

  function escapeHTML(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function loadCreditsHTMLOnce() {
    if (htmlLoaded || loading) return;
    loading = true;

    body.innerHTML = `<div class="zzx-credits-loading">Loading credits…</div>`;

    try {
      const r = await fetch(HTML_URL, { cache: "no-store" });
      if (!r.ok) throw new Error(`credits.html HTTP ${r.status}`);

      const html = await r.text();

      // Inject content (scripts/links inside won't execute; that's intended)
      body.innerHTML = html;
      htmlLoaded = true;

      // Ensure styling + behavior
      ensureCSSOnce(CSS_HREF);
      await ensureCreditsModuleOnce();
    } catch (e) {
      htmlLoaded = false;
      body.innerHTML =
        `<div class="zzx-credits-loading">Failed to load credits: ${escapeHTML(String(e?.message || e))}</div>`;
      console.warn("[Credits] load failed:", e);
    } finally {
      loading = false;
    }
  }

  // -----------------------------
  // Open/close
  // -----------------------------
  function open() {
    if (!modal.hidden) return;

    modal.hidden = false;

    // If you already have a sitewide no-scroll pattern, keep it consistent.
    document.documentElement.classList.add("no-scroll");
    document.body.classList.add("no-scroll");

    // Load content on first open
    loadCreditsHTMLOnce().finally(() => {
      (xBtn || btn).focus?.();
    });
  }

  function close() {
    if (modal.hidden) return;

    modal.hidden = true;
    document.documentElement.classList.remove("no-scroll");
    document.body.classList.remove("no-scroll");
    btn.focus?.();
  }

  // Toggle (clicking again closes)
  function toggle() {
    if (modal.hidden) open();
    else close();
  }

  // -----------------------------
  // Bind once
  // -----------------------------
  if (!btn.__zzxBoundCreditsModal) {
    btn.__zzxBoundCreditsModal = true;
    btn.addEventListener("click", toggle);
  }

  if (xBtn && !xBtn.__zzxBoundCreditsModal) {
    xBtn.__zzxBoundCreditsModal = true;
    xBtn.addEventListener("click", close);
  }

  // Backdrop click closes (but not clicks inside dialog)
  if (!modal.__zzxBoundBackdrop) {
    modal.__zzxBoundBackdrop = true;
    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });
  }

  // ESC closes
  if (!W.__ZZX_CREDITS_ESC_BOUND) {
    W.__ZZX_CREDITS_ESC_BOUND = true;
    document.addEventListener("keydown", (e) => {
      if ((e.key === "Escape" || e.key === "Esc") && !modal.hidden) close();
    });
  }

  // Preload CSS early (optional but makes first open smoother)
  try { ensureCSSOnce(CSS_HREF); } catch (_) {}
})();
