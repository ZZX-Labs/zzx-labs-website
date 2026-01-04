// __partials/widgets/runtime.js
// HARDENED runtime: loud errors + fallback widget list + per-widget error cards.
// This prevents the "bar exists but no widgets" silent failure.

(function () {
  const W = window;

  if (W.__ZZX_WIDGETS_RUNTIME_BOOTED) return;
  W.__ZZX_WIDGETS_RUNTIME_BOOTED = true;

  // ---------------- prefix helpers ----------------
  function getPrefix() {
    const p = W.ZZX?.PREFIX;
    return (typeof p === "string" && p.length) ? p : ".";
  }

  function join(path) {
    const p = getPrefix();
    if (!path) return path;
    if (p === "/" || /^https?:\/\//i.test(path)) return path;
    if (!path.startsWith("/")) return path;
    return p.replace(/\/+$/, "") + path;
  }

  const CORE_JS  = join("/__partials/widgets/_core/widget-core.js");
  const HUD_JS   = join("/__partials/widgets/hud-state.js");
  const MANIFEST = join("/__partials/widgets/manifest.json");

  // Fallback list if manifest is missing/bad
  const FALLBACK_WIDGETS = [
    "runtime",
    "bitcoin-ticker",
    "price-24h",
    "volume-24h",
    "high-low-24h",
    "fees",
    "mempool",
    "mempool-goggles",
    "tip",
    "drift",
    "hashrate",
    "hashrate-by-nation",
    "nodes",
    "nodes-by-nation",
    "lightning",
    "lightning-detail",
    "intel",
    "btc-intel",
    "btc-repo",
    "btc-news",
    "satoshi-quote",
    "btc-halving-suite",
    "btc-blockexplorer",
    "btc-notabletxs",
    "bitrng",
    "btc-stolen",
    "btc-burned",
    "btc-lost"
  ];

  // ---------------- core loader ----------------
  async function ensureScript(src) {
    return await new Promise((resolve) => {
      const existing = Array.from(document.scripts).some(s => s.src && s.src.includes(src));
      if (existing) return resolve(true);
      const s = document.createElement("script");
      s.src = src;
      s.defer = true;
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.body.appendChild(s);
    });
  }

  async function ensureCoreLoaded() {
    if (!W.ZZXWidgetsCore) await ensureScript(CORE_JS);
    if (!W.ZZXHUD) await ensureScript(HUD_JS);
    return !!(W.ZZXWidgetsCore && W.ZZXHUD);
  }

  // ---------------- UI helpers ----------------
  function shell() {
    return document.querySelector('[data-zzx-widgets="1"]') || document.querySelector(".zzx-widgets");
  }

  function rail() {
    return document.getElementById("zzx-widgets-rail");
  }

  function handle() {
    return document.querySelector("[data-hud-handle]");
  }

  function applyMode(mode) {
    const sh = shell();
    const hd = handle();
    if (sh) sh.setAttribute("data-hud-state", mode);
    if (hd) hd.hidden = (mode !== "hidden");
  }

  function errorCardHTML(title, lines = []) {
    const msg = lines.map(l => `<div style="opacity:.9; margin-top:.15rem;">${escapeHTML(String(l))}</div>`).join("");
    return `
      <div class="zzx-card" style="border-color: rgba(255,80,80,.45);">
        <div class="zzx-card__title" style="color:#ff6b6b;">${escapeHTML(title)}</div>
        <div class="zzx-card__sub" style="white-space: normal; color:#ffd1d1;">
          ${msg || "—"}
        </div>
      </div>
    `;
  }

  function escapeHTML(s) {
    return s.replace(/[&<>"']/g, m => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[m]));
  }

  function ensureRailExistsOrScream() {
    const r = rail();
    if (r) return r;

    const sh = shell();
    if (!sh) return null;

    // Create rail if missing (prevents total failure)
    const created = document.createElement("div");
    created.className = "zzx-widgets__rail";
    created.id = "zzx-widgets-rail";
    created.setAttribute("role", "region");
    created.setAttribute("aria-label", "Bitcoin dashboard widgets");
    sh.appendChild(created);

    return created;
  }

  // ---------------- widget mounting ----------------
  async function mountWidget(id) {
    const Core = W.ZZXWidgetsCore;
    const r = ensureRailExistsOrScream();
    if (!Core || !r) return false;

    // Slot container
    let slot = r.querySelector(`[data-widget-id="${id}"]`);
    if (!slot) {
      slot = document.createElement("div");
      slot.className = "zzx-widget";
      slot.setAttribute("data-widget-id", id);
      r.appendChild(slot);
    }

    // Don’t remount if already mounted and non-empty
    if (slot.dataset.mounted === "1" && slot.innerHTML.trim().length) return true;

    const base = join(`/__partials/widgets/${id}`);
    const htmlUrl = `${base}/widget.html`;
    const cssUrl  = `${base}/widget.css`;
    const jsUrl   = `${base}/widget.js`;

    // CSS (safe if missing—won’t break runtime)
    Core.ensureCSS(cssUrl, `w-${id}`);

    // HTML
    try {
      const html = await Core.fetchText(htmlUrl);
      slot.innerHTML = html;
      slot.dataset.mounted = "1";
    } catch (e) {
      slot.innerHTML = errorCardHTML(
        `Widget missing: ${id}`,
        [`HTML 404? → ${htmlUrl}`, String(e && e.message ? e.message : e)]
      );
      slot.dataset.mounted = "1";
      return false;
    }

    // JS (safe if missing—widget might still render static)
    Core.ensureJS(jsUrl, `w-${id}`);

    return true;
  }

  async function loadManifestOrFallback() {
    const Core = W.ZZXWidgetsCore;

    try {
      const m = await Core.fetchJSON(MANIFEST);
      if (!m || typeof m !== "object") throw new Error("manifest not an object");
      const widgets = Array.isArray(m.widgets) ? m.widgets.slice() : [];

      // sort by priority if present
      widgets.sort((a, b) => {
        const ap = Number.isFinite(a?.priority) ? a.priority : 9999;
        const bp = Number.isFinite(b?.priority) ? b.priority : 9999;
        return ap - bp;
      });

      // use enabled default true
      const ids = widgets
        .map(w => String(w?.id || "").trim())
        .filter(Boolean)
        .filter((id, idx, arr) => arr.indexOf(id) === idx)
        .filter((id) => {
          const w = widgets.find(x => String(x?.id || "").trim() === id);
          return !(w && w.enabled === false);
        });

      return { ids, manifestOk: true, raw: m };
    } catch (e) {
      return { ids: FALLBACK_WIDGETS.slice(), manifestOk: false, err: e };
    }
  }

  async function build(force = false) {
    const Core = W.ZZXWidgetsCore;
    const r = ensureRailExistsOrScream();
    if (!Core || !r) return;

    if (!force && r.dataset.built === "1") return;
    r.dataset.built = "0";

    // clear rail
    r.innerHTML = "";

    const { ids, manifestOk, err } = await loadManifestOrFallback();

    // Loud error if manifest failed
    if (!manifestOk) {
      const box = document.createElement("div");
      box.className = "zzx-widget";
      box.setAttribute("data-widget-id", "runtime-error");
      box.innerHTML = errorCardHTML(
        "HUD manifest failed to load",
        [
          `Tried: ${MANIFEST}`,
          `Prefix: ${getPrefix()}`,
          `Error: ${String(err && err.message ? err.message : err)}`
        ]
      );
      r.appendChild(box);
    }

    // Mount widgets in order
    let mountedAny = false;
    for (const id of ids) {
      const ok = await mountWidget(id);
      mountedAny = mountedAny || ok;
    }

    // If absolutely nothing mounted, scream
    if (!mountedAny && r.children.length === 0) {
      const box = document.createElement("div");
      box.className = "zzx-widget";
      box.innerHTML = errorCardHTML(
        "No widgets mounted",
        [
          "Rail is empty after build()",
          `Prefix: ${getPrefix()}`,
          `Manifest URL: ${MANIFEST}`
        ]
      );
      r.appendChild(box);
    }

    r.dataset.built = "1";
  }

  function bindControlsOnce() {
    const sh = shell();
    if (!sh || sh.__bound) return;
    sh.__bound = true;

    sh.addEventListener("click", async (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      const mode = btn.getAttribute("data-zzx-mode");
      const action = btn.getAttribute("data-zzx-action");

      if (mode) {
        const s = W.ZZXHUD.setMode(mode);
        applyMode(s.mode);
      }

      if (action === "reset") {
        const s = W.ZZXHUD.reset();
        applyMode(s.mode);
        await build(true);
      }

      if (action === "show") {
        const s = W.ZZXHUD.setMode("full");
        applyMode(s.mode);
      }
    });

    // external handle
    const showBtn = document.querySelector("[data-hud-show]");
    if (showBtn && !showBtn.__bound) {
      showBtn.__bound = true;
      showBtn.addEventListener("click", async () => {
        const s = W.ZZXHUD.setMode("full");
        applyMode(s.mode);
        // if rail is empty (hidden bug), rebuild
        const r = rail();
        if (r && r.children.length === 0) await build(true);
      });
    }
  }

  async function boot(force = false) {
    const ok = await ensureCoreLoaded();

    // If core failed, paint a visible failure card
    if (!ok) {
      const r = ensureRailExistsOrScream();
      if (r) {
        r.innerHTML = errorCardHTML(
          "HUD core failed to load",
          [
            `CORE: ${CORE_JS}`,
            `HUD: ${HUD_JS}`,
            `Prefix: ${getPrefix()}`
          ]
        );
      }
      return;
    }

    // Apply saved mode early
    const s = W.ZZXHUD.read();
    applyMode(s.mode);

    // Build widgets
    await build(force);

    // Bind controls
    bindControlsOnce();
  }

  // Expose rebind
  W.ZZXWidgetsRuntime = {
    rebind(force = false) { return boot(!!force); }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => boot(false), { once: true });
  } else {
    boot(false);
  }
})();
