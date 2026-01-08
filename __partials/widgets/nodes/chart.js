// __partials/widgets/nodes/chart.js
// DROP-IN (OPTIONAL)
// Safe no-op unless you add an SVG with [data-nodes-svg] later.
// If present, it can render a tiny history sparkline from localStorage.

(function () {
  "use strict";

  const NS = (window.ZZXNodesChart = window.ZZXNodesChart || {});
  const KEY = "zzx:nodes:history:v1";

  function loadHistory() {
    try {
      const raw = localStorage.getItem(KEY);
      const arr = JSON.parse(raw || "[]");
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

  function saveHistory(arr) {
    try { localStorage.setItem(KEY, JSON.stringify(arr.slice(-48))); } catch {}
  }

  NS.pushPoint = function pushPoint(totalNodes) {
    const v = Number(totalNodes);
    if (!Number.isFinite(v) || v <= 0) return;

    const now = Date.now();
    const h = loadHistory();
    h.push([now, v]);
    saveHistory(h);
  };

  NS.draw = function draw(svgEl) {
    if (!svgEl) return;

    const w = 300, h = 70, pad = 6;
    const hist = loadHistory();
    if (hist.length < 2) return;

    const vals = hist.map(x => Number(x[1])).filter(Number.isFinite);
    if (vals.length < 2) return;

    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = (max - min) || 1;

    const pts = vals.map((v, i) => {
      const x = (i / Math.max(1, vals.length - 1)) * (w - pad * 2) + pad;
      const y = (h - pad) - ((v - min) / span) * (h - pad * 2);
      return [x, y];
    });

    const dLine = "M " + pts.map(p => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" L ");
    const dArea = `${dLine} L ${(w - pad).toFixed(2)} ${(h - pad).toFixed(2)} L ${pad.toFixed(2)} ${(h - pad).toFixed(2)} Z`;

    const pLine = svgEl.querySelector("[data-nodes-line]");
    const pArea = svgEl.querySelector("[data-nodes-area]");
    if (pLine) pLine.setAttribute("d", dLine);
    if (pArea) pArea.setAttribute("d", dArea);
  };
})();
