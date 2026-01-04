// static/js/ticker-widget.js
// Ticker embed loader (runs once per page)
//
// IMPORTANT (matches your current HUD architecture):
// - DO NOT mount into #btc-ticker (that is the HUD/runtime shell mount point).
// - Mount the ticker fragment into the ticker WIDGET SLOT:
//
//     [data-widget-slot="bitcoin-ticker"]
//
// Assumes your ticker files remain at:
//   /bitcoin/ticker/ticker.html
//   /bitcoin/ticker/ticker.js

(function () {
  const W = window;

  // Find the correct mount point for the ticker content
  const slot =
    document.querySelector('[data-widget-slot="bitcoin-ticker"]') ||
    document.querySelector('[data-widget-id="bitcoin-ticker"]') ||
    document.getElementById("btc-ticker"); // last-resort fallback ONLY

  if (!slot) return;

  // Prevent double-load per page (per slot)
  if (slot.dataset.tickerLoaded === "1") return;
  slot.dataset.tickerLoaded = "1";

  // Prefer a dedicated inner mount if widget.html provides one:
  // <div data-ticker-mount></div>
  function getMount() {
    return slot.querySelector("[data-ticker-mount]") || slot;
  }

  function setHTML(html) {
    const mount = getMount();
    mount.innerHTML = html;
  }

  function renderFail(msg) {
    try {
      slot.innerHTML =
        `<div class="btc-card">
           <div class="btc-card__title">[BTC]</div>
           <div class="btc-card__value">$—</div>
           <div class="btc-card__sub">${String(msg || "ticker load failed")}</div>
         </div>`;
    } catch (_) {}
  }

  // Load embeddable HTML fragment
  fetch("/bitcoin/ticker/ticker.html", { cache: "no-store" })
    .then((r) => {
      if (!r.ok) throw new Error(`ticker.html HTTP ${r.status}`);
      return r.text();
    })
    .then((html) => {
      // If runtime mounted a richer widget.html wrapper, only fill the inner mount.
      // If not, we inject into the slot itself.
      setHTML(html);

      // Load ticker logic once (and only after HTML exists)
      if (!document.querySelector('script[data-ticker-core="1"]')) {
        const s = document.createElement("script");
        s.src = "/bitcoin/ticker/ticker.js";
        s.defer = true;
        s.dataset.tickerCore = "1";
        s.onerror = () => console.warn("[Ticker] ticker.js failed to load:", s.src);
        document.body.appendChild(s);
      }
    })
    .catch((err) => {
      console.error("Ticker widget load failed:", err);
      renderFail(err && err.message ? err.message : "ticker load failed");
    });
})();
