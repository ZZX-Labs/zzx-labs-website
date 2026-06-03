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

    function markActivePortal() {
        const state = $("#admin-portal-state");

        if (state) {
            state.textContent = "Ready";
        }

        const updated = $("#admin-updated-at");

        if (updated) {
            updated.textContent = formatLocalTimestamp(new Date());
        }
    }

    function annotateExternalState() {
        const cards = document.querySelectorAll(".admin-card");

        cards.forEach((card) => {
            const href = card.getAttribute("href") || "";

            if (href.includes("__server")) {
                card.dataset.portalGroup = "server";
            } else if (href.includes("_dashboard")) {
                card.dataset.portalGroup = "dashboard";
            } else if (href.includes("_analytics")) {
                card.dataset.portalGroup = "analytics";
            } else if (href.includes("_security")) {
                card.dataset.portalGroup = "security";
            } else if (href.includes("bitcoin")) {
                card.dataset.portalGroup = "bitcoin";
            } else {
                card.dataset.portalGroup = "site";
            }
        });
    }

    function protectStaticAdminPage() {
        const warning = document.createElement("meta");
        warning.name = "zzx-admin-static-warning";
        warning.content = "Do not expose secrets, credentials, tokens, private logs, or private API payloads in this static admin portal.";
        document.head.appendChild(warning);
    }

    function init() {
        markActivePortal();
        annotateExternalState();
        protectStaticAdminPage();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
        return;
    }

    init();
})();
