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

    function updateSecurityState() {
        const state = $("#security-state");
        const updated = $("#security-updated");

        if (state) {
            state.textContent = "Ready";
        }

        if (updated) {
            updated.textContent = formatLocalTimestamp(new Date());
        }
    }

    function annotateCards() {
        document.querySelectorAll(".security-card").forEach((card) => {
            const href = card.getAttribute("href") || "";

            if (href.includes("firewall") || href.includes("blocked")) {
                card.dataset.securityGroup = "defense";
            } else if (href.includes("intrusion") || href.includes("incident")) {
                card.dataset.securityGroup = "incident";
            } else if (href.includes("actor") || href.includes("apt")) {
                card.dataset.securityGroup = "threat-intel";
            } else if (href.includes("bitcoin") || href.includes("bitnodes")) {
                card.dataset.securityGroup = "bitcoin-intel";
            } else {
                card.dataset.securityGroup = "security";
            }
        });
    }

    function injectStaticWarningMeta() {
        const meta = document.createElement("meta");
        meta.name = "zzx-security-static-warning";
        meta.content = "Static security portal. Do not commit secrets, credentials, tokens, raw logs, private telemetry, or active defensive rules.";
        document.head.appendChild(meta);
    }

    function init() {
        updateSecurityState();
        annotateCards();
        injectStaticWarningMeta();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
        return;
    }

    init();
})();
