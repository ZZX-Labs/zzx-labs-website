(function () {
  "use strict";

  const W = window;
  if (W.WFB) return;

  const WFB = {
    state: {
      archive: null,
      selectedYear: 2025,
      featureStatus: {},
      referencePages: []
    },
    $: (selector, scope) => (scope || document).querySelector(selector),
    $$: (selector, scope) => Array.from((scope || document).querySelectorAll(selector)),
    text(value, fallback) {
      return value === null || value === undefined || value === "" ? (fallback || "—") : String(value);
    },
    num(value, fallback) {
      const n = Number(value);
      return Number.isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
    },
    format(value) {
      const n = Number(value);
      return Number.isFinite(n) ? n.toLocaleString() : "—";
    },
    unique(values) {
      return Array.from(new Set((values || []).filter((value) => value !== null && value !== undefined && value !== "")));
    },
    dispatch(name, detail) {
      document.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    }
  };

  W.WFB = WFB;
})();
