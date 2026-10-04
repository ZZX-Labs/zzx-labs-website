(() => {
    "use strict";

    function clamp(value, min, max) {
        const n = Number.parseFloat(value);
        if (!Number.isFinite(n)) return 1;
        return Math.min(max, Math.max(min, n));
    }

    function runtimeHeight() {
        const width = window.innerWidth;
        if (width < 520) return 780;
        if (width < 900) return 860;
        if (width < 1200) return 940;
        return 1080;
    }

    function resize() {
        const runtime = document.getElementById("cz-runtime");
        const frame = document.getElementById("cz-frame");
        if (!runtime || !frame) return;

        const raw = getComputedStyle(document.documentElement)
            .getPropertyValue("--zzx-cyberchef-scale") || "1";
        const scale = clamp(raw, 0.65, 1);
        const height = runtimeHeight();

        runtime.style.height = `${height}px`;
        runtime.style.minHeight = `${height}px`;
        runtime.style.overflow = "hidden";

        frame.style.transformOrigin = "top left";
        frame.style.transform = scale === 1 ? "none" : `scale(${scale})`;
        frame.style.width = scale === 1 ? "100%" : `${100 / scale}%`;
        frame.style.height = scale === 1 ? "100%" : `${height / scale}px`;
    }

    function setScale(value) {
        const scale = clamp(value, 0.65, 1);
        document.documentElement.style.setProperty("--zzx-cyberchef-scale", String(scale));
        resize();
    }

    function boot() {
        resize();
        window.addEventListener("resize", resize, { passive: true });
        window.addEventListener("orientationchange", () => setTimeout(resize, 250), { passive: true });
        window.addEventListener("zzx-cyberchef-ready", resize);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }

    window.ZZXCyberChefResize = resize;
    window.ZZXCyberChefSetScale = setScale;
})();
