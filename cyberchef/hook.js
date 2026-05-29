(() => {
    "use strict";

    window.ZZX = window.ZZX || {};

    window.ZZX.CYBERCHEF = {

        version: "v11.0.0",

        title: "CyberChefZZX",

        localUrl: "./app/",

        upstreamUrl:
            "https://gchq.github.io/CyberChef/",

        defaultSource: "local",

        allowSourceSwitching: true,

        allowFullscreen: true,

        allowPopout: true,

        allowReload: true,

        allowStatusMessages: true,

        iframeId: "cz-frame",

        containerId: "cz-container",

        statusId: "cz-status",

        sourceId: "cz-source",

        loadButtonId: "cz-load",

        refreshButtonId: "cz-refresh",

        activeSourceId: "cz-active-source",

        frameStateId: "cz-frame-state",

        storageKeys: {

            source:
                "zzxCyberChefSource",

            fullscreen:
                "zzxCyberChefFullscreen",

            lastLoaded:
                "zzxCyberChefLastLoaded"

        }
    };

})();