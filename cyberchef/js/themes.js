(() => {
    "use strict";

    const M = window.ZZXCyberChefModules;
    const config = window.ZZX.CYBERCHEF;
    const Storage = M.Storage;
    const key = config.storageKeys.theme;
    const cache = new Map();
    let catalogPromise = null;
    let applySerial = 0;

    function mix(hexA, hexB, t) {
        const parse = value => {
            const raw = String(value || "#000000").replace("#", "");
            const h = raw.length === 3 ? raw.split("").map(c => c + c).join("") : raw.padEnd(6, "0").slice(0, 6);
            return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0);
        };
        const a = parse(hexA), b = parse(hexB), n = Math.max(0, Math.min(1, Number(t) || 0));
        return `#${a.map((v, i) => Math.round(v + (b[i] - v) * n).toString(16).padStart(2, "0")).join("")}`;
    }

    function setVar(style, name, value) {
        if (value !== undefined && value !== null && value !== "") style.setProperty(name, String(value));
    }

    function applyToDocument(doc, preset) {
        if (!doc?.documentElement || !preset) return;
        const root = doc.documentElement;
        const style = root.style;
        const c = preset.colors || {};
        const fonts = preset.fonts || {};
        const surface = preset.surface || {};
        const type = preset.typography || {};
        const effects = preset.effects || {};
        const panelHi = c.panelHigh || mix(c.panel || c.background, c.text || "#ffffff", .06);
        const deep = c.deep || mix(c.background || "#111111", "#000000", .24);

        const vars = {
            "--zzx-bg": c.background,
            "--zzx-panel": c.panel,
            "--zzx-panel-hi": panelHi,
            "--zzx-deep": deep,
            "--zzx-accent": c.accent,
            "--zzx-secondary": c.secondary,
            "--zzx-text": c.text,
            "--zzx-muted": c.muted,
            "--zzx-border": c.border,
            "--zzx-font-ui": fonts.ui,
            "--zzx-font-mono": fonts.mono,
            "--zzx-font-heading": fonts.heading || fonts.ui,
            "--zzx-radius": `${Number(surface.radius ?? 8)}px`,
            "--zzx-control-radius": `${Number(surface.controlRadius ?? surface.radius ?? 8)}px`,
            "--zzx-shadow": surface.shadow || "0 16px 38px rgba(0,0,0,.4)",
            "--zzx-texture": surface.textureCss || "none",
            "--zzx-letter-spacing": type.letterSpacing || ".01em",
            "--zzx-font-weight": String(type.weight || 600),
            "--zzx-glow": effects.glow || c.accent,
            "--zzx-glow-strength": String(effects.glowStrength ?? .1),
            "--primary-font-colour": c.text,
            "--subtext-font-colour": c.muted,
            "--primary-background-colour": c.background,
            "--secondary-background-colour": c.panel,
            "--primary-border-colour": c.border,
            "--secondary-border-colour": mix(c.border || "#444444", c.background || "#111111", .34),
            "--title-colour": c.accent,
            "--title-background-colour": panelHi,
            "--banner-font-colour": c.text,
            "--banner-bg-colour": deep,
            "--banner-url-colour": c.accent,
            "--category-list-font-colour": c.accent,
            "--op-list-operation-font-colour": c.text,
            "--op-list-operation-bg-colour": c.panel,
            "--op-list-operation-border-colour": c.border,
            "--rec-list-operation-font-colour": c.text,
            "--rec-list-operation-bg-colour": panelHi,
            "--rec-list-operation-border-colour": c.border,
            "--selected-operation-font-color": c.background,
            "--selected-operation-bg-colour": c.accent,
            "--selected-operation-border-colour": c.accent,
            "--arg-font-colour": c.text,
            "--arg-background": c.panel,
            "--arg-border-colour": c.border,
            "--arg-disabled-background": mix(c.panel || "#222222", c.muted || "#777777", .18),
            "--arg-label-colour": c.secondary,
            "--btn-default-font-colour": c.text,
            "--btn-default-bg-colour": c.panel,
            "--btn-default-border-colour": c.border,
            "--btn-default-hover-font-colour": c.background,
            "--btn-default-hover-bg-colour": c.accent,
            "--btn-default-hover-border-colour": c.accent,
            "--btn-success-font-colour": c.background,
            "--btn-success-bg-colour": c.accent,
            "--btn-success-border-colour": c.accent,
            "--scrollbar-track": deep,
            "--scrollbar-thumb": c.border,
            "--scrollbar-hover": c.accent,
            "--input-highlight-colour": c.accent,
            "--input-border-colour": c.border
        };
        Object.entries(vars).forEach(([name, value]) => setVar(style, name, value));
        root.dataset.zzxTheme = preset.id;
        root.dataset.zzxThemeTexture = surface.texture || "flat";
        root.dataset.zzxThemeShape = surface.shape || "soft";
        root.dataset.zzxScanlines = effects.scanlines ? "1" : "0";
        try {
            const raw = String(c.background || "#000000").replace("#", "");
            const rgb = raw.length >= 6 ? [0, 2, 4].map(i => parseInt(raw.slice(i, i + 2), 16) || 0) : [0, 0, 0];
            const lum = (rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722) / 255;
            root.style.colorScheme = lum > .6 ? "light" : "dark";
        } catch (_) {}
    }

    async function fetchJSON(url, label) {
        const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
        if (!response.ok) throw new Error(`${label} request failed: HTTP ${response.status}`);
        return response.json();
    }

    const Themes = {
        presets: [],
        index: 0,
        ready: false,
        error: null,

        current() { return this.presets[this.index] || null; },

        restore() {
            const id = Storage.read(key, config.defaultThemeId || "tactical-olive");
            const found = this.presets.findIndex(item => item.id === id);
            this.index = found >= 0 ? found : 0;
            return this.current();
        },

        loadCatalog() {
            if (this.ready && this.presets.length === 64) return Promise.resolve(this.presets);
            if (catalogPromise) return catalogPromise;
            catalogPromise = (async () => {
                const index = await fetchJSON(config.themeIndexUrl, "Theme catalog");
                if (!Array.isArray(index.themes) || index.themes.length !== 64) {
                    throw new Error(`ZZXCyberChef theme index contains ${Array.isArray(index.themes) ? index.themes.length : 0} themes; expected 64.`);
                }
                this.presets = index.themes.map((entry, i) => ({ ...entry, index: i }));
                this.ready = true;
                this.error = null;
                this.restore();
                window.dispatchEvent(new CustomEvent("zzx-cyberchef-themes-ready", { detail: { count: this.presets.length } }));
                return this.presets;
            })().catch(err => {
                this.ready = false;
                this.error = err;
                catalogPromise = null;
                console.error("[ZZXCyberChef themes]", err);
                M.Status?.set(err.message || "Theme catalog failed to load.", "error");
                throw err;
            });
            return catalogPromise;
        },

        ensureReady() { return this.loadCatalog(); },

        async resolve(meta) {
            if (!meta) return null;
            if (cache.has(meta.id)) return cache.get(meta.id);
            const url = new URL(`./themes/${meta.file}`, window.location.href).href;
            const preset = await fetchJSON(url, `Theme ${meta.label || meta.id}`);
            cache.set(meta.id, preset);
            return preset;
        },

        apply(index = this.index, persist = true) {
            if (!this.presets.length) return null;
            this.index = ((Number(index) % this.presets.length) + this.presets.length) % this.presets.length;
            const meta = this.current();
            if (persist && meta) Storage.write(key, meta.id);
            const serial = ++applySerial;
            window.dispatchEvent(new CustomEvent("zzx-cyberchef-theme-change", {
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
                if (doc && M.Runtime?.mode() === "modified") applyToDocument(doc, preset);
                window.dispatchEvent(new CustomEvent("zzx-cyberchef-theme-change", {
                    detail: { index: this.index, count: this.presets.length, preset: meta, resolved: preset, pending: false }
                }));
                this.preloadNeighbors();
                return preset;
            } catch (err) {
                if (serial === applySerial) {
                    console.error("[ZZXCyberChef themes]", err);
                    M.Status?.set(err.message || "Theme failed to load.", "error");
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
                const i = ((this.index + offset) % this.presets.length + this.presets.length) % this.presets.length;
                const meta = this.presets[i];
                if (meta && !cache.has(meta.id)) void this.resolve(meta).catch(() => {});
            });
        }
    };

    M.Themes = Themes;
    window.addEventListener("zzx-cyberchef-frame-ready", e => {
        if (e.detail?.mode === "modified") Themes.applyCurrent(false);
    });
})();
