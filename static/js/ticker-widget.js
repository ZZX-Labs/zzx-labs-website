// /static/js/ticker-widget.js
// ZZX Bitcoin Ticker Widget Loader (UNIFIED + DEPTH-SAFE + HUD-SAFE)
//
// Fixes the failure modes you described:
// - Works from ANY subpage depth (uses window.ZZX.PREFIX if present; falls back safely)
// - Waits until partials/runtime are ready, so it doesn't race header/footer/HUD
// - Mounts ONLY into the bitcoin-ticker WIDGET SLOT (never into HUD shell unless last resort)
// - Avoids “disappearing” by re-attaching if the slot is replaced (MutationObserver)
// - Avoids double-loading ticker core
//
// Assumes ticker assets exist at:
//   <prefix>/bitcoin/ticker/ticker.html
//   <prefix>/bitcoin/ticker/ticker.js
//
// NOTE: This file does not change layout/CSS directly; it ensures correct mounting.
// Centering is controlled by your widget-core layout CSS. If it still left-aligns,
// that is a CSS rule issue (we will fix in widget-core.css / widget.css next).

(function () {
  const W = window;

  // ---------------------------------------------------------------------------
  // Prefix-aware URL builder (GH Pages + deep pages safe)
  // ---------------------------------------------------------------------------
  function prefix() {
    // Your partials-loader sets window.ZZX.PREFIX; use it if available
    const p = W.ZZX && typeof W.ZZX.PREFIX === "string" ? W.ZZX.PREFIX : null;
    if (!p) return "";                // fallback: root-relative
    if (p === "/") return "";         // hosted at domain root
    return p.replace(/\/+$/, "");     // strip trailing slash
  }

  function url(path) {
    // path like "/bitcoin/ticker/ticker.html"
    const p = prefix();
    if (!p) return path;
    return p + path;
  }

  // ---------------------------------------------------------------------------
  // Slot discovery (STRICT) + safe mount selection
  // ---------------------------------------------------------------------------
  function findSlot() {
    // Correct mount: the ticker widget slot (preferred)
    return (
      document.querySelector('[data-widget-slot="bitcoin-ticker"]') ||
      document.querySelector('[data-widget-id="bitcoin-ticker"]') ||
      document.querySelector('[data-w="bitcoin-ticker"]') ||
      null
    );
  }

  function getMount(slot) {
    // Prefer a dedicated inner mount:
    // <div data-ticker-mount></div>
    return slot.querySelector("[data-ticker-mount]") || slot;
  }

  function renderFail(slot, msg) {
    try {
      const mount = getMount(slot);
      mount.innerHTML =
        `<div class="btc-card">
           <div class="btc-card__title">[BTC]</div>
           <div class="btc-card__value">$—</div>
           <div class="btc-card__sub">${String(msg || "ticker load failed")}</div>
         </div>`;
    } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // Core loader (only once)
  // ---------------------------------------------------------------------------
  function ensureTickerCore() {
    if (document.querySelector('script[data-ticker-core="1"]')) return;

    const s = document.createElement("script");
    s.src = url("/bitcoin/ticker/ticker.js") + `?v=${Date.now()}`; // cache-bust during stabilization
    s.defer = true;
    s.dataset.tickerCore = "1";
    s.onerror = () => console.warn("[Ticker] ticker.js failed to load:", s.src);
    document.body.appendChild(s);
  }

  // ---------------------------------------------------------------------------
  // Inject ticker fragment into the widget slot
  // ---------------------------------------------------------------------------
  async function mountTickerInto(slot) {
    if (!slot) return;

    // Prevent double-load per SLOT instance
    if (slot.dataset.tickerLoaded === "1") return;
    slot.dataset.tickerLoaded = "1";

    const htmlURL = url("/bitcoin/ticker/ticker.html");

    try {
      const r = await fetch(htmlURL, { cache: "no-store" });
      if (!r.ok) throw new Error(`ticker.html HTTP ${r.status}`);

      const html = await r.text();
      const mount = getMount(slot);

      // IMPORTANT: do not wipe the whole slot if it contains the widget wrapper.
      // Only populate the inner mount if present; else populate slot.
      mount.innerHTML = html;

      ensureTickerCore();
    } catch (err) {
      console.error("[Ticker] widget load failed:", err);
      renderFail(slot, err && err.message ? err.message : "ticker load failed");
    }
  }

  // ---------------------------------------------------------------------------
  // Races: runtime/partials + widget-core may mount after DOMContentLoaded.
  // We:
  // - wait for zzx:partials:ready if present
  // - otherwise mount on DOMContentLoaded
  // - and observe DOM for the slot being created/replaced (prevents “disappearing”)
  // ---------------------------------------------------------------------------
  let started = false;

  function start() {
    if (started) return;
    started = true;

    // Try mount immediately if slot exists
    const slot = findSlot();
    if (slot) mountTickerInto(slot);

    // Observe for slot insertion/replacement (covers widget-core re-render)
    const mo = new MutationObserver(() => {
      const s = findSlot();
      if (s && s.dataset.tickerLoaded !== "1") {
        mountTickerInto(s);
      }
    });

    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  // Prefer partials-ready because that means header/footer/runtime are stable
  W.addEventListener("zzx:partials:ready", start, { once: true });

  // Fallback if event never fires
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      // small defer to let synchronous runtime scripts attach first
      setTimeout(start, 0);
    }, { once: true });
  } else {
    setTimeout(start, 0);
  }
})();
