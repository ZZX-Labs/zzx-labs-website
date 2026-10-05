(() => {
    "use strict";

    const M = window.ZZXCyberChefModules;
    const config = window.ZZX.CYBERCHEF;
    const Storage = M.Storage;
    const Status = M.Status;
    const keys = config.storageKeys;

    let currentMode = "modified";
    let loadSerial = 0;

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

    function isGuardedDocument(doc) {
        return doc?.documentElement?.dataset?.zzxStorageFallback === "memory";
    }

    function sameOriginNative(win, doc) {
        if (!win) return false;
        if (isGuardedDocument(doc)) return true;
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
            sameOriginNative(win, doc) &&
            /CyberChef/i.test(title) &&
            hasCyberChefAssets(doc)
        );
    }

    function escapeHtmlAttr(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll('"', "&quot;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;");
    }

    function guardedHtml(html, recipe = "") {
        const expected = expectedNativeUrl();
        const baseHref = expected.href.replace(/index\.html(?:[?#].*)?$/, "");
        const recipeScript = recipe
            ? `<script data-zzx-cyberchef-recipe>try{location.hash="recipe=${encodeURIComponent(String(recipe))}";}catch(e){}<\/script>`
            : "";
        const injection = `<base href="${escapeHtmlAttr(baseHref)}">\n${M.Quota.memoryPrelude()}\n${recipeScript}`;
        if (/<head(?:\s[^>]*)?>/i.test(html)) {
            return html.replace(/<head(?:\s[^>]*)?>/i, match => `${match}\n${injection}`);
        }
        return `${injection}\n${html}`;
    }

    async function fetchNativeHtml() {
        const url = expectedNativeUrl();
        const response = await fetch(url.href, {
            cache: "no-store",
            credentials: "same-origin"
        });
        if (!response.ok) {
            throw new Error(`Local CyberChef HTML request failed: HTTP ${response.status}`);
        }
        const html = await response.text();
        if (!/<title[^>]*>[^<]*CyberChef/i.test(html)) {
            throw new Error("Local CyberChef HTML response is not the expected production document.");
        }
        return html;
    }

    function setNativeFrame(node, target) {
        node.removeAttribute("srcdoc");
        node.setAttribute("src", target);
    }

    async function setGuardedFrame(node, recipe = "") {
        const html = await fetchNativeHtml();
        node.setAttribute("src", "about:blank");
        node.srcdoc = guardedHtml(html, recipe);
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
                Status.set(
                    isGuardedDocument(doc)
                        ? "CyberChefZZX loaded with the ZZX CSS shim and an in-memory storage fallback because browser localStorage is full."
                        : "CyberChefZZX loaded: pristine CyberChef loaded first; ZZX CSS shim applied afterward.",
                    "ready"
                );
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

    async function prepareStorage(mode) {
        if (!M.Quota?.ensureWritable) return { ok: true, repaired: false, fallback: false, removed: [] };
        const result = await M.Quota.ensureWritable();
        if (result.repaired) {
            Status.set(
                `CyberChef browser storage quota was full. ZZX backed up CyberChef storage to IndexedDB and freed ${result.removed.length} CyberChef key(s) before loading.`,
                "ready"
            );
        } else if (!result.ok && mode === "native") {
            Status.set(
                "Browser localStorage is still full. The pristine native app is unmodified and may show CyberChef's QuotaExceededError. Use Modified mode for the guarded runtime or clear site storage for zzx-labs.io.",
                "error"
            );
        }
        return result;
    }

    const Runtime = {
        frame,
        document: frameDocument,
        window: frameWindow,
        mode() { return currentMode; },
        selectedMode,

        async load(mode = selectedMode(), options = {}) {
            const node = frame();
            if (!node) return;

            const serial = ++loadSerial;
            currentMode = mode === "native" ? "native" : "modified";
            const select = document.getElementById(config.sourceId);
            if (select) select.value = currentMode;

            Storage.write(keys.source, currentMode);
            Status.source(currentMode);
            Status.frame("Checking storage…");

            const storage = await prepareStorage(currentMode);
            if (serial !== loadSerial) return;

            Status.frame("Loading…");
            Status.set(currentMode === "modified"
                ? "Loading pristine local CyberChef, then applying ZZX CSS/JS modules…"
                : "Loading pristine local CyberChef…");

            node.onload = () => afterLoad(currentMode);

            const base = config.nativeUrl;
            const target = options.recipe
                ? `${base}#recipe=${encodeURIComponent(String(options.recipe))}`
                : base;

            if (currentMode === "modified" && !storage.ok) {
                try {
                    await setGuardedFrame(node, options.recipe || "");
                    return;
                } catch (err) {
                    console.error("[CyberChefZZX storage fallback]", err);
                    Status.frame("Storage fallback failed");
                    Status.set(err?.message || "Could not start guarded CyberChef runtime.", "error");
                    return;
                }
            }

            const current = node.getAttribute("src") || "";
            if (!node.hasAttribute("srcdoc") && current === target && options.force) {
                try {
                    node.contentWindow.location.reload();
                    return;
                } catch (err) {}
            }
            setNativeFrame(node, target);
        },

        reload() {
            return this.load(currentMode, { force: true });
        },

        loadRecipe(recipe) {
            return this.load(currentMode, { recipe, force: true });
        },

        reapply() {
            if (currentMode === "modified") afterLoad("modified");
        }
    };

    M.Runtime = Runtime;
})();
