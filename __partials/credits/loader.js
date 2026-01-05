// __partials/credits/loader.js
// ZZX Credits Loader (DROP-IN REPLACEMENT)
//
// What this version does (per your spec):
// - Injects a Credits button into the FOOTER TOPLINE (right side of the copyright line)
// - Opens a CENTERED modal popup with an X close button
// - Closes on: X, ESC key, backdrop click
// - Loads credits content from: /__partials/credits/credits.html (preferred)
//   and also loads: /__partials/credits/credits.css + /__partials/credits/credits.js (optional enhancement)
// - Prefix-aware (works from any depth / GH Pages)
// - Persists open/closed state in localStorage
// - Never hard-crashes the page if assets are missing

(() => {
  "use strict";

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
    if (!String(path).startsWith("/")) return path;
    return String(prefix).replace(/\/+$/, "") + String(path);
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

  function qs(sel, scope) {
    return (scope || document).querySelector(sel);
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

  async function fetchText(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.text();
  }

  // ---------- mount targets ----------
  function findFooterTopline() {
    // Your new footer markup uses: .container.footer-topline
    return qs(".footer .container.footer-topline")
      || qs(".footer-topline")
      || qs("footer .container")
      || qs("footer")
      || document.body;
  }

  function ensureInlineStyleOnce() {
    if (document.querySelector("style[data-zzx-credits-inline='1']")) return;

    const st = document.createElement("style");
    st.setAttribute("data-zzx-credits-inline", "1");
    st.textContent = `
/* Credits button placement inside footer topline (no sitewide impact) */
.footer .container.footer-topline{
  position: relative;
}
.zzx-credits__btn{
  appearance:none;
  -webkit-appearance:none;
  background: transparent;
  border: 0;
  padding: .1rem .35rem;
  margin: 0;
  cursor: pointer;
  color: #c0d674;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: .95rem;
  line-height: 1.2;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  gap: .35rem;
  white-space: nowrap;
}
.zzx-credits__btn:hover{ color:#e6a42b; text-decoration: underline; }
.zzx-credits__btn:focus-visible{
  outline: none;
  color:#000;
  background:#e6a42b;
  box-shadow: 0 0 0 2px #e6a42b;
}

/* Make topline able to put the button slightly to the right of the text */
.footer .container.footer-topline{
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  column-gap: 1.25rem;
  text-align: center;
}
.footer .container.footer-topline .footer-copy{
  margin: 0;
}
@media (max-width: 820px){
  .footer .container.footer-topline{
    grid-template-columns: 1fr;
    row-gap: .65rem;
  }
}

/* Modal (centered, covers footer/bottom region visually) */
#zzx-credits-modal{
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0,0,0,.62);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
#zzx-credits-modal[hidden]{ display:none !important; }

#zzx-credits-dialog{
  width: min(900px, 100%);
  max-height: min(78vh, 780px);
  background: #0b0b0b;
  border: 1px solid rgba(255,255,255,.18);
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0,0,0,.55);
  overflow: hidden;
  color: #c0d674;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}

#zzx-credits-head{
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: .75rem;
  padding: .85rem 1rem;
  border-bottom: 1px solid rgba(255,255,255,.12);
}

#zzx-credits-title{
  margin:0;
  font-size:1.05rem;
  color:#e6a42b;
  letter-spacing: .01em;
}

#zzx-credits-x{
  appearance:none;
  -webkit-appearance:none;
  background: transparent;
  border: 1px solid rgba(255,255,255,.18);
  color: #c0d674;
  border-radius: 10px;
  padding: .25rem .55rem;
  cursor: pointer;
}
#zzx-credits-x:hover{ color:#e6a42b; border-color:#e6a42b; }

#zzx-credits-body{
  padding: 1rem;
  overflow:auto;
  max-height: calc(min(78vh, 780px) - 56px);
}

.zzx-credits__loading{ color:#b7bf9a; font-size:.95rem; }
.zzx-credits__fail{ color:#b7bf9a; font-size:.95rem; }
.zzx-credits__fail strong{ color:#e6a42b; }
    `;
    document.head.appendChild(st);
  }

  function ensureButton(host) {
    // Prefer using your existing button if present:
    // <button id="footer-credits-btn" ...>Credits</button>
    let btn = document.getElementById("footer-credits-btn");
    if (btn) {
      // unify class so styling applies
      btn.classList.add("zzx-credits__btn");
      return btn;
    }

    // Otherwise inject a minimal button into footer topline
    btn = host.querySelector("[data-zzx-credits-btn]");
    if (btn) return btn;

    btn = document.createElement("button");
    btn.type = "button";
    btn.className = "zzx-credits__btn";
    btn.setAttribute("data-zzx-credits-btn", "1");
    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-controls", "zzx-credits-modal");
    btn.setAttribute("aria-expanded", "false");
    btn.title = "Credits";

    // icon + text (no external images)
    btn.innerHTML = `
      <span aria-hidden="true" style="display:inline-flex;align-items:center;">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 22a10 10 0 1 0-10-10 10 10 0 0 0 10 10Z" stroke="currentColor" stroke-width="1.6"/>
          <path d="M12 11.2v5.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          <path d="M12 7.4h.01" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
        </svg>
      </span>
      <span>Credits</span>
    `;

    host.appendChild(btn);
    return btn;
  }

  function ensureModalShell(host) {
    let modal = document.getElementById("zzx-credits-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "zzx-credits-modal";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "zzx-credits-title");
      modal.hidden = true;

      modal.innerHTML = `
        <div id="zzx-credits-dialog" role="document">
          <div id="zzx-credits-head">
            <h2 id="zzx-credits-title">Credits</h2>
            <button type="button" id="zzx-credits-x" aria-label="Close Credits">✕</button>
          </div>
          <div id="zzx-credits-body">
            <div class="zzx-credits__loading">Loading credits…</div>
          </div>
        </div>
      `;

      // Keep modal sibling to body (not nested inside footer) so it overlays correctly
      document.body.appendChild(modal);
    }

    const body = document.getElementById("zzx-credits-body");
    const xBtn = document.getElementById("zzx-credits-x");
    return { modal, body, xBtn };
  }

  function setOpen(btn, modal, isOpen) {
    modal.hidden = !isOpen;
    btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    writeOpen(isOpen);

    // optional: prevent background scroll while modal open
    document.documentElement.classList.toggle("no-scroll", isOpen);
    document.body.classList.toggle("no-scroll", isOpen);
  }

  function renderFail(body, msg) {
    body.innerHTML = `
      <div class="zzx-credits__fail">
        <strong>Credits failed to load.</strong><br>
        ${escapeHTML(msg)}
      </div>
    `;
  }

  async function boot() {
    const prefix = getPrefix();
    const qsuf = getQuerySuffix();

    const CSS_URL   = join(prefix, `/__partials/credits/credits.css${qsuf}`);
    const JS_URL    = join(prefix, `/__partials/credits/credits.js${qsuf}`);
    const HTML_URL  = join(prefix, `/__partials/credits/credits.html${qsuf}`);

    // CSS preferred but optional
    try { ensureCSSOnce("v1", CSS_URL); } catch (_) {}
    // Inline placement + modal styling (safe + isolated)
    ensureInlineStyleOnce();

    const host = findFooterTopline();
    const btn = ensureButton(host);
    const { modal, body, xBtn } = ensureModalShell(host);

    // Close handlers (X, ESC, backdrop)
    function close() {
      setOpen(btn, modal, false);
      try { btn.focus(); } catch (_) {}
    }
    function open() {
      setOpen(btn, modal, true);
      try { xBtn?.focus(); } catch (_) {}
    }

    // Click: toggle
    if (!btn.__zzxCreditsBound) {
      btn.__zzxCreditsBound = true;
      btn.addEventListener("click", () => {
        const isOpen = !modal.hidden;
        if (isOpen) close(); else open();
        // lazy-load only when opening
        if (!isOpen) maybeLoadCredits();
      });
    }

    // Backdrop click closes
    if (!modal.__zzxCreditsBackdropBound) {
      modal.__zzxCreditsBackdropBound = true;
      modal.addEventListener("click", (e) => {
        if (e.target === modal) close();
      });
    }

    // X closes
    if (xBtn && !xBtn.__zzxCreditsXBound) {
      xBtn.__zzxCreditsXBound = true;
      xBtn.addEventListener("click", close);
    }

    // ESC closes
    if (!document.__zzxCreditsEscBound) {
      document.__zzxCreditsEscBound = true;
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !modal.hidden) close();
      });
    }

    async function maybeLoadCredits() {
      // already loaded
      if (body.dataset.zzxCreditsLoaded === "1") return;
      if (body.dataset.zzxCreditsLoaded === "loading") return;

      body.dataset.zzxCreditsLoaded = "loading";

      // Preferred: credits.html (content)
      try {
        const html = await fetchText(HTML_URL);
        body.innerHTML = html;
        body.dataset.zzxCreditsLoaded = "1";
      } catch (e) {
        body.dataset.zzxCreditsLoaded = "0";
        renderFail(body, e?.message || "credits.html failed to load");
      }

      // Optional enhancement: credits.js (non-fatal)
      try { await ensureJSOnce("v1", JS_URL); } catch (_) {}
    }

    // Restore persisted state
    const shouldOpen = readOpen();
    if (shouldOpen) {
      open();
      await maybeLoadCredits();
    } else {
      setOpen(btn, modal, false);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
