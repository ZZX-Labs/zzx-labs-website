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

    function updateDashboardState() {
        const state = $("#dashboard-state");
        const updated = $("#dashboard-updated");

        if (state) {
            state.textContent = "Ready";
        }

        if (updated) {
            updated.textContent = formatLocalTimestamp(new Date());
        }
    }

    function annotateCards() {
        document.querySelectorAll(".dashboard-card").forEach((card) => {
            const href = card.getAttribute("href") || "";

            if (href.includes("bitnodes")) {
                card.dataset.dashboardGroup = "bitnodes";
            } else if (href.includes("mempool")) {
                card.dataset.dashboardGroup = "mempool";
            } else if (href.includes("bpi")) {
                card.dataset.dashboardGroup = "bpi";
            } else if (href.includes("__server")) {
                card.dataset.dashboardGroup = "server";
            } else {
                card.dataset.dashboardGroup = "operations";
            }
        });
    }

    function init() {
        updateDashboardState();
        annotateCards();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
        return;
    }

    init();
})();
