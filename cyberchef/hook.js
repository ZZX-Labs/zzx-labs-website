(() => {
    "use strict";

    window.ZZX = window.ZZX || {};

    window.ZZX.CYBERCHEF = {
        version: "v11.0.0",

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

        cyberChefMainScript: "app/assets/main.js",
        cyberChefMainStylesheet: "app/assets/main.css",

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