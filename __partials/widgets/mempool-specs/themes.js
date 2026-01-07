// __partials/widgets/mempool-specs/themes.js
// - Fee rate -> color mapping
// - Uses window.ZZXTheme if present; otherwise falls back to defaults.
// Exposes: window.ZZXMempoolSpecs.Theme

(function () {
  const NS = (window.ZZXMempoolSpecs = window.ZZXMempoolSpecs || {});

  const FALLBACK = {
    canvasBg: "#000",
    border: "#e6a42b",
    text: "#c0d674",
    muted: "rgba(192,214,116,0.75)",
    gridLine: "rgba(255,255,255,0.06)",
    tileOutline: "rgba(255,255,255,0.08)",

    // fee tiers low->high
    tiers: [
      { min:   0, color: "#203a43" }, // very low
      { min:   2, color: "#2c5364" },
      { min:   5, color: "#1c7c54" },
      { min:  10, color: "#2aa876" },
      { min:  20, color: "#6aa92a" },
      { min:  40, color: "#b6a11c" },
      { min:  80, color: "#e6a42b" },
      { min: 150, color: "#ff6b35" },
      { min: 300, color: "#ff3b3b" }  // screaming
    ],

    // used for “high/low markers” if you want them later
    hiColor: "#2bdc7f",
    loColor: "#ff3b3b",
  };

  function getThemeFromGlobal() {
    const t = window.ZZXTheme?.widgets?.mempoolSpecs;
    if (!t || typeof t !== "object") return null;
    return t;
  }

  function normalizeTheme(t) {
    const out = { ...FALLBACK, ...(t || {}) };

    // tiers may be array of strings or objects; normalize to {min,color}
    if (Array.isArray(out.tiers)) {
      out.tiers = out.tiers
        .map((x, i) => {
          if (typeof x === "string") return { min: i * 10, color: x };
          if (x && typeof x === "object") return { min: Number(x.min ?? 0), color: String(x.color || "#888") };
          return null;
        })
        .filter(Boolean)
        .sort((a, b) => a.min - b.min);
    } else {
      out.tiers = FALLBACK.tiers.slice();
    }

    return out;
  }

  function colorForFeeRate(satsPerVb, theme) {
    const fee = Number(satsPerVb);
    const t = normalizeTheme(theme || getThemeFromGlobal());

    if (!Number.isFinite(fee) || fee < 0) return t.tiers[0].color;

    // find highest tier with min <= fee
    let c = t.tiers[0].color;
    for (const tier of t.tiers) {
      if (fee >= tier.min) c = tier.color;
      else break;
    }
    return c;
  }

  NS.Theme = {
    get() { return normalizeTheme(getThemeFromGlobal()); },
    colorForFeeRate,
    normalize: normalizeTheme,
  };
})();
