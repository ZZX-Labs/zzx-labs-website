(() => {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".mode-tab").forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.mode;

        document.querySelectorAll(".mode-tab").forEach((tab) => {
          tab.classList.toggle("active", tab === button);
        });

        document.querySelectorAll(".mode-panel").forEach((panel) => {
          panel.classList.toggle("active", panel.id === `mode-${mode}`);
        });

        window.ZZXHooks?.emit("tervis:mode", { mode });
      });
    });
  });
})();
