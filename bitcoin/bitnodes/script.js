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
        return String(depth || ".")
            .replace(/\/+$/, "") || ".";
    }

    function src(path) {
        return `${cleanDepth(getDepth())}/${path}`;
    }

    function moduleLoaded(path) {
        return document.querySelector(
            `script[data-bn-module="${path}"]`
        );
    }

    function loadScript(path) {
        return new Promise((resolve, reject) => {

            if (moduleLoaded(path)) {
                resolve();
                return;
            }

            const script = document.createElement("script");

            script.src = src(path);
            script.defer = true;
            script.dataset.bnModule = path;

            script.onload = () => {
                resolve();
            };

            script.onerror = () => {
                reject(
                    new Error(
                        `Failed to load ${path}`
                    )
                );
            };

            document.head.appendChild(script);
        });
    }

    async function loadModules() {
        for (const modulePath of BN_MODULES) {
            await loadScript(modulePath);
        }
    }

    function initSubsystems() {

        window.BNHeader?.init?.();
        window.BNNavbarInit?.();
        window.BNFooter?.init?.();

        window.BNCredits?.init?.();

        window.BNPanels?.init?.();

        window.BNSearch?.init?.();
        window.BNTables?.init?.();

        window.BNCards?.init?.();
        window.BNCharts?.renderAll?.();
        window.BNWidgets?.init?.();

        window.BNKnotsVsCore?.init?.();

        window.BNMaps?.init?.();

        window.BNGeoIP?.init?.();
        window.BNVPN?.init?.();
        window.BNTor?.init?.();

        window.BNAgents?.init?.();
        window.BNVersions?.init?.();
        window.BNPorts?.init?.();
        window.BNServices?.init?.();

        window.BNDataSource?.init?.();

        window.BNCore?.init?.();
    }

    async function boot() {
        try {
            await loadModules();

            initSubsystems();

            document.documentElement.classList.add(
                "bn-modules-loaded"
            );

            console.info(
                "[Bitnodes] Modules initialized."
            );

        } catch (err) {

            console.error(
                "Bitnodes module load failed:",
                err
            );

            const status =
                document.querySelector(
                    "#bn-status"
                );

            if (status) {
                status.textContent =
                    `Module load failure: ${err.message}`;
            }
        }
    }

    document.addEventListener(
        "DOMContentLoaded",
        boot
    );

})();
