(() => {
    "use strict";

    function updateTimestamp() {
        const target = document.getElementById(
            "analytics-updated"
        );

        if (!target) {
            return;
        }

        target.textContent =
            new Date().toLocaleString();
    }

    function init() {
        updateTimestamp();
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            init
        );
        return;
    }

    init();
})();
