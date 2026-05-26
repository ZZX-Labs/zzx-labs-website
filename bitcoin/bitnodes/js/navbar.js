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

    function resolveNavbarLinks() {
        const depth = getDepth();

        document
            .querySelectorAll(
                ".bn-navbar a[href], .bn-main-nav a[href]"
            )
            .forEach(link => {

                const raw =
                    link.getAttribute("href");

                link.setAttribute(
                    "href",
                    normalizeRelativeHref(
                        raw,
                        depth
                    )
                );
            });
    }

    function normalizePath(pathname) {
        return pathname
            .replace(/\/index\.html$/, "/")
            .replace(/\/+$/, "/");
    }

    function markActiveLinks() {
        const current =
            normalizePath(location.pathname);

        document
            .querySelectorAll(
                ".bn-navbar a, .bn-main-nav a"
            )
            .forEach(link => {

                let href;

                try {
                    href = new URL(
                        link.href,
                        location.href
                    ).pathname;
                }

                catch {
                    return;
                }

                href = normalizePath(href);

                if (href === current) {

                    link.classList.add(
                        "is-active"
                    );

                    link.setAttribute(
                        "aria-current",
                        "page"
                    );
                }

                else {

                    link.classList.remove(
                        "is-active"
                    );

                    link.removeAttribute(
                        "aria-current"
                    );
                }
            });
    }

    function closeMobileMenu() {

        const header =
            document.querySelector(
                ".bn-site-header"
            );

        const nav =
            document.querySelector(
                ".bn-main-nav"
            );

        const button =
            document.querySelector(
                ".bn-menu-button"
            );

        if (header) {
            header.classList.remove(
                "is-open"
            );
        }

        if (nav) {
            nav.classList.remove(
                "is-open"
            );
        }

        if (button) {
            button.setAttribute(
                "aria-expanded",
                "false"
            );
        }

        document.body.classList.remove(
            "bn-nav-open"
        );
    }

    function wireMobileMenu() {

        const header =
            document.querySelector(
                ".bn-site-header"
            );

        const nav =
            document.querySelector(
                ".bn-main-nav"
            );

        const button =
            document.querySelector(
                ".bn-menu-button"
            );

        if (
            !header ||
            !nav ||
            !button
        ) {
            return;
        }

        button.addEventListener(
            "click",
            () => {

                const open =
                    !header.classList.contains(
                        "is-open"
                    );

                header.classList.toggle(
                    "is-open",
                    open
                );

                nav.classList.toggle(
                    "is-open",
                    open
                );

                document.body.classList.toggle(
                    "bn-nav-open",
                    open
                );

                button.setAttribute(
                    "aria-expanded",
                    String(open)
                );
            }
        );

        nav.querySelectorAll("a").forEach(link => {

            link.addEventListener(
                "click",
                () => {

                    if (
                        window.innerWidth <= 900
                    ) {
                        closeMobileMenu();
                    }
                }
            );
        });

        window.addEventListener(
            "resize",
            () => {

                if (
                    window.innerWidth > 900
                ) {
                    closeMobileMenu();
                }
            }
        );
    }

    function initNavbar() {

        resolveNavbarLinks();

        markActiveLinks();

        wireMobileMenu();
    }

    window.BNNavbarInit =
        initNavbar;

    document.addEventListener(
        "DOMContentLoaded",
        initNavbar
    );
})();
