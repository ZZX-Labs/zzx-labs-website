(() => {
    "use strict";
    const M = window.ZZXCyberChefModules;
    const config = window.ZZX.CYBERCHEF;
    const Storage = M.Storage;
    const key = config.storageKeys.theme;

    const clamp = n => Math.max(0, Math.min(255, Math.round(n)));
    function parse(hex) {
        const clean = String(hex).replace("#", "");
        const full = clean.length === 3 ? clean.split("").map(c => c + c).join("") : clean;
        return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
    }
    function hex(rgb) { return `#${rgb.map(v => clamp(v).toString(16).padStart(2, "0")).join("")}`; }
    function mix(a, b, amount) {
        const A = parse(a), B = parse(b); const t = Math.max(0, Math.min(1, amount));
        return hex(A.map((v, i) => v + (B[i] - v) * t));
    }
    function shift(color, amount, lightMode = false) {
        if (!amount) return color;
        const target = amount > 0 ? (lightMode ? "#000000" : "#ffffff") : (lightMode ? "#ffffff" : "#000000");
        return mix(color, target, Math.abs(amount));
    }
    function palette(preset) {
        const f = preset.family, v = preset.variant, light = Boolean(f.light);
        const bg = shift(f.bg, v.shade, light);
        const panel = shift(f.panel, v.shade * 0.72, light);
        const accent = shift(f.accent, v.contrast * 0.45, false);
        const secondary = shift(f.secondary, v.contrast * 0.35, false);
        const text = shift(f.text, v.contrast * 0.22, light);
        const muted = shift(f.muted, v.contrast * 0.16, light);
        const border = shift(f.border, v.contrast * 0.35, light);
        const panelHi = mix(panel, light ? "#000000" : "#ffffff", light ? 0.06 : 0.08);
        const deep = mix(bg, light ? "#ffffff" : "#000000", 0.22);
        return { bg, panel, panelHi, deep, accent, secondary, text, muted, border, light };
    }
    function setVars(doc, preset) {
        const p = palette(preset), s = doc.documentElement.style;
        const vars = {
            "--zzx-bg": p.bg, "--zzx-panel": p.panel, "--zzx-panel-hi": p.panelHi, "--zzx-deep": p.deep,
            "--zzx-accent": p.accent, "--zzx-secondary": p.secondary, "--zzx-text": p.text, "--zzx-muted": p.muted, "--zzx-border": p.border,
            "--primary-font-colour": p.text, "--subtext-font-colour": p.muted,
            "--primary-background-colour": p.bg, "--secondary-background-colour": p.panel,
            "--primary-border-colour": p.border, "--secondary-border-colour": mix(p.border, p.bg, 0.35),
            "--title-colour": p.accent, "--title-background-colour": p.panelHi,
            "--banner-font-colour": p.text, "--banner-bg-colour": p.deep, "--banner-url-colour": p.accent,
            "--category-list-font-colour": p.accent,
            "--op-list-operation-font-colour": p.text, "--op-list-operation-bg-colour": p.panel, "--op-list-operation-border-colour": p.border,
            "--rec-list-operation-font-colour": p.text, "--rec-list-operation-bg-colour": p.panelHi, "--rec-list-operation-border-colour": p.border,
            "--selected-operation-font-color": p.light ? "#ffffff" : "#111111", "--selected-operation-bg-colour": p.accent, "--selected-operation-border-colour": shift(p.accent, 0.14, false),
            "--arg-font-colour": p.text, "--arg-background": p.panel, "--arg-border-colour": p.border, "--arg-disabled-background": mix(p.panel, p.muted, 0.18), "--arg-label-colour": p.secondary,
            "--btn-default-font-colour": p.text, "--btn-default-bg-colour": p.panel, "--btn-default-border-colour": p.border,
            "--btn-default-hover-font-colour": p.light ? "#ffffff" : "#111111", "--btn-default-hover-bg-colour": p.accent, "--btn-default-hover-border-colour": p.accent,
            "--btn-success-font-colour": p.light ? "#ffffff" : "#111111", "--btn-success-bg-colour": p.accent, "--btn-success-border-colour": shift(p.accent, 0.12, false),
            "--scrollbar-track": p.deep, "--scrollbar-thumb": p.border, "--scrollbar-hover": p.accent,
            "--drop-file-border-colour": p.accent, "--table-border-colour": p.border, "--popover-background": p.panelHi, "--popover-border-colour": p.border,
            "--code-background": mix(p.panel, p.accent, 0.10), "--code-font-colour": p.text, "--input-highlight-colour": p.accent, "--input-border-colour": p.border
        };
        Object.entries(vars).forEach(([name, value]) => s.setProperty(name, value));
        doc.documentElement.style.colorScheme = p.light ? "light" : "dark";
    }

    const Themes = {
        presets: config.themePresets,
        index: 0,
        restore() {
            const id = Storage.read(key, this.presets[0]?.id || "tactical-standard");
            const found = this.presets.findIndex(item => item.id === id);
            this.index = found >= 0 ? found : 0; return this.current();
        },
        current() { return this.presets[this.index] || this.presets[0] || null; },
        apply(index = this.index, persist = true) {
            if (!this.presets.length) return null;
            this.index = ((index % this.presets.length) + this.presets.length) % this.presets.length;
            const preset = this.current(), doc = M.Runtime?.document();
            if (doc?.documentElement && M.Runtime?.mode() === "modified") {
                doc.documentElement.dataset.zzxTheme = preset.id;
                doc.documentElement.dataset.zzxThemeFamily = preset.family.id;
                doc.documentElement.dataset.zzxThemeVariant = preset.variant.id;
                setVars(doc, preset);
            }
            if (persist) Storage.write(key, preset.id);
            window.dispatchEvent(new CustomEvent("zzx-cyberchef-theme-change", { detail: { index: this.index, count: this.presets.length, preset } }));
            return preset;
        },
        applyCurrent(persist = false) { return this.apply(this.index, persist); }
    };
    Themes.restore(); M.Themes = Themes;
})();
