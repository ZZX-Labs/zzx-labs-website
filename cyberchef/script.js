(() => {
    "use strict";

    const config = window.ZZX?.CYBERCHEF || {};

    function ready(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn, { once: true });
        } else {
            fn();
        }
    }

    function markRoot() {
        document.documentElement.classList.add("zzx-cyberchef-root");
        document.body?.classList.add("zzx-cyberchef-root-body");
    }

    function setVersionText(version) {
        document.querySelectorAll("[data-zzx-cyberchef-version]").forEach((node) => {
            node.textContent = version;
        });
        document.documentElement.dataset.zzxCyberchefVersion = version;
    }

    async function hydrateManifest() {
        try {
            const response = await fetch(config.manifestUrl || "./runtime-manifest.json", {
                cache: "no-store"
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const manifest = await response.json();
            const release = manifest?.release || {};
            const version = String(release.tag || (release.version ? `v${release.version}` : "latest"));
            config.version = version;
            config.release = release;
            setVersionText(version);
        } catch (error) {
            console.warn("[CyberChefZZX] runtime manifest unavailable:", error);
            setVersionText("latest");
        }
    }

    ready(() => {
        markRoot();
        hydrateManifest();
        window.dispatchEvent(new CustomEvent("zzx-cyberchef-overlay-loaded"));
    });
})();
