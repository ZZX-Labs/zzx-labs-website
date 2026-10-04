(() => {
    "use strict";

    function frame() {
        return document.getElementById("cz-frame");
    }

    function runtime() {
        return document.getElementById("cz-runtime");
    }

    function resize() {
        const box = runtime();
        const child = frame();
        if (!box || !child) return;

        let height;
        if (document.body.classList.contains("cz-fullscreen-tool")) {
            const toolbar = document.querySelector(".cz-frame-toolbar")?.getBoundingClientRect().height || 0;
            const deck = document.querySelector(".cz-control-deck")?.getBoundingClientRect().height || 0;
            height = Math.max(540, window.innerHeight - toolbar - deck - 8);
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
    }

    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("orientationchange", () => setTimeout(resize, 200), { passive: true });
    window.addEventListener("zzx-cyberchef-frame-ready", resize);

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", resize, { once: true });
    } else {
        resize();
    }

    window.ZZXCyberChefResize = resize;
})();
