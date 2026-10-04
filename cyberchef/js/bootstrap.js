(() => {
    "use strict";

    const M = window.ZZXCyberChefModules;
    const config = window.ZZX.CYBERCHEF;
    const Storage = M.Storage;

    function boot() {
        const source = document.getElementById(config.sourceId);
        const stored = Storage.read(config.storageKeys.source, config.defaultSource);
        const initialMode = stored === "native" ? "native" : "modified";
        if (source) source.value = initialMode;

        document.getElementById(config.loadButtonId)?.addEventListener("click", () => M.Runtime.load(M.Runtime.selectedMode(), { force: true }));
        document.getElementById(config.refreshButtonId)?.addEventListener("click", () => M.Runtime.reload());
        source?.addEventListener("change", () => M.Runtime.load(M.Runtime.selectedMode(), { force: true }));

        M.Resize?.boot();
        M.PageModes?.boot();
        M.Modifications?.boot();
        M.Rotary?.boot();
        M.Manifest?.load();
        M.Runtime.load(initialMode, { force: true });

        window.ZZXCyberChef = {
            load: (...args) => M.Runtime.load(...args),
            reload: () => M.Runtime.reload(),
            loadRecipe: recipe => M.Runtime.loadRecipe(recipe),
            getFrame: () => M.Runtime.frame(),
            getDocument: () => M.Runtime.document(),
            getWindow: () => M.Runtime.window(),
            getMode: () => M.Runtime.mode(),
            reapplyShim: () => M.Runtime.reapply(),
            modules: M
        };
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }
})();
