(() => {
    "use strict";

    const config = window.ZZX.CYBERCHEF;

    window.ZZXCyberChefModules.Manifest = {
        async load() {
            try {
                const response = await fetch(config.manifestUrl, { cache: "no-store" });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const manifest = await response.json();
                const tag = manifest?.release?.tag || manifest?.release?.version || manifest?.native_frontend?.version || "latest";
                config.version = tag;
                document.querySelectorAll("[data-zzx-cyberchef-version]").forEach(node => {
                    node.textContent = String(tag);
                });
                return manifest;
            } catch (err) {
                console.warn("[CyberChefZZX] Runtime manifest unavailable:", err);
                return null;
            }
        }
    };
})();
