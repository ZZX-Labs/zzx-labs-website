(() => {
    "use strict";

    const M = window.ZZXCyberChefModules;
    const config = window.ZZX.CYBERCHEF;

    const Resize = {
        resize() {
            const box = document.getElementById(config.runtimeId || "cz-runtime");
            const child = document.getElementById(config.frameId);
            if (!box || !child) return;

            let height;
            if (document.body.classList.contains("cz-fullscreen-tool")) {
                const viewbar = document.getElementById("cz-viewbar")?.getBoundingClientRect().height || 0;
                const toolbar = document.querySelector(".cz-frame-toolbar")?.getBoundingClientRect().height || 0;
                const deck = document.querySelector(".cz-control-deck")?.getBoundingClientRect().height || 0;
                height = Math.max(540, window.innerHeight - viewbar - toolbar - deck - 8);
            } else if (window.innerWidth < 760) {
                // Mobile viewport can shrink while address bar/keyboard opens.
                // Keep four custom panes scrollable and avoid repeated viewport resize loops.
                height = Math.max(900, Math.min(1240, Math.round(window.innerHeight * 1.3)));
            } else if (window.innerWidth < 1200) {
                height = Math.max(820, Math.floor(window.innerHeight * 0.76));
            } else {
                height = Math.max(900, Math.floor(window.innerHeight * 0.78));
            }

            height = Math.round(height);
            if (this.lastHeight === height) return;
            this.lastHeight = height;
            box.style.setProperty("--cz-runtime-height", `${height}px`);
            box.style.height = `${height}px`;
            box.style.minHeight = `${height}px`;
            child.style.height = "100%";
        },
        boot() {
            let scheduled = false;
            window.addEventListener("resize", () => {
                if (scheduled) return;
                scheduled = true;
                requestAnimationFrame(() => { scheduled = false; this.resize(); });
            }, { passive: true });
            window.addEventListener("orientationchange", () => setTimeout(() => this.resize(), 200), { passive: true });
            window.addEventListener("zzx-cyberchef-frame-ready", () => this.resize());
            this.resize();
        }
    };

    M.Resize = Resize;
})();
