(() => {
    "use strict";

    window.ZZX = window.ZZX || {};

    window.ZZX.CYBERCHEF = {
        version: "latest",

        title: "CyberChefZZX",

        modifiedUrl: "./",
        nativeUrl: "./app/",
        upstreamUrl: "https://gchq.github.io/CyberChef/",

        defaultSource: "modified",

        allowSourceSwitching: true,
        allowFullscreen: true,
        allowPopout: true,
        allowReload: true,
        allowStatusMessages: true,
        allowDirectRuntime: true,

        runtimeId: "cz-runtime",
        containerId: "cz-container",
        statusId: "cz-status",
        sourceId: "cz-source",
        loadButtonId: "cz-load",
        refreshButtonId: "cz-refresh",
        activeSourceId: "cz-active-source",
        frameStateId: "cz-frame-state",
        modificationsId: "cz-modifications",

        runtimeHtml: "./app/index.html",
        runtimeManifestUrl: "./runtime-manifest.json",

        storageKeys: {
            source: "zzxCyberChefSource",
            fullscreen: "zzxCyberChefFullscreen",
            compact: "zzxCyberChefCompact",
            scale: "zzxCyberChefScale",
            theme: "zzxCyberChefTheme",
            cyberTheme: "zzxCyberChefInternalTheme",
            lastLoaded: "zzxCyberChefLastLoaded"
        },

        defaultOptions: {
            theme: "dark",
            wordWrap: true,
            showErrors: true,
            updateUrl: true
        }
    };

    async function hydrateReleaseMetadata() {
        const config = window.ZZX.CYBERCHEF;

        try {
            const response = await fetch(config.runtimeManifestUrl, {
                cache: "no-store"
            });

            if (!response.ok) {
                throw new Error(
                    `runtime manifest request failed: HTTP ${response.status}`
                );
            }

            const manifest = await response.json();
            const native = manifest && manifest.native_frontend
                ? manifest.native_frontend
                : {};

            const version = String(native.version || "").trim();
            const tag = String(native.tag || "").trim();
            const displayVersion = tag || (version ? `v${version}` : "");

            if (!displayVersion) {
                throw new Error("runtime manifest contains no CyberChef version");
            }

            config.version = displayVersion;
            config.releasePage = String(native.release_page || "").trim();
            config.releaseSha256 = String(native.release_sha256 || "").trim();

            document
                .querySelectorAll("[data-cyberchef-version]")
                .forEach((node) => {
                    node.textContent = displayVersion;
                });

            document.documentElement.dataset.cyberchefVersion = displayVersion;
        } catch (err) {
            console.warn("CyberChef release metadata unavailable:", err);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            hydrateReleaseMetadata,
            { once: true }
        );
    } else {
        hydrateReleaseMetadata();
    }
})();
