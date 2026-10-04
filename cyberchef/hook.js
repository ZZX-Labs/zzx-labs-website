(() => {
    "use strict";

    window.ZZX = window.ZZX || {};

    window.ZZX.CYBERCHEF = {
        version: "latest",
        title: "CyberChefZZX",

        modifiedUrl: "./app/index.html",
        nativeUrl: "./app/index.html",
        upstreamUrl: "https://gchq.github.io/CyberChef/",
        manifestUrl: "./runtime-manifest.json",

        modifiedStylesheets: [
            "./theme.css",
            "./layout.css"
        ],

        defaultSource: "modified",

        frameId: "cz-frame",
        runtimeId: "cz-runtime",
        containerId: "cz-container",
        statusId: "cz-status",
        sourceId: "cz-source",
        loadButtonId: "cz-load",
        refreshButtonId: "cz-refresh",
        activeSourceId: "cz-active-source",
        frameStateId: "cz-frame-state",
        modificationsId: "cz-modifications",

        storageKeys: {
            source: "zzxCyberChefSourceV2",
            fullscreen: "zzxCyberChefFullscreenV2",
            compact: "zzxCyberChefCompactV2",
            scale: "zzxCyberChefFrameScaleV2",
            theme: "zzxCyberChefThemeV2",
            lastLoaded: "zzxCyberChefLastLoadedV2"
        }
    };
})();
