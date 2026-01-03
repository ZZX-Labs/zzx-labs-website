// static/js/ticker-widget.js
// Self-contained ticker embed loader (runs once per page)

(function () {
  const container = document.getElementById("ticker-container");
  const mount = document.getElementById("btc-ticker");

  if (!container || !mount) return; // page doesn't have the widget

  // Prevent double-loading if partial included twice accidentally
  if (container.dataset.tickerLoaded === "1") return;
  container.dataset.tickerLoaded = "1";

  // Load embeddable HTML fragment
  fetch("/bitcoin/ticker/ticker.html", { cache: "no-store" })
    .then((r) => {
      if (!r.ok) throw new Error(`ticker.html HTTP ${r.status}`);
      return r.text();
    })
    .then((html) => {
      mount.innerHTML = html;

      // Load ticker logic once (and only after HTML exists)
      if (!document.querySelector('script[data-ticker-core="1"]')) {
        const s = document.createElement("script");
        s.src = "/bitcoin/ticker/ticker.js";
        s.defer = true;
        s.dataset.tickerCore = "1";
        document.body.appendChild(s);
      }
    })
    .catch((err) => console.error("Ticker widget load failed:", err));
})();
