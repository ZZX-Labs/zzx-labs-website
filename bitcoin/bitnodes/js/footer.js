(() => {
    "use strict";

    function resolveFooterLinks() {

        const depth =
            document.body.dataset.bnDepth || ".";

        const footer =
            document.querySelector(".bn-site-footer");

        if (!footer) {
            return;
        }

        footer.querySelectorAll("a").forEach(link => {

            const href =
                link.getAttribute("href");

            if (!href) {
                return;
            }

            if (
                href.startsWith("http") ||
                href.startsWith("#")
            ) {
                return;
            }

            if (href.startsWith("./")) {

                link.setAttribute(
                    "href",
                    href.replace("./", `${depth}/`)
                );

                return;
            }

            if (href.startsWith("../")) {

                const clean =
                    href.replace(/^\.\.\//, "");

                link.setAttribute(
                    "href",
                    `${depth}/../${clean}`
                );
            }
        });
    }

    window.BNFooterInit =
        function BNFooterInit() {

            resolveFooterLinks();
        };
})();
