(() => {
    "use strict";

    const BN_MODULES = [
        "js/base.js",
        "js/api.js",
        "js/core.js",
        "js/navbar.js",
        "js/search.js",
        "js/tables.js",
        "js/cards.js",
        "js/charts.js",
        "js/knotsvscore.js",
        "js/versions.js",
        "js/agents.js",
        "js/tor.js",
        "js/geoip.js"
    ];

    function getDepth() {
        return document.body.dataset.bnDepth || ".";
    }

    function src(path) {
        return `${getDepth()}/${path}`;
    }

    function loadScript(path) {
        return new Promise((resolve, reject) => {
            const script = document.createElement("script");

            script.src = src(path);
            script.defer = true;

            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load ${path}`));

            document.head.appendChild(script);
        });
    }

    async function loadModules() {
        for (const modulePath of BN_MODULES) {
            await loadScript(modulePath);
        }

        window.BNCore?.init?.();
    }

    document.addEventListener("DOMContentLoaded", () => {
        loadModules().catch(err => {
            console.error("Bitnodes module load failed:", err);
        });
    });
})();