// __partials/credits/loader.js
// ZZX Credits Loader
// - Safe as a module (type="module") or classic script
// - Prefix-aware (works from any depth / GH Pages subpaths)
// - Loads: /__partials/credits/credits.html + /__partials/credits/credits.css
// - Mounts into: #zzx-credits if present, else appends to #zzx-footer, else to <body>
// - Never hard-crashes your page if credits assets are missing

(() => {
  const W = window;

  // Prevent double-boot
  if (W.__ZZX_CREDITS_LOADER_BOOTED) return;
  W.__ZZX_CREDITS_LOADER_BOOTED = true;

  // ---------- prefix-aware join ----------
  function getPrefix() {
    const p1 = W.ZZX?.PREFIX;
    if (typeof p1 === "string" && p1.length) return p1;

    const p2 = document.documentElement?.getAttribute("data-zzx-prefix");
    if (typeof p2 === "string" && p2.length) return p2;

    // If a <base href="/"> exists, root-relative works; prefix can be "."
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
  // If you load this as /__partials/credits/loader.js?v=XYZ
  // we will apply the same ?v=XYZ to credits.html/css.
  function getQuerySuffix() {
    try {
      // Prefer currentScript (works for module + classic in modern browsers)
      const src = document.currentScript?.getAttribute("src") || "";
      const q = src.includes("?") ? src.slice(src.indexOf("?")) : "";
      if (q) return q;

      // Fallback: asset-version meta (optional)
      const meta = document.querySelector('meta[name="asset-version"]')?.getAttribute("content");
      return meta ? `?v=${encodeURIComponent(meta)}` : "";
    } catch (_) {
      return "";
    }
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

  async function fetchText(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.text();
  }

  // ---------- mount ----------
  function getOrCreateMount() {
    // explicit mount wins
    let mount = document.getElementById("zzx-credits");
    if (mount) return mount;

    // footer is a good default if present
    const footerHost = document.getElementById("zzx-footer");
    if (footerHost) {
      mount = document.createElement("div");
      mount.id = "zzx-credits";
      footerHost.appendChild(mount);
      return mount;
    }

    // last resort: append to body
    mount = document.createElement("div");
    mount.id = "zzx-credits";
    document.body.appendChild(mount);
    return mount;
  }

  function renderFail(mount, msg) {
    // Keep it visually quiet—no layout explosion
    mount.innerHTML =
      `<div class="btc-card" style="max-width:420px;margin:.5rem auto;">
         <div class="btc-card__title">Credits</div>
         <div class="btc-card__sub">${escapeHTML(msg)}</div>
       </div>`;
  }

  function escapeHTML(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function boot() {
    const prefix = getPrefix();
    const qs = getQuerySuffix();

    const CSS_URL  = join(prefix, `/__partials/credits/credits.css${qs}`);
    const HTML_URL = join(prefix, `/__partials/credits/credits.html${qs}`);

    // CSS is optional but preferred
    try { ensureCSSOnce("v1", CSS_URL); } catch (_) {}

    const mount = getOrCreateMount();

    // Prevent overlapping loads
    if (mount.dataset.loading === "1") return;
    mount.dataset.loading = "1";

    try {
      const html = await fetchText(HTML_URL);
      mount.innerHTML = html;
      mount.dataset.loaded = "1";
    } catch (e) {
      // If credits assets aren’t deployed yet, don’t break the site.
      renderFail(mount, e?.message || "credits load failed");
    } finally {
      mount.dataset.loading = "0";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
