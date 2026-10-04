(() => {
    "use strict";

    function updateTimestamp() {

        const target =
            document.getElementById(
                "backups-updated"
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

                if (href.includes("local")) {
                    card.dataset.backupGroup = "local";
                }
                else if (href.includes("offsite")) {
                    card.dataset.backupGroup = "offsite";
                }
                else if (href.includes("cold")) {
                    card.dataset.backupGroup = "cold";
                }
                else if (href.includes("replication")) {
                    card.dataset.backupGroup = "replication";
                }
                else if (href.includes("retention")) {
                    card.dataset.backupGroup = "retention";
                }
                else if (href.includes("disaster")) {
                    card.dataset.backupGroup = "recovery";
                }
                else {
                    card.dataset.backupGroup = "general";
                }

            });
    }

    function injectMeta() {

        const meta =
            document.createElement(
                "meta"
            );

        meta.name =
            "zzx-backups-warning";

        meta.content =
            "Do not expose backup archives, recovery keys, vault locations, credentials, retention metadata, or private storage details.";

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
