// __partials/widgets/hashrate-by-nation/widget.js
// DROP-IN, SINGLE-FILE, NO FETCHES
// Uses:
//   window.ZZXMiningStats.globalHashrateZH   (from working hashrate widget)
//   window.ZZXNodesByNation                 (node share data you already compute)
//
// NO mempool
// NO allorigins
// NO fetch.js
// NO JSON parsing
// NO dependency failures

(function () {
  "use strict";

  const ID = "hashrate-by-nation";
  const DEBUG = !!window.__ZZX_WIDGET_DEBUG;

  // ---------------- CONFIG ----------------
  const CONFIG = {
    torFraction: 0.68,        // % of hashrate assumed to be hidden via Tor
    torMinMult: 0.25,         // lower bound per-nation tor allocation
    torMaxMult: 2.50,         // upper bound per-nation tor allocation
    refreshMs: 5000,
    topN: 10,
  };

  // ---------------- UTILS ----------------
  function n(x) {
    const v = Number(x);
    return Number.isFinite(v) ? v : NaN;
  }

  function fmt(x, d = 2) {
    return Number.isFinite(x)
      ? x.toLocaleString(undefined, {
          minimumFractionDigits: d,
          maximumFractionDigits: d,
        })
      : "—";
  }

  function setText(root, sel, text) {
    const el = root.querySelector(sel);
    if (el) el.textContent = text;
  }

  function normalizeShares(map) {
    const sum = Object.values(map).reduce((a, b) => a + n(b), 0);
    if (!(sum > 0)) return null;
    const out = {};
    for (const k in map) {
      const v = n(map[k]);
      if (v > 0) out[k] = v / sum;
    }
    return out;
  }

  // ---------------- INPUT ----------------
  function getGlobalHashrateZH() {
    return n(window.ZZXMiningStats?.globalHashrateZH);
  }

  function getNodeShares() {
    const src = window.ZZXNodesByNation;
    if (!src || typeof src !== "object") return null;

    // Preferred: shares already computed
    if (src.shares && typeof src.shares === "object") {
      return normalizeShares(src.shares);
    }

    // Fallback: counts
    if (src.byNation && typeof src.byNation === "object") {
      const counts = {};
      let total = 0;
      for (const iso in src.byNation) {
        const c = n(src.byNation[iso]?.nodes);
        if (c > 0) {
          counts[iso.toUpperCase()] = c;
          total += c;
        }
      }
      if (total > 0) {
        const shares = {};
        for (const k in counts) shares[k] = counts[k] / total;
        return normalizeShares(shares);
      }
    }

    return null;
  }

  // ---------------- TOR MODEL ----------------
  function torRedistribute(publicShares, multMin, multMax) {
    const tmp = {};
    for (const iso in publicShares) {
      const p = publicShares[iso];
      let v = p;
      v = Math.max(p * multMin, Math.min(p * multMax, v));
      tmp[iso] = v;
    }
    return normalizeShares(tmp);
  }

  function buildEstimates(globalZH, publicShares) {
    const torFrac = CONFIG.torFraction;
    const pubFrac = 1 - torFrac;

    const torBase = publicShares;
    const torLow  = torRedistribute(publicShares, CONFIG.torMinMult, 1.0);
    const torHigh = torRedistribute(publicShares, 1.0, CONFIG.torMaxMult);

    const rows = [];

    for (const iso in publicShares) {
      const p = publicShares[iso];
      const baseShare = pubFrac * p + torFrac * torBase[iso];
      const lowShare  = pubFrac * p + torFrac * torLow[iso];
      const highShare = pubFrac * p + torFrac * torHigh[iso];

      rows.push({
        iso,
        hashrateZH: globalZH * baseShare,
        lowZH: globalZH * lowShare,
        highZH: globalZH * highShare,
      });
    }

    rows.sort((a, b) => b.hashrateZH - a.hashrateZH);
    return rows.slice(0, CONFIG.topN);
  }

  // ---------------- RENDER ----------------
  function render(root, rows, globalZH) {
    const sub = root.querySelector("[data-hbn-sub]");
    const svg = root.querySelector("[data-hbn-svg]");

    // Chart path if present
    if (
      svg &&
      window.ZZXHashrateNationPlotter?.layout &&
      window.ZZXHashrateNationChart?.draw
    ) {
      const layout = window.ZZXHashrateNationPlotter.layout(rows);
      window.ZZXHashrateNationChart.draw(svg, layout);
    }

    // Always show text fallback
    if (sub) {
      const txt = rows
        .map(
          r =>
            `${r.iso}: ${fmt(r.hashrateZH)} ZH/s (${fmt(r.lowZH)}–${fmt(r.highZH)})`
        )
        .join(" · ");

      sub.textContent =
        `Global ${fmt(globalZH)} ZH/s · Estimated by node share + Tor band · ${txt}`;
    }
  }

  // ---------------- LOOP ----------------
  function update(root) {
    const globalZH = getGlobalHashrateZH();
    if (!(globalZH > 0)) {
      setText(root, "[data-hbn-sub]", "waiting for global hashrate…");
      return;
    }

    const shares = getNodeShares();
    if (!shares) {
      setText(root, "[data-hbn-sub]", "error: node shares missing");
      return;
    }

    const rows = buildEstimates(globalZH, shares);
    if (!rows.length) {
      setText(root, "[data-hbn-sub]", "error: no nation rows");
      return;
    }

    render(root, rows, globalZH);
  }

  function boot(root) {
    if (!root) return;

    if (root.__zzxTimer) {
      clearInterval(root.__zzxTimer);
      root.__zzxTimer = null;
    }

    update(root);
    root.__zzxTimer = setInterval(
      () => update(root),
      CONFIG.refreshMs
    );
  }

  // ---------------- REGISTER ----------------
  if (window.ZZXWidgetsCore?.onMount) {
    window.ZZXWidgetsCore.onMount(ID, boot);
  } else if (window.ZZXWidgets?.register) {
    window.ZZXWidgets.register(ID, boot);
  }
})();
