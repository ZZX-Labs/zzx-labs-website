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
        const target = document.getElementById("nginx-updated");

        if (!target) {
            return;
        }

        target.textContent = formatLocalTimestamp(new Date());
    }

    function annotateNginxCards() {
        document.querySelectorAll(".server-card").forEach((card) => {
            const href = card.getAttribute("href") || "";

            if (href.includes("/api") || href.includes("flask")) {
                card.dataset.nginxRoute = "api";
            } else if (href.includes("bitnodes")) {
                card.dataset.nginxRoute = "bitnodes";
            } else if (href.includes("bpi")) {
                card.dataset.nginxRoute = "bpi";
            } else if (href.includes("mempool")) {
                card.dataset.nginxRoute = "mempool";
            } else if (href.includes("cyberchef")) {
                card.dataset.nginxRoute = "tools";
            } else {
                card.dataset.nginxRoute = "static";
            }
        });
    }

    function injectNginxMeta() {
        const meta = document.createElement("meta");
        meta.name = "zzx-nginx-static-warning";
        meta.content = "nginx documentation portal. Do not publish production secrets, private hostnames, private upstreams, credentials, access tokens, or private logs.";
        document.head.appendChild(meta);
    }

    function init() {
        updateTimestamp();
        annotateNginxCards();
        injectNginxMeta();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
        return;
    }

    init();
})();
