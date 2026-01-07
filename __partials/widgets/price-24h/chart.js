// __partials/widgets/price-24h/chart.js
// Chart module wrapper for price-24h

(function () {
  "use strict";

  const NS = (window.ZZXChart = window.ZZXChart || {});

  NS.drawPrice24 = function drawPrice24(canvas, candles, deltaIsUp) {
    window.ZZXPlotter?.drawHL?.(canvas, candles, deltaIsUp);
  };
})();
