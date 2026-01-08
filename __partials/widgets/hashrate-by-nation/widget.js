// __partials/widgets/hashrate-by-nation/widget.js
// DROP-IN, WORKING, NO FETCHES, NO DEPS
// Inputs:
//   window.ZZXMiningStats.globalHashrateZH   (Number, ZH/s)
//   window.ZZXNodesByNation                 (shares OR counts)
// Output: SVG bars + subline text
(function () {
  "use strict";

  const ID = "hashrate-by-nation";
  const DEBUG = !!window.__ZZX_WIDGET_DEBUG;

  const CFG = {
    refreshMs: 5000,
    topN: 10,

    // Tor uncertainty model (band around node-share allocation)
    torFraction: 0.68,
    torMinMult: 0.25,
    torMaxMult: 2.50,

    // SVG layout
    svgW: 300,
    rowH: 14,
    rowGap: 4,
    padX: 10,
    barMaxW: 240,
    labelX: 4,
  };

  function n(x) {
    const v = Number(x);
    return Number.isFinite(v) ? v : NaN;
  }

  function fmt(x, d = 2) {
    return Number.isFinite(x)
      ? x.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })
      : "—";
  }

  function setText(root, sel, text) {
    const el = root.querySelector(sel);
    if (el) el.textContent = text;
  }

  function normalizeShares(map) {
    if (!map || typeof map !== "object") return null;
    let sum = 0;
    for (const k in map) {
      const v = n(map[k]);
      if (v > 0) sum += v;
    }
    if (!(sum > 0)) return null;

    const out = {};
    for (const k in map) {
      const v = n(map[k]);
      if (v > 0) out[String(k).toUpperCase()] = v / sum;
    }
    return out;
  }

  function getGlobalZH() {
    return n(window.ZZXMiningStats?.globalHashrateZH);
  }

  function getNodeShares() {
    const src = window.ZZXNodesByNation;
    if (!src || typeof src !== "object") return null;

    // Preferred: shares already computed
    if (src.shares && typeof src.shares === "object") {
      return normalizeShares(src.shares);
    }

    // Fallback: byNation counts
    if (src.byNation && typeof src.byNation === "object") {
      const counts = {};
      for (const iso in src.byNation) {
        const c = n(src.byNation[iso]?.nodes);
        if (c > 0) counts[String(iso).toUpperCase()] = c;
      }
      return normalizeShares(counts);
    }

    return null;
  }

  // Tor redistribution: creates alternative share maps to create a min/max band
  function torRedistribute(baseShares, multMin, multMax) {
    const tmp = {};
    for (const iso in baseShares) {
      const p = baseShares[iso];
      // clamp the share weight with multipliers, then renormalize
      const w = Math.max(p * multMin, Math.min(p * multMax, p));
      tmp[iso] = w;
    }
    return normalizeShares(tmp);
  }

  function buildRows(globalZH, publicShares) {
    const torFrac = CFG.torFraction;
    const pubFrac = 1 - torFrac;

    const torBase = publicShares; // center
    const torLow  = torRedistribute(publicShares, CFG.torMinMult, 1.0) || torBase;
    const torHigh = torRedistribute(publicShares, 1.0, CFG.torMaxMult) || torBase;

    const rows = [];
    for (const iso in publicShares) {
      const p = publicShares[iso];

      const baseShare = pubFrac * p + torFrac * (torBase[iso] || 0);
      const lowShare  = pubFrac * p + torFrac * (torLow[iso]  || 0);
      const highShare = pubFrac * p + torFrac * (torHigh[iso] || 0);

      rows.push({
        iso,
        zh: globalZH * baseShare,
        low: globalZH * lowShare,
        high: globalZH * highShare,
      });
    }

    rows.sort((a, b) => b.zh - a.zh);
    return rows.slice(0, CFG.topN);
  }

  // SVG render (self-contained)
  function renderSVG(svg, rows) {
    if (!svg) return;

    // clear
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const NS = "http://www.w3.org/2000/svg";
    const maxVal = Math.max(1, ...rows.map(r => (Number.isFinite(r.high) ? r.high : r.zh)));

    const make = (tag) => document.createElementNS(NS, tag);

    rows.forEach((r, i) => {
      const y = CFG.padX + i * (CFG.rowH + CFG.rowGap);

      const w = (r.zh / maxVal) * CFG.barMaxW;
      const wLow = (r.low / maxVal) * CFG.barMaxW;
      const wHigh = (r.high / maxVal) * CFG.barMaxW;

      // uncertainty band (low..high)
      const band = make("rect");
      band.setAttribute("x", String(CFG.padX + Math.min(wLow, wHigh)));
      band.setAttribute("y", String(y));
      band.setAttribute("width", String(Math.max(0, Math.abs(wHigh - wLow))));
      band.setAttribute("height", String(CFG.rowH));
      band.setAttribute("class", "zzx-hbn-band");
      svg.appendChild(band);

      // main bar
      const bar = make("rect");
      bar.setAttribute("x", String(CFG.padX));
      bar.setAttribute("y", String(y));
      bar.setAttribute("width", String(Math.max(0, w)));
      bar.setAttribute("height", String(CFG.rowH));
      bar.setAttribute("class", "zzx-hbn-bar");
      svg.appendChild(bar);

      // ISO label
      const t1 = make("text");
      t1.setAttribute("x", String(CFG.labelX));
      t1.setAttribute("y", String(y + CFG.rowH - 3));
      t1.setAttribute("class", "zzx-hbn-label");
      t1.textContent = r.iso;
      svg.appendChild(t1);

      // value label
      const t2 = make("text");
      t2.setAttribute("x", String(CFG.padX + Math.max(0, w) + 6));
      t2.setAttribute("y", String(y + CFG.rowH - 3));
      t2.setAttribute("class", "zzx-hbn-value");
      t2.textContent = `${r.zh.toFixed(2)} ZH/s`;
      svg.appendChild(t2);
    });

    // resize viewBox height to fit rows cleanly
    const h = CFG.padX * 2 + rows.length * (CFG.rowH + CFG.rowGap);
    svg.setAttribute("viewBox", `0 0 ${CFG.svgW} ${Math.max(80, h)}`);
  }

  function update(root) {
    const globalZH = getGlobalZH();
    if (!(globalZH > 0)) {
      setText(root, "[data-hbn-sub]", "waiting for global hashrate…");
      return;
    }

    const shares = getNodeShares();
    if (!shares) {
      setText(root, "[data-hbn-sub]", "error: ZZXNodesByNation missing (shares or counts)");
      return;
    }

    const rows = buildRows(globalZH, shares);
    if (!rows.length) {
      setText(root, "[data-hbn-sub]", "error: no nation rows");
      return;
    }

    const svg = root.querySelector("[data-hbn-svg]");
    renderSVG(svg, rows);

    const sub = rows
      .map(r => `${r.iso}: ${fmt(r.zh)} (${fmt(r.low)}–${fmt(r.high)})`)
      .join(" · ");

    setText(
      root,
      "[data-hbn-sub]",
      `Global ${fmt(globalZH)} ZH/s · node-share × tor-band estimate · ${sub}`
    );
  }

  function boot(root) {
    if (!root) return;

    if (root.__zzxTimer) {
      clearInterval(root.__zzxTimer);
      root.__zzxTimer = null;
    }

    update(root);
    root.__zzxTimer = setInterval(() => update(root), CFG.refreshMs);
  }

  if (window.ZZXWidgetsCore?.onMount) {
    window.ZZXWidgetsCore.onMount(ID, boot);
  } else if (window.ZZXWidgets?.register) {
    window.ZZXWidgets.register(ID, boot);
  } else {
    if (DEBUG) console.warn("[hashrate-by-nation] no widget registry found");
  }
})();
