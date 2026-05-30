(() => {
    "use strict";

    function $(id) {
        return document.getElementById(id);
    }

    function cfg() {
        return window.ZZX?.CYBERCHEF || {};
    }

    function ready(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn);
            return;
        }

        fn();
    }

    function save(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (err) {
            console.warn(err);
        }
    }

    function load(key, fallback = null) {
        try {
            const value = localStorage.getItem(key);
            return value ?? fallback;
        } catch (err) {
            return fallback;
        }
    }

    function memoryStorage() {
        let mem = {};

        return {
            getItem(key) {
                return Object.prototype.hasOwnProperty.call(mem, key)
                    ? mem[key]
                    : null;
            },

            setItem(key, value) {
                mem[key] = String(value);
            },

            removeItem(key) {
                delete mem[key];
            },

            clear() {
                mem = {};
            },

            key(index) {
                return Object.keys(mem)[index] || null;
            },

            get length() {
                return Object.keys(mem).length;
            }
        };
    }

    function storageWorks(name) {
        try {
            const storage = window[name];
            const key = "__zzx_storage_test__";

            storage.setItem(key, "1");
            storage.removeItem(key);

            return true;
        } catch (err) {
            return false;
        }
    }

    function installStorageShim() {
        try {
            if (!storageWorks("localStorage")) {
                Object.defineProperty(window, "localStorage", {
                    configurable: true,
                    value: memoryStorage()
                });
            }
        } catch (err) {}

        try {
            if (!storageWorks("sessionStorage")) {
                Object.defineProperty(window, "sessionStorage", {
                    configurable: true,
                    value: memoryStorage()
                });
            }
        } catch (err) {}

        try {
            const originalSetItem = Storage.prototype.setItem;

            Storage.prototype.setItem = function (key, value) {
                try {
                    return originalSetItem.call(this, key, value);
                } catch (err) {
                    if (
                        err &&
                        (
                            err.name === "QuotaExceededError" ||
                            err.name === "NS_ERROR_DOM_QUOTA_REACHED"
                        )
                    ) {
                        return null;
                    }

                    throw err;
                }
            };
        } catch (err) {}
    }

    function setDefaultOptions() {
        try {
            const existing = localStorage.getItem("options");
            const options = existing ? JSON.parse(existing) : {};

            options.theme = options.theme || "dark";
            options.wordWrap = true;
            options.showErrors = true;
            options.updateUrl = true;

            localStorage.setItem("options", JSON.stringify(options));
        } catch (err) {}
    }

    function getSourceLabel(source) {
        if (source === "upstream") {
            return "GCHQ CyberChef";
        }

        if (source === "native") {
            return "Native Local CyberChef";
        }

        return "CyberChefZZX Modified Instance";
    }

    function getSourceURL(source) {
        const c = cfg();

        if (source === "upstream") {
            return c.upstreamUrl || "https://gchq.github.io/CyberChef/";
        }

        if (source === "native") {
            return c.nativeUrl || "./app/";
        }

        return c.modifiedUrl || "./";
    }

    function updateStatus(text) {
        const c = cfg();
        const el = $(c.statusId || "cz-status");

        if (!el) {
            return;
        }

        el.textContent = text;
    }

    function updateSourceLabel(source) {
        const c = cfg();
        const el = $(c.activeSourceId || "cz-active-source");

        if (!el) {
            return;
        }

        el.textContent = getSourceLabel(source);
    }

    function updateRuntimeState(text) {
        const c = cfg();
        const el = $(c.frameStateId || "cz-frame-state");

        if (!el) {
            return;
        }

        el.textContent = text;
    }

    function setSourceValue(value) {
        const c = cfg();
        const source = $(c.sourceId || "cz-source");

        if (source) {
            source.value = value;
        }
    }

    function getSourceValue() {
        const c = cfg();
        const source = $(c.sourceId || "cz-source");

        return source?.value || c.defaultSource || "modified";
    }

    function loadExternalSource(source) {
        const url = getSourceURL(source);

        updateStatus(`Opening ${getSourceLabel(source)}...`);
        updateRuntimeState("Redirecting");

        window.location.href = url;
    }

    function loadCyberChefMain() {
        if (document.querySelector("script[data-cz-main='true']")) {
            return;
        }

        const script = document.createElement("script");

        script.src = "app/assets/main.js";
        script.defer = false;
        script.dataset.czMain = "true";

        script.onload = () => {
            updateRuntimeState("Ready");
            updateStatus("CyberChefZZX modified instance loaded.");
        };

        script.onerror = () => {
            updateRuntimeState("Error");
            updateStatus("Failed to load app/assets/main.js.");
            document.documentElement.classList.add("cz-error");
        };

        document.head.appendChild(script);
    }

    function loadCyberChef() {
        const source = getSourceValue();

        updateSourceLabel(source);

        save(
            cfg().storageKeys?.source || "zzxCyberChefSource",
            source
        );

        save(
            cfg().storageKeys?.lastLoaded || "zzxCyberChefLastLoaded",
            new Date().toISOString()
        );

        if (source === "native" || source === "upstream") {
            loadExternalSource(source);
            return;
        }

        updateStatus("Loading CyberChefZZX modified instance...");
        updateRuntimeState("Loading");

        installStorageShim();
        setDefaultOptions();
        loadCyberChefMain();
    }

    function refreshCyberChef() {
        const source = getSourceValue();

        updateRuntimeState("Refreshing");

        if (source === "native" || source === "upstream") {
            loadExternalSource(source);
            return;
        }

        window.location.reload();
    }

    function waitForCyberChef() {
        let attempts = 0;

        const timer = setInterval(() => {
            attempts += 1;

            const readyNode =
                document.querySelector("#workspace-wrapper") ||
                document.querySelector("#content-wrapper") ||
                document.querySelector("#operations") ||
                document.querySelector("#recipe") ||
                document.querySelector("#input") ||
                document.querySelector("#output");

            if (readyNode) {
                clearInterval(timer);

                document.documentElement.classList.add("cz-ready");
                document.documentElement.classList.remove("cz-loading");

                updateRuntimeState("Ready");
                updateStatus("CyberChefZZX workspace ready.");

                window.dispatchEvent(
                    new CustomEvent("zzx-cyberchef-ready", {
                        detail: {
                            source: "modified",
                            version: cfg().version || "v11.0.0"
                        }
                    })
                );

                return;
            }

            if (attempts > 300) {
                clearInterval(timer);

                updateRuntimeState("Timeout");
                updateStatus("CyberChefZZX did not finish initializing.");
                document.documentElement.classList.add("cz-error");
            }
        }, 250);
    }

    ready(() => {
        const c = cfg();

        const source = $(c.sourceId || "cz-source");
        const loadButton = $(c.loadButtonId || "cz-load");
        const refreshButton = $(c.refreshButtonId || "cz-refresh");

        const savedSource = load(
            c.storageKeys?.source || "zzxCyberChefSource",
            c.defaultSource || "modified"
        );

        if (source) {
            source.value = savedSource;
        }

        loadButton?.addEventListener("click", loadCyberChef);
        refreshButton?.addEventListener("click", refreshCyberChef);

        document.documentElement.classList.add("cz-loading");

        installStorageShim();
        setDefaultOptions();

        setSourceValue(savedSource);

        if (savedSource === "modified") {
            loadCyberChef();
            waitForCyberChef();
        } else {
            updateSourceLabel(savedSource);
            updateStatus(`${getSourceLabel(savedSource)} selected. Click Load to open.`);
            updateRuntimeState("Waiting");
        }

        console.info("[CyberChefZZX] Initialized.");
    });
})();