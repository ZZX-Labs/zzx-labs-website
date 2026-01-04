// __partials/widgets/runtime.js
// Runtime orchestrator:
// 1) Prefix-aware paths (works from any depth)
// 2) Reads manifest.json
// 3) For each slot: inject widget.html -> inject widget.css -> load widget.js AFTER mount
// 4) Single HUD bar + safe hide/show (never loses the handle)

(function () {
  const W = window;

  if (W.__ZZX_WIDGETS_RUNTIME_BOOTED) return;
  W.__ZZX_WIDGETS_RUNTIME_BOOTED = true;

  // ---------- prefix helpers ----------
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

  function urlFor(pathAbs) {
    return join(getPrefix(), pathAbs);
  }

  // ---------- state ----------
  const STATE_KEY = "zzx.hud.mode";

  function readMode() {
    const m = localStorage.getItem(STATE_KEY);
    return (m === "full" || m === "ticker-only" || m === "hidden") ? m : "full";
  }
  function setMode(mode) {
    if (!(mode === "full" || mode === "ticker-only" || mode === "hidden")) mode = "full";
    localStorage.setItem(STATE_KEY, mode);

    const root = document.querySelector("[data-hud-root]");
    const handle = document.querySelector("[data-hud-handle]");
    if (root) root.setAttribute("data-hud-state", mode);
    // handle ALWAYS present; show button only when hidden
    if (handle) handle.style.display = (mode === "hidden") ? "flex" : "none";
  }

  function resetState() {
    localStorage.removeItem(STATE_KEY);
    setMode("full");
  }

  // ---------- asset injectors ----------
  function ensureCSSOnce(id, href) {
    const sel = `link[data-zzx-css="${id}"]`;
    if (document.querySelector(sel)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute("data-zzx-css", id);
    document.head.appendChild(l);
  }

  function loadScriptOnce(id, src) {
    return new Promise((resolve, reject) => {
      const sel = `script[data-zzx-js="${id}"]`;
      if (document.querySelector(sel)) return resolve(true);

      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.setAttribute("data-zzx-js", id);
      s.onload = () => resolve(true);
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.body.appendChild(s);
    });
  }

  async function fetchText(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.text();
  }

  async function fetchJSON(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.json();
  }

  // ---------- widget mount ----------
  function slotEl(id) {
    return document.querySelector(`[data-widget-slot="${id}"]`);
  }

  async function mountWidget(id) {
    const slot = slotEl(id);
    if (!slot) return;

    // prevent double mount
    if (slot.dataset.mounted === "1") return;
    slot.dataset.mounted = "1";

    const base = `/__partials/widgets/${id}`;
    const htmlUrl = urlFor(`${base}/widget.html`);
    const cssUrl  = urlFor(`${base}/widget.css`);
    const jsUrl   = urlFor(`${base}/widget.js`);

    // 1) HTML first (so widget.js finds its DOM)
    try {
      const html = await fetchText(htmlUrl);
      slot.innerHTML = html;
      // give a stable root marker without forcing widget rewrites
      slot.setAttribute("data-widget-id", id);
    } catch (e) {
      slot.innerHTML = `<div class="btc-card"><div class="btc-card__title">${id}</div><div class="btc-card__sub">HTML load failed</div></div>`;
      console.warn(`[HUD] ${id} html failed`, e);
      return;
    }

    // 2) CSS (safe to inject once)
    ensureCSSOnce(id, cssUrl);

    // 3) JS after mount (critical)
    try {
      await loadScriptOnce(id, jsUrl);
    } catch (e) {
      console.warn(`[HUD] ${id} js failed`, e);
      // leave card visible; widget js failure is non-fatal
    }
  }

  async function mountAll(manifest) {
    const widgets = (manifest?.widgets || [])
      .filter(w => w && w.id)
      .slice()
      .sort((a, b) => (a.priority ?? 9999) - (b.priority ?? 9999));

    for (const w of widgets) {
      const slot = slotEl(w.id);
      if (!slot) continue;

      // If disabled: keep empty (or you can hide)
      if (w.enabled === false) {
        slot.style.display = "none";
        continue;
      } else {
        slot.style.display = "";
      }

      await mountWidget(w.id);
    }
  }

  // ---------- controls ----------
  function bindControls() {
    const root = document.querySelector("[data-hud-root]");
    if (!root || root.__boundControls) return;
    root.__boundControls = true;

    root.addEventListener("click", async (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      const mode = btn.getAttribute("data-hud-mode");
      const action = btn.getAttribute("data-hud-action");

      if (mode) {
        setMode(mode);
      }

      if (action === "reset") {
        resetState();

        // re-mount all widgets (clear mounted flags + reload)
        root.querySelectorAll("[data-widget-slot]").forEach(el => {
          el.dataset.mounted = "0";
          el.innerHTML = "";
          el.style.display = "";
        });

        await bootWidgets(); // remount
      }
    });

    const showBtn = document.querySelector("[data-hud-show]");
    if (showBtn && !showBtn.__boundShow) {
      showBtn.__boundShow = true;
      showBtn.addEventListener("click", () => setMode("full"));
    }
  }

  // ---------- boot ----------
  async function bootWidgets() {
    const manifestUrl = urlFor("/__partials/widgets/manifest.json");
    let manifest;

    try {
      manifest = await fetchJSON(manifestUrl);
    } catch (e) {
      console.warn("[HUD] manifest.json failed:", e);
      // fallback: mount whatever slots exist (best effort)
      manifest = {
        widgets: Array.from(document.querySelectorAll("[data-widget-slot]"))
          .map(el => ({ id: el.getAttribute("data-widget-slot"), enabled: true, priority: 999 }))
      };
    }

    await mountAll(manifest);
  }

  async function boot() {
    // state first (so hidden/ticker-only applies immediately)
    setMode(readMode());
    bindControls();
    await bootWidgets();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
