(() => {
    "use strict";

    const config = window.ZZX?.CYBERCHEF || {};
    let currentSource = config.defaultSource || "modified";

    const $ = (id) => document.getElementById(id);

    function ready(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn, { once: true });
        } else {
            fn();
        }
    }

    function storageGet(key, fallback = null) {
        try {
            return localStorage.getItem(key) ?? fallback;
        } catch (err) {
            return fallback;
        }
    }

    function storageSet(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (err) {}
    }

    function status(text, isError = false) {
        const el = $(config.statusId || "cz-status");
        if (!el) return;
        el.textContent = text;
        el.classList.toggle("cz-error", Boolean(isError));
    }

    function state(text) {
        const el = $(config.frameStateId || "cz-frame-state");
        if (el) el.textContent = text;
    }

    function active(text) {
        const el = $(config.activeSourceId || "cz-active-source");
        if (el) el.textContent = text;
    }

    function frame() {
        return $(config.frameId || "cz-frame");
    }

    function frameWindow() {
        try {
            return frame()?.contentWindow || null;
        } catch (err) {
            return null;
        }
    }

    function frameDocument() {
        try {
            return frame()?.contentDocument || null;
        } catch (err) {
            return null;
        }
    }

    function setVersion(version) {
        const value = version && String(version).startsWith("v")
            ? String(version)
            : version ? `v${version}` : "latest";

        document.querySelectorAll("[data-zzx-cyberchef-version]")
            .forEach((node) => {
                node.textContent = value;
            });

        config.version = value;
    }

    async function loadManifest() {
        try {
            const response = await fetch(config.manifestUrl || "./runtime-manifest.json", {
                cache: "no-store"
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const manifest = await response.json();
            const release = manifest?.release || {};
            setVersion(release.tag || release.version || "latest");
            config.release = release;
            return manifest;
        } catch (err) {
            console.warn("[CyberChefZZX] runtime manifest unavailable:", err);
            setVersion("latest");
            return null;
        }
    }

    function forceFrameDark() {
        if (currentSource === "upstream") return;

        const win = frameWindow();
        const doc = frameDocument();
        if (!win || !doc) return;

        try {
            const existing = win.localStorage.getItem("options");
            const options = existing ? JSON.parse(existing) : {};
            options.theme = "dark";
            options.wordWrap = true;
            options.showErrors = true;
            options.updateUrl = true;
            win.localStorage.setItem("options", JSON.stringify(options));
        } catch (err) {}

        try {
            doc.documentElement.classList.remove(
                "classic",
                "geocities",
                "solarizedDark",
                "solarizedLight"
            );
            doc.documentElement.classList.add("dark");

            const theme = doc.querySelector("#theme");
            if (theme && theme.value !== "dark") {
                theme.value = "dark";
                theme.dispatchEvent(new win.Event("change", { bubbles: true }));
            }
        } catch (err) {}
    }

    function removeFrameOverlay() {
        const doc = frameDocument();
        if (!doc) return;
        doc.getElementById("zzx-cyberchef-frame-style")?.remove();
        doc.documentElement.classList.remove("zzx-cyberchef-embedded");
        doc.body?.classList.remove("zzx-cyberchef-embedded-body");
    }

    function applyFrameOverlay() {
        if (currentSource !== "modified") return;

        const doc = frameDocument();
        if (!doc) return;

        removeFrameOverlay();

        const link = doc.createElement("link");
        link.id = "zzx-cyberchef-frame-style";
        link.rel = "stylesheet";
        link.href = new URL(config.frameStylesheet || "./frame.css", window.location.href).href;
        doc.head.appendChild(link);

        doc.documentElement.classList.add("zzx-cyberchef-embedded");
        doc.body?.classList.add("zzx-cyberchef-embedded-body");
        forceFrameDark();
    }

    function sourceSpec(source) {
        if (source === "native") {
            return {
                label: "Native Local CyberChef",
                url: config.nativeUrl || "./app/"
            };
        }
        if (source === "upstream") {
            return {
                label: "GCHQ Hosted CyberChef",
                url: config.upstreamUrl || "https://gchq.github.io/CyberChef/"
            };
        }
        return {
            label: "CyberChefZZX Modified Instance",
            url: config.modifiedUrl || "./app/"
        };
    }

    function setSource(source, forceReload = true) {
        const allowed = ["modified", "native", "upstream"];
        currentSource = allowed.includes(source) ? source : "modified";
        storageSet(config.storageKeys?.source || "zzxCyberChefSource", currentSource);

        const select = $(config.sourceId || "cz-source");
        if (select) select.value = currentSource;

        const spec = sourceSpec(currentSource);
        active(spec.label);
        state("Loading");
        status(`Loading ${spec.label}…`);

        const target = frame();
        if (!target) {
            status("CyberChef runtime frame is missing.", true);
            state("Error");
            return;
        }

        if (forceReload || target.src !== new URL(spec.url, window.location.href).href) {
            target.src = spec.url;
        } else if (currentSource === "modified") {
            applyFrameOverlay();
        } else if (currentSource === "native") {
            removeFrameOverlay();
        }
    }

    function refresh() {
        const target = frame();
        if (!target) return;
        state("Reloading");
        status("Reloading CyberChef runtime…");
        try {
            target.contentWindow.location.reload();
        } catch (err) {
            target.src = target.src;
        }
    }

    function loadRecipe(recipe) {
        const target = frame();
        if (!target || !recipe) return;

        if (currentSource === "upstream") {
            window.open(
                `${config.upstreamUrl || "https://gchq.github.io/CyberChef/"}#recipe=${encodeURIComponent(recipe)}`,
                "_blank",
                "noopener"
            );
            return;
        }

        const url = new URL(config.nativeUrl || "./app/", window.location.href);
        url.hash = `recipe=${encodeURIComponent(recipe)}`;
        target.src = url.href;
        if (currentSource !== "modified") currentSource = "modified";
    }

    function onFrameLoad() {
        const spec = sourceSpec(currentSource);

        if (currentSource === "modified") {
            applyFrameOverlay();
            setTimeout(applyFrameOverlay, 250);
            setTimeout(forceFrameDark, 900);
        } else if (currentSource === "native") {
            removeFrameOverlay();
        }

        state("Ready");
        status(`${spec.label} ready${config.version ? ` — ${config.version}` : ""}.`);
        storageSet(config.storageKeys?.lastLoaded || "zzxCyberChefLastLoaded", new Date().toISOString());

        window.dispatchEvent(new CustomEvent("zzx-cyberchef-ready", {
            detail: { source: currentSource, frame: frame() }
        }));
    }

    function boot() {
        loadManifest();

        const target = frame();
        if (!target) {
            status("CyberChef runtime frame is missing.", true);
            return;
        }

        target.addEventListener("load", onFrameLoad);

        $(config.loadButtonId || "cz-load")?.addEventListener("click", () => {
            const source = $(config.sourceId || "cz-source")?.value || "modified";
            setSource(source, true);
        });

        $(config.refreshButtonId || "cz-refresh")?.addEventListener("click", refresh);

        const saved = storageGet(
            config.storageKeys?.source || "zzxCyberChefSource",
            config.defaultSource || "modified"
        );

        setSource(saved, target.getAttribute("src") !== sourceSpec(saved).url);
    }

    window.ZZXCyberChef = {
        frame,
        frameWindow,
        frameDocument,
        setSource,
        refresh,
        loadRecipe,
        applyFrameOverlay,
        removeFrameOverlay,
        forceFrameDark,
        get source() {
            return currentSource;
        }
    };

    ready(boot);
})();
