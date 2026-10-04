(() => {
    "use strict";

    const M = window.ZZXCyberChefModules;
    const config = window.ZZX.CYBERCHEF;
    const Storage = M.Storage;
    const key = config.storageKeys.layout;

    const Layouts = {
        index: 0,
        restore() {
            const id = Storage.read(key, config.layoutPresets[0]?.id || "native");
            const found = config.layoutPresets.findIndex(item => item.id === id);
            this.index = found >= 0 ? found : 0;
            return this.current();
        },
        current() {
            return config.layoutPresets[this.index] || config.layoutPresets[0] || null;
        },
        apply(index = this.index, persist = true) {
            const presets = config.layoutPresets;
            if (!presets.length) return null;
            this.index = ((index % presets.length) + presets.length) % presets.length;
            const preset = this.current();
            const doc = M.Runtime?.document();
            if (doc?.documentElement && M.Runtime?.mode() === "modified") {
                doc.documentElement.dataset.zzxLayout = preset.id;
            }
            if (persist) Storage.write(key, preset.id);
            return preset;
        },
        applyCurrent(persist = false) {
            return this.apply(this.index, persist);
        }
    };

    Layouts.restore();
    M.Layouts = Layouts;
})();
