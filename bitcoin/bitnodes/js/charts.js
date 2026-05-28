(() => {
    "use strict";

    const MODULES = [
        "js/analytics.js",
        "js/visualizations.js",
        "js/graphs.js",
        "js/diagrams.js",
        "js/labels.js",
        "js/3d.js",
        "js/displays.js",
        "js/canvascharts.js"
    ];

    const BN = window.BN || {};
    const Charts = window.BNCharts || {};

    Charts.modules = Charts.modules || [];
    Charts.datasets = Charts.datasets || new Map();

    function ready(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn);
            return;
        }

        fn();
    }

    function getDepth() {
        return document.body?.dataset?.bnDepth || ".";
    }

    function cleanDepth(depth) {
        return String(depth || ".").replace(/\/+$/, "") || ".";
    }

    function src(path) {
        return `${cleanDepth(getDepth())}/${path}`;
    }

    function moduleLoaded(path) {
        return document.querySelector(
            `script[data-bn-chart-module="${path}"]`
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
            script.dataset.bnChartModule = path;

            script.onload = () => {
                resolve();
            };

            script.onerror = () => {
                reject(new Error(`Failed to load chart module ${path}`));
            };

            document.head.appendChild(script);
        });
    }

    function normalizeDataset(dataset) {
        if (window.BNCanvasCharts?.normalizeDataset) {
            return window.BNCanvasCharts.normalizeDataset(dataset);
        }

        if (Array.isArray(dataset)) {
            return {
                labels: dataset.map(row => row.label ?? row.name ?? row.key ?? "Unknown"),
                values: dataset.map(row => {
                    const value = row.value ?? row.count ?? row.nodes ?? row.reachable_nodes ?? 0;
                    const n = Number(value);
                    return Number.isFinite(n) ? n : 0;
                })
            };
        }

        return {
            labels: Array.isArray(dataset?.labels) ? dataset.labels : [],
            values: Array.isArray(dataset?.values) ? dataset.values : [],
            title: dataset?.title || "",
            centerLabel: dataset?.centerLabel || ""
        };
    }

    function registerDataset(name, dataset) {
        if (!name || !dataset) {
            return;
        }

        Charts.datasets.set(String(name), normalizeDataset(dataset));
    }

    function getDataset(name) {
        return Charts.datasets.get(String(name)) || null;
    }

    function clearDatasets() {
        Charts.datasets.clear();
    }

    function renderAll(scope = document) {
        window.BNAnalytics?.renderAll?.(scope);
        window.BNVisualizations?.renderAll?.(scope);
        window.BNGraphs?.renderAll?.(scope);
        window.BNDiagrams?.renderAll?.(scope);
        window.BNLabels?.renderAll?.(scope);
        window.BN3D?.renderAll?.(scope);
        window.BNDisplays?.renderAll?.(scope);
        window.BNCanvasCharts?.renderAll?.(scope);
    }

    function renderCanvas(canvas) {
        if (!canvas) {
            return null;
        }

        if (window.BNCanvasCharts?.renderCanvas) {
            return window.BNCanvasCharts.renderCanvas(canvas);
        }

        if (window.BNVisualizations?.renderCanvas) {
            return window.BNVisualizations.renderCanvas(canvas);
        }

        return null;
    }

    async function loadModules() {
        for (const path of MODULES) {
            await loadScript(path);
        }

        Charts.modules = MODULES.slice();

        window.BNAnalytics?.init?.();
        window.BNVisualizations?.init?.();
        window.BNGraphs?.init?.();
        window.BNDiagrams?.init?.();
        window.BNLabels?.init?.();
        window.BN3D?.init?.();
        window.BNDisplays?.init?.();
        window.BNCanvasCharts?.init?.();

        renderAll();
    }

    function init() {
        loadModules().catch(err => {
            console.error("Bitnodes chart module load failed:", err);

            const status = document.querySelector("#bn-status");

            if (status) {
                status.textContent = `Chart module load failure: ${err.message}`;
            }
        });
    }

    document.addEventListener("bn:data-loaded", () => {
        renderAll();
    });

    document.addEventListener("bn:datasource-change", () => {
        clearDatasets();
        renderAll();
    });

    window.BNCharts = {
        ...Charts,
        modules: Charts.modules,
        datasets: Charts.datasets,
        init,
        loadModules,
        registerDataset,
        getDataset,
        clearDatasets,
        renderAll,
        renderCanvas
    };

    ready(init);
})();
