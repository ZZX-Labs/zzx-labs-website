(() => {
    "use strict";

    const M = window.ZZXCyberChefModules;
    const config = window.ZZX.CYBERCHEF;
    const Storage = M.Storage;
    const key = config.storageKeys.layout;
    const cache = new Map();

    let catalogPromise = null;
    let nativeSnapshot = null;
    let mutationObserver = null;
    let frameResizeObserver = null;
    let reapplyTimer = null;
    let applying = false;
    let applySerial = 0;

    const wrap = (i, n) => n ? ((Number(i) % n) + n) % n : 0;
    const isMobile = () => Boolean(window.matchMedia?.("(max-width: 760px)")?.matches);
    const paneNames = ["ops", "recipe", "input", "output"];

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

    function snap(node) {
        if (!node) return null;
        return {
            style: node.getAttribute("style"),
            className: node.className
        };
    }

    function restoreNode(node, state) {
        if (!node || !state) return;
        if (state.style === null) node.removeAttribute("style");
        else node.setAttribute("style", state.style);
        node.className = state.className;
    }

    function captureNative(doc) {
        if (nativeSnapshot || !doc) return;
        const nodes = nodesFor(doc);
        nativeSnapshot = {
            root: snap(doc.documentElement),
            body: snap(doc.body),
            nodes: Object.fromEntries(Object.entries(nodes).map(([name, node]) => [name, snap(node)])),
            gutters: Array.from(doc.querySelectorAll("#content-wrapper > .gutter, #IO > .gutter")).map(node => ({
                node,
                state: snap(node)
            }))
        };
    }

    function restoreNative(doc) {
        if (!doc || !nativeSnapshot) return;
        const nodes = nodesFor(doc);
        restoreNode(doc.documentElement, nativeSnapshot.root);
        restoreNode(doc.body, nativeSnapshot.body);
        Object.entries(nodes).forEach(([name, node]) => restoreNode(node, nativeSnapshot.nodes[name]));
        nativeSnapshot.gutters.forEach(({ node, state }) => {
            if (node?.isConnected) restoreNode(node, state);
        });

        const root = doc.documentElement;
        root.classList.remove(
            "zzx-layout-custom",
            "zzx-layout-mobile",
            "zzx-sticky-titles",
            "zzx-compact-banner",
            "zzx-four-pane-layout"
        );
        doc.body?.classList.remove("zzx-layout-custom", "zzx-four-pane-layout");
        ["zzxLayout", "zzxLayoutMode", "zzxLayoutFamily"].forEach(name => { delete root.dataset[name]; });
        root.dataset.zzxLayoutMode = "native";
        try {
            const win = M.Runtime?.window();
            win?.dispatchEvent(new Event("resize"));
            requestAnimationFrame(() => win?.dispatchEvent(new Event("resize")));
        } catch (_) {}
    }

    function important(style, name, value) {
        if (!style) return;
        if (value === null || value === undefined || value === "") style.removeProperty(name);
        else style.setProperty(name, String(value), "important");
    }

    function areaTemplate(areas) {
        return (areas || []).map(row => `"${row}"`).join(" ");
    }

    function validateGeometry(preset) {
        const w = preset?.workspace || {};
        const areas = Array.isArray(w.areas) ? w.areas.map(String) : [];
        const columns = Array.isArray(w.columns) ? w.columns : [];
        const rows = Array.isArray(w.rows) ? w.rows : [];
        if (!areas.length || !columns.length || !rows.length) {
            throw new Error(`Layout ${preset?.id || "unknown"} has incomplete grid geometry.`);
        }
        const widths = areas.map(row => row.trim().split(/\s+/).filter(Boolean).length);
        if (new Set(widths).size !== 1 || widths[0] !== columns.length || areas.length !== rows.length) {
            throw new Error(`Layout ${preset.id} grid dimensions are inconsistent.`);
        }
        const tokens = new Set(areas.flatMap(row => row.trim().split(/\s+/).filter(Boolean)));
        const missing = paneNames.filter(name => !tokens.has(name));
        if (missing.length) throw new Error(`Layout ${preset.id} is missing pane(s): ${missing.join(", ")}.`);
        return true;
    }

    function resolvedPreset(preset) {
        if (!preset || preset.native || !isMobile() || !preset.mobile) return preset;
        return {
            ...preset,
            workspace: {
                ...(preset.workspace || {}),
                areas: (preset.mobile.areas || ["ops", "recipe", "input", "output"]).map(String),
                columns: preset.mobile.columns || ["minmax(0,1fr)"],
                rows: preset.mobile.rows || ["minmax(0,1fr)", "minmax(0,1fr)", "minmax(0,1fr)", "minmax(0,1fr)"],
                gap: Math.min(6, Number(preset.workspace?.gap ?? 4)),
                padding: Math.min(.24, Number(preset.workspace?.padding ?? .16))
            },
            mobileActive: true
        };
    }

    function resetGridItem(node, area, overflow = "hidden") {
        important(node.style, "grid-area", area);
        important(node.style, "position", "relative");
        important(node.style, "inset", "auto");
        important(node.style, "left", "auto");
        important(node.style, "right", "auto");
        important(node.style, "top", "auto");
        important(node.style, "bottom", "auto");
        important(node.style, "float", "none");
        important(node.style, "display", "block");
        important(node.style, "width", "100%");
        important(node.style, "height", "100%");
        important(node.style, "min-width", "0");
        important(node.style, "min-height", "0");
        important(node.style, "max-width", "none");
        important(node.style, "max-height", "none");
        important(node.style, "flex", "none");
        important(node.style, "flex-basis", "auto");
        important(node.style, "box-sizing", "border-box");
        important(node.style, "overflow", overflow);
        important(node.style, "transform", "none");
    }

    function applyCustom(doc, originalPreset) {
        const preset = resolvedPreset(originalPreset);
        validateGeometry(preset);
        const nodes = nodesFor(doc);
        const { workspace, content, operations, recipe, io, input, output, banner } = nodes;
        if (!workspace || !content || !operations || !recipe || !io || !input || !output) return false;
        captureNative(doc);

        const w = preset.workspace || {};
        const density = preset.density || {};
        const behavior = preset.behavior || {};
        const areas = w.areas;
        const columns = w.columns.join(" ");
        const rows = w.rows.join(" ");
        const gap = `${Number(w.gap ?? 4)}px`;
        const padding = `${Number(w.padding ?? .16)}rem`;
        const bannerHeight = Math.max(28, Number(density.bannerHeight ?? 36));
        const root = doc.documentElement;
        const body = doc.body;

        root.classList.add("zzx-layout-custom", "zzx-four-pane-layout");
        root.classList.toggle("zzx-layout-mobile", Boolean(preset.mobileActive));
        root.classList.toggle("zzx-sticky-titles", Boolean(behavior.stickyTitles));
        root.classList.toggle("zzx-compact-banner", Boolean(behavior.compactBanner));
        body?.classList.add("zzx-layout-custom", "zzx-four-pane-layout");
        root.dataset.zzxLayout = originalPreset.id;
        root.dataset.zzxLayoutMode = "custom";
        root.dataset.zzxLayoutFamily = originalPreset.family || "custom";

        important(root.style, "width", "100%");
        important(root.style, "height", "100%");
        important(root.style, "min-width", "0");
        important(root.style, "overflow", "hidden");
        if (body) {
            important(body.style, "width", "100%");
            important(body.style, "height", "100%");
            important(body.style, "min-width", "0");
            important(body.style, "min-height", "0");
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
            important(banner.style, "box-sizing", "border-box");
            important(banner.style, "overflow", "hidden");
            important(banner.style, "z-index", "30");
        }

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
        important(content.style, "width", "auto");
        important(content.style, "height", "auto");
        important(content.style, "min-width", "0");
        important(content.style, "min-height", "0");
        important(content.style, "max-width", "none");
        important(content.style, "max-height", "none");
        important(content.style, "box-sizing", "border-box");
        important(content.style, "overflow", "hidden");
        important(content.style, "align-items", "stretch");
        important(content.style, "justify-items", "stretch");

        resetGridItem(operations, "ops", "auto");
        resetGridItem(recipe, "recipe", "auto");

        /* #IO remains in the DOM for upstream code, but stops creating its own
           box.  Input and Output therefore become real grid items of
           #content-wrapper without reparenting or touching upstream files. */
        important(io.style, "display", "contents");
        important(io.style, "position", "static");
        important(io.style, "width", "auto");
        important(io.style, "height", "auto");
        important(io.style, "min-width", "0");
        important(io.style, "min-height", "0");
        important(io.style, "overflow", "visible");
        important(io.style, "transform", "none");

        resetGridItem(input, "input", "hidden");
        resetGridItem(output, "output", "hidden");

        Array.from(doc.querySelectorAll("#content-wrapper > .gutter, #IO > .gutter")).forEach(gutter => {
            important(gutter.style, "display", "none");
            important(gutter.style, "width", "0");
            important(gutter.style, "height", "0");
            important(gutter.style, "min-width", "0");
            important(gutter.style, "min-height", "0");
            important(gutter.style, "flex-basis", "0");
        });

        root.style.setProperty("--zzx-ui-scale", String(density.scale ?? .88));
        root.style.setProperty("--zzx-op-pad-y", `${Number(density.operationPadding ?? 3)}px`);
        root.style.setProperty("--zzx-banner-height", `${bannerHeight}px`);
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
            preset.family = meta.family || preset.family || "custom";
            if (!preset.native) validateGeometry(resolvedPreset(preset));
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

        scheduleReapply(delay = 90) {
            if (applying || this.current()?.id === "native" || M.Runtime?.mode() !== "modified") return;
            clearTimeout(reapplyTimer);
            reapplyTimer = setTimeout(() => this.applyCurrent(false), delay);
        },

        observe() {
            mutationObserver?.disconnect();
            frameResizeObserver?.disconnect();

            const doc = M.Runtime?.document();
            const content = doc?.querySelector("#content-wrapper");
            if (content && window.MutationObserver) {
                mutationObserver = new MutationObserver(mutations => {
                    if (applying || this.current()?.id === "native") return;
                    const meaningful = mutations.some(m => m.target === content || m.target?.classList?.contains("gutter"));
                    if (meaningful) this.scheduleReapply(100);
                });
                mutationObserver.observe(content, { subtree: true, attributes: true, attributeFilter: ["style", "class"] });
            }

            const frame = M.Runtime?.frame?.();
            if (frame && window.ResizeObserver) {
                frameResizeObserver = new ResizeObserver(() => this.scheduleReapply(70));
                frameResizeObserver.observe(frame);
            }
        },

        reset() {
            mutationObserver?.disconnect();
            frameResizeObserver?.disconnect();
            mutationObserver = null;
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
        }, 160);
    });

    window.addEventListener("resize", () => Layouts.scheduleReapply(90), { passive: true });
})();
