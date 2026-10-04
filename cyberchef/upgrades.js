(() => {
    "use strict";

    const config = window.ZZX?.CYBERCHEF || {};
    const STORAGE = config.storageKeys || {};

    function read(key, fallback = "0") {
        try { return localStorage.getItem(key) ?? fallback; }
        catch (err) { return fallback; }
    }

    function write(key, value) {
        try { localStorage.setItem(key, value); }
        catch (err) {}
    }

    function makeButton(id, label) {
        const button = document.createElement("button");
        button.id = id;
        button.type = "button";
        button.textContent = label;
        return button;
    }

    function setToggle(className, storageKey, enabled) {
        document.body.classList.toggle(className, enabled);
        write(storageKey, enabled ? "1" : "0");
        window.ZZXCyberChefResize?.();
    }

    function boot() {
        const bar = document.querySelector(".cz-sourcebar");
        if (!bar || document.getElementById("cz-compact-toggle")) return;

        const compact = makeButton("cz-compact-toggle", "Compact Page");
        const fullscreen = makeButton("cz-fullscreen-toggle", "Tool Fullscreen");
        const analyst = makeButton("cz-analyst-toggle", "Analyst View");
        bar.append(compact, fullscreen, analyst);

        const compactKey = STORAGE.compact || "zzxCyberChefCompactV8";
        const fullscreenKey = STORAGE.fullscreen || "zzxCyberChefFullscreenV8";
        const analystKey = STORAGE.analyst || "zzxCyberChefAnalystV8";

        setToggle("cz-compact", compactKey, read(compactKey) === "1");
        setToggle("cz-fullscreen-tool", fullscreenKey, read(fullscreenKey) === "1");
        setToggle("cz-analyst-mode", analystKey, read(analystKey) === "1");

        compact.addEventListener("click", () => {
            setToggle("cz-compact", compactKey, !document.body.classList.contains("cz-compact"));
        });
        fullscreen.addEventListener("click", () => {
            setToggle("cz-fullscreen-tool", fullscreenKey, !document.body.classList.contains("cz-fullscreen-tool"));
        });
        analyst.addEventListener("click", () => {
            setToggle("cz-analyst-mode", analystKey, !document.body.classList.contains("cz-analyst-mode"));
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }
})();
