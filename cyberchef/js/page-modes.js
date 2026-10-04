(() => {
    "use strict";

    const M = window.ZZXCyberChefModules;
    const config = window.ZZX.CYBERCHEF;
    const Storage = M.Storage;
    const keys = config.storageKeys;

    function makeButton(id, label) {
        const button = document.createElement("button");
        button.id = id;
        button.type = "button";
        button.textContent = label;
        return button;
    }

    function apply(className, key, enabled) {
        document.body.classList.toggle(className, enabled);
        Storage.write(key, enabled ? "1" : "0");
        M.Resize?.resize();
    }

    M.PageModes = {
        boot() {
            const bar = document.querySelector(".cz-sourcebar");
            if (!bar || document.getElementById("cz-compact-toggle")) return;

            const compact = makeButton("cz-compact-toggle", "Compact Page");
            const fullscreen = makeButton("cz-fullscreen-toggle", "Tool Fullscreen");
            const analyst = makeButton("cz-analyst-toggle", "Analyst View");
            bar.append(compact, fullscreen, analyst);

            apply("cz-compact", keys.compact, Storage.read(keys.compact, "0") === "1");
            apply("cz-fullscreen-tool", keys.fullscreen, Storage.read(keys.fullscreen, "0") === "1");
            apply("cz-analyst-mode", keys.analyst, Storage.read(keys.analyst, "0") === "1");

            compact.addEventListener("click", () => apply("cz-compact", keys.compact, !document.body.classList.contains("cz-compact")));
            fullscreen.addEventListener("click", () => apply("cz-fullscreen-tool", keys.fullscreen, !document.body.classList.contains("cz-fullscreen-tool")));
            analyst.addEventListener("click", () => apply("cz-analyst-mode", keys.analyst, !document.body.classList.contains("cz-analyst-mode")));
        }
    };
})();
