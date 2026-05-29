(() => {
    "use strict";

    function qs(selector) {
        return document.querySelector(selector);
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

    function resizeCyberChefCanvas() {
        const frameWrap = qs(".cz-frame-wrap");
        const header = qs("header");
        const hero = qs(".cz-hero");
        const status = qs(".cz-status");
        const cards = qs(".cz-grid");
        const panelHead = qs(".cz-panel-head");
        const toolbar = qs(".cz-frame-toolbar");
        const credits = qs(".cz-credit-grid");
        const footer = qs("footer");

        if (!frameWrap) {
            return;
        }

        const reserved =
            outerHeight(header) +
            outerHeight(hero) +
            outerHeight(status) +
            outerHeight(cards) +
            outerHeight(panelHead) +
            outerHeight(toolbar) +
            outerHeight(credits) +
            outerHeight(footer) +
            96;

        const available =
            window.innerHeight - reserved;

        const minHeight =
            window.innerWidth < 640
                ? 560
                : window.innerWidth < 1100
                    ? 700
                    : 860;

        frameWrap.style.height =
            px(Math.max(minHeight, available));
    }

    function bootContainer() {
        resizeCyberChefCanvas();

        window.addEventListener(
            "resize",
            resizeCyberChefCanvas,
            { passive: true }
        );

        window.addEventListener(
            "orientationchange",
            () => {
                setTimeout(resizeCyberChefCanvas, 250);
            },
            { passive: true }
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
})();