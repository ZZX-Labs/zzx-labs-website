(() => {
    "use strict";

    const M = window.ZZXCyberChefModules;
    const config = window.ZZX.CYBERCHEF;
    const Storage = M.Storage;
    const key = config.storageKeys.theme;

    const Themes = {
        index: 0,
        restore() {
            const id = Storage.read(key, config.themePresets[0]?.id || "tactical");
            const found = config.themePresets.findIndex(item => item.id === id);
            this.index = found >= 0 ? found : 0;
            return this.current();
        },
        current() {
            return config.themePresets[this.index] || config.themePresets[0] || null;
        },
        apply(index = this.index, persist = true) {
            const presets = config.themePresets;
            if (!presets.length) return null;
            this.index = ((index % presets.length) + presets.length) % presets.length;
            const preset = this.current();
            const doc = M.Runtime?.document();
            if (doc?.documentElement && M.Runtime?.mode() === "modified") {
                doc.documentElement.dataset.zzxTheme = preset.id;
            }
            if (persist) Storage.write(key, preset.id);
            return preset;
        },
        applyCurrent(persist = false) {
            return this.apply(this.index, persist);
        }
    };

    Themes.restore();
    M.Themes = Themes;
})();
