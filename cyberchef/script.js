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
        } catch (err) {}
    }

    function load(key, fallback = null) {
        try {
            return localStorage.getItem(key) ?? fallback;
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

            options.theme = "dark";
            options.wordWrap = true;
            options.showErrors = true;
            options.updateUrl = true;

            localStorage.setItem("options", JSON.stringify(options));

            document.documentElement.classList.remove("classic");
            document.documentElement.classList.add("dark");
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

    function updateStatus(text) {
        const el = $("cz-status");

        if (el) {
            el.textContent = text;
        }
    }

    function updateSourceLabel(source) {
        const el = $("cz-active-source");

        if (el) {
            el.textContent = getSourceLabel(source);
        }
    }

    function updateRuntimeState(text) {
        const el = $("cz-frame-state");

        if (el) {
            el.textContent = text;
        }
    }

    function getSourceValue() {
        return $("cz-source")?.value || cfg().defaultSource || "modified";
    }

    function setSourceValue(value) {
        const source = $("cz-source");

        if (source) {
            source.value = value;
        }
    }

    function loadExternalSource(source) {
        if (source === "upstream") {
            updateStatus("Opening GCHQ CyberChef...");
            updateRuntimeState("Opening Upstream");

            window.open(
                cfg().upstreamUrl || "https://gchq.github.io/CyberChef/",
                "_blank",
                "noopener"
            );

            return;
        }

        updateStatus("Opening native local CyberChef...");
        updateRuntimeState("Opening Native");

        window.location.href =
            cfg().nativeUrl || "./app/";
    }

    function rewriteNodeURLs(root) {
        const attrs = ["src", "href", "data"];

        root.querySelectorAll("*").forEach((node) => {
            for (const attr of attrs) {
                const value = node.getAttribute(attr);

                if (!value) {
                    continue;
                }

                if (
                    value.startsWith("assets/") ||
                    value.startsWith("./assets/")
                ) {
                    node.setAttribute(
                        attr,
                        value.replace(/^\.?\/?assets\//, "app/assets/")
                    );
                }

                if (
                    value === "styles.css" ||
                    value === "./styles.css"
                ) {
                    node.setAttribute(attr, "app/styles.css");
                }

                if (
                    value === "script.js" ||
                    value === "./script.js"
                ) {
                    node.setAttribute(attr, "app/script.js");
                }
            }
        });
    }

    function collectExecutableScripts(doc) {
        const scripts = [];

        doc.querySelectorAll("script").forEach((script) => {
            scripts.push({
                src: script.getAttribute("src"),
                text: script.textContent || "",
                type: script.getAttribute("type") || ""
            });

            script.remove();
        });

        return scripts;
    }

    function executeScript(entry) {
        return new Promise((resolve, reject) => {
            const script = document.createElement("script");

            if (entry.type) {
                script.type = entry.type;
            }

            if (entry.src) {
                let src = entry.src;

                if (
                    src.startsWith("assets/") ||
                    src.startsWith("./assets/")
                ) {
                    src = src.replace(/^\.?\/?assets\//, "app/assets/");
                }

                if (
                    src === "script.js" ||
                    src === "./script.js"
                ) {
                    src = "app/script.js";
                }

                script.src = src;
                script.onload = resolve;
                script.onerror = reject;

                document.body.appendChild(script);
                return;
            }

            script.textContent = entry.text;
            document.body.appendChild(script);
            resolve();
        });
    }

    async function runScriptsSequentially(scripts) {
        for (const script of scripts) {
            await executeScript(script);
        }
    }

    async function loadCyberChefFragment() {
        const runtime = $("cz-runtime");

        if (!runtime) {
            updateRuntimeState("Error");
            updateStatus("Missing #cz-runtime container.");
            return;
        }

        updateRuntimeState("Fetching");
        updateStatus("Fetching CyberChefZZX runtime...");

        const response = await fetch("./cyberchef.html", {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(
                `Failed to fetch cyberchef.html: HTTP ${response.status}`
            );
        }

        const html = await response.text();

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        rewriteNodeURLs(doc);

        const scripts = collectExecutableScripts(doc);

        runtime.innerHTML = "";

        Array.from(doc.body.childNodes).forEach((node) => {
            runtime.appendChild(
                document.importNode(node, true)
            );
        });

        updateRuntimeState("Executing");
        updateStatus("Executing CyberChef runtime scripts...");

        await runScriptsSequentially(scripts);

        updateRuntimeState("Ready");
        updateStatus("CyberChefZZX workspace ready.");

        document.documentElement.classList.add("cz-ready");
        document.documentElement.classList.remove("cz-loading");
        document.documentElement.classList.remove("cz-error");

        window.dispatchEvent(
            new CustomEvent("zzx-cyberchef-ready", {
                detail: {
                    source: "modified",
                    version: cfg().version || "v11.0.0"
                }
            })
        );
    }

    async function loadCyberChef() {
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

        try {
            document.documentElement.classList.add("cz-loading");
            document.documentElement.classList.remove("cz-ready");
            document.documentElement.classList.remove("cz-error");

            installStorageShim();
            setDefaultOptions();

            await loadCyberChefFragment();
        } catch (err) {
            console.error(err);

            updateRuntimeState("Error");
            updateStatus(err.message || "CyberChefZZX failed to load.");

            document.documentElement.classList.add("cz-error");
            document.documentElement.classList.remove("cz-loading");
        }
    }

    function refreshCyberChef() {
        const runtime = $("cz-runtime");

        if (runtime) {
            runtime.innerHTML = `
                <div class="cz-runtime-loading">
                    <strong>Reloading CyberChefZZX Runtime...</strong>
                    <br>
                    Fetching native CyberChef workspace...
                </div>
            `;
        }

        loadCyberChef();
    }

    ready(() => {
        const savedSource = load(
            cfg().storageKeys?.source || "zzxCyberChefSource",
            cfg().defaultSource || "modified"
        );

        const cleanSource =
            savedSource === "modified" ||
            savedSource === "native" ||
            savedSource === "upstream"
                ? savedSource
                : "modified";

        setSourceValue(cleanSource);

        $("cz-load")?.addEventListener("click", loadCyberChef);
        $("cz-refresh")?.addEventListener("click", refreshCyberChef);

        installStorageShim();
        setDefaultOptions();

        loadCyberChef();

        console.info("[CyberChefZZX] Fragment runtime loader initialized.");
    });
})();