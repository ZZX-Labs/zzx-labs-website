(() => {
    "use strict";

    const M = window.ZZXCyberChefModules;
    const config = window.ZZX.CYBERCHEF;
    const Storage = M.Storage;
    const Status = M.Status;
    const keys = config.storageKeys;

    let currentMode = "modified";

    function frame() {
        return document.getElementById(config.frameId);
    }

    function frameDocument() {
        try { return frame()?.contentDocument || null; }
        catch (err) { return null; }
    }

    function frameWindow() {
        try { return frame()?.contentWindow || null; }
        catch (err) { return null; }
    }

    function clearShim(doc) {
        doc?.querySelectorAll("link[data-zzx-cyberchef-shim]").forEach(node => node.remove());
        if (!doc?.documentElement) return;
        doc.documentElement.classList.remove("zzx-cyberchef-modified");
        delete doc.documentElement.dataset.zzxTheme;
        delete doc.documentElement.dataset.zzxLayout;
    }

    function appendShim(doc) {
        clearShim(doc);
        const link = doc.createElement("link");
        link.rel = "stylesheet";
        link.dataset.zzxCyberchefShim = "1";
        link.href = new URL(config.shimUrl, window.location.href).href;
        return new Promise((resolve, reject) => {
            link.addEventListener("load", () => resolve(link), { once: true });
            link.addEventListener("error", () => reject(new Error("ZZX CSS shim failed to load.")), { once: true });
            doc.head.appendChild(link);
        });
    }

    function expectedNativeUrl() {
        return new URL(config.nativeUrl, window.location.href);
    }

    function sameOriginNative(win) {
        if (!win) return false;
        try {
            const actual = new URL(win.location.href);
            const expected = expectedNativeUrl();
            return actual.origin === window.location.origin && actual.pathname === expected.pathname;
        } catch (err) {
            return false;
        }
    }

    function hasCyberChefAssets(doc) {
        if (!doc) return false;
        const expected = expectedNativeUrl();
        const appBase = expected.pathname.replace(/index\.html$/, "");
        return Array.from(doc.querySelectorAll('script[src], link[rel="stylesheet"][href]')).some(node => {
            const raw = node.getAttribute("src") || node.getAttribute("href") || "";
            try {
                const url = new URL(raw, expected);
                return url.origin === window.location.origin && url.pathname.startsWith(`${appBase}assets/`);
            } catch (err) {
                return false;
            }
        });
    }

    function validate(doc, win) {
        const title = doc?.querySelector("title")?.textContent || "";
        return Boolean(
            doc?.documentElement &&
            doc?.head &&
            doc?.body &&
            sameOriginNative(win) &&
            /CyberChef/i.test(title) &&
            hasCyberChefAssets(doc)
        );
    }

    async function afterLoad(mode) {
        const doc = frameDocument();
        const win = frameWindow();
        if (!validate(doc, win)) {
            Status.frame("Invalid runtime");
            Status.set(
                "/cyberchef/app/ did not return the locally hosted CyberChef production document and assets.",
                "error"
            );
            return;
        }

        try {
            if (mode === "modified") {
                Status.frame("Applying ZZX modules…");
                await appendShim(doc);
                doc.documentElement.classList.remove("classic", "geocities", "solarizedDark", "solarizedLight");
                doc.documentElement.classList.add("dark", "zzx-cyberchef-modified");
                M.Themes?.applyCurrent(false);
                M.Layouts?.applyCurrent(false);
                Status.set("CyberChefZZX loaded: pristine CyberChef loaded first; ZZX CSS shim applied afterward.", "ready");
            } else {
                clearShim(doc);
                Status.set("Native local CyberChef loaded without ZZX override modules.", "ready");
            }

            Status.frame("Ready");
            window.dispatchEvent(new CustomEvent("zzx-cyberchef-frame-ready", { detail: { mode } }));
            M.Resize?.resize();
        } catch (err) {
            console.error("[CyberChefZZX]", err);
            Status.frame("Module error");
            Status.set(err?.message || "CyberChefZZX modules failed to load.", "error");
        }
    }

    function selectedMode() {
        const value = document.getElementById(config.sourceId)?.value || currentMode || config.defaultSource;
        return value === "native" ? "native" : "modified";
    }

    const Runtime = {
        frame,
        document: frameDocument,
        window: frameWindow,
        mode() { return currentMode; },
        selectedMode,

        load(mode = selectedMode(), options = {}) {
            const node = frame();
            if (!node) return;

            currentMode = mode === "native" ? "native" : "modified";
            const select = document.getElementById(config.sourceId);
            if (select) select.value = currentMode;

            Storage.write(keys.source, currentMode);
            Status.source(currentMode);
            Status.frame("Loading…");
            Status.set(currentMode === "modified"
                ? "Loading pristine local CyberChef, then applying ZZX CSS/JS modules…"
                : "Loading pristine local CyberChef…");

            node.onload = () => afterLoad(currentMode);

            const base = config.nativeUrl;
            const target = options.recipe
                ? `${base}#recipe=${encodeURIComponent(String(options.recipe))}`
                : base;

            const current = node.getAttribute("src") || "";
            if (current === target && options.force) {
                try {
                    node.contentWindow.location.reload();
                    return;
                } catch (err) {}
            }
            node.setAttribute("src", target);
        },

        reload() {
            this.load(currentMode, { force: true });
        },

        loadRecipe(recipe) {
            this.load(currentMode, { recipe, force: true });
        },

        reapply() {
            if (currentMode === "modified") afterLoad("modified");
        }
    };

    M.Runtime = Runtime;
})();
