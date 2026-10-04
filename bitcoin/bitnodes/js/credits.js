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

    function $(selector, scope = document) {
        return scope.querySelector(selector);
    }

    async function inject(selector, path) {
        const target = $(selector);

        if (!target) {
            return;
        }

        try {
            const response = await fetch(path, {
                cache: "no-store"
            });

            if (!response.ok) {
                throw new Error(`${response.status} ${response.statusText}`);
            }

            target.innerHTML = await response.text();
        } catch (err) {
            console.warn(`Credits include failed: ${path}`, err);
        }
    }

    function depth() {
        return document.body?.dataset?.bnDepth || "..";
    }

    async function loadIncludes() {
        const base = depth();

        await inject("#bn-header", `${base}/includes/header.html`);
        await inject("#bn-navbar", `${base}/includes/navbar.html`);
        await inject("#bn-footer", `${base}/includes/footer.html`);

        window.BNNavbarInit?.();
        window.BNHeaderInit?.();
        window.BNFooterInit?.();
    }

    function stampCreditsMeta() {
        const target = $("#bn-credits-meta");

        if (!target) {
            return;
        }

        const updated = new Date().toISOString().replace(".000Z", "Z");

        target.textContent = `Credits page initialized ${updated}`;
    }

    function init() {
        loadIncludes();
        stampCreditsMeta();
    }

    window.BNCredits = {
        init,
        loadIncludes,
        stampCreditsMeta
    };

    BN.ready ? BN.ready(init) : ready(init);
})();
