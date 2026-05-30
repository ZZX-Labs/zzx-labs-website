(() => {
    "use strict";

    function qs(selector) {
        return document.querySelector(selector);
    }

    function qsa(selector) {
        return Array.from(document.querySelectorAll(selector));
    }

    function px(value) {
        return `${Math.max(0, Math.floor(value))}px`;
    }

    function outerHeight(el) {
        if (!el) {
            return 0;
        }

        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);

        return (
            rect.height +
            parseFloat(style.marginTop || "0") +
            parseFloat(style.marginBottom || "0")
        );
    }

    function isVisible(el) {
        if (!el) {
            return false;
        }

        const style = window.getComputedStyle(el);

        return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            el.getClientRects().length > 0
        );
    }

    function getRuntime() {
        return qs("#cz-runtime") ||
            qs("[data-cz-runtime]");
    }

    function getWorkspace() {
        return qs("#workspace-wrapper") ||
            qs("#content-wrapper") ||
            qs("#operations")?.parentElement ||
            null;
    }

    function getReservedHeight() {
        const selectors = [
            "header",
            ".cz-hero",
            ".cz-status",
            ".cz-grid",
            ".cz-panel-head",
            ".cz-frame-toolbar",
            ".cz-credit-grid",
            "footer"
        ];

        return selectors
            .map(qs)
            .filter(isVisible)
            .reduce(
                (total, el) => total + outerHeight(el),
                0
            );
    }

    function getMinimumHeight() {
        if (window.innerWidth < 480) {
            return 560;
        }

        if (window.innerWidth < 768) {
            return 650;
        }

        if (window.innerWidth < 1100) {
            return 760;
        }

        return 900;
    }

    function resizeCyberChefCanvas() {
        const runtime = getRuntime();

        if (!runtime) {
            return;
        }

        const reserved =
            getReservedHeight() + 96;

        const available =
            window.innerHeight - reserved;

        runtime.style.minHeight =
            px(Math.max(getMinimumHeight(), available));

        runtime.style.height =
            "auto";

        const workspace = getWorkspace();

        if (workspace && runtime.contains(workspace)) {
            workspace.style.minHeight =
                px(Math.max(getMinimumHeight() - 80, available - 80));
        }

        document.documentElement.style.setProperty(
            "--cz-runtime-height",
            runtime.style.minHeight
        );
    }

    function markCyberChefRuntime() {
        const runtime = getRuntime();

        if (!runtime) {
            return;
        }

        const nodes = qsa(
            "#loader-wrapper, #content-wrapper, #workspace-wrapper, #operations, #recipe, #IO, #input, #output"
        );

        for (const node of nodes) {
            if (!runtime.contains(node)) {
                continue;
            }

            node.dataset.czNativeNode = "true";
        }
    }

    function observeRuntime() {
        const runtime = getRuntime();

        if (!runtime || !window.MutationObserver) {
            return;
        }

        const observer = new MutationObserver(() => {
            markCyberChefRuntime();
            resizeCyberChefCanvas();
        });

        observer.observe(runtime, {
            childList: true,
            subtree: true
        });

        window.ZZXCyberChefObserver = observer;
    }

    function bootContainer() {
        resizeCyberChefCanvas();
        markCyberChefRuntime();
        observeRuntime();

        window.addEventListener(
            "resize",
            resizeCyberChefCanvas,
            { passive: true }
        );

        window.addEventListener(
            "orientationchange",
            () => {
                setTimeout(resizeCyberChefCanvas, 250);
                setTimeout(resizeCyberChefCanvas, 1000);
            },
            { passive: true }
        );

        window.addEventListener(
            "zzx-cyberchef-ready",
            () => {
                markCyberChefRuntime();
                resizeCyberChefCanvas();
                setTimeout(resizeCyberChefCanvas, 500);
                setTimeout(resizeCyberChefCanvas, 1500);
            }
        );

        document.documentElement.classList.add(
            "cz-container-ready"
        );
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            bootContainer
        );
    } else {
        bootContainer();
    }

    window.ZZXCyberChefResize =
        resizeCyberChefCanvas;

    window.ZZXCyberChefMarkRuntime =
        markCyberChefRuntime;
})();