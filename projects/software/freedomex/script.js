(() => {
  "use strict";

  const state = { nation: "all", mode: "all" };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function save() {
    try { localStorage.setItem("freedomex.router", JSON.stringify(state)); } catch { /* Preferences are optional. */ }
  }

  function load() {
    try {
      const stored = JSON.parse(localStorage.getItem("freedomex.router") || "null");
      if (stored && ["all", "canada", "united-states"].includes(stored.nation)) state.nation = stored.nation;
      if (stored && ["all", "cex", "dex"].includes(stored.mode)) state.mode = stored.mode;
    } catch { /* Start with safe defaults. */ }
  }

  window.FreedomExUI = Object.freeze({ state, escapeHtml, save, load });
})();
