(() => {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    const tabs = [...document.querySelectorAll(".mode-tab")];
    const panels = [...document.querySelectorAll(".mode-panel")];

    function activate(mode) {
      tabs.forEach((tab) => {
        const active = tab.dataset.mode === mode;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", active ? "true" : "false");
      });

      panels.forEach((panel) => {
        panel.classList.toggle("active", panel.id === `mode-${mode}`);
      });

      window.ZZXHooks?.emit("project:mode", { mode });
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => activate(tab.dataset.mode));
    });

    if (tabs.length) activate(tabs[0].dataset.mode);
  });
})();
