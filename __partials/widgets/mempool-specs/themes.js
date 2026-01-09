// __partials/widgets/mempool-specs/themes.js
// DROP-IN COMPLETE REPLACEMENT
//
// Fee-rate → color mapping for mempool-specs.
// Respects global ZZXTheme if present.
// Defaults align with ZZX color system:
//   - Values:  #c0d674
//   - Volume:  #e6a42b
//
// Exposes:
//   window.ZZXMempoolSpecs.Theme

(function () {
  "use strict";

  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});

  const FALLBACK = {
    canvasBg: "#000000",
    border:   "#e6a42b",
    text:     "#c0d674",
    muted:    "rgba(192,214,116,0.70)",
    gridLine: "rgba(255,255,255,0.06)",
    tileOutline: "rgba(255,255,255,0.08)",

    // Fee tiers (sat/vB) — ordered low → high
    tiers: [
      { min:   0, color: "#1e2b32" }, // dust / idle
      { min:   2, color: "#243f4a" },
      { min:   5, color: "#2f6f5a" },
      { min:  10, color: "#4b9a6a" },
      { min:  20, color: "#6bb36d" },
      { min:  40, color: "#9fb84b" },
      { min:  80, color: "#c0d674" }, // economic equilibrium
      { min: 150, color: "#e6a42b" }, // congestion
      { min: 300, color: "#ff4d4d" }  // panic
    ],

    hiColor: "#e6a42b",
    loColor: "#2b7cff"
  };

  function getGlobalTheme() {
    const t = window.ZZXTheme?.widgets?.mempoolSpecs;
    if (!t || typeof t !== "object") return null;
    return t;
  }

  function normalizeTheme(t) {
    const out = { ...FALLBACK, ...(t || {}) };

    if (Array.isArray(out.tiers)) {
      out.tiers = out.tiers
        .map((x, i) => {
          if (typeof x === "string") {
            return { min: i * 10, color: x };
          }
          if (x && typeof x === "object") {
            return {
              min: Number(x.min ?? 0),
              color: String(x.color || "#888")
            };
          }
          return null;
        })
        .filter(Boolean)
        .sort((a, b) => a.min - b.min);
    } else {
      out.tiers = FALLBACK.tiers.slice();
    }

    return out;
  }

  function colorForFeeRate(satPerVb, theme) {
    const fee = Number(satPerVb);
    const t = normalizeTheme(theme || getGlobalTheme());

    if (!Number.isFinite(fee) || fee < 0) {
      return t.tiers[0].color;
    }

    let color = t.tiers[0].color;
    for (const tier of t.tiers) {
      if (fee >= tier.min) color = tier.color;
      else break;
    }
    return color;
  }

  NS.Theme = {
    get() {
      return normalizeTheme(getGlobalTheme());
    },
    normalize: normalizeTheme,
    colorForFeeRate
  };
})();
