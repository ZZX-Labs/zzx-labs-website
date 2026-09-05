// Shared chart orchestrator for the matched 24h market widget family.

(function () {
  "use strict";

  const W = window;
  if (W.ZZXMarket24Chart?.__version >= 3) return;

  function draw(canvas, kind, model) {
    if (!canvas) return false;

    try {
      if (W.ZZXMarket24Plotter?.draw) {
        const ok = W.ZZXMarket24Plotter.draw(canvas, kind, model);
        if (ok) return true;
      }
    } catch (error) {
      console.warn("[market24 chart] plotter failed", error);
    }

    try {
      if (W.ZZXMarket24Spark?.draw) {
        return Boolean(W.ZZXMarket24Spark.draw(canvas, kind, model));
      }
    } catch (error) {
      console.warn("[market24 chart] fallback failed", error);
    }

    return false;
  }

  function clear(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  W.ZZXMarket24Chart = {
    __version: 3,
    draw,
    clear
  };
})();
