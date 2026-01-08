// __partials/widgets/hashrate-by-nation/chart.js
// DROP-IN (DEBUGGED)
//
// Renders hashrate-by-nation bars with optional uncertainty bands.
// Compatible with ZZXHashrateNationPlotter.layout() output.
//
// Expects rows shaped like:
// {
//   iso,
//   x, y, w, h,
//   bandMinW?, bandMaxW?,
//   hashrateZH
// }

(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

  const NS = (window.ZZXHashrateNationChart =
    window.ZZXHashrateNationChart || {});

  function el(name, attrs = {}, text) {
    const n = document.createElementNS(SVG_NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }

  NS.draw = function draw(svg, rows) {
    if (!svg || !Array.isArray(rows)) return;

    // Clear safely (no innerHTML string parsing)
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    rows.forEach(r => {
      const yMid = r.y + r.h / 2 + 4;

      // --- Uncertainty band (if present) ---
      if (Number.isFinite(r.bandMinW) && Number.isFinite(r.bandMaxW)) {
        const bandX = r.x + Math.min(r.bandMinW, r.bandMaxW);
        const bandW = Math.abs(r.bandMaxW - r.bandMinW);

        svg.appendChild(el("rect", {
          x: bandX.toFixed(2),
          y: r.y.toFixed(2),
          width: bandW.toFixed(2),
          height: r.h.toFixed(2),
          class: "zzx-hbn-band",
        }));
      }

      // --- Main bar ---
      svg.appendChild(el("rect", {
        x: r.x.toFixed(2),
        y: r.y.toFixed(2),
        width: Math.max(0, r.w).toFixed(2),
        height: r.h.toFixed(2),
        class: "zzx-hbn-bar",
      }));

      // --- Nation label ---
      svg.appendChild(el("text", {
        x: 4,
        y: yMid.toFixed(2),
        class: "zzx-hbn-label",
        "dominant-baseline": "middle",
      }, r.iso));

      // --- Value label ---
      svg.appendChild(el("text", {
        x: (r.x + r.w + 6).toFixed(2),
        y: yMid.toFixed(2),
        class: "zzx-hbn-value",
        "dominant-baseline": "middle",
      }, `${r.hashrateZH.toFixed(2)} ZH/s`));
    });
  };
})();
