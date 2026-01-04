// static/js/ticker-widget.js
// Ticker embed loader (runs once per page)
//
// IMPORTANT (matches your current HUD architecture):
// - DO NOT mount into #btc-ticker (that is the HUD/runtime shell mount point).
// - Instead, mount the ticker fragment into the ticker WIDGET SLOT:
//
//     [data-widget-slot="bitcoin-ticker"]
//
// This prevents clobbering the runtime bar + other widgets.
// It also works whether the page is using:
// - the HUD runtime (__partials/widgets/runtime.js), or
// - a standalone page that only has the ticker slot.
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

  // Prevent double-load per page
  if (slot.dataset.tickerLoaded === "1") return;
  slot.dataset.tickerLoaded = "1";

  // Small helper: safe HTML injection
  function setHTML(html) {
    // Prefer a dedicated inner mount if your widget.html provides one:
    // <div data-ticker-mount></div>
    const inner = slot.querySelector("[data-ticker-mount]");
    (inner || slot).innerHTML = html;
  }

  // Load embeddable HTML fragment
  fetch("/bitcoin/ticker/ticker.html", { cache: "no-store" })
    .then((r) => {
      if (!r.ok) throw new Error(`ticker.html HTTP ${r.status}`);
      return r.text();
    })
    .then((html) => {
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
      // Keep slot visually sane if ticker fails
      try {
        slot.innerHTML =
          `<div class="btc-card">
             <div class="btc-card__title">[BTC]</div>
             <div class="btc-card__value">$—</div>
             <div class="btc-card__sub">ticker load failed</div>
           </div>`;
      } catch (_) {}
    });
})();
