(() => {
    "use strict";

    window.ZZX = window.ZZX || {};
    window.ZZX.CYBERCHEF = Object.assign(
        {
            title: "CyberChefZZX",
            nativeUrl: "./app/",
            manifestUrl: "./runtime-manifest.json",
            upstreamUrl: "https://gchq.github.io/CyberChef/",
            defaultTheme: "tactical",
            storageKeys: {
                theme: "zzxCyberChefTheme",
                drawer: "zzxCyberChefDrawer"
            }
        },
        window.ZZX.CYBERCHEF || {}
    );
})();
