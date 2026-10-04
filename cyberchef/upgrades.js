(() => {
    "use strict";

    const config = window.ZZX?.CYBERCHEF || {};
    const storageKey = config.storageKeys?.theme || "zzxCyberChefTheme";
    const themes = [
        ["tactical", "ZZX Tactical"],
        ["amber", "ZZX Amber"],
        ["mono", "ZZX Mono"],
        ["upstream", "Upstream Styling"]
    ];

    function ready(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn, { once: true });
        } else {
            fn();
        }
    }

    function getTheme() {
        try {
            return localStorage.getItem(storageKey) || config.defaultTheme || "tactical";
        } catch (_) {
            return config.defaultTheme || "tactical";
        }
    }

    function setTheme(theme) {
        for (const [value] of themes) {
            document.documentElement.classList.remove(`zzx-theme-${value}`);
        }
        if (theme !== "upstream") {
            document.documentElement.classList.add(`zzx-theme-${theme}`);
        }
        document.documentElement.dataset.zzxTheme = theme;
        try {
            localStorage.setItem(storageKey, theme);
        } catch (_) {}
    }

    function makeToolbar() {
        if (document.getElementById("zzx-cyberchef-toolbar")) {
            return;
        }

        const bar = document.createElement("aside");
        bar.id = "zzx-cyberchef-toolbar";
        bar.setAttribute("aria-label", "ZZX CyberChef controls");
        bar.innerHTML = `
            <a class="zzx-brand" href="./" title="Customized CyberChef root">CyberChefZZX</a>
            <span class="zzx-version" data-zzx-cyberchef-version>latest</span>
            <select id="zzx-theme-select" aria-label="ZZX CyberChef theme"></select>
            <button id="zzx-recipes-toggle" type="button" aria-controls="zzx-cyberchef-drawer" aria-expanded="false">Recipes</button>
            <a href="./app/" title="Open untouched local CyberChef">Native</a>
        `;

        const select = bar.querySelector("#zzx-theme-select");
        for (const [value, label] of themes) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = label;
            select.appendChild(option);
        }

        const theme = getTheme();
        select.value = themes.some(([value]) => value === theme) ? theme : "tactical";
        setTheme(select.value);
        select.addEventListener("change", () => setTheme(select.value));

        bar.querySelector("#zzx-recipes-toggle").addEventListener("click", () => {
            window.dispatchEvent(new CustomEvent("zzx-cyberchef-toggle-drawer"));
        });

        document.body.appendChild(bar);
    }

    ready(makeToolbar);
})();
