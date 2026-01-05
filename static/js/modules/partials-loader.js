/* /partials-loader.js
   FRAME-FIRST LOADER (AUTHORITATIVE)
   Requirements implemented exactly:
   1) Load HEADER + NAV first
   2) Load FOOTER next
   3) After FOOTER is in DOM, attach a Credits ICON BUTTON to the RIGHT of footer text
      - Button toggles the Credits panel (show/hide)
   4) Only after frame + footer + credits toggle are ready do we load RUNTIME
   5) Only after runtime is ready do we signal widgets/HUD to start

   This file is designed to be safe on:
   - "/" and deep subpages ("/about/", "/pages/services/...", etc.)
   - GitHub Pages and local nginx

   It never changes your content; it only injects a single button element into the footer container.

   Emits events:
   - window event: "zzx:frame:ready"   after header/nav/footer + credits button
   - window event: "zzx:partials:ready" after runtime is injected

   Debug:
   - window.ZZXPartials.lastResults
*/

(function () {
  const CACHE = "no-store";

  // Prefer absolute-root paths first so subpages never break.
  const PARTIAL_PATHS = {
    header:  ["/partials/header.html",  "/__partials/header.html",  "/header.html"],
    nav:     ["/partials/nav.html",     "/__partials/nav.html",     "/nav.html"],
    footer:  ["/partials/footer.html",  "/__partials/footer.html",  "/footer.html"],
    credits: ["/partials/credits.html", "/__partials/credits.html", "/credits.html"],
    runtime: ["/partials/runtime.html", "/__partials/runtime.html", "/runtime.html"]
  };

  // Credits icon candidates (PNG). We try a small set; first hit wins.
  // If none load, we fall back to a text button ("Credits") but still functional.
  const CREDITS_ICON_CANDIDATES = [
    "/static/images/icons/credits.png",
    "/static/images/credits.png",
    "/static/images/icon-credits.png",
    "/static/icons/credits.png",
    "/static/credits.png"
  ];

  // Slot discovery: supports either #ids or data-partial attributes.
  function findSlot(key) {
    return (
      document.getElementById(`site-${key}`) ||
      document.querySelector(`[data-partial="${key}"]`) ||
      null
    );
  }

  async function tryFetch(url) {
    const r = await fetch(url, { cache: CACHE, credentials: "same-origin" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.text();
  }

  function unique(arr) {
    return Array.from(new Set(arr));
  }

  // Build candidate list:
  // - Absolute root paths
  // - Relative fallbacks up to 6 levels deep
  function buildCandidates(paths) {
    const out = [];
    for (const p of paths) {
      out.push(p);

      const depth = location.pathname.replace(/\/+$/, "").split("/").length - 1;
      const relBase = p.replace(/^\/+/, "");
      for (let i = 0; i < Math.min(depth, 6); i++) {
        out.push("../".repeat(i + 1) + relBase);
      }
    }
    return unique(out);
  }

  async function loadOne(key) {
    const slot = findSlot(key);
    if (!slot) return { key, ok: false, reason: "slot_missing" };

    const candidates = buildCandidates(PARTIAL_PATHS[key] || []);
    for (const url of candidates) {
      try {
        const html = await tryFetch(url);
        slot.innerHTML = html;
        slot.setAttribute("data-partial-loaded", "1");
        slot.setAttribute("data-partial-source", url);
        return { key, ok: true, url };
      } catch {
        // continue
      }
    }

    slot.setAttribute("data-partial-loaded", "0");
    return { key, ok: false, reason: "fetch_failed", candidates };
  }

  function ensureCreditsToggle() {
    const footerSlot = findSlot("footer");
    const creditsSlot = findSlot("credits");

    if (!footerSlot || !creditsSlot) return { ok: false, reason: "missing_slots" };

    // Do not duplicate
    if (footerSlot.querySelector("[data-credits-toggle]")) {
      return { ok: true, reason: "already_present" };
    }

    // We do NOT reposition your footer content.
    // We only attach a small, inline-flex button aligned to the right edge
    // by wrapping footer contents in a flex row IF a wrapper doesn't already exist.
    //
    // Minimal DOM touch:
    // - create a container at the end that naturally sits to the right
    //   (works when footer already uses flex or grid; if not, the button still appears
    //   at the end without breaking text flow).
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("data-credits-toggle", "1");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", "site-credits");
    btn.title = "Credits";

    // Ultra-minimal inline styling to prevent CSS dependency and stop “floating”
    btn.style.marginLeft = "12px";
    btn.style.display = "inline-flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.padding = "0";
    btn.style.border = "0";
    btn.style.background = "transparent";
    btn.style.cursor = "pointer";
    btn.style.lineHeight = "0";

    // Create img; if none loads, keep text fallback.
    const img = document.createElement("img");
    img.alt = "Credits";
    img.width = 20;
    img.height = 20;
    img.decoding = "async";
    img.loading = "eager";
    img.style.display = "block";
    img.style.opacity = "0.92";

    // Text fallback (hidden unless img fails)
    const txt = document.createElement("span");
    txt.textContent = "Credits";
    txt.style.display = "none";
    txt.style.fontSize = "12px";
    txt.style.color = "inherit";
    txt.style.opacity = "0.9";
    txt.style.lineHeight = "1";

    btn.appendChild(img);
    btn.appendChild(txt);

    // Default: credits hidden until toggled, but we don’t force a layout change.
    // If your CSS already controls it, we respect that.
    // We only apply inline display if the credits panel is visibly overlaying.
    function setCreditsVisible(on) {
      // Prefer targeting explicit slot id if present
      const panel = creditsSlot;
      const isOn = !!on;

      btn.setAttribute("aria-expanded", isOn ? "true" : "false");

      // If you already have a class-based system, we avoid fighting it.
      // We use a single data attribute that your CSS/JS may already understand.
      panel.setAttribute("data-credits-open", isOn ? "1" : "0");

      // Minimal inline fallback:
      // - When closed: hide if currently overlaying or visible by default.
      // - When open: show.
      if (isOn) {
        panel.style.display = "";
      } else {
        // only hide if it is currently taking up layout/overlaying
        // (safe default: hide to prevent “floating over content”)
        panel.style.display = "none";
      }
    }

    // Initialize: closed to prevent overlay
    setCreditsVisible(false);

    btn.addEventListener("click", () => {
      const open = creditsSlot.getAttribute("data-credits-open") === "1";
      setCreditsVisible(!open);
    });

    // Insert button into footer in the least invasive way:
    // If footer already has a footer-right container, use it; else append.
    const right =
      footerSlot.querySelector("[data-footer-right]") ||
      footerSlot.querySelector(".footer-right") ||
      footerSlot.querySelector("footer .right") ||
      null;

    if (right) {
      right.appendChild(btn);
    } else {
      // Append as last element inside footer slot.
      footerSlot.appendChild(btn);
    }

    // Try to load an icon source; if all fail, show text label.
    (async () => {
      for (const src of CREDITS_ICON_CANDIDATES) {
        try {
          // preflight load
          await new Promise((resolve, reject) => {
            const t = new Image();
            t.onload = resolve;
            t.onerror = reject;
            t.src = src;
          });
          img.src = src;
          return;
        } catch {
          // try next
        }
      }
      // No icon found
      img.style.display = "none";
      txt.style.display = "inline";
    })();

    return { ok: true, reason: "inserted" };
  }

  async function loadFrameThenRuntime() {
    // FRAME FIRST (strict)
    const results = [];
    results.push(await loadOne("header"));
    results.push(await loadOne("nav"));
    results.push(await loadOne("footer"));

    // Credits content can be loaded now, but the toggle is attached to footer text
    // after footer exists.
    results.push(await loadOne("credits"));

    const toggle = ensureCreditsToggle();
    window.dispatchEvent(new CustomEvent("zzx:frame:ready", { detail: { results, toggle } }));

    // RUNTIME LAST (only after frame is stable)
    results.push(await loadOne("runtime"));

    window.ZZXPartials = window.ZZXPartials || {};
    window.ZZXPartials.lastResults = results;

    window.dispatchEvent(new CustomEvent("zzx:partials:ready", { detail: results }));

    return results;
  }

  function boot() {
    loadFrameThenRuntime().catch(() => {
      // never hard-fail the page
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  // Export API
  window.ZZXPartials = window.ZZXPartials || {};
  window.ZZXPartials.loadAll = loadFrameThenRuntime;
})();
