(() => {
    "use strict";

    function markAssetsPage() {
        document.body.dataset.serverAssets = "true";
    }

    function annotateAssetCards() {
        document.querySelectorAll(".server-card").forEach((card) => {
            const href = card.getAttribute("href") || "";

            if (href.includes("network")) {
                card.dataset.assetGroup = "network";
            } else if (href.includes("deployment")) {
                card.dataset.assetGroup = "deployment";
            } else if (href.includes("rack")) {
                card.dataset.assetGroup = "rack";
            } else if (href.includes("service")) {
                card.dataset.assetGroup = "services";
            } else if (href.includes("wireframes")) {
                card.dataset.assetGroup = "wireframes";
            } else if (href.includes("mockups")) {
                card.dataset.assetGroup = "mockups";
            } else if (href.includes("screenshots")) {
                card.dataset.assetGroup = "screenshots";
            } else if (href.includes("documentation")) {
                card.dataset.assetGroup = "documentation";
            } else if (href.includes("branding")) {
                card.dataset.assetGroup = "branding";
            } else {
                card.dataset.assetGroup = "assets";
            }
        });
    }

    function injectAssetSafetyMeta() {
        const meta = document.createElement("meta");
        meta.name = "zzx-server-assets-warning";
        meta.content = "Server assets portal. Keep production secrets, private diagrams, internal credentials, and sensitive host data out of the public repository.";
        document.head.appendChild(meta);
    }

    function init() {
        markAssetsPage();
        annotateAssetCards();
        injectAssetSafetyMeta();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
        return;
    }

    init();
})();
