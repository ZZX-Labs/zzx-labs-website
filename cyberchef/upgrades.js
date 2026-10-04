(() => {
    "use strict";

    const STORAGE = {
        theme: "zzxCyberChefTheme",
        compact: "zzxCyberChefCompact",
        fullscreen: "zzxCyberChefFullscreen",
        analyst: "zzxCyberChefAnalystMode",
        scale: "zzxCyberChefScale"
    };

    function ready(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn, { once: true });
        } else {
            fn();
        }
    }

    function get(key, fallback = null) {
        try {
            return localStorage.getItem(key) ?? fallback;
        } catch (err) {
            return fallback;
        }
    }

    function set(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (err) {}
    }

    function makeButton(text, id) {
        const button = document.createElement("button");
        button.type = "button";
        button.id = id;
        button.textContent = text;
        return button;
    }

    function makeSelect(id, values) {
        const select = document.createElement("select");
        select.id = id;
        for (const [value, label] of values) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = label;
            select.appendChild(option);
        }
        return select;
    }

    function applyTheme(theme) {
        document.body.classList.remove(
            "cz-theme-tactical",
            "cz-theme-amber",
            "cz-theme-crt",
            "cz-theme-monochrome"
        );
        if (theme !== "plain") document.body.classList.add(`cz-theme-${theme}`);
        set(STORAGE.theme, theme);
    }

    function applyScale(scale) {
        set(STORAGE.scale, String(scale));
        window.ZZXCyberChefSetScale?.(scale);
    }

    function setCompact(enabled) {
        document.body.classList.toggle("cz-compact", enabled);
        set(STORAGE.compact, enabled ? "1" : "0");
        window.ZZXCyberChefResize?.();
    }

    function setFullscreen(enabled) {
        document.body.classList.toggle("cz-fullscreen-tool", enabled);
        set(STORAGE.fullscreen, enabled ? "1" : "0");
        window.ZZXCyberChefResize?.();
    }

    function setAnalyst(enabled) {
        document.body.classList.toggle("cz-analyst-mode", enabled);
        set(STORAGE.analyst, enabled ? "1" : "0");
        window.ZZXCyberChefResize?.();
    }

    function forceCyberChefDarkTheme() {
        window.ZZXCyberChef?.forceFrameDark?.();
    }

    function injectControls() {
        const bar = document.querySelector(".cz-sourcebar");
        if (!bar || document.getElementById("cz-theme")) return;

        const theme = makeSelect("cz-theme", [
            ["tactical", "ZZX Tactical"],
            ["amber", "ZZX Amber"],
            ["crt", "ZZX CRT"],
            ["monochrome", "ZZX Mono"],
            ["plain", "Plain Dark"]
        ]);

        const scale = makeSelect("cz-scale", [
            ["0.70", "Zoom 70%"],
            ["0.75", "Zoom 75%"],
            ["0.80", "Zoom 80%"],
            ["0.85", "Zoom 85%"],
            ["0.90", "Zoom 90%"],
            ["0.95", "Zoom 95%"],
            ["1", "Zoom 100%"]
        ]);

        theme.value = get(STORAGE.theme, "tactical");
        scale.value = get(STORAGE.scale, "1");

        const compact = makeButton("Compact", "cz-compact-toggle");
        const fullscreen = makeButton("Tool Fullscreen", "cz-fullscreen-toggle");
        const analyst = makeButton("Analyst Mode", "cz-analyst-toggle");
        const dark = makeButton("Force Dark", "cz-force-dark");

        bar.append(theme, scale, compact, fullscreen, analyst, dark);

        theme.addEventListener("change", () => applyTheme(theme.value));
        scale.addEventListener("change", () => applyScale(scale.value));
        compact.addEventListener("click", () => setCompact(!document.body.classList.contains("cz-compact")));
        fullscreen.addEventListener("click", () => setFullscreen(!document.body.classList.contains("cz-fullscreen-tool")));
        analyst.addEventListener("click", () => setAnalyst(!document.body.classList.contains("cz-analyst-mode")));
        dark.addEventListener("click", forceCyberChefDarkTheme);
    }

    ready(() => {
        injectControls();
        applyTheme(get(STORAGE.theme, "tactical"));
        applyScale(get(STORAGE.scale, "1"));
        setCompact(get(STORAGE.compact, "0") === "1");
        setFullscreen(get(STORAGE.fullscreen, "0") === "1");
        setAnalyst(get(STORAGE.analyst, "0") === "1");

        window.addEventListener("zzx-cyberchef-ready", () => {
            forceCyberChefDarkTheme();
            window.ZZXCyberChefResize?.();
        });

        console.info("[CyberChefZZX] iframe-safe upgrades loaded.");
    });
})();
