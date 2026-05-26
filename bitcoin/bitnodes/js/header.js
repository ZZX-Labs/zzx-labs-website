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
            return href;
        }

        if (href.startsWith("/")) {
            return href;
        }

        return `${depth}/${href}`;
    }

    function resolveLinks() {
        const depth = getDepth();

        document
            .querySelectorAll(".bn-site-header a[href]")
            .forEach(link => {
                const raw = link.getAttribute("href");

                link.setAttribute(
                    "href",
                    normalizeRelativeHref(raw, depth)
                );
            });
    }

    function markActive() {
        const current = location.pathname.replace(/\/index\.html$/, "/");

        document
            .querySelectorAll(".bn-main-nav a[href]")
            .forEach(link => {
                const href = new URL(link.href, location.href)
                    .pathname
                    .replace(/\/index\.html$/, "/");

                if (href === current) {
                    link.classList.add("is-active");
                    link.setAttribute("aria-current", "page");
                } else {
                    link.classList.remove("is-active");
                    link.removeAttribute("aria-current");
                }
            });
    }

    function wireMenu() {
        const header = document.querySelector(".bn-site-header");
        const button = document.querySelector(".bn-menu-button");
        const nav = document.querySelector("#bn-main-nav");

        if (!header || !button || !nav) {
            return;
        }

        button.addEventListener("click", () => {
            const open = header.classList.toggle("is-open");

            nav.classList.toggle("is-open", open);
            button.setAttribute("aria-expanded", String(open));
        });
    }

    window.BNHeaderInit = function BNHeaderInit() {
        resolveLinks();
        markActive();
        wireMenu();
    };

    document.addEventListener("DOMContentLoaded", () => {
        window.BNHeaderInit();
    });
})();
