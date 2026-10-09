(() => {
    "use strict";
    // CyberChef-only priority mount.  Does not change the sitewide partials,
    // ticker, widget, nav, or credits implementations.
    let mounting = false;
    async function fetchHTML(relative) {
        const response = await fetch(new URL(relative, location.href), { cache: "no-store" });
        if (!response.ok) throw new Error(`${relative}: HTTP ${response.status}`);
        return response.text();
    }
    async function mount() {
        if (mounting) return;
        mounting = true;
        try {
            const header = document.getElementById("zzx-header");
            const footer = document.getElementById("zzx-footer");
            if (!header || !footer) return;
            if (header.children.length && footer.children.length) return;
            // Fetch simultaneously; do not block HTML parsing or page render.
            const [h, nav, f] = await Promise.all([
                fetchHTML("../__partials/header/header.html"),
                fetchHTML("../__partials/nav/nav.html"),
                fetchHTML("../__partials/footer/footer.html")
            ]);
            if (!header.children.length) {
                const markup = h.includes("<!-- navbar Here -->")
                    ? h.replace("<!-- navbar Here -->", nav)
                    : h + nav;
                header.innerHTML = markup;
            }
            if (!footer.children.length) footer.innerHTML = f;
            window.dispatchEvent(new CustomEvent("zzx:cyberchef-shell-ready"));
        } catch (err) {
            console.warn("[CyberChefZZX] independent header/footer mount failed; sitewide loader will retry:", err);
        }
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { void mount(); }, { once: true });
    else void mount();
})();
