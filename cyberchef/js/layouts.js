(() => {
    "use strict";
    const M = window.ZZXCyberChefModules;
    const config = window.ZZX.CYBERCHEF;
    const Storage = M.Storage;
    const key = config.storageKeys.layout;

    function setVar(style, name, value) { if (value === null || value === undefined) style.removeProperty(name); else style.setProperty(name, value); }
    const Layouts = {
        presets: config.layoutPresets,
        index: 0,
        restore() {
            const id = Storage.read(key, this.presets[0]?.id || "native-standard");
            const found = this.presets.findIndex(item => item.id === id);
            this.index = found >= 0 ? found : 0; return this.current();
        },
        current() { return this.presets[this.index] || this.presets[0] || null; },
        apply(index = this.index, persist = true) {
            if (!this.presets.length) return null;
            this.index = ((index % this.presets.length) + this.presets.length) % this.presets.length;
            const preset = this.current(), doc = M.Runtime?.document();
            if (doc?.documentElement && M.Runtime?.mode() === "modified") {
                const el = doc.documentElement, s = el.style;
                el.dataset.zzxLayout = preset.id;
                el.dataset.zzxLayoutMode = preset.native ? "native" : "custom";
                el.dataset.zzxLayoutBase = preset.baseId;
                el.dataset.zzxLayoutDensity = preset.densityId;
                const g = preset.geometry;
                setVar(s, "--zzx-operations-width", g ? `${g[0]}%` : null);
                setVar(s, "--zzx-recipe-width", g ? `${g[1]}%` : null);
                setVar(s, "--zzx-io-width", g ? `${g[2]}%` : null);
                setVar(s, "--zzx-input-height", g ? `${g[3]}%` : null);
                setVar(s, "--zzx-output-height", g ? `${g[4]}%` : null);
                setVar(s, "--zzx-ui-scale", String(preset.scale));
                setVar(s, "--zzx-op-pad-y", `${preset.operationPadding}px`);
                setVar(s, "--zzx-banner-height", `${preset.bannerHeight}px`);
            }
            if (persist) Storage.write(key, preset.id);
            window.dispatchEvent(new CustomEvent("zzx-cyberchef-layout-change", { detail: { index: this.index, count: this.presets.length, preset } }));
            return preset;
        },
        applyCurrent(persist = false) { return this.apply(this.index, persist); }
    };
    Layouts.restore(); M.Layouts = Layouts;
})();
