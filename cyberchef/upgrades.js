(() => {
    "use strict";

    const STORAGE = {
        theme: "zzxCyberChefTheme",
        compact: "zzxCyberChefCompact",
        fullscreen: "zzxCyberChefFullscreen"
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

    function makeSelect() {
        const select = document.createElement("select");
        select.id = "cz-theme";

        const themes = [
            ["tactical", "ZZX Tactical"],
            ["plain", "Plain Dark"]
        ];

        for (const [value, label] of themes) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = label;
            select.appendChild(option);
        }

        return select;
    }

    function applyTheme(theme) {
        document.body.classList.remove(
            "cz-theme-tactical"
        );

        if (theme === "tactical") {
            document.body.classList.add(
                "cz-theme-tactical"
            );
        }

        set(STORAGE.theme, theme);
    }

    function setCompact(enabled) {
        document.body.classList.toggle(
            "cz-compact",
            enabled
        );

        set(
            STORAGE.compact,
            enabled ? "1" : "0"
        );

        window.ZZXCyberChefResize?.();
    }

    function setFullscreen(enabled) {
        document.body.classList.toggle(
            "cz-fullscreen-tool",
            enabled
        );

        set(
            STORAGE.fullscreen,
            enabled ? "1" : "0"
        );

        window.ZZXCyberChefResize?.();
    }

    function injectControls() {
        const bar =
            document.querySelector(".cz-sourcebar");

        if (!bar) {
            return;
        }

        const theme = makeSelect();
        theme.value = get(STORAGE.theme, "tactical");

        const compact = makeButton(
            "Compact",
            "cz-compact-toggle"
        );

        const fullscreen = makeButton(
            "Tool Fullscreen",
            "cz-fullscreen-toggle"
        );

        bar.appendChild(theme);
        bar.appendChild(compact);
        bar.appendChild(fullscreen);

        theme.addEventListener("change", () => {
            applyTheme(theme.value);
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
    }

    ready(() => {
        injectControls();

        applyTheme(
            get(STORAGE.theme, "tactical")
        );

        setCompact(
            get(STORAGE.compact, "0") === "1"
        );

        setFullscreen(
            get(STORAGE.fullscreen, "0") === "1"
        );

        console.info(
            "[CyberChefZZX] Upgrades loaded."
        );
    });
})();