// /static/js/ticker-widget.js
// ZZX Bitcoin Ticker Widget Loader
// UNIFIED + DEPTH-SAFE + HUD-SAFE + MANIFEST-CORE-SAFE
//
// PURPOSE:
// - Preserve the historical /bitcoin/ticker/ ticker loader as a compatibility path.
// - Work from any site depth using window.ZZX.PREFIX.
// - Mount ONLY into the bitcoin-ticker slot.
// - Support BOTH current and legacy widget-slot conventions.
// - NEVER overwrite the canonical manifest/widget-core mounted bitcoin-ticker.
// - Recover if a slot is replaced.
// - Recover from transient ticker.html / ticker.js load failures.
// - Avoid duplicate ticker-core scripts.
//
// CANONICAL HUD:
//   /__partials/widgets/manifest.json
//     -> /__partials/widgets/_core/widget-core.js
//     -> /__partials/widgets/bitcoin-ticker/
//
// LEGACY FALLBACK:
//   /bitcoin/ticker/ticker.html
//   /bitcoin/ticker/ticker.js
//
// The canonical manifest-driven widget always wins.

(function () {
  "use strict";

  const W = window;
  const D = document;

  if (W.__ZZX_LEGACY_TICKER_WIDGET_BOOTED) return;
  W.__ZZX_LEGACY_TICKER_WIDGET_BOOTED = true;

  const ID = "bitcoin-ticker";

  const LEGACY_HTML = "/bitcoin/ticker/ticker.html";
  const LEGACY_JS   = "/bitcoin/ticker/ticker.js";

  const CORE_WAIT_MS = 1800;
  const RETRY_DELAY_MS = 1500;

  let observer = null;
  let coreWaitTimer = null;
  let retryTimer = null;

  // ---------------------------------------------------------------------------
  // Asset version
  // ---------------------------------------------------------------------------

  function assetVersion() {
    const el = D.querySelector('meta[name="asset-version"]');
    return el ? String(el.getAttribute("content") || "").trim() : "";
  }

  function withV(path) {
    const v = assetVersion();
    if (!v) return path;

    try {
      const u = new URL(path, location.href);

      if (!u.searchParams.has("v")) {
        u.searchParams.set("v", v);
      }

      return u.href;
    } catch (_) {
      return path;
    }
  }

  // ---------------------------------------------------------------------------
  // Prefix
  // ---------------------------------------------------------------------------

  function prefix() {
    let p = "";

    if (W.ZZX && typeof W.ZZX.PREFIX === "string") {
      p = W.ZZX.PREFIX.trim();
    }

    if (!p) {
      const hp = D.documentElement
        ? D.documentElement.getAttribute("data-zzx-prefix")
        : "";

      if (typeof hp === "string") {
        p = hp.trim();
      }
    }

    // Never allow relative pseudo-prefixes.
    if (
      p === "." ||
      p === "./" ||
      p === "/"
    ) {
      p = "";
    }

    p = String(p || "").replace(/\/+$/g, "");

    W.ZZX = Object.assign({}, W.ZZX || {}, {
      PREFIX: p
    });

    return p;
  }

  function url(path) {
    if (!path) return path;

    const s = String(path);

    if (/^https?:\/\//i.test(s)) {
      return s;
    }

    if (!s.startsWith("/")) {
      return s;
    }

    const p = prefix();

    return p ? p + s : s;
  }

  // ---------------------------------------------------------------------------
  // Slot discovery
  // ---------------------------------------------------------------------------

  function findSlot() {
    return (
      // Current canonical wrapper convention
      D.querySelector('.btc-slot[data-widget="bitcoin-ticker"]') ||

      // Alternate/current core convention
      D.querySelector('[data-widget-slot="bitcoin-ticker"]') ||

      // Older compatibility conventions
      D.querySelector('[data-widget-id="bitcoin-ticker"]') ||
      D.querySelector('[data-w="bitcoin-ticker"]') ||

      null
    );
  }

  // ---------------------------------------------------------------------------
  // Canonical widget-core detection
  // ---------------------------------------------------------------------------

  function canonicalRoot(slot) {
    if (!slot) return null;

    return (
      slot.querySelector(
        '[data-widget-root="bitcoin-ticker"]'
      ) ||

      slot.querySelector(
        '.zzx-widget[data-widget-id="bitcoin-ticker"]'
      ) ||

      null
    );
  }

  function canonicalMounted(slot) {
    const root = canonicalRoot(slot);

    if (!root) return false;

    // widget-core creates the root before loading HTML.
    // Its presence is enough to establish ownership.
    return true;
  }

  function canonicalCoreExpected() {
    return Boolean(
      W.ZZXWidgetsCore ||
      W.__ZZX_TICKER_LOADER_BOOTED ||
      D.querySelector('script[data-zzx-ticker-loader="1"]') ||
      D.querySelector(
        'script[src*="/static/js/modules/ticker-loader.js"]'
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Mount selection
  // ---------------------------------------------------------------------------

  function getMount(slot) {
    if (!slot) return null;

    // Explicit legacy mount container wins if a page supplies one.
    return (
      slot.querySelector("[data-ticker-mount]") ||
      slot
    );
  }

  // ---------------------------------------------------------------------------
  // Error rendering
  // ---------------------------------------------------------------------------

  function renderFail(slot, msg) {
    if (!slot) return;

    // Never overwrite canonical widget-core UI with a legacy error.
    if (canonicalMounted(slot)) return;

    try {
      const mount = getMount(slot);
      if (!mount) return;

      mount.textContent = "";

      const card = D.createElement("div");
      card.className = "btc-card";

      const title = D.createElement("div");
      title.className = "btc-card__title";
      title.textContent = "[BTC]";

      const value = D.createElement("div");
      value.className = "btc-card__value";
      value.textContent = "$—";

      const sub = D.createElement("div");
      sub.className = "btc-card__sub";
      sub.textContent = String(
        msg || "ticker load failed"
      );

      card.appendChild(title);
      card.appendChild(value);
      card.appendChild(sub);

      mount.appendChild(card);
    } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // Legacy ticker core
  // ---------------------------------------------------------------------------

  function findTickerCoreScript() {
    return (
      D.querySelector('script[data-ticker-core="1"]') ||
      D.querySelector(
        'script[src*="/bitcoin/ticker/ticker.js"]'
      ) ||
      null
    );
  }

  function ensureTickerCore() {
    return new Promise((resolve, reject) => {
      const existing = findTickerCoreScript();

      if (existing) {
        if (existing.dataset.tickerCoreLoaded === "1") {
          resolve(existing);
          return;
        }

        if (existing.dataset.tickerCoreFailed === "1") {
          try {
            existing.remove();
          } catch (_) {}
        } else {
          const loaded = () => {
            existing.dataset.tickerCoreLoaded = "1";
            resolve(existing);
          };

          const failed = () => {
            existing.dataset.tickerCoreFailed = "1";
            reject(
              new Error("ticker.js failed to load")
            );
          };

          existing.addEventListener(
            "load",
            loaded,
            { once: true }
          );

          existing.addEventListener(
            "error",
            failed,
            { once: true }
          );

          // Script may already have executed before this listener attached.
          setTimeout(() => {
            if (
              existing.dataset.tickerCoreFailed !== "1"
            ) {
              existing.dataset.tickerCoreLoaded = "1";
              resolve(existing);
            }
          }, 750);

          return;
        }
      }

      const s = D.createElement("script");

      s.src = withV(url(LEGACY_JS));
      s.defer = true;

      s.dataset.tickerCore = "1";

      s.addEventListener(
        "load",
        () => {
          s.dataset.tickerCoreLoaded = "1";
          s.dataset.tickerCoreFailed = "0";
          resolve(s);
        },
        { once: true }
      );

      s.addEventListener(
        "error",
        () => {
          s.dataset.tickerCoreFailed = "1";

          console.warn(
            "[Ticker] ticker.js failed to load:",
            s.src
          );

          reject(
            new Error("ticker.js failed to load")
          );
        },
        { once: true }
      );

      (
        D.body ||
        D.head ||
        D.documentElement
      ).appendChild(s);
    });
  }

  // ---------------------------------------------------------------------------
  // Retry
  // ---------------------------------------------------------------------------

  function scheduleRetry() {
    if (retryTimer !== null) return;

    retryTimer = W.setTimeout(() => {
      retryTimer = null;

      const slot = findSlot();

      if (!slot) return;
      if (canonicalMounted(slot)) return;

      if (
        slot.dataset.tickerLoaded !== "1" &&
        slot.dataset.tickerLoading !== "1"
      ) {
        mountTickerInto(slot);
      }
    }, RETRY_DELAY_MS);
  }

  // ---------------------------------------------------------------------------
  // Legacy fragment loader
  // ---------------------------------------------------------------------------

  async function mountTickerInto(slot) {
    if (!slot) return;

    // Manifest-driven widget-core owns this slot.
    if (canonicalMounted(slot)) {
      slot.dataset.tickerLegacySuppressed = "1";
      return;
    }

    if (slot.dataset.tickerLoaded === "1") {
      return;
    }

    if (slot.dataset.tickerLoading === "1") {
      return;
    }

    slot.dataset.tickerLoading = "1";
    slot.dataset.tickerLoadFailed = "0";

    const htmlURL = withV(url(LEGACY_HTML));

    try {
      const r = await fetch(
        htmlURL,
        {
          cache: "no-store"
        }
      );

      if (!r.ok) {
        throw new Error(
          `ticker.html HTTP ${r.status}`
        );
      }

      const html = await r.text();

      // widget-core may have mounted while the request was in flight.
      if (canonicalMounted(slot)) {
        slot.dataset.tickerLegacySuppressed = "1";
        return;
      }

      const mount = getMount(slot);

      if (!mount) {
        throw new Error(
          "ticker mount unavailable"
        );
      }

      mount.innerHTML = html;

      await ensureTickerCore();

      slot.dataset.tickerLoaded = "1";
      slot.dataset.tickerLoadFailed = "0";
    } catch (err) {
      slot.dataset.tickerLoaded = "0";
      slot.dataset.tickerLoadFailed = "1";

      console.error(
        "[Ticker] legacy widget load failed:",
        err
      );

      renderFail(
        slot,
        err && err.message
          ? err.message
          : "ticker load failed"
      );

      scheduleRetry();
    } finally {
      slot.dataset.tickerLoading = "0";
    }
  }

  // ---------------------------------------------------------------------------
  // Slot handling
  // ---------------------------------------------------------------------------

  function considerSlot(slot) {
    if (!slot) return;

    // Canonical manifest/core widget always wins.
    if (canonicalMounted(slot)) {
      slot.dataset.tickerLegacySuppressed = "1";
      return;
    }

    // If the unified ticker loader is present, give widget-core a short
    // opportunity to claim the slot before invoking the old fallback.
    if (canonicalCoreExpected()) {
      if (coreWaitTimer !== null) return;

      coreWaitTimer = W.setTimeout(() => {
        coreWaitTimer = null;

        const current = findSlot();

        if (!current) return;

        if (canonicalMounted(current)) {
          current.dataset.tickerLegacySuppressed = "1";
          return;
        }

        mountTickerInto(current);
      }, CORE_WAIT_MS);

      return;
    }

    mountTickerInto(slot);
  }

  // ---------------------------------------------------------------------------
  // Observer
  // ---------------------------------------------------------------------------

  function installObserver() {
    if (observer) return;

    observer = new MutationObserver(() => {
      const slot = findSlot();

      if (!slot) return;

      if (canonicalMounted(slot)) {
        slot.dataset.tickerLegacySuppressed = "1";
        return;
      }

      if (
        slot.dataset.tickerLoaded !== "1" &&
        slot.dataset.tickerLoading !== "1"
      ) {
        considerSlot(slot);
      }
    });

    observer.observe(
      D.documentElement,
      {
        childList: true,
        subtree: true
      }
    );
  }

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------

  let started = false;

  function start() {
    if (started) return;
    started = true;

    prefix();

    installObserver();

    const slot = findSlot();

    if (slot) {
      considerSlot(slot);
    }
  }

  // Both partial-ready spellings exist historically in this repo.
  W.addEventListener(
    "zzx:partials-ready",
    start,
    { once: true }
  );

  W.addEventListener(
    "zzx:partials:ready",
    start,
    { once: true }
  );

  // DOM fallback.
  if (D.readyState === "loading") {
    D.addEventListener(
      "DOMContentLoaded",
      () => {
        W.setTimeout(start, 0);
      },
      { once: true }
    );
  } else {
    W.setTimeout(start, 0);
  }

  // Normalize an already-known prefix immediately.
  if (
    W.ZZX &&
    typeof W.ZZX.PREFIX === "string"
  ) {
    prefix();
  }
})();
