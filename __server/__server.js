(() => {
    "use strict";

    const $ = (selector) => document.querySelector(selector);

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

    function updateServerState() {
        const state = $("#server-state");
        const updated = $("#server-updated");

        if (state) {
            state.textContent = "Ready";
        }

        if (updated) {
            updated.textContent = formatLocalTimestamp(new Date());
        }
    }

    function annotateCards() {
        document.querySelectorAll(".server-card").forEach((card) => {
            const href = card.getAttribute("href") || "";

            if (href.includes("nginx")) {
                card.dataset.serverGroup = "nginx";
            } else if (href.includes("flask")) {
                card.dataset.serverGroup = "flask";
            } else if (href.includes("sftp")) {
                card.dataset.serverGroup = "sftp";
            } else if (href.includes("email")) {
                card.dataset.serverGroup = "email";
            } else if (href.includes("data-storage")) {
                card.dataset.serverGroup = "storage";
            } else if (href.includes("zira")) {
                card.dataset.serverGroup = "zira";
            } else if (href.includes("dashboard")) {
                card.dataset.serverGroup = "dashboard";
            } else {
                card.dataset.serverGroup = "server";
            }
        });
    }

    function injectStaticServerMeta() {
        const meta = document.createElement("meta");
        meta.name = "zzx-server-static-warning";
        meta.content = "Static server portal. Do not commit credentials, tokens, private environment files, SSH keys, private host configs, logs, or database dumps.";
        document.head.appendChild(meta);
    }

    function init() {
        updateServerState();
        annotateCards();
        injectStaticServerMeta();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
        return;
    }

    init();
})();
