(() => {
    "use strict";

    window.ZZX = window.ZZX || {};

    window.ZZX.CYBERCHEF = {
        title: "CyberChefZZX",
        version: "latest",
        manifestUrl: "./runtime-manifest.json",
        nativeUrl: "./app/index.html",
        nativePath: "/cyberchef/app/",
        shimUrl: "./shim/shim.css",
        upstreamUrl: "https://gchq.github.io/CyberChef/",
        defaultSource: "modified",

        runtimeId: "cz-runtime",
        frameId: "cz-frame",
        containerId: "cz-container",
        statusId: "cz-status",
        sourceId: "cz-source",
        loadButtonId: "cz-load",
        refreshButtonId: "cz-refresh",
        activeSourceId: "cz-active-source",
        frameStateId: "cz-frame-state",
        modificationsId: "cz-modifications",

        themePresets: [
            { id: "tactical", label: "Tactical" },
            { id: "amber", label: "Amber" },
            { id: "crt", label: "CRT" },
            { id: "mono", label: "Monochrome" },
            { id: "terminal", label: "Terminal" },
            { id: "midnight", label: "Midnight" },
            { id: "slate", label: "Slate" },
            { id: "paper", label: "Paper" }
        ],

        layoutPresets: [
            { id: "native", label: "Native" },
            { id: "balanced", label: "Balanced" },
            { id: "operations", label: "Operations Wide" },
            { id: "recipe", label: "Recipe Wide" },
            { id: "io", label: "I/O Wide" },
            { id: "compact", label: "Compact" },
            { id: "input", label: "Input Focus" },
            { id: "output", label: "Output Focus" }
        ],

        storageKeys: {
            source: "zzxCyberChefSourceV8",
            theme: "zzxCyberChefThemeV8",
            layout: "zzxCyberChefLayoutV8",
            module: "zzxCyberChefModuleV8",
            function: "zzxCyberChefFunctionV8",
            compact: "zzxCyberChefCompactV8",
            fullscreen: "zzxCyberChefFullscreenV8",
            analyst: "zzxCyberChefAnalystV8"
        }
    };
})();
