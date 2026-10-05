(() => {
    "use strict";

    const M = window.ZZXCyberChefModules;
    const config = window.ZZX.CYBERCHEF;
    const Storage = M.Storage;
    const key = config.storageKeys.layout;
    const cache = new Map();

    let catalogPromise = null;
    let nativeSnapshot = null;
    let observer = null;
    let frameResizeObserver = null;
    let reapplyTimer = null;
    let applying = false;
    let applySerial = 0;

    const wrap = (i, n) => n ? ((Number(i) % n) + n) % n : 0;
    const isMobile = () => Boolean(window.matchMedia?.("(max-width: 760px)")?.matches);

    const nodesFor = doc => ({
        workspace: doc?.querySelector("#workspace-wrapper"),
        content: doc?.querySelector("#content-wrapper"),
        operations: doc?.querySelector("#operations"),
        recipe: doc?.querySelector("#recipe"),
        io: doc?.querySelector("#IO"),
        input: doc?.querySelector("#input"),
        output: doc?.querySelector("#output"),
        banner: doc?.querySelector("#banner")
    });

    function snapshotNode(node) {
        if (!node) return null;
        return { style: node.getAttribute("style"), className: node.className };
    }

    function captureNative(doc) {
        if (nativeSnapshot || !doc) return;
        const nodes = nodesFor(doc);
        nativeSnapshot = {
            nodes: Object.fromEntries(Object.entries(nodes).map(([name, node]) => [name, snapshotNode(node)])),
            rootStyle: doc.documentElement?.getAttribute("style") ?? null,
            bodyStyle: doc.body?.getAttribute("style") ?? null,
            gutters: Array.from(doc.querySelectorAll("#content-wrapper > .gutter, #IO > .gutter")).map(node => ({
                node,
                style: node.getAttribute("style"),
                className: node.className
            }))
        };
    }

    function restoreStyle(node, value) {
        if (!node) return;
        if (value === null) node.removeAttribute("style");
        else node.setAttribute("style", value);
    }

    function restoreNode(node, snap) {
        if (!node || !snap) return;
        restoreStyle(node, snap.style);
        node.className = snap.className;
    }

    function restoreNative(doc) {
        if (!doc || !nativeSnapshot) return;
        const nodes = nodesFor(doc);
        Object.entries(nodes).forEach(([name, node]) => restoreNode(node, nativeSnapshot.nodes[name]));
        nativeSnapshot.gutters.forEach(item => {
            if (!item.node?.isConnected) return;
            restoreStyle(item.node, item.style);
            item.node.className = item.className;
        });
        restoreStyle(doc.documentElement, nativeSnapshot.rootStyle);
        restoreStyle(doc.body, nativeSnapshot.bodyStyle);

        const root = doc.documentElement;
        root.classList.remove("zzx-layout-custom", "zzx-layout-mobile", "zzx-sticky-titles", "zzx-compact-banner");
        doc.body?.classList.remove("zzx-layout-custom");
        ["zzxLayout", "zzxLayoutOrientation", "zzxLayoutMode"].forEach(name => { delete root.dataset[name]; });
        [
            "--zzx-ui-scale",
            "--zzx-op-pad-y",
            "--zzx-banner-height",
            "--zzx-mobile-zoom",
            "--zzx-workspace-gap",
            "--zzx-workspace-padding"
        ].forEach(name => root.style.removeProperty(name));
        root.dataset.zzxLayoutMode = "native";
        try { M.Runtime?.window()?.dispatchEvent(new Event("resize")); } catch (_) {}
    }

    function important(style, name, value) {
        if (!style) return;
        if (value === null || value === undefined || value === "") style.removeProperty(name);
        else style.setProperty(name, String(value), "important");
    }

    const areaTemplate = areas => (areas || []).map(row => `"${row}"`).join(" ");

    function resolvedGeometry(preset) {
        if (!preset || preset.native || !isMobile() || !preset.mobile) {
            return { ...preset, mobileActive: false };
        }
        return {
            ...preset,
            workspace: {
                ...(preset.workspace || {}),
                areas: (preset.mobile.areas || ["io", "recipe", "ops"]).map(String),
                columns: preset.mobile.columns || ["minmax(0,1fr)"],
                rows: preset.mobile.rows || ["minmax(0,1fr)", "minmax(0,1fr)", "minmax(0,1fr)"],
                gap: Math.min(8, Number(preset.workspace?.gap ?? 6)),
                padding: Math.min(.35, Number(preset.workspace?.padding ?? .25))
            },
            io: {
                ...(preset.io || {}),
                orientation: preset.mobile.ioOrientation || "vertical",
                split: preset.mobile.ioSplit || [50, 50]
            },
            mobileActive: true
        };
    }

    function applyCustom(doc, preset) {
        const resolved = resolvedGeometry(preset);
        const nodes = nodesFor(doc);
        const { workspace, content, operations, recipe, io, input, output, banner } = nodes;
        if (!workspace || !content || !operations || !recipe || !io || !input || !output) return false;
        captureNative(doc);

        const w = resolved.workspace || {};
        const ioc = resolved.io || {};
        const density = resolved.density || {};
        const behavior = resolved.behavior || {};

        const areas = w.areas || ["ops recipe io"];
        const columns = Array.isArray(w.columns)
            ? w.columns.join(" ")
            : (w.columns || "minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)");
        const rows = Array.isArray(w.rows)
            ? w.rows.join(" ")
            : (w.rows || "minmax(0,1fr)");
        const gap = `${Number(w.gap ?? 8)}px`;
        const padding = `${Number(w.padding ?? .35)}rem`;
        const bannerHeight = Math.max(28, Number(density.bannerHeight ?? 42));

        const root = doc.documentElement;
        const body = doc.body;
        root.classList.add("zzx-layout-custom");
        root.classList.toggle("zzx-layout-mobile", Boolean(resolved.mobileActive));
        root.classList.toggle("zzx-sticky-titles", Boolean(behavior.stickyTitles));
        root.classList.toggle("zzx-compact-banner", Boolean(behavior.compactBanner));
        root.dataset.zzxLayout = preset.id;
        root.dataset.zzxLayoutMode = "custom";
        root.dataset.zzxLayoutOrientation = ioc.orientation || "vertical";
        body?.classList.add("zzx-layout-custom");

        important(root.style, "width", "100%");
        important(root.style, "height", "100%");
        important(root.style, "overflow", "hidden");
        if (body) {
            important(body.style, "width", "100%");
            important(body.style, "height", "100%");
            important(body.style, "min-width", "0");
            important(body.style, "margin", "0");
            important(body.style, "overflow", "hidden");
        }

        if (banner) {
            important(banner.style, "position", "absolute");
            important(banner.style, "left", "0");
            important(banner.style, "right", "0");
            important(banner.style, "top", "0");
            important(banner.style, "height", `${bannerHeight}px`);
            important(banner.style, "min-height", `${bannerHeight}px`);
            important(banner.style, "max-height", `${bannerHeight}px`);
            important(banner.style, "overflow", "hidden");
            important(banner.style, "box-sizing", "border-box");
            important(banner.style, "z-index", "20");
        }

        /* Dock the workspace to the iframe viewport. This is the key sizing
           contract: layouts fill the feature frame, not the parent browser. */
        important(workspace.style, "position", "absolute");
        important(workspace.style, "left", "0");
        important(workspace.style, "right", "0");
        important(workspace.style, "top", `${bannerHeight}px`);
        important(workspace.style, "bottom", "0");
        important(workspace.style, "width", "auto");
        important(workspace.style, "height", "auto");
        important(workspace.style, "min-width", "0");
        important(workspace.style, "min-height", "0");
        important(workspace.style, "max-width", "none");
        important(workspace.style, "max-height", "none");
        important(workspace.style, "overflow", "hidden");
        important(workspace.style, "box-sizing", "border-box");

        important(content.style, "position", "absolute");
        important(content.style, "inset", "0");
        important(content.style, "display", "grid");
        important(content.style, "grid-template-areas", areaTemplate(areas));
        important(content.style, "grid-template-columns", columns);
        important(content.style, "grid-template-rows", rows);
        important(content.style, "gap", gap);
        important(content.style, "padding", padding);
        important(content.style, "box-sizing", "border-box");
        important(content.style, "width", "auto");
        important(content.style, "height", "auto");
        important(content.style, "min-width", "0");
        important(content.style, "min-height", "0");
        important(content.style, "max-width", "none");
        important(content.style, "max-height", "none");
        important(content.style, "overflow", "hidden");
        important(content.style, "align-items", "stretch");
        important(content.style, "justify-items", "stretch");

        [[operations, "ops"], [recipe, "recipe"], [io, "io"]].forEach(([node, area]) => {
            important(node.style, "grid-area", area);
            important(node.style, "position", "relative");
            important(node.style, "left", "auto");
            important(node.style, "right", "auto");
            important(node.style, "top", "auto");
            important(node.style, "bottom", "auto");
            important(node.style, "float", "none");
            important(node.style, "width", "100%");
            important(node.style, "height", "100%");
            important(node.style, "min-width", "0");
            important(node.style, "min-height", "0");
            important(node.style, "max-width", "none");
            important(node.style, "max-height", "none");
            important(node.style, "flex", "none");
            important(node.style, "flex-basis", "auto");
            important(node.style, "box-sizing", "border-box");
            important(node.style, "overflow", node === io ? "hidden" : "auto");
        });

        const horizontal = ioc.orientation === "horizontal";
        const split = Array.isArray(ioc.split) && ioc.split.length === 2 ? ioc.split : [50, 50];
        important(io.style, "display", "grid");
        important(io.style, "gap", `${Number(ioc.gap ?? 6)}px`);
        important(io.style, "grid-template-areas", horizontal ? '"input output"' : '"input" "output"');
        important(io.style, "grid-template-columns", horizontal ? `${split[0]}fr ${split[1]}fr` : "minmax(0,1fr)");
        important(io.style, "grid-template-rows", horizontal ? "minmax(0,1fr)" : `${split[0]}fr ${split[1]}fr`);
        important(io.style, "align-items", "stretch");

        [[input, "input"], [output, "output"]].forEach(([node, area]) => {
            important(node.style, "grid-area", area);
            important(node.style, "position", "relative");
            important(node.style, "left", "auto");
            important(node.style, "right", "auto");
            important(node.style, "top", "auto");
            important(node.style, "bottom", "auto");
            important(node.style, "float", "none");
            important(node.style, "width", "100%");
            important(node.style, "height", "100%");
            important(node.style, "min-width", "0");
            important(node.style, "min-height", "0");
            important(node.style, "max-width", "none");
            important(node.style, "max-height", "none");
            important(node.style, "flex", "none");
            important(node.style, "flex-basis", "auto");
            important(node.style, "box-sizing", "border-box");
            important(node.style, "overflow", "auto");
        });

        Array.from(doc.querySelectorAll("#content-wrapper > .gutter, #IO > .gutter")).forEach(gutter => {
            important(gutter.style, "display", behavior.hideGutters === false ? null : "none");
        });

        root.style.setProperty("--zzx-ui-scale", String(density.scale ?? 1));
        root.style.setProperty("--zzx-op-pad-y", `${Number(density.operationPadding ?? 5)}px`);
        root.style.setProperty("--zzx-banner-height", `${bannerHeight}px`);
        root.style.setProperty("--zzx-mobile-zoom", String(preset.mobile?.zoom ?? .68));
        root.style.setProperty("--zzx-workspace-gap", gap);
        root.style.setProperty("--zzx-workspace-padding", padding);

        try {
            const win = M.Runtime?.window();
            win?.dispatchEvent(new Event("resize"));
            requestAnimationFrame(() => win?.dispatchEvent(new Event("resize")));
        } catch (_) {}
        return true;
    }

    async function fetchJSON(url, label) {
        const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
        if (!response.ok) throw new Error(`${label} request failed: HTTP ${response.status}`);
        return response.json();
    }

    const Layouts = {
        presets: [],
        index: 0,
        ready: false,
        error: null,

        current() { return this.presets[this.index] || null; },

        restore() {
            const id = Storage.read(key, config.defaultLayoutId || "native");
            const found = this.presets.findIndex(item => item.id === id);
            this.index = found >= 0 ? found : 0;
            return this.current();
        },

        loadCatalog() {
            if (this.ready && this.presets.length === 128) return Promise.resolve(this.presets);
            if (catalogPromise) return catalogPromise;
            catalogPromise = (async () => {
                const index = await fetchJSON(config.layoutIndexUrl, "Layout catalog");
                if (!Array.isArray(index.layouts) || index.layouts.length !== 128) {
                    throw new Error(`CyberChefZZX layout index contains ${Array.isArray(index.layouts) ? index.layouts.length : 0} layouts; expected 128.`);
                }
                this.presets = index.layouts.map((entry, i) => ({ ...entry, index: i }));
                this.ready = true;
                this.error = null;
                this.restore();
                window.dispatchEvent(new CustomEvent("zzx-cyberchef-layouts-ready", { detail: { count: this.presets.length } }));
                return this.presets;
            })().catch(err => {
                this.ready = false;
                this.error = err;
                catalogPromise = null;
                console.error("[CyberChefZZX layouts]", err);
                M.Status?.set(err.message || "Layout catalog failed to load.", "error");
                throw err;
            });
            return catalogPromise;
        },

        ensureReady() { return this.loadCatalog(); },

        async resolve(meta) {
            if (!meta) return null;
            if (cache.has(meta.id)) return cache.get(meta.id);
            const url = new URL(`./layouts/${meta.file}`, window.location.href).href;
            const preset = await fetchJSON(url, `Layout ${meta.label || meta.id}`);
            cache.set(meta.id, preset);
            return preset;
        },

        apply(index = this.index, persist = true) {
            if (!this.presets.length) return null;
            this.index = wrap(index, this.presets.length);
            const meta = this.current();
            if (persist && meta) Storage.write(key, meta.id);
            const serial = ++applySerial;
            window.dispatchEvent(new CustomEvent("zzx-cyberchef-layout-change", {
                detail: { index: this.index, count: this.presets.length, preset: meta, pending: true }
            }));
            void this.applyResolved(meta, serial);
            return meta;
        },

        async applyResolved(meta, serial = ++applySerial) {
            if (!meta) return null;
            try {
                const preset = await this.resolve(meta);
                if (serial !== applySerial || this.current()?.id !== meta.id) return preset;
                const doc = M.Runtime?.document();
                if (doc && M.Runtime?.mode() === "modified") {
                    applying = true;
                    captureNative(doc);
                    if (preset.native) restoreNative(doc);
                    else if (!applyCustom(doc, preset)) throw new Error("CyberChef workspace nodes are not ready for the selected layout.");
                    requestAnimationFrame(() => requestAnimationFrame(() => { applying = false; }));
                }
                window.dispatchEvent(new CustomEvent("zzx-cyberchef-layout-change", {
                    detail: { index: this.index, count: this.presets.length, preset: meta, resolved: preset, pending: false }
                }));
                this.preloadNeighbors();
                return preset;
            } catch (err) {
                applying = false;
                if (serial === applySerial) {
                    console.error("[CyberChefZZX layouts]", err);
                    M.Status?.set(err.message || "Layout failed to load.", "error");
                }
                return null;
            }
        },

        applyCurrent(persist = false) {
            const meta = this.current();
            if (!meta) return null;
            if (persist) Storage.write(key, meta.id);
            const serial = ++applySerial;
            void this.applyResolved(meta, serial);
            return meta;
        },

        preloadNeighbors() {
            if (!this.presets.length) return;
            [-1, 1].forEach(offset => {
                const i = wrap(this.index + offset, this.presets.length);
                const meta = this.presets[i];
                if (meta && !cache.has(meta.id)) void this.resolve(meta).catch(() => {});
            });
        },

        observe() {
            observer?.disconnect();
            frameResizeObserver?.disconnect();

            const doc = M.Runtime?.document();
            const content = doc?.querySelector("#content-wrapper");
            if (content && window.MutationObserver) {
                observer = new MutationObserver(() => {
                    if (applying || this.current()?.id === "native") return;
                    clearTimeout(reapplyTimer);
                    reapplyTimer = setTimeout(() => this.applyCurrent(false), 120);
                });
                observer.observe(content, { subtree: true, attributes: true, attributeFilter: ["style", "class"] });
            }

            const frame = M.Runtime?.frame?.();
            if (frame && window.ResizeObserver) {
                frameResizeObserver = new ResizeObserver(() => {
                    if (applying || this.current()?.id === "native") return;
                    clearTimeout(reapplyTimer);
                    reapplyTimer = setTimeout(() => this.applyCurrent(false), 80);
                });
                frameResizeObserver.observe(frame);
            }
        },

        reset() {
            observer?.disconnect();
            frameResizeObserver?.disconnect();
            observer = null;
            frameResizeObserver = null;
            nativeSnapshot = null;
            clearTimeout(reapplyTimer);
            applying = false;
            applySerial++;
        }
    };

    M.Layouts = Layouts;

    window.addEventListener("zzx-cyberchef-frame-ready", event => {
        Layouts.reset();
        if (event.detail?.mode !== "modified") return;
        setTimeout(() => {
            Layouts.applyCurrent(false);
            Layouts.observe();
        }, 120);
    });

    window.addEventListener("resize", () => {
        if (!Layouts.ready || M.Runtime?.mode() !== "modified" || Layouts.current()?.id === "native") return;
        clearTimeout(reapplyTimer);
        reapplyTimer = setTimeout(() => Layouts.applyCurrent(false), 100);
    }, { passive: true });
})();
