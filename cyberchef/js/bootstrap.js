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

    function chromePresent() {
        const header = document.getElementById("zzx-header");
        const footer = document.getElementById("zzx-footer");
        return Boolean(header?.children.length && footer?.children.length);
    }

    function waitForChrome(maxMs = 3200) {
        if (chromePresent()) return Promise.resolve(true);
        return new Promise(resolve => {
            let finished = false;
            const done = result => {
                if (finished) return;
                finished = true;
                clearTimeout(timeout);
                window.removeEventListener("zzx:cyberchef-shell-ready", inspect);
                window.removeEventListener("zzx:frame:ready", inspect);
                window.removeEventListener("zzx:frame-ready", inspect);
                resolve(result);
            };
            const inspect = () => { if (chromePresent()) done(true); };
            const timeout = setTimeout(() => done(chromePresent()), maxMs);
            window.addEventListener("zzx:cyberchef-shell-ready", inspect);
            window.addEventListener("zzx:frame:ready", inspect);
            window.addEventListener("zzx:frame-ready", inspect);
        });
    }

    async function boot() {
        const source = document.getElementById(config.sourceId);
        const stored = Storage.read(config.storageKeys.source, config.defaultSource);
        const initialMode = stored === "native" ? "native" : "modified";
        if (source) source.value = initialMode;

        let started = false;
        let intersection = null;
        const startRuntime = (options = {}) => {
            intersection?.disconnect();
            intersection = null;
            started = true;
            const iframe = document.getElementById(config.frameId);
            // Once requested, never let iframe loading=lazy defer an explicit
            // button press or an actual IntersectionObserver intersection.
            if (iframe) iframe.loading = "eager";
            return M.Runtime.load(M.Runtime.selectedMode(), options);
        };
        document.getElementById(config.loadButtonId)?.addEventListener("click", () => {
            void startRuntime({ force: true });
        });
        document.getElementById(config.refreshButtonId)?.addEventListener("click", () => {
            if (started) void M.Runtime.reload();
            else void startRuntime({ force: true });
        });
        document.getElementById("cz-repair-native")?.addEventListener("click", () => { void repairNative(false); });
        source?.addEventListener("change", () => { void startRuntime({ force: true }); });

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

        // Don't start CyberChef's 13MB engine while header/nav/footer fetches
        // are still outstanding.  The independent shell-first loader has a
        // bounded timeout, so it never deadlocks offline operation.
        await waitForChrome();
        window.ZZXCyberChef = {
            load: (...args) => {
                intersection?.disconnect();
                started = true;
                const iframe = document.getElementById(config.frameId);
                if (iframe) iframe.loading = "eager";
                return M.Runtime.load(...args);
            },
            reload: () => started ? M.Runtime.reload() : startRuntime({ force: true }),
            loadRecipe: recipe => {
                intersection?.disconnect();
                started = true;
                const iframe = document.getElementById(config.frameId);
                if (iframe) iframe.loading = "eager";
                return M.Runtime.loadRecipe(recipe);
            },
            repairNativeStorage: repairNative,
            getFrame: () => M.Runtime.frame(),
            getDocument: () => M.Runtime.document(),
            getWindow: () => M.Runtime.window(),
            getMode: () => M.Runtime.mode(),
            reapplyShim: () => M.Runtime.reapply(),
            modules: M
        };

        M.Status?.frame("Standby");
        M.Status?.set("Page loaded. CyberChef starts automatically near its workspace, or press Load to start now.");

        const runtime = document.getElementById(config.runtimeId || "cz-runtime");
        if (runtime && "IntersectionObserver" in window) {
            intersection = new IntersectionObserver(entries => {
                if (!started && entries.some(entry => entry.isIntersecting)) {
                    void startRuntime({ force: true });
                }
            }, { rootMargin: matchMedia("(max-width: 760px)").matches ? "120px 0px" : "360px 0px" });
            intersection.observe(runtime);
        } else {
            // Compatibility path for browsers lacking IntersectionObserver.
            const startOnScroll = () => {
                window.removeEventListener("scroll", startOnScroll);
                void startRuntime({ force: true });
            };
            window.addEventListener("scroll", startOnScroll, { passive: true, once: true });
            // The Load button still works when no scrolling is possible.
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => { void boot(); }, { once: true });
    } else {
        void boot();
    }
})();
