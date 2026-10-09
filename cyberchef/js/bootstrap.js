(() => {
    "use strict";
    const M = window.ZZXCyberChefModules;
    const config = window.ZZX.CYBERCHEF;
    const Storage = M.Storage;

    async function repairNative(openAfter = false) {
        const btn = document.getElementById("cz-repair-native");
        if (btn) btn.disabled = true;
        try {
            const result = await M.Quota?.ensureWritable?.();
            if (result?.ok) {
                M.Status?.set(
                    result.repaired
                        ? `Native storage repaired; backed up/freed ${result.removed.length} CyberChef/ZZX key(s).`
                        : "Native CyberChef storage probe passed.",
                    "ready"
                );
                if (openAfter) window.open(config.nativeUrl, "_blank", "noopener");
            } else {
                M.Status?.set(
                    "Origin storage is still full. The pristine /cyberchef/app/ cannot be modified without ceasing to be pristine; Modified mode can use the guarded memory fallback.",
                    "error"
                );
            }
            return result;
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function boot() {
        const source = document.getElementById(config.sourceId);
        const stored = Storage.read(config.storageKeys.source, config.defaultSource);
        const initialMode = stored === "native" ? "native" : "modified";
        if (source) source.value = initialMode;

        let initialLoadStarted = false;
        let intersectionObserver = null;
        let loadTimer = null;

        const startRuntime = async (options = {}) => {
            if (options.force) initialLoadStarted = false;
            if (initialLoadStarted) return;
            initialLoadStarted = true;
            if (intersectionObserver) {
                try { intersectionObserver.disconnect(); } catch (_) {}
                intersectionObserver = null;
            }
            if (loadTimer) {
                clearTimeout(loadTimer);
                loadTimer = null;
            }
            await M.Runtime.load(M.Runtime.selectedMode(), { force: true });
        };

        const triggerImmediateLoad = async () => {
            initialLoadStarted = false;
            await M.Runtime.load(M.Runtime.selectedMode(), { force: true });
        };

        document.getElementById(config.loadButtonId)?.addEventListener("click", () => { void triggerImmediateLoad(); });
        document.getElementById(config.refreshButtonId)?.addEventListener("click", () => M.Runtime.reload());
        document.getElementById("cz-repair-native")?.addEventListener("click", () => { void repairNative(false); });
        source?.addEventListener("change", () => { void triggerImmediateLoad(); });

        M.Resize?.boot();
        M.PageModes?.boot();
        M.History?.boot();
        M.Modifications?.boot();
        M.Macros?.boot();
        M.Parameters?.boot();
        M.Downloads?.boot();
        M.Manifest?.load();

        try {
            await Promise.all([
                M.Themes?.loadCatalog?.(),
                M.Layouts?.loadCatalog?.()
            ]);
        } catch (err) {
            console.error("[CyberChefZZX preset bootstrap]", err);
            M.Status?.set(err.message || "Preset catalog failed to load.", "error");
        }

        await M.Rotary?.boot?.();

        const statusNode = document.getElementById(config.statusId);
        if (statusNode) {
            statusNode.textContent = "Standby. The CyberChef engine will load when the workspace enters view, or immediately when Load is pressed.";
        }
        M.Status?.frame?.("Standby");

        const panel = document.getElementById("cz-workspace-panel") || document.getElementById("cz-runtime") || document.getElementById("cz-container");
        if (panel && "IntersectionObserver" in window) {
            intersectionObserver = new IntersectionObserver(entries => {
                if (entries.some(entry => entry.isIntersecting)) {
                    void startRuntime();
                }
            }, { rootMargin: "240px 0px" });
            intersectionObserver.observe(panel);
            loadTimer = setTimeout(() => { void startRuntime(); }, 1800);
        } else {
            loadTimer = setTimeout(() => { void startRuntime(); }, 500);
        }

        window.ZZXCyberChef = {
            load: (...args) => M.Runtime.load(...args),
            reload: () => M.Runtime.reload(),
            loadRecipe: recipe => M.Runtime.loadRecipe(recipe),
            repairNativeStorage: repairNative,
            getFrame: () => M.Runtime.frame(),
            getDocument: () => M.Runtime.document(),
            getWindow: () => M.Runtime.window(),
            getMode: () => M.Runtime.mode(),
            reapplyShim: () => M.Runtime.reapply(),
            modules: M
        };
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => { void boot(); }, { once: true });
    } else {
        void boot();
    }
})();
