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
        const target = document.getElementById("sftp-updated");

        if (target) {
            target.textContent = formatLocalTimestamp(new Date());
        }
    }

    function annotateSftpCards() {
        document.querySelectorAll(".server-card").forEach((card) => {
            const href = card.getAttribute("href") || "";

            if (href.includes("client")) {
                card.dataset.sftpGroup = "clients";
            } else if (href.includes("research")) {
                card.dataset.sftpGroup = "research";
            } else if (href.includes("release")) {
                card.dataset.sftpGroup = "releases";
            } else if (href.includes("quarantine")) {
                card.dataset.sftpGroup = "quarantine";
            } else if (href.includes("ssh")) {
                card.dataset.sftpGroup = "keys";
            } else if (href.includes("audit")) {
                card.dataset.sftpGroup = "audit";
            } else if (href.includes("storage")) {
                card.dataset.sftpGroup = "storage";
            } else {
                card.dataset.sftpGroup = "sftp";
            }
        });
    }

    function injectSftpMeta() {
        const meta = document.createElement("meta");
        meta.name = "zzx-sftp-static-warning";
        meta.content = "SFTP portal. Do not publish real usernames, hostnames, IP addresses, SSH private keys, authorized keys, passwords, client paths, upload logs, or access records.";
        document.head.appendChild(meta);
    }

    function init() {
        updateTimestamp();
        annotateSftpCards();
        injectSftpMeta();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
        return;
    }

    init();
})();
