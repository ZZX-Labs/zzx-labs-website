// __partials/widgets/hashrate/plotter.js
(function () {
  "use strict";

  const W = window;
  const NS = (W.ZZXHashratePlotter = W.ZZXHashratePlotter || {});

  NS.build = function build(valuesZH) {
    const w = 300, h = 70, pad = 6;

    const src = Array.isArray(valuesZH) ? valuesZH : [];
    if (src.length < 2) return { line:"", area:"" };

    const vals = src.filter(Number.isFinite);
    if (!vals.length) return { line:"", area:"" };

    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = (max - min) || 1;

    const n = src.length;
    const pts = src.map((v, i) => {
      const x = (i / Math.max(1, n - 1)) * (w - pad * 2) + pad;
      const vv = Number.isFinite(v) ? v : min;
      const y = (h - pad) - ((vv - min) / span) * (h - pad * 2);
      return [x, y];
    });

    const line = "M " + pts.map(p => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" L ");
    const area = `${line} L ${(w - pad).toFixed(2)} ${(h - pad).toFixed(2)} L ${pad.toFixed(2)} ${(h - pad).toFixed(2)} Z`;
    return { line, area };
  };
})();
