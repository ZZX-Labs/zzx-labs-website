// __partials/widgets/hashrate/chart.js
(function () {
  "use strict";

  const W = window;
  const NS = (W.ZZXHashrateChart = W.ZZXHashrateChart || {});

  NS.draw = function draw(svgEl, valuesZH) {
    if (!svgEl) return;

    const pLine = svgEl.querySelector("[data-hr-line]");
    const pArea = svgEl.querySelector("[data-hr-area]");
    if (!pLine || !pArea) return;

    const res = W.ZZXHashratePlotter?.build
      ? W.ZZXHashratePlotter.build(valuesZH)
      : { line:"", area:"" };

    pLine.setAttribute("d", res.line || "");
    pArea.setAttribute("d", res.area || "");
  };
})();
