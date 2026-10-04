(() => {
    "use strict";

    function formatLocalTimestamp(date) {
        try {
            return new Intl.DateTimeFormat(undefined, {
                year: "numeric",
                month: "short",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            }).format(date);
        } catch (_error) {
            return date.toISOString();
        }
    }

    function updateTimestamp() {
        const target = document.getElementById("storage-updated");

        if (target) {
            target.textContent = formatLocalTimestamp(new Date());
        }
    }

    function annotateStorageCards() {
        document.querySelectorAll(".server-card").forEach((card) => {
            const href = card.getAttribute("href") || "";

            if (href.includes("private")) {
                card.dataset.storageGroup = "private";
            } else if (href.includes("research")) {
                card.dataset.storageGroup = "research";
            } else if (href.includes("archive")) {
                card.dataset.storageGroup = "archive";
            } else if (href.includes("client")) {
                card.dataset.storageGroup = "clients";
            } else if (href.includes("backup")) {
                card.dataset.storageGroup = "backups";
            } else if (href.includes("sftp")) {
                card.dataset.storageGroup = "sftp";
            } else if (href.includes("policy")) {
                card.dataset.storageGroup = "policy";
            } else {
                card.dataset.storageGroup = "storage";
            }
        });
    }

    function injectStorageMeta() {
        const meta = document.createElement("meta");
        meta.name = "zzx-data-storage-static-warning";
        meta.content = "Data storage portal. Do not publish private files, credentials, keys, tokens, backups, database dumps, user records, private paths, or sensitive storage topology.";
        document.head.appendChild(meta);
    }

    function init() {
        updateTimestamp();
        annotateStorageCards();
        injectStorageMeta();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
        return;
    }

    init();
})();
