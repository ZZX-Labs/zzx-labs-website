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

    function normalizeHref(href, depth) {
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

    function normalizePath(path) {
        return path
            .replace(/\/index\.html$/, "/")
            .replace(/\/+$/, "/");
    }

    function getHeader() {
        return document.querySelector(".bn-site-header");
    }

    function getButton() {
        return document.querySelector(".bn-menu-button, .bn-navbar-toggle");
    }

    function getNav() {
        return document.querySelector("#bn-main-nav, .bn-main-nav, .bn-navbar-links, .bn-nav-links");
    }

    function resolveLinks() {
        const depth = getDepth();

        document
            .querySelectorAll(".bn-site-header a[href], .bn-navbar a[href], .bn-main-nav a[href]")
            .forEach(link => {
                if (link.dataset.bnResolved === "true") {
                    return;
                }

                const raw = link.getAttribute("href");

                link.setAttribute(
                    "href",
                    normalizeHref(raw, depth)
                );

                link.dataset.bnResolved = "true";
            });
    }

    function markActive() {
        const current = normalizePath(location.pathname);

        document
            .querySelectorAll(".bn-site-header a[href], .bn-navbar a[href], .bn-main-nav a[href]")
            .forEach(link => {
                let href = "";

                try {
                    href = normalizePath(new URL(link.href, location.href).pathname);
                } catch (_err) {
                    return;
                }

                if (href === current) {
                    link.classList.add("is-active");
                    link.setAttribute("aria-current", "page");
                } else {
                    link.classList.remove("is-active");
                    link.removeAttribute("aria-current");
                }
            });
    }

    function setOpen(open) {
        const header = getHeader();
        const button = getButton();
        const nav = getNav();

        if (header) {
            header.classList.toggle("is-open", open);
        }

        if (nav) {
            nav.classList.toggle("is-open", open);
        }

        if (button) {
            button.classList.toggle("is-open", open);
            button.setAttribute("aria-expanded", String(open));
        }

        document.body.classList.toggle("bn-nav-open", open);
    }

    function wireMenu() {
        const button = getButton();
        const nav = getNav();

        if (!button || !nav) {
            return;
        }

        if (button.dataset.bnMenuReady === "true") {
            return;
        }

        button.setAttribute("aria-expanded", "false");

        button.addEventListener("click", () => {
            const open = !button.classList.contains("is-open");

            setOpen(open);
        });

        nav.querySelectorAll("a").forEach(link => {
            link.addEventListener("click", () => {
                setOpen(false);
            });
        });

        document.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                setOpen(false);
            }
        });

        button.dataset.bnMenuReady = "true";
    }

    function initNavbar() {
        resolveLinks();
        markActive();
        wireMenu();
    }

    window.BNNavbarInit = initNavbar;
    window.BNHeaderInit = initNavbar;
})();