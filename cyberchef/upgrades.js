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
            document.addEventListener("DOMContentLoaded", fn);
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

    function makeThemeSelect() {
        const select = document.createElement("select");
        select.id = "cz-theme";

        [
            ["tactical", "ZZX Tactical"],
            ["amber", "ZZX Amber"],
            ["crt", "ZZX CRT"],
            ["monochrome", "ZZX Mono"],
            ["plain", "Plain Dark"]
        ].forEach(([value, label]) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = label;
            select.appendChild(option);
        });

        return select;
    }

    function makeScaleSelect() {
        const select = document.createElement("select");
        select.id = "cz-scale";

        [
            ["0.65", "Zoom 65%"],
            ["0.70", "Zoom 70%"],
            ["0.72", "Zoom 72%"],
            ["0.75", "Zoom 75%"],
            ["0.80", "Zoom 80%"],
            ["0.85", "Zoom 85%"],
            ["0.90", "Zoom 90%"],
            ["1", "Zoom 100%"]
        ].forEach(([value, label]) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = label;
            select.appendChild(option);
        });

        return select;
    }

    function applyTheme(theme) {
        document.body.classList.remove(
            "cz-theme-tactical",
            "cz-theme-amber",
            "cz-theme-crt",
            "cz-theme-monochrome"
        );

        if (theme !== "plain") {
            document.body.classList.add(`cz-theme-${theme}`);
        }

        set(STORAGE.theme, theme);
    }

    function applyScale(scale) {
        document.documentElement.style.setProperty(
            "--zzx-cyberchef-scale",
            String(scale)
        );

        set(STORAGE.scale, String(scale));

        window.ZZXCyberChefResize?.();
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
        try {
            const existing = localStorage.getItem("options");
            const options = existing ? JSON.parse(existing) : {};

            options.theme = "dark";
            options.updateUrl = true;
            options.wordWrap = true;
            options.showErrors = true;

            localStorage.setItem("options", JSON.stringify(options));

            document.documentElement.className =
                document.documentElement.className
                    .replace(/\bclassic\b/g, "")
                    .trim();

            document.documentElement.classList.add("dark");
        } catch (err) {}

        try {
            const themeSelect = document.querySelector("#theme");

            if (themeSelect) {
                themeSelect.value = "dark";
                themeSelect.dispatchEvent(
                    new Event("change", { bubbles: true })
                );
            }
        } catch (err) {}
    }

    function injectControls() {
        const bar = document.querySelector(".cz-sourcebar");

        if (!bar || document.getElementById("cz-theme")) {
            return;
        }

        const theme = makeThemeSelect();
        theme.value = get(STORAGE.theme, "tactical");

        const scale = makeScaleSelect();
        scale.value = get(STORAGE.scale, "0.72");

        const compact = makeButton("Compact", "cz-compact-toggle");
        const fullscreen = makeButton("Tool Fullscreen", "cz-fullscreen-toggle");
        const analyst = makeButton("Analyst Mode", "cz-analyst-toggle");
        const dark = makeButton("Force Dark", "cz-force-dark");

        bar.appendChild(theme);
        bar.appendChild(scale);
        bar.appendChild(compact);
        bar.appendChild(fullscreen);
        bar.appendChild(analyst);
        bar.appendChild(dark);

        theme.addEventListener("change", () => {
            applyTheme(theme.value);
        });

        scale.addEventListener("change", () => {
            applyScale(scale.value);
        });

        compact.addEventListener("click", () => {
            setCompact(
                !document.body.classList.contains("cz-compact")
            );
        });

        fullscreen.addEventListener("click", () => {
            setFullscreen(
                !document.body.classList.contains("cz-fullscreen-tool")
            );
        });

        analyst.addEventListener("click", () => {
            setAnalyst(
                !document.body.classList.contains("cz-analyst-mode")
            );
        });

        dark.addEventListener("click", () => {
            forceCyberChefDarkTheme();
        });
    }

    ready(() => {
        injectControls();

        applyTheme(get(STORAGE.theme, "tactical"));
        applyScale(get(STORAGE.scale, "0.72"));

        setCompact(get(STORAGE.compact, "0") === "1");
        setFullscreen(get(STORAGE.fullscreen, "0") === "1");
        setAnalyst(get(STORAGE.analyst, "0") === "1");

        forceCyberChefDarkTheme();

        window.addEventListener("zzx-cyberchef-ready", () => {
            forceCyberChefDarkTheme();
            window.ZZXCyberChefResize?.();

            setTimeout(forceCyberChefDarkTheme, 500);
            setTimeout(window.ZZXCyberChefResize, 750);
            setTimeout(forceCyberChefDarkTheme, 1500);
            setTimeout(window.ZZXCyberChefResize, 1750);
        });

        setInterval(forceCyberChefDarkTheme, 5000);

        console.info("[CyberChefZZX] Upgrades loaded.");
    });
})();