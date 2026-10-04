(() => {
    "use strict";

    const BN = window.BN || {};

    function ready(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn);
            return;
        }

        fn();
    }

    function $all(selector, scope = document) {
        if (BN.$$) {
            return BN.$$(selector, scope);
        }

        return Array.from(scope.querySelectorAll(selector));
    }

    function initPanel(panel) {
        if (!panel || panel.dataset.bnPanelReady === "true") {
            return;
        }

        panel.dataset.bnPanelReady = "true";

        const head = panel.querySelector(":scope > .bn-panel-head");

        if (head) {
            panel.classList.add("has-panel-head");
        }

        const tables = panel.querySelectorAll(":scope .bn-table");

        if (tables.length) {
            panel.classList.add("has-tables");
        }

        const charts = panel.querySelectorAll(":scope canvas[data-bn-chart]");

        if (charts.length) {
            panel.classList.add("has-charts");
        }

        const widgets = panel.querySelectorAll(
            ":scope [data-bn-geoip], :scope [data-bn-vpn], :scope [data-bn-tor], :scope [data-bn-agents], :scope [data-bn-versions], :scope [data-bn-ports], :scope [data-bn-services], :scope [data-bn-knotsvscore]"
        );

        if (widgets.length) {
            panel.classList.add("has-widgets");
        }
    }

    function init(scope = document) {
        $all(".bn-panel", scope).forEach(initPanel);
    }

    document.addEventListener("bn:data-loaded", () => {
        init();
    });

    document.addEventListener("bn:datasource-change", () => {
        init();
    });

    window.BNPanels = {
        init,
        initPanel
    };

    ready(init);
})();
