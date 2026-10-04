// /static/js/theme.js
// Theme tokens for widgets. Safe to load multiple times.

(function () {
  window.ZZXTheme = window.ZZXTheme || {};

  // Global-ish defaults (match your palette)
  const BRAND = {
    bg0: "#000000",
    bg1: "#0b0b0b",
    panel: "#111111",
    line: "#2a2a2a",
    green: "#c0d674",
    ochre: "#e6a42b",
    muted: "#b7bf9a",
  };

  // Mempool "goggles" palette (fee-rate tiers from LOW→HIGH)
  // You can later swap for any scheme.
  const GOGGLES = {
    canvasBg: BRAND.bg0,
    frameBorder: BRAND.ochre,
    gridLine: "rgba(255,255,255,0.06)",
    tileGap: 1,          // px gap between tiles
    tileSize: 4,         // px tile size (4 looks good, 3 = denser)
    cornerRadius: 8,

    // Fee tiers colors (low->high). Add/remove tiers freely.
    tiers: [
      "#0b3d2e", // low
      "#0f5a3f",
      "#12724f",
      "#168a61",
      "#1aa374",
      "#6aa92a",
      "#b6a11c", // very high
    ],
  };

  window.ZZXTheme.widgets = window.ZZXTheme.widgets || {};
  window.ZZXTheme.widgets.mempoolGoggles = window.ZZXTheme.widgets.mempoolGoggles || GOGGLES;
  window.ZZXTheme.brand = window.ZZXTheme.brand || BRAND;
})();
