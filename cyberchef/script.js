(() => {
"use strict";

const RUNTIME_HTML = "./cyberchef.html";  

function $(id) {  
    return document.getElementById(id);  
}  

function ready(fn) {  
    if (document.readyState === "loading") {  
        document.addEventListener("DOMContentLoaded", fn);  
    } else {  
        fn();  
    }  
}  

function status(text) {  
    const el = $("cz-status");  
    if (el) el.textContent = text;  
}  

function state(text) {  
    const el = $("cz-frame-state");  
    if (el) el.textContent = text;  
}  

function memoryStorage() {  
    let mem = {};  
    return {  
        getItem(k) {  
            return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;  
        },  
        setItem(k, v) {  
            mem[k] = String(v);  
        },  
        removeItem(k) {  
            delete mem[k];  
        },  
        clear() {  
            mem = {};  
        },  
        key(i) {  
            return Object.keys(mem)[i] || null;  
        },  
        get length() {  
            return Object.keys(mem).length;  
        }  
    };  
}  

function safeStorage(name) {  
    try {  
        const s = window[name];  
        const k = "__zzx_storage_test__";  
        s.setItem(k, "1");  
        s.removeItem(k);  
    } catch (err) {  
        try {  
            Object.defineProperty(window, name, {  
                configurable: true,  
                value: memoryStorage()  
            });  
        } catch (ignored) {}  
    }  
}  

function installStorageShim() {  
    safeStorage("localStorage");  
    safeStorage("sessionStorage");  

    try {  
        const original = Storage.prototype.setItem;  

        Storage.prototype.setItem = function (key, value) {  
            try {  
                return original.call(this, key, value);  
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
    } catch (ignored) {}  
}  

function forceDark() {  
    try {  
        localStorage.setItem(  
            "options",  
            JSON.stringify({  
                theme: "dark",  
                wordWrap: true,  
                showErrors: true,  
                updateUrl: true  
            })  
        );  
    } catch (ignored) {}  

    try {  
        document.documentElement.classList.remove(  
            "classic",  
            "geocities",  
            "solarizedDark",  
            "solarizedLight"  
        );  
        document.documentElement.classList.add("dark");  
    } catch (ignored) {}  
}  

function normalizeUrl(value) {  
    if (!value) return value;  

    if (value.startsWith("assets/")) {  
        return `app/${value}`;  
    }  

    if (value.startsWith("./assets/")) {  
        return value.replace("./assets/", "app/assets/");  
    }  

    if (value === "script.js" || value === "./script.js") {  
        return "app/script.js";  
    }  

    if (value === "styles.css" || value === "./styles.css") {  
        return "app/styles.css";  
    }  

    return value;  
}  

function installContainmentCss() {  
    let style = document.getElementById("cz-runtime-containment-css");  

    if (style) {  
        style.remove();  
    }  

    style = document.createElement("style");  
    style.id = "cz-runtime-containment-css";  
    style.dataset.czRuntimeAsset = "true";  

    style.textContent = `  
        #cz-runtime {  
            position: relative !important;  
            min-height: 960px !important;  
            overflow: auto !important;  
            background: #111 !important;  
            isolation: isolate !important;  
        }  

        #cz-runtime #loader-wrapper {  
            position: absolute !important;  
            inset: 0 !important;  
            width: 100% !important;  
            height: 100% !important;  
            z-index: 10 !important;  
        }  

        html.cz-ready #cz-runtime #loader-wrapper,  
        #cz-runtime.cz-runtime-ready #loader-wrapper {  
            display: none !important;  
            visibility: hidden !important;  
            pointer-events: none !important;  
        }  

        #cz-runtime #content-wrapper,  
        #cz-runtime #workspace-wrapper {  
            max-width: none !important;  
        }  
    `;  

    document.head.appendChild(style);  
}  

function removeRuntimeAssets() {  
    document  
        .querySelectorAll("[data-cz-runtime-asset='true']")  
        .forEach((node) => node.remove());  
}  

function installStyles(doc) {  
    doc.querySelectorAll("link[rel='stylesheet']").forEach((link) => {  
        const href = normalizeUrl(link.getAttribute("href"));  
        if (!href) return;  

        const out = document.createElement("link");  
        out.rel = "stylesheet";  
        out.href = href;  
        out.dataset.czRuntimeAsset = "true";  
        document.head.appendChild(out);  
    });  

    installContainmentCss();  

    ["./upgrades.css", "./modifications.css"].forEach((href) => {  
        const out = document.createElement("link");  
        out.rel = "stylesheet";  
        out.href = href;  
        out.dataset.czRuntimeAsset = "true";  
        document.head.appendChild(out);  
    });  
}  

function collectScripts(doc) {  
    const scripts = [];  

    doc.querySelectorAll("script").forEach((script) => {  
        scripts.push({  
            src: normalizeUrl(script.getAttribute("src")),  
            type: script.getAttribute("type") || "",  
            text: script.textContent || ""  
        });  
        script.remove();  
    });  

    return scripts;  
}  

function rewriteInlineUrls(root) {  
    root.querySelectorAll("*").forEach((node) => {  
        ["src", "href", "data"].forEach((attr) => {  
            const value = node.getAttribute(attr);  
            if (!value) return;  
            node.setAttribute(attr, normalizeUrl(value));  
        });  
    });  
}  

function executeScript(entry) {  
    return new Promise((resolve, reject) => {  
        const script = document.createElement("script");  
        script.dataset.czRuntimeAsset = "true";  

        if (entry.type) {  
            script.type = entry.type;  
        }  

        if (entry.src) {  
            script.src = entry.src;  
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

async function executeScripts(scripts) {  
    for (const script of scripts) {  
        await executeScript(script);  
    }  
}  

function releaseLoaderWhenReady() {  
    let attempts = 0;  

    const timer = setInterval(() => {  
        attempts += 1;  

        const runtime = $("cz-runtime");  

        const readyNode =  
            document.querySelector("#workspace-wrapper") ||  
            document.querySelector("#content-wrapper") ||  
            document.querySelector("#operations") ||  
            document.querySelector("#recipe") ||  
            document.querySelector("#input") ||  
            document.querySelector("#output");  

        if (readyNode || attempts >= 80) {  
            clearInterval(timer);  

            if (runtime) {  
                runtime.classList.add("cz-runtime-ready");  
            }  

            document.documentElement.classList.add("cz-ready");  
            document.documentElement.classList.remove("cz-loading", "cz-error");  

            state("Ready");  
            status("CyberChefZZX workspace ready.");  
        }  
    }, 250);  
}  

async function loadCyberChef() {  
    const source = $("cz-source")?.value || "modified";  

    if (source === "native") {  
        window.location.href = "./app/";  
        return;  
    }  

    if (source === "upstream") {  
        window.open("https://gchq.github.io/CyberChef/", "_blank", "noopener");  
        return;  
    }  

    const runtime = $("cz-runtime");  

    if (!runtime) {  
        status("Missing #cz-runtime.");  
        state("Error");  
        return;  
    }  

    try {  
        document.documentElement.classList.add("cz-loading");  
        document.documentElement.classList.remove("cz-ready", "cz-error");  

        installStorageShim();  
        forceDark();  
        removeRuntimeAssets();  

        runtime.innerHTML = `  
            <div class="cz-runtime-loading">  
                <strong>Loading CyberChefZZX Runtime...</strong>  
                <br>  
                Fetching native CyberChef workspace...  
            </div>  
        `;  

        state("Fetching");  
        status("Fetching CyberChef runtime...");  

        const response = await fetch(RUNTIME_HTML, { cache: "no-store" });  

        if (!response.ok) {  
            throw new Error(`Failed to fetch ${RUNTIME_HTML}: HTTP ${response.status}`);  
        }  

        const html = await response.text();  
        const doc = new DOMParser().parseFromString(html, "text/html");  

        rewriteInlineUrls(doc);  
        installStyles(doc);  

        const scripts = collectScripts(doc);  

        runtime.innerHTML = "";  

        Array.from(doc.body.childNodes).forEach((node) => {  
            runtime.appendChild(document.importNode(node, true));  
        });  

        state("Executing");  
        status("Executing CyberChef runtime...");  

        await executeScripts(scripts);

        setTimeout(forceDark, 250);
        setTimeout(forceDark, 1000);
        setTimeout(forceDark, 2500);

        const runtime = $("cz-runtime");

        if (runtime) {
            runtime.classList.add("cz-runtime-ready");
        }

        document.documentElement.classList.add("cz-ready");
        document.documentElement.classList.remove("cz-loading", "cz-error");

        state("Ready");
        status("CyberChefZZX workspace ready.");

        releaseLoaderWhenReady();

    } catch (err) {  
        console.error(err);  

        document.documentElement.classList.add("cz-error");  
        document.documentElement.classList.remove("cz-loading");  

        state("Error");  
        status(err.message || "CyberChefZZX failed to load.");  
    }  
}  

ready(() => {  
    $("cz-load")?.addEventListener("click", loadCyberChef);  
    $("cz-refresh")?.addEventListener("click", loadCyberChef);  

    installStorageShim();  
    forceDark();  
    loadCyberChef();  
});

})();