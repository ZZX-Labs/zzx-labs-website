(() => {
    "use strict";

    function getDepth() {
        return document.body.dataset.bnDepth || ".";
    }

    function isExternalHref(href) {
        return (
            href.startsWith("http://") ||
            href.startsWith("https://") ||
            href.startsWith("mailto:") ||
            href.startsWith("tel:") ||
            href.startsWith("#")
        );
    }

    function normalizeRelativeHref(href, depth) {
        if (!href || isExternalHref(href)) {
            return href;
        }

        if (href.startsWith("./")) {
            return `${depth}/${href.slice(2)}`;
        }

        if (href.startsWith("../")) {
            return `${depth}/${href}`;
        }

        if (href.startsWith("/")) {
            return href;
        }

        return `${depth}/${href}`;
    }

    function resolveFooterLinks() {
        const depth = getDepth();
        const footer = document.querySelector(".bn-site-footer");

        if (!footer) {
            return;
        }

        footer.querySelectorAll("a[href]").forEach(link => {
            const raw = link.getAttribute("href");

            link.setAttribute(
                "href",
                normalizeRelativeHref(raw, depth)
            );
        });
    }

    window.BNFooterInit = function BNFooterInit() {
        resolveFooterLinks();
    };

    document.addEventListener("DOMContentLoaded", () => {
        window.BNFooterInit();
    });
})();
