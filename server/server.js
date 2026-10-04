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
        const target = document.getElementById("host-updated");

        if (target) {
            target.textContent = formatLocalTimestamp(new Date());
        }
    }

    function annotateCards() {
        document.querySelectorAll(".host-card").forEach((card) => {
            const href = card.getAttribute("href") || "";

            if (href.includes("systemd")) {
                card.dataset.hostGroup = "systemd";
            } else if (href.includes("__server")) {
                card.dataset.hostGroup = "server-frontend";
            } else if (href.includes("nginx")) {
                card.dataset.hostGroup = "nginx";
            } else if (href.includes("flask")) {
                card.dataset.hostGroup = "flask";
            } else if (href.includes("bitnodes")) {
                card.dataset.hostGroup = "bitnodes";
            } else if (href.includes("bpi")) {
                card.dataset.hostGroup = "bpi";
            } else if (href.includes("mempool")) {
                card.dataset.hostGroup = "mempool";
            } else if (href.includes("dashboard")) {
                card.dataset.hostGroup = "dashboard";
            } else {
                card.dataset.hostGroup = "host";
            }
        });
    }

    function injectHostMeta() {
        const meta = document.createElement("meta");
        meta.name = "zzx-host-server-static-warning";
        meta.content = "Host server portal. Do not commit production secrets, private environment files, SSH keys, internal IP addresses, credentials, raw logs, or recovery material.";
        document.head.appendChild(meta);
    }

    function init() {
        updateTimestamp();
        annotateCards();
        injectHostMeta();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
        return;
    }

    init();
})();
