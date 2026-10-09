(() => {
    "use strict";

    const M = window.ZZXCyberChefModules;
    const config = window.ZZX.CYBERCHEF;
    const Storage = M.Storage;
    const keys = config.storageKeys;

    const MODES = [
        { id: "normal", label: "Full Page", className: null },
        { id: "compact", label: "Compact", className: "cz-compact" },
        { id: "fullscreen", label: "Tool Fullscreen", className: "cz-fullscreen-tool" },
        { id: "analyst", label: "Analyst View", className: "cz-analyst-mode" }
    ];

    const LEGACY_KEYS = [
        "zzxCyberChefCompactV9",
        "zzxCyberChefFullscreenV9",
        "zzxCyberChefAnalystV9",
        "zzxCyberChefCompactV10",
        "zzxCyberChefFullscreenV10",
        "zzxCyberChefAnalystV10"
    ];

    function validMode(value) {
        return MODES.some(mode => mode.id === value) ? value : "normal";
    }

    function clearModeClasses() {
        for (const mode of MODES) {
            if (mode.className) document.body.classList.remove(mode.className);
        }
    }

    function updateButtons(modeId) {
        document.querySelectorAll("[data-cz-view-mode]").forEach(button => {
            const active = button.dataset.czViewMode === modeId;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", active ? "true" : "false");
        });
    }

    function applyMode(modeId) {
        const selected = MODES.find(mode => mode.id === validMode(modeId)) || MODES[0];
        clearModeClasses();
        if (selected.className) document.body.classList.add(selected.className);
        updateButtons(selected.id);
        M.Resize?.resize();
        return selected.id;
    }

    function makeViewbar() {
        let bar = document.getElementById("cz-viewbar");
        if (bar) return bar;

        const host = document.getElementById("cz-viewbar-host");
        const main = host || document.querySelector("main.cz-shell") || document.querySelector("main") || document.body;
        bar = document.createElement("div");
        bar.id = "cz-viewbar";
        bar.className = "cz-viewbar";
        bar.setAttribute("role", "toolbar");
        bar.setAttribute("aria-label", "ZZXCyberChef page view controls");

        const label = document.createElement("span");
        label.className = "cz-viewbar-label";
        label.textContent = "Page View";
        bar.appendChild(label);

        for (const mode of MODES) {
            const button = document.createElement("button");
            button.type = "button";
            button.dataset.czViewMode = mode.id;
            button.textContent = mode.label;
            button.setAttribute("aria-pressed", "false");
            button.addEventListener("click", () => applyMode(mode.id));
            bar.appendChild(button);
        }

        const reset = document.createElement("button");
        reset.type = "button";
        reset.className = "cz-viewbar-reset";
        reset.textContent = "Restore All Content";
        reset.addEventListener("click", () => applyMode("normal"));
        bar.appendChild(reset);

        if (host) host.replaceChildren(bar);
        else main.insertBefore(bar, main.firstChild);
        return bar;
    }

    M.PageModes = {
        apply: applyMode,
        boot() {
            // Migrate away from the old three-boolean mode system.  Those controls
            // lived inside the content they hid, which could make the page impossible
            // to restore.  Old flags are intentionally discarded once.
            LEGACY_KEYS.forEach(key => Storage.remove(key));
            Storage.remove(keys.viewMode);

            makeViewbar();
            // Hide/collapse modes are intentionally session-only. Every reload
            // starts with the complete page visible so a stale mode can never
            // strand the controls or the upper ZZXCyberChef content off-screen.
            applyMode("normal");

            document.addEventListener("keydown", event => {
                if (event.key === "Escape" && document.body.classList.contains("cz-fullscreen-tool")) {
                    applyMode("normal");
                }
            });
        }
    };
})();
