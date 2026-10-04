(() => {
    "use strict";

    const config = window.ZZX?.CYBERCHEF || {};
    const $ = (id) => document.getElementById(id);
    let currentSource = config.defaultSource || "modified";
    let loadSerial = 0;

    function ready(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn, { once: true });
        } else {
            fn();
        }
    }

    function getStorage(key, fallback = null) {
        try {
            return localStorage.getItem(key) ?? fallback;
        } catch (err) {
            return fallback;
        }
    }

    function setStorage(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (err) {}
    }

    function status(text, error = false) {
        const node = $(config.statusId || "cz-status");
        if (!node) return;
        node.textContent = text;
        node.classList.toggle("cz-error", Boolean(error));
    }

    function state(text) {
        const node = $(config.frameStateId || "cz-frame-state");
        if (node) node.textContent = text;
    }

    function active(text) {
        const node = $(config.activeSourceId || "cz-active-source");
        if (node) node.textContent = text;
    }

    function modeCard(text) {
        const node = $("cz-mode-card");
        if (node) node.textContent = text;
    }

    function frame() {
        return $(config.frameId || "cz-frame");
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

    function setVersion(value) {
        const version = value
            ? (String(value).startsWith("v") ? String(value) : `v${value}`)
            : "latest";

        config.version = version;
        document.querySelectorAll("[data-zzx-cyberchef-version]")
            .forEach((node) => { node.textContent = version; });
    }

    async function loadManifest() {
        try {
            const response = await fetch(config.manifestUrl || "./runtime-manifest.json", {
                cache: "no-store"
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const manifest = await response.json();
            setVersion(manifest?.release?.tag || manifest?.release?.version || null);
            return manifest;
        } catch (err) {
            console.warn("[CyberChefZZX] runtime manifest unavailable", err);
            setVersion(null);
            return null;
        }
    }

    function localAppReady(doc) {
        return Boolean(
            doc &&
            doc.querySelector("#workspace-wrapper") &&
            doc.querySelector("#operations") &&
            doc.querySelector("#recipe") &&
            doc.querySelector("#IO")
        );
    }

    function clearModifiedLayer() {
        const doc = frameDocument();
        if (!doc) return;

        doc.querySelectorAll("link[data-zzx-cyberchef-layer]")
            .forEach((node) => node.remove());

        doc.documentElement.classList.remove("zzx-cyberchef-modified");
        doc.documentElement.removeAttribute("data-zzx-theme");
    }

    function applyInternalTheme(theme) {
        const doc = frameDocument();
        if (!doc || currentSource !== "modified") return;
        doc.documentElement.dataset.zzxTheme = theme || "tactical";
    }

    function installModifiedLayer() {
        if (currentSource !== "modified") return false;

        const doc = frameDocument();
        if (!localAppReady(doc)) return false;

        clearModifiedLayer();

        for (const href of (config.modifiedStylesheets || [])) {
            const link = doc.createElement("link");
            link.rel = "stylesheet";
            link.href = new URL(href, window.location.href).href;
            link.dataset.zzxCyberchefLayer = "true";
            doc.head.appendChild(link);
        }

        doc.documentElement.classList.add("zzx-cyberchef-modified");
        applyInternalTheme(
            getStorage(config.storageKeys?.theme || "zzxCyberChefThemeV2", "tactical")
        );

        return true;
    }

    function sourceSpec(source) {
        if (source === "native") {
            return {
                label: "Native Local CyberChef",
                mode: "Native",
                url: config.nativeUrl || "./app/index.html",
                local: true
            };
        }

        if (source === "upstream") {
            return {
                label: "GCHQ Hosted CyberChef",
                mode: "Upstream",
                url: config.upstreamUrl || "https://gchq.github.io/CyberChef/",
                local: false
            };
        }

        return {
            label: "CyberChefZZX Modified Instance",
            mode: "ZZX Modified",
            url: config.modifiedUrl || "./app/index.html",
            local: true
        };
    }

    function loadSource(source, reload = true) {
        const allowed = new Set(["modified", "native", "upstream"]);
        currentSource = allowed.has(source) ? source : "modified";
        setStorage(config.storageKeys?.source || "zzxCyberChefSourceV2", currentSource);

        const spec = sourceSpec(currentSource);
        const target = frame();
        const select = $(config.sourceId || "cz-source");

        if (select) select.value = currentSource;
        active(spec.label);
        modeCard(spec.mode);
        state("Loading");
        status(`Loading ${spec.label}…`);

        if (!target) {
            state("Error");
            status("CyberChef runtime frame is missing from this page.", true);
            return;
        }

        loadSerial += 1;
        target.dataset.loadSerial = String(loadSerial);

        const wanted = new URL(spec.url, window.location.href).href;
        if (reload || target.src !== wanted) {
            target.src = wanted;
        } else {
            onFrameLoad();
        }
    }

    function refresh() {
        const target = frame();
        if (!target) return;
        state("Reloading");
        status("Reloading CyberChef runtime…");
        loadSource(currentSource, true);
    }

    function loadRecipe(recipe) {
        if (!recipe) return;

        if (currentSource === "upstream") {
            const url = new URL(config.upstreamUrl || "https://gchq.github.io/CyberChef/");
            url.hash = `recipe=${encodeURIComponent(recipe)}`;
            window.open(url.href, "_blank", "noopener");
            return;
        }

        const target = frame();
        if (!target) return;

        if (currentSource !== "modified") {
            currentSource = "modified";
            const select = $(config.sourceId || "cz-source");
            if (select) select.value = "modified";
        }

        const url = new URL(config.modifiedUrl || "./app/index.html", window.location.href);
        url.hash = `recipe=${encodeURIComponent(recipe)}`;
        target.src = url.href;
    }

    function onFrameLoad() {
        const spec = sourceSpec(currentSource);

        if (!spec.local) {
            state("Ready");
            status(`${spec.label} loaded.`);
            return;
        }

        const doc = frameDocument();
        if (!localAppReady(doc)) {
            state("Runtime missing");
            status(
                "Local CyberChef did not load. /cyberchef/app/index.html is missing or is not the CyberChef production build. Run the ZZX-CyberChef workflow and confirm it committed cyberchef/app/ to the website branch.",
                true
            );
            return;
        }

        if (currentSource === "modified") {
            installModifiedLayer();
            setTimeout(installModifiedLayer, 150);
            setTimeout(installModifiedLayer, 700);
        } else {
            clearModifiedLayer();
        }

        state("Ready");
        status(`${spec.label} ready${config.version ? ` — ${config.version}` : ""}.`);
        setStorage(
            config.storageKeys?.lastLoaded || "zzxCyberChefLastLoadedV2",
            new Date().toISOString()
        );

        window.dispatchEvent(new CustomEvent("zzx-cyberchef-ready", {
            detail: { source: currentSource, frame: frame() }
        }));
    }

    function boot() {
        loadManifest();

        const target = frame();
        if (!target) {
            status("CyberChef runtime frame is missing from this page.", true);
            return;
        }

        target.addEventListener("load", onFrameLoad);

        $(config.loadButtonId || "cz-load")?.addEventListener("click", () => {
            loadSource($(config.sourceId || "cz-source")?.value || "modified", true);
        });

        $(config.refreshButtonId || "cz-refresh")?.addEventListener("click", refresh);

        const saved = getStorage(
            config.storageKeys?.source || "zzxCyberChefSourceV2",
            config.defaultSource || "modified"
        );

        loadSource(saved, target.getAttribute("src") !== sourceSpec(saved).url);
    }

    window.ZZXCyberChef = {
        frame,
        frameDocument,
        frameWindow,
        loadSource,
        refresh,
        loadRecipe,
        installModifiedLayer,
        clearModifiedLayer,
        applyInternalTheme,
        get source() { return currentSource; }
    };

    ready(boot);
})();
