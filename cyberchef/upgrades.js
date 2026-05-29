(() => {
    "use strict";

    const STORAGE = {
        theme: "zzxCyberChefTheme",
        compact: "zzxCyberChefCompact",
        fullscreen: "zzxCyberChefFullscreen",
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
            ["0.65", "65%"],
            ["0.70", "70%"],
            ["0.72", "72%"],
            ["0.75", "75%"],
            ["0.80", "80%"],
            ["0.85", "85%"],
            ["1", "100%"]
        ].forEach(([value, label]) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = `Zoom ${label}`;
            select.appendChild(option);
        });

        return select;
    }

    function applyTheme(theme) {
        document.body.classList.remove("cz-theme-tactical");

        if (theme === "tactical") {
            document.body.classList.add("cz-theme-tactical");
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

    function forceCyberChefDarkTheme() {
        const frame = document.querySelector("#cz-frame");

        if (!frame || !frame.contentWindow) {
            return;
        }

        try {
            const win = frame.contentWindow;
            const doc = win.document;

            try {
                win.localStorage.setItem(
                    "options",
                    JSON.stringify({
                        theme: "dark",
                        updateUrl: true,
                        wordWrap: true,
                        showErrors: true
                    })
                );
            } catch (err) {}

            try {
                doc.documentElement.className = "dark";
            } catch (err) {}

            try {
                const themeSelect = doc.querySelector("#theme");

                if (themeSelect) {
                    themeSelect.value = "dark";
                    themeSelect.dispatchEvent(new Event("change", { bubbles: true }));
                }
            } catch (err) {}
        } catch (err) {}
    }

    function injectControls() {
        const bar = document.querySelector(".cz-sourcebar");

        if (!bar) {
            return;
        }

        const theme = makeThemeSelect();
        theme.value = get(STORAGE.theme, "tactical");

        const scale = makeScaleSelect();
        scale.value = get(STORAGE.scale, "0.72");

        const compact = makeButton("Compact", "cz-compact-toggle");
        const fullscreen = makeButton("Tool Fullscreen", "cz-fullscreen-toggle");
        const dark = makeButton("Force Dark", "cz-force-dark");

        bar.appendChild(theme);
        bar.appendChild(scale);
        bar.appendChild(compact);
        bar.appendChild(fullscreen);
        bar.appendChild(dark);

        theme.addEventListener("change", () => {
            applyTheme(theme.value);
        });

        scale.addEventListener("change", () => {
            applyScale(scale.value);
        });

        compact.addEventListener("click", () => {
            setCompact(!document.body.classList.contains("cz-compact"));
        });

        fullscreen.addEventListener("click", () => {
            setFullscreen(!document.body.classList.contains("cz-fullscreen-tool"));
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

        const frame = document.querySelector("#cz-frame");

        if (frame) {
            frame.addEventListener("load", () => {
                setTimeout(forceCyberChefDarkTheme, 300);
                setTimeout(forceCyberChefDarkTheme, 1200);
                setTimeout(forceCyberChefDarkTheme, 3000);
            });
        }

        setInterval(forceCyberChefDarkTheme, 5000);

        console.info("[CyberChefZZX] Upgrades loaded.");
    });
})();