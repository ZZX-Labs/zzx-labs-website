(() => {
    "use strict";

    function updateTimestamp() {
        const target =
            document.getElementById(
                "flask-updated"
            );

        if (!target) {
            return;
        }

        target.textContent =
            new Date().toLocaleString();
    }

    function annotateApiCards() {
        document.querySelectorAll(".server-card")
            .forEach((card) => {

                const href =
                    card.getAttribute("href") || "";

                if (href.includes("bpi")) {
                    card.dataset.apiGroup = "bitcoin";
                }
                else if (href.includes("bitnodes")) {
                    card.dataset.apiGroup = "bitnodes";
                }
                else if (href.includes("mempool")) {
                    card.dataset.apiGroup = "mempool";
                }
                else if (href.includes("security")) {
                    card.dataset.apiGroup = "security";
                }
                else if (href.includes("analytics")) {
                    card.dataset.apiGroup = "analytics";
                }
                else if (href.includes("zira")) {
                    card.dataset.apiGroup = "zira";
                }
                else {
                    card.dataset.apiGroup = "general";
                }
            });
    }

    function init() {
        updateTimestamp();
        annotateApiCards();
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
