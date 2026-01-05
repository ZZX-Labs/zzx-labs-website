// static/js/credits-modal.js  (DROP-IN REPLACEMENT)
// Works with your existing: /__partials/credits/credits.html (contains <link> + <script type="module">)
//
// Key behavior:
// - Opens/closes modal (X, Esc, backdrop click)
// - Injects credits.html into modal body
// - Ensures credits.css is loaded ONCE
// - Ensures credits.js module is loaded ONCE (via dynamic import)
// - DOES NOT rely on executing <script> tags from injected HTML (browsers won't)

(() => {
  const btn   = document.getElementById("footer-credits-btn");
  const modal = document.getElementById("zzx-credits-modal");
  const body  = document.getElementById("zzx-credits-body");
  const xBtn  = modal ? modal.querySelector(".zzx-credits-x") : null;

  if (!btn || !modal || !body) return;

  const CSS_HREF = "/__partials/credits/credits.css";
  const HTML_URL = "/__partials/credits/credits.html";
  const JS_MOD   = "/__partials/credits/credits.js";

  let htmlLoaded = false;
  let moduleLoaded = false;

  function ensureCSSOnce(href) {
    if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    document.head.appendChild(l);
  }

  async function ensureCreditsModuleOnce() {
    if (moduleLoaded) return;
    moduleLoaded = true;
    try {
      // Use dynamic import so it runs even though injected <script type="module"> won’t execute.
      await import(JS_MOD);
    } catch (e) {
      // If module fails, allow retry on next open
      moduleLoaded = false;
      console.warn("[Credits] credits.js failed to import:", e);
    }
  }

  async function loadCreditsHTMLOnce() {
    if (htmlLoaded) return;

    body.innerHTML = `<div class="zzx-credits-loading">Loading credits…</div>`;

    try {
      const r = await fetch(HTML_URL, { cache: "no-store" });
      if (!r.ok) throw new Error(`credits.html HTTP ${r.status}`);
      const html = await r.text();

      // We *do not* rely on <link>/<script> in the HTML; we load assets ourselves.
      // Still safe to inject full HTML; CSS/JS will be handled explicitly.
      body.innerHTML = html;

      htmlLoaded = true;

      // Now ensure assets
      ensureCSSOnce(CSS_HREF);
      await ensureCreditsModuleOnce();

    } catch (e) {
      htmlLoaded = false;
      body.innerHTML =
        `<div class="zzx-credits-loading">Failed to load credits: ${escapeHTML(String(e?.message || e))}</div>`;
      console.warn("[Credits] load failed:", e);
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

  function open() {
    modal.hidden = false;
    document.body.classList.add("no-scroll");
    loadCreditsHTMLOnce().finally(() => {
      (xBtn || btn).focus?.();
    });
  }

  function close() {
    modal.hidden = true;
    document.body.classList.remove("no-scroll");
    btn.focus?.();
  }

  btn.addEventListener("click", open);
  xBtn && xBtn.addEventListener("click", close);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) close();
  });
})();
