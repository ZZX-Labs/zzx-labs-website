// __partials/widgets/runtime.js
// Loads manifest, mounts widget HTML into rail, injects widget css/js, binds the ONE HUD bar.

(function () {
  const W = window;
  if (W.__ZZX_WIDGETS_RUNTIME_BOOTED) return;
  W.__ZZX_WIDGETS_RUNTIME_BOOTED = true;

  function prefix() {
    const p = W.ZZX?.PREFIX;
    return (typeof p === "string" && p.length) ? p : ".";
  }
  function join(path) {
    const p = prefix();
    if (!path) return path;
    if (p === "/" || /^https?:\/\//i.test(path)) return path;
    if (!path.startsWith("/")) return path;
    return p.replace(/\/+$/, "") + path;
  }

  const CORE_JS  = join("/__partials/widgets/_core/widget-core.js");
  const HUD_JS   = join("/__partials/widgets/hud-state.js");
  const MANIFEST = join("/__partials/widgets/manifest.json");

  const FALLBACK_WIDGETS = [
    "bitcoin-ticker",
    "high-low-24h",
    "tip",
    "drift",
    "mempool-goggles",
    "btc-news",
    "btc-repo",
    "intel",
    "btc-intel"
  ];

  async function ensureScript(src) {
    return await new Promise((resolve) => {
      const exists = Array.from(document.scripts).some(s => s.src && s.src.includes(src));
      if (exists) return resolve(true);
      const s = document.createElement("script");
      s.src = src;
      s.defer = true;
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.body.appendChild(s);
    });
  }

  async function ensureCore() {
    if (!W.ZZXWidgetsCore) await ensureScript(CORE_JS);
    if (!W.ZZXHUD) await ensureScript(HUD_JS);
    return !!(W.ZZXWidgetsCore && W.ZZXHUD);
  }

  function shell() { return document.querySelector('[data-zzx-widgets="1"]'); }
  function rail() { return document.getElementById("zzx-widgets-rail"); }
  function handle() { return document.querySelector("[data-hud-handle]"); }

  function applyMode(mode) {
    const sh = shell();
    const hd = handle();
    if (sh) sh.setAttribute("data-hud-state", mode);
    if (hd) hd.hidden = (mode !== "hidden");
  }

  function errorCard(title, lines) {
    const r = rail();
    if (!r) return;
    const div = document.createElement("div");
    div.className = "zzx-card";
    div.style.borderColor = "rgba(255,80,80,.45)";
    div.innerHTML = `
      <div class="zzx-card__title" style="color:#ff6b6b;">${title}</div>
      <div class="zzx-card__sub" style="white-space:normal;color:#ffd1d1;">
        ${(lines || []).map(x => `<div style="margin-top:.15rem;opacity:.9;">${String(x)}</div>`).join("")}
      </div>
    `;
    r.appendChild(div);
  }

  async function loadManifestIds(Core) {
    try {
      const m = await Core.fetchJSON(MANIFEST);
      const list = Array.isArray(m?.widgets) ? m.widgets.slice() : [];
      list.sort((a,b) => (Number(a?.priority)||9999) - (Number(b?.priority)||9999));
      const ids = list
        .filter(w => w && w.enabled !== false)
        .map(w => String(w.id || "").trim())
        .filter(Boolean);

      return { ids, ok: true };
    } catch (e) {
      return { ids: FALLBACK_WIDGETS.slice(), ok: false, err: e };
    }
  }

  async function mountWidget(Core, id) {
    const r = rail();
    if (!r) return;

    const base = join(`/__partials/widgets/${id}`);
    const htmlUrl = `${base}/widget.html`;
    const cssUrl  = `${base}/widget.css`;
    const jsUrl   = `${base}/widget.js`;

    // slot
    const slot = document.createElement("div");
    slot.className = "zzx-widget";
    slot.setAttribute("data-widget-id", id);
    r.appendChild(slot);

    // css/js
    Core.ensureCSS(cssUrl, `w-${id}`);
    Core.ensureJS(jsUrl, `w-${id}`);

    // html
    try {
      const html = await Core.fetchText(htmlUrl);
      slot.innerHTML = html;
      // tell core this widget exists now
      Core.notifyMount(id);
    } catch (e) {
      slot.innerHTML = `
        <div class="zzx-card" style="border-color: rgba(255,80,80,.45);">
          <div class="zzx-card__title" style="color:#ff6b6b;">Widget missing: ${id}</div>
          <div class="zzx-card__sub" style="white-space:normal;color:#ffd1d1;">
            <div>HTML: ${htmlUrl}</div>
            <div>${String(e && e.message ? e.message : e)}</div>
          </div>
        </div>
      `;
    }
  }

  function bindBarOnce() {
    const sh = shell();
    if (!sh || sh.__bound) return;
    sh.__bound = true;

    sh.addEventListener("click", (e) => {
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
        // hard reload widget mounts
        boot(true);
      }
    });

    const showBtn = document.querySelector("[data-hud-show]");
    if (showBtn && !showBtn.__bound) {
      showBtn.__bound = true;
      showBtn.addEventListener("click", () => {
        const s = W.ZZXHUD.setMode("full");
        applyMode(s.mode);
      });
    }
  }

  async function boot(force) {
    const ok = await ensureCore();
    if (!ok) return;

    const Core = W.ZZXWidgetsCore;

    // apply saved mode
    const state = W.ZZXHUD.read();
    applyMode(state.mode);

    bindBarOnce();

    const r = rail();
    if (!r) return;

    if (!force && r.dataset.built === "1") return;
    r.dataset.built = "0";
    r.innerHTML = "";

    const { ids, ok: manifestOk, err } = await loadManifestIds(Core);
    if (!manifestOk) {
      errorCard("HUD manifest failed", [
        `Tried: ${MANIFEST}`,
        `Prefix: ${prefix()}`,
        `Error: ${String(err && err.message ? err.message : err)}`
      ]);
    }

    for (const id of ids) await mountWidget(Core, id);

    r.dataset.built = "1";
  }

  W.ZZXWidgetsRuntime = { rebind(force=false){ return boot(!!force); } };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => boot(false), { once: true });
  } else {
    boot(false);
  }
})();
