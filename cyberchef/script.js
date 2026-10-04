(() => {
    "use strict";

    const config = window.ZZX?.CYBERCHEF || {};
    const STORAGE = config.storageKeys || {};

    function byId(id) {
        return document.getElementById(id);
    }

    function readStorage(key, fallback = null) {
        try {
            return localStorage.getItem(key) ?? fallback;
        } catch (err) {
            return fallback;
        }
    }

    function writeStorage(key, value) {
        try {
            localStorage.setItem(key, String(value));
        } catch (err) {}
    }

    function setStatus(message, kind = "") {
        const node = byId(config.statusId || "cz-status");
        if (!node) return;
        node.textContent = message;
        node.classList.remove("cz-status-ready", "cz-status-error");
        if (kind === "ready") node.classList.add("cz-status-ready");
        if (kind === "error") node.classList.add("cz-status-error");
    }

    function setFrameState(message) {
        const node = byId(config.frameStateId || "cz-frame-state");
        if (node) node.textContent = message;
    }

    function setActiveLabel(mode) {
        const active = byId(config.activeSourceId || "cz-active-source");
        const card = byId("cz-mode-card");
        const modified = mode === "modified";
        if (active) active.textContent = modified ? "CyberChefZZX Modified" : "Native Local CyberChef";
        if (card) card.textContent = modified ? "ZZX Modified" : "Native Local";
        document.body.dataset.cyberchefMode = mode;
    }

    function frame() {
        return byId(config.frameId || "cz-frame");
    }

    function frameDocument() {
        try {
            return frame()?.contentDocument || null;
        } catch (err) {
            return null;
        }
    }

    function frameWindow() {
        try {
            return frame()?.contentWindow || null;
        } catch (err) {
            return null;
        }
    }

    function selectedMode() {
        const select = byId(config.sourceId || "cz-source");
        const value = select?.value || config.defaultSource || "modified";
        return value === "native" ? "native" : "modified";
    }

    function clearShim(doc) {
        doc.getElementById("zzx-cyberchef-shim")?.remove();
        doc.documentElement.classList.remove("zzx-cyberchef-modified");
        delete doc.documentElement.dataset.zzxTheme;
        delete doc.documentElement.dataset.zzxLayout;
    }

    function installShim(doc) {
        clearShim(doc);

        const link = doc.createElement("link");
        link.id = "zzx-cyberchef-shim";
        link.rel = "stylesheet";
        link.href = new URL(config.shimUrl || "./shim/shim.css", window.location.href).href;

        return new Promise((resolve, reject) => {
            link.addEventListener("load", () => resolve(link), { once: true });
            link.addEventListener("error", () => reject(new Error("ZZX CyberChef CSS shim failed to load.")), { once: true });
            doc.head.appendChild(link);
        });
    }

    function setModifiedRoot(doc) {
        doc.documentElement.classList.remove("classic", "geocities", "solarizedDark", "solarizedLight");
        doc.documentElement.classList.add("dark", "zzx-cyberchef-modified");

        const theme = readStorage(STORAGE.theme || "zzxCyberChefThemeV8", "tactical");
        const layout = readStorage(STORAGE.layout || "zzxCyberChefLayoutV8", "native");
        doc.documentElement.dataset.zzxTheme = theme;
        doc.documentElement.dataset.zzxLayout = layout;
    }

    function emitReady(mode) {
        const detail = { mode };
        window.dispatchEvent(new CustomEvent("zzx-cyberchef-frame-ready", { detail }));
        window.dispatchEvent(new CustomEvent("zzx-cyberchef-ready", { detail }));
    }

    async function handleFrameLoad(mode) {
        const doc = frameDocument();
        if (!doc || !doc.documentElement) {
            setFrameState("Error");
            setStatus("CyberChef loaded outside the expected same-origin local path.", "error");
            return;
        }

        const title = doc.querySelector("title")?.textContent || "";
        const hasBody = Boolean(doc.body && doc.documentElement);
        const hasRuntimeCode = Boolean(
            doc.querySelector('script[src], script:not([src])') ||
            doc.querySelector('link[rel="stylesheet"][href], style')
        );

        // Do not gate a valid upstream release on internal DOM IDs. CyberChef's
        // generated workspace markup is an implementation detail and can change
        // between releases. We only require a same-origin CyberChef document with
        // a normal document body and executable/styled runtime content.
        if (!/CyberChef/i.test(title) || !hasBody || !hasRuntimeCode) {
            setFrameState("Invalid runtime");
            setStatus("/cyberchef/app/ loaded, but it is not a complete CyberChef production document.", "error");
            return;
        }

        try {
            if (mode === "modified") {
                setFrameState("Applying ZZX shim…");
                await installShim(doc);
                setModifiedRoot(doc);
                setStatus("CyberChefZZX loaded: upstream CyberChef first, ZZX CSS shim second.", "ready");
            } else {
                clearShim(doc);
                setStatus("Native local CyberChef loaded with no ZZX CSS shim.", "ready");
            }

            setFrameState("Ready");
            emitReady(mode);
            window.ZZXCyberChefResize?.();
        } catch (err) {
            console.error("[CyberChefZZX]", err);
            setFrameState("Shim error");
            setStatus(err?.message || "CyberChefZZX shim failed to load.", "error");
        }
    }

    function loadRuntime(mode = selectedMode(), options = {}) {
        const node = frame();
        if (!node) return;

        const normalizedMode = mode === "native" ? "native" : "modified";
        const select = byId(config.sourceId || "cz-source");
        if (select) select.value = normalizedMode;

        writeStorage(STORAGE.source || "zzxCyberChefSourceV8", normalizedMode);
        setActiveLabel(normalizedMode);
        setFrameState("Loading…");
        setStatus(normalizedMode === "modified"
            ? "Loading local CyberChef, then applying the ZZX CSS shim…"
            : "Loading unmodified local CyberChef…");

        node.onload = () => handleFrameLoad(normalizedMode);

        const target = options.recipe
            ? `${config.nativeUrl || "./app/index.html"}#recipe=${encodeURIComponent(options.recipe)}`
            : (config.nativeUrl || "./app/index.html");

        const current = node.getAttribute("src") || "";
        if (current === target && !options.force) {
            try {
                node.contentWindow.location.reload();
                return;
            } catch (err) {}
        }

        node.setAttribute("src", target);
    }

    async function loadManifest() {
        try {
            const response = await fetch(config.manifestUrl || "./runtime-manifest.json", { cache: "no-store" });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const manifest = await response.json();
            const tag = manifest?.release?.tag || manifest?.release?.version || "latest";
            config.version = tag;
            document.querySelectorAll("[data-zzx-cyberchef-version]").forEach(node => {
                node.textContent = String(tag);
            });
        } catch (err) {
            console.warn("[CyberChefZZX] Runtime manifest unavailable:", err);
        }
    }

    function boot() {
        const select = byId(config.sourceId || "cz-source");
        const stored = readStorage(STORAGE.source || "zzxCyberChefSourceV8", config.defaultSource || "modified");
        const initialMode = stored === "native" ? "native" : "modified";
        if (select) select.value = initialMode;

        byId(config.loadButtonId || "cz-load")?.addEventListener("click", () => loadRuntime(selectedMode(), { force: true }));
        byId(config.refreshButtonId || "cz-refresh")?.addEventListener("click", () => loadRuntime(selectedMode(), { force: true }));
        select?.addEventListener("change", () => loadRuntime(selectedMode(), { force: true }));

        loadManifest();
        loadRuntime(initialMode, { force: true });
    }

    window.ZZXCyberChef = {
        load: loadRuntime,
        loadRecipe(recipe) {
            loadRuntime(selectedMode(), { recipe: String(recipe || ""), force: true });
        },
        getFrame: frame,
        getDocument: frameDocument,
        getWindow: frameWindow,
        getMode: selectedMode,
        reapplyShim() {
            if (selectedMode() === "modified") handleFrameLoad("modified");
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }
})();
