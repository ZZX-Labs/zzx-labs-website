(() => {
    "use strict";

    const M = window.ZZXCyberChefModules;
    const config = window.ZZX.CYBERCHEF;

    const Resize = {
        resize() {
            const box = document.getElementById(config.runtimeId);
            const child = document.getElementById(config.frameId);
            if (!box || !child) return;

            let height;
            if (document.body.classList.contains("cz-fullscreen-tool")) {
                const viewbar = document.getElementById("cz-viewbar")?.getBoundingClientRect().height || 0;
                const toolbar = document.querySelector(".cz-frame-toolbar")?.getBoundingClientRect().height || 0;
                const deck = document.querySelector(".cz-control-deck")?.getBoundingClientRect().height || 0;
                height = Math.max(540, window.innerHeight - viewbar - toolbar - deck - 8);
            } else if (window.innerWidth < 760) {
                height = 760;
            } else if (window.innerWidth < 1200) {
                height = Math.max(820, Math.floor(window.innerHeight * 0.76));
            } else {
                height = Math.max(900, Math.floor(window.innerHeight * 0.78));
            }

            box.style.height = `${height}px`;
            box.style.minHeight = `${height}px`;
            child.style.height = `${height}px`;
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
