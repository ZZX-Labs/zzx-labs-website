(() => {
    "use strict";

    const config = window.ZZX?.CYBERCHEF || {};
    const STORAGE = config.storageKeys || {};

    function ready(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn, { once: true });
        } else {
            fn();
        }
    }

    function get(key, fallback = null) {
        try { return localStorage.getItem(key) ?? fallback; }
        catch (err) { return fallback; }
    }

    function set(key, value) {
        try { localStorage.setItem(key, value); }
        catch (err) {}
    }

    function optionSelect(id, entries) {
        const select = document.createElement("select");
        select.id = id;
        for (const [value, label] of entries) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = label;
            select.appendChild(option);
        }
        return select;
    }

    function button(id, label) {
        const node = document.createElement("button");
        node.type = "button";
        node.id = id;
        node.textContent = label;
        return node;
    }

    function applyTheme(theme) {
        document.body.classList.remove(
            "cz-theme-tactical",
            "cz-theme-amber",
            "cz-theme-crt",
            "cz-theme-monochrome"
        );
        if (theme !== "plain") document.body.classList.add(`cz-theme-${theme}`);
        set(STORAGE.theme || "zzxCyberChefThemeV2", theme);
        window.ZZXCyberChef?.applyInternalTheme?.(theme);
    }

    function applyScale(scale) {
        set(STORAGE.scale || "zzxCyberChefFrameScaleV2", String(scale));
        window.ZZXCyberChefSetScale?.(scale);
    }

    function toggleClass(className, storageKey) {
        const enabled = !document.body.classList.contains(className);
        document.body.classList.toggle(className, enabled);
        set(storageKey, enabled ? "1" : "0");
        window.ZZXCyberChefResize?.();
    }

    function injectControls() {
        const bar = document.querySelector(".cz-sourcebar");
        if (!bar || document.getElementById("cz-theme")) return;

        const theme = optionSelect("cz-theme", [
            ["tactical", "ZZX Tactical"],
            ["amber", "ZZX Amber"],
            ["crt", "ZZX CRT"],
            ["monochrome", "ZZX Mono"],
            ["plain", "CyberChef Dark"]
        ]);

        const scale = optionSelect("cz-scale", [
            ["1", "Zoom 100%"],
            ["0.95", "Zoom 95%"],
            ["0.90", "Zoom 90%"],
            ["0.85", "Zoom 85%"],
            ["0.80", "Zoom 80%"],
            ["0.75", "Zoom 75%"],
            ["0.70", "Zoom 70%"],
            ["0.65", "Zoom 65%"]
        ]);

        const compact = button("cz-compact-toggle", "Compact");
        const fullscreen = button("cz-fullscreen-toggle", "Tool Fullscreen");
        const analyst = button("cz-analyst-toggle", "Analyst Mode");

        theme.value = get(STORAGE.theme || "zzxCyberChefThemeV2", "tactical");
        scale.value = get(STORAGE.scale || "zzxCyberChefFrameScaleV2", "1");

        bar.append(theme, scale, compact, fullscreen, analyst);

        theme.addEventListener("change", () => applyTheme(theme.value));
        scale.addEventListener("change", () => applyScale(scale.value));
        compact.addEventListener("click", () => toggleClass("cz-compact", STORAGE.compact || "zzxCyberChefCompactV2"));
        fullscreen.addEventListener("click", () => toggleClass("cz-fullscreen-tool", STORAGE.fullscreen || "zzxCyberChefFullscreenV2"));
        analyst.addEventListener("click", () => toggleClass("cz-analyst-mode", "zzxCyberChefAnalystV2"));
    }

    ready(() => {
        injectControls();

        const theme = get(STORAGE.theme || "zzxCyberChefThemeV2", "tactical");
        const scale = get(STORAGE.scale || "zzxCyberChefFrameScaleV2", "1");
        applyTheme(theme);
        applyScale(scale);

        document.body.classList.toggle("cz-compact", get(STORAGE.compact || "zzxCyberChefCompactV2", "0") === "1");
        document.body.classList.toggle("cz-fullscreen-tool", get(STORAGE.fullscreen || "zzxCyberChefFullscreenV2", "0") === "1");

        window.addEventListener("zzx-cyberchef-ready", () => {
            window.ZZXCyberChef?.applyInternalTheme?.(theme);
            window.ZZXCyberChefResize?.();
        });
    });
})();
