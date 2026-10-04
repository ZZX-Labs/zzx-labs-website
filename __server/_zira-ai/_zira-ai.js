(() => {
    "use strict";

    function updateTimestamp() {

        const target =
            document.getElementById(
                "zira-updated"
            );

        if (!target) {
            return;
        }

        target.textContent =
            new Date().toLocaleString();
    }

    function annotateCards() {

        document
            .querySelectorAll(".server-card")
            .forEach((card) => {

                const href =
                    card.getAttribute("href") || "";

                if (href.includes("knowledge")) {
                    card.dataset.ziraModule = "knowledge";
                }
                else if (href.includes("search")) {
                    card.dataset.ziraModule = "search";
                }
                else if (href.includes("automation")) {
                    card.dataset.ziraModule = "automation";
                }
                else if (href.includes("agent")) {
                    card.dataset.ziraModule = "agents";
                }
                else if (href.includes("bitnodes")) {
                    card.dataset.ziraModule = "bitnodes";
                }
                else if (href.includes("bpi")) {
                    card.dataset.ziraModule = "bpi";
                }
                else if (href.includes("cyberchef")) {
                    card.dataset.ziraModule = "cyberchef";
                }
                else if (href.includes("research")) {
                    card.dataset.ziraModule = "research";
                }
                else {
                    card.dataset.ziraModule = "general";
                }

            });
    }

    function injectMeta() {

        const meta =
            document.createElement(
                "meta"
            );

        meta.name =
            "zzx-zira-warning";

        meta.content =
            "Do not expose prompts, credentials, model weights, datasets, customer records, private research, or operational secrets.";

        document.head.appendChild(
            meta
        );
    }

    function init() {
        updateTimestamp();
        annotateCards();
        injectMeta();
    }

    if (
        document.readyState ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            init
        );
        return;
    }

    init();

})();
