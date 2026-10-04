(() => {
    "use strict";

    function ready(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn, { once: true });
        } else {
            fn();
        }
    }

    function clampScale(value) {
        const number = Number.parseFloat(value);
        if (!Number.isFinite(number)) return 1;
        return Math.min(1, Math.max(0.65, number));
    }

    function desiredHeight() {
        if (window.innerWidth < 520) return 760;
        if (window.innerWidth < 900) return 900;
        if (window.innerWidth < 1200) return 1000;
        return Math.max(1080, Math.min(1320, window.innerHeight + 260));
    }

    function resizeCyberChefCanvas() {
        const runtime = document.getElementById("cz-runtime");
        const frame = document.getElementById("cz-frame");
        if (!runtime || !frame) return;

        const raw = getComputedStyle(document.documentElement)
            .getPropertyValue("--zzx-cyberchef-scale") || "1";
        const scale = clampScale(raw);
        const height = desiredHeight();

        runtime.style.height = `${height}px`;
        runtime.style.minHeight = `${height}px`;
        runtime.style.overflow = "hidden";

        frame.style.transformOrigin = "top left";
        frame.style.transform = scale === 1 ? "none" : `scale(${scale})`;
        frame.style.width = scale === 1 ? "100%" : `${100 / scale}%`;
        frame.style.height = scale === 1 ? "100%" : `${height / scale}px`;

        document.documentElement.style.setProperty("--cz-runtime-height", `${height}px`);
    }

    function setScale(value) {
        const scale = clampScale(value);
        document.documentElement.style.setProperty("--zzx-cyberchef-scale", String(scale));
        resizeCyberChefCanvas();
    }

    ready(() => {
        resizeCyberChefCanvas();
        window.addEventListener("resize", resizeCyberChefCanvas, { passive: true });
        window.addEventListener("orientationchange", () => {
            setTimeout(resizeCyberChefCanvas, 200);
            setTimeout(resizeCyberChefCanvas, 800);
        }, { passive: true });
        window.addEventListener("zzx-cyberchef-ready", resizeCyberChefCanvas);
    });

    window.ZZXCyberChefResize = resizeCyberChefCanvas;
    window.ZZXCyberChefSetScale = setScale;
})();
