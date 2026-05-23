(() => {
    "use strict";

    function resolveLinks() {
        const depth = document.body.dataset.bnDepth || ".";
        const header = document.querySelector(".bn-site-header");

        if (!header) {
            return;
        }

        header.querySelectorAll("a[href^='./']").forEach(link => {
            const raw = link.getAttribute("href");
            link.setAttribute("href", raw.replace("./", `${depth}/`));
        });
    }

    function markActive() {
        const path = location.pathname.replace(/\/index\.html$/, "/");

        document.querySelectorAll(".bn-main-nav a").forEach(link => {
            const href = new URL(link.href).pathname.replace(/\/index\.html$/, "/");

            if (href === path) {
                link.classList.add("is-active");
            }
        });
    }

    function wireMenu() {
        const header = document.querySelector(".bn-site-header");
        const button = document.querySelector(".bn-menu-button");

        if (!header || !button) {
            return;
        }

        button.addEventListener("click", () => {
            const open = header.classList.toggle("is-open");
            button.setAttribute("aria-expanded", String(open));
        });
    }

    window.BNHeaderInit = function BNHeaderInit() {
        resolveLinks();
        markActive();
        wireMenu();
    };
})();
