(() => {
    "use strict";

    const BN_MODULES = [
        "js/base.js",
        "js/api.js",
        "js/datasource.js",

        "js/header.js",
        "js/navbar.js",
        "js/footer.js",
        "js/credits.js",

        "js/panels.js",
        "js/search.js",
        "js/tables.js",

        "js/cards.js",
        "js/charts.js",
        "js/widgets.js",
        "js/knotsvscore.js",

        "js/maps.js",
        "js/geoip.js",
        "js/vpn.js",
        "js/tor.js",

        "js/agents.js",
        "js/versions.js",
        "js/ports.js",
        "js/services.js",

        "js/core.js"
    ];

    function getDepth() {
        return document.body?.dataset?.bnDepth || ".";
    }

    function cleanDepth(depth) {
        return String(depth || ".").replace(/\/+$/, "") || ".";
    }

    function src(path) {
        return `${cleanDepth(getDepth())}/${path}`;
    }

    function loadScript(path) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[data-bn-module="${path}"]`)) {
                resolve();
                return;
            }

            const script = document.createElement("script");

            script.src = src(path);
            script.defer = true;
            script.dataset.bnModule = path;

            script.onload = resolve;

            script.onerror = () => {
                reject(new Error(`Failed to load ${path}`));
            };

            document.head.appendChild(script);
        });
    }

    async function loadModules() {
        for (const modulePath of BN_MODULES) {
            await loadScript(modulePath);
        }

        window.BNHeader?.init?.();
        window.BNNavbarInit?.();
        window.BNFooter?.init?.();

        window.BNDataSource?.init?.();
        window.BNCore?.init?.();
    }

    document.addEventListener("DOMContentLoaded", () => {
        loadModules().catch(err => {
            console.error("Bitnodes module load failed:", err);
        });
    });
})();
