(() => {
    "use strict";

    const M = window.ZZXCyberChefModules;
    const config = window.ZZX.CYBERCHEF;

    const Resize = {
        resize() {
            const box = document.getElementById(config.runtimeId || "cz-runtime");
            const child = document.getElementById(config.frameId || "cz-frame");
            if (!box || !child) return;

            let height;
            if (document.body.classList.contains("cz-fullscreen-tool")) {
                const viewbar = document.getElementById("cz-viewbar")?.getBoundingClientRect().height || 0;
                const toolbar = document.querySelector(".cz-frame-toolbar")?.getBoundingClientRect().height || 0;
                const deck = document.querySelector(".cz-control-deck")?.getBoundingClientRect().height || 0;
                height = Math.max(540, window.innerHeight - viewbar - toolbar - deck - 8);
            } else if (window.innerWidth < 760) {
                // Four sequential pane regions need usable touch editing height.
                // Do not scale the entire app smaller: that also shrinks touch targets.
                const viewHeight = window.visualViewport?.height || window.innerHeight;
                height = Math.max(1820, Math.min(2200, Math.round(viewHeight * 2.15)));
            } else if (window.innerWidth < 1200) {
                height = Math.max(820, Math.floor(window.innerHeight * 0.76));
            } else {
                height = Math.max(900, Math.floor(window.innerHeight * 0.78));
            }

            box.style.setProperty("--cz-mobile-runtime-height", `${height}px`);
            box.style.setProperty("height", `${height}px`, "important");
            box.style.setProperty("min-height", `${height}px`, "important");
            child.style.setProperty("height", "100%", "important");
        },
        boot() {
            window.addEventListener("resize", () => this.resize(), { passive: true });
            window.addEventListener("orientationchange", () => setTimeout(() => this.resize(), 200), { passive: true });
            window.addEventListener("zzx-cyberchef-frame-ready", () => this.resize());
            this.resize();
        }
    };

    M.Resize = Resize;
})();
