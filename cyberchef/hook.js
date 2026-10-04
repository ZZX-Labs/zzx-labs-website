(() => {
    "use strict";

    window.ZZX = window.ZZX || {};

    window.ZZX.CYBERCHEF = {
        version: "latest",
        title: "CyberChefZZX",

        modifiedUrl: "./app/",
        nativeUrl: "./app/",
        upstreamUrl: "https://gchq.github.io/CyberChef/",
        manifestUrl: "./runtime-manifest.json",
        frameStylesheet: "./frame.css",

        defaultSource: "modified",
        allowSourceSwitching: true,
        allowFullscreen: true,
        allowPopout: true,
        allowReload: true,
        allowStatusMessages: true,

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
})();
