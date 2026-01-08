// __partials/widgets/hashrate-by-nation/chart.js
// DROP-IN (DEBUGGED)
//
// Renders hashrate-by-nation bars with optional uncertainty band.
// Works with output from ZZXHashrateNationPlotter.layout():
//   {
//     iso, x, y, w, h,
//     bandMinW?, bandMaxW?,
//     hashrateZH,           // central estimate
//     _raw?: { lowZH?, highZH?, capped? }   // preserved if you pass it through
//   }
//
// Safe: never throws on NaN, never uses innerHTML.

(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const NS = (window.ZZXHashrateNationChart =
    window.ZZXHashrateNationChart || {});

  function el(name, attrs, text) {
    const node = document.createElementNS(SVG_NS, name);
    if (attrs) for (const k in attrs) node.setAttribute(k, String(attrs[k]));
    if (text != null) node.textContent = String(text);
    return node;
  }

  function nf(x, d = 2) {
    const v = Number(x);
    return Number.isFinite(v) ? v.toFixed(d) : "—";
  }

  NS.draw = function draw(svg, rows) {
    if (!svg || !Array.isArray(rows)) return;

    while (svg.firstChild) svg.removeChild(svg.firstChild);

    for (const r of rows) {
      if (!r) continue;

      const x = Number(r.x), y = Number(r.y), w = Number(r.w), h = Number(r.h);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(h)) continue;

      const barW = Number.isFinite(w) ? Math.max(0, w) : 0;
      const yMid = y + h / 2;

      // --- Uncertainty band (optional) ---
      const bMin = Number(r.bandMinW);
      const bMax = Number(r.bandMaxW);
      if (Number.isFinite(bMin) && Number.isFinite(bMax)) {
        const bandStart = x + Math.min(bMin, bMax);
        const bandW = Math.abs(bMax - bMin);
        if (bandW > 0.5) {
          svg.appendChild(
            el("rect", {
              x: bandStart.toFixed(2),
              y: y.toFixed(2),
              width: bandW.toFixed(2),
              height: h.toFixed(2),
              class: "zzx-hbn-band",
            })
          );
        }
      }

      // --- Main bar ---
      svg.appendChild(
        el("rect", {
          x: x.toFixed(2),
          y: y.toFixed(2),
          width: barW.toFixed(2),
          height: h.toFixed(2),
          rx: 2,
          ry: 2,
          class: "zzx-hbn-bar",
        })
      );

      // --- Nation label (left) ---
      svg.appendChild(
        el(
          "text",
          {
            x: 4,
            y: yMid.toFixed(2),
            class: "zzx-hbn-label",
            "dominant-baseline": "middle",
          },
          r.iso || "—"
        )
      );

      // --- Value label (right of bar) ---
      const zh = Number(r.hashrateZH);
      const capped = !!(r._raw && r._raw.capped);
      const suffix = capped ? " (cap)" : "";

      svg.appendChild(
        el(
          "text",
          {
            x: (x + barW + 6).toFixed(2),
            y: yMid.toFixed(2),
            class: "zzx-hbn-value",
            "dominant-baseline": "middle",
          },
          `${nf(zh, 2)} ZH/s${suffix}`
        )
      );

      // --- Optional range label (if estimator preserved low/high in _raw) ---
      const lowZH = Number(r._raw?.lowZH);
      const highZH = Number(r._raw?.highZH);
      if (Number.isFinite(lowZH) && Number.isFinite(highZH)) {
        svg.appendChild(
          el(
            "text",
            {
              x: (x + barW + 6).toFixed(2),
              y: (yMid + 10).toFixed(2),
              class: "zzx-hbn-range",
              "dominant-baseline": "middle",
            },
            `${nf(lowZH, 2)}–${nf(highZH, 2)}`
          )
        );
      }
    }
  };
})();
