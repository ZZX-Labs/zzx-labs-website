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
        const target = document.getElementById("email-updated");

        if (target) {
            target.textContent = formatLocalTimestamp(new Date());
        }
    }

    function annotateEmailCards() {
        document.querySelectorAll(".server-card").forEach((card) => {
            const href = card.getAttribute("href") || "";

            if (href.includes("domain")) {
                card.dataset.emailGroup = "domain";
            } else if (href.includes("secure")) {
                card.dataset.emailGroup = "secure-contact";
            } else if (href.includes("proton")) {
                card.dataset.emailGroup = "proton-bridge";
            } else if (href.includes("alerts")) {
                card.dataset.emailGroup = "alerts";
            } else if (href.includes("security")) {
                card.dataset.emailGroup = "security";
            } else if (href.includes("lists")) {
                card.dataset.emailGroup = "lists";
            } else if (href.includes("templates")) {
                card.dataset.emailGroup = "templates";
            } else {
                card.dataset.emailGroup = "email";
            }
        });
    }

    function injectEmailMeta() {
        const meta = document.createElement("meta");
        meta.name = "zzx-email-static-warning";
        meta.content = "Email portal. Do not publish mailbox credentials, SMTP passwords, bridge tokens, private aliases, recovery codes, DNS secrets, DKIM private keys, raw mail, message metadata, or private contact records.";
        document.head.appendChild(meta);
    }

    function init() {
        updateTimestamp();
        annotateEmailCards();
        injectEmailMeta();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
        return;
    }

    init();
})();
