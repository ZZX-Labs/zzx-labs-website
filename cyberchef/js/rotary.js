(() => {
    "use strict";

    const M = window.ZZXCyberChefModules;
    const config = window.ZZX.CYBERCHEF;
    const Themes = M.Themes;
    const Layouts = M.Layouts;
    const Operations = M.Operations;

    function wrap(index, count) {
        return count ? ((index % count) + count) % count : 0;
    }

    function root(name) {
        return document.querySelector(`.cz-rotary[data-rotary="${name}"]`);
    }

    function button(name) {
        return root(name)?.querySelector(".cz-knob") || null;
    }

    function value(name) {
        return root(name)?.querySelector(".cz-rotary-value") || null;
    }

    function visual(name, index, count, label) {
        const btn = button(name);
        const pointer = btn?.querySelector(".cz-knob-pointer");
        if (!btn) return;
        const safeCount = Math.max(1, count);
        const normalized = wrap(index, safeCount);
        const angle = safeCount <= 1 ? -135 : -135 + (normalized / (safeCount - 1)) * 270;
        if (pointer) pointer.style.transform = `translateX(-50%) rotate(${angle}deg)`;
        if (value(name)) value(name).textContent = label || "—";
        btn.setAttribute("aria-valuemin", "0");
        btn.setAttribute("aria-valuemax", String(Math.max(0, safeCount - 1)));
        btn.setAttribute("aria-valuenow", String(normalized));
        btn.setAttribute("aria-valuetext", label || "Unavailable");
    }

    function refreshPresetVisuals() {
        const t = Themes.current();
        const l = Layouts.current();
        visual("theme", Themes.index, config.themePresets.length, t?.label || "—");
        visual("layout", Layouts.index, config.layoutPresets.length, l?.label || "—");
    }

    function step(name, delta) {
        if (name === "theme") {
            const preset = Themes.apply(Themes.index + delta);
            visual(name, Themes.index, config.themePresets.length, preset?.label);
        } else if (name === "layout") {
            const preset = Layouts.apply(Layouts.index + delta);
            visual(name, Layouts.index, config.layoutPresets.length, preset?.label);
        } else if (name === "module") {
            Operations.selectModule(Operations.state.moduleIndex + delta);
        } else if (name === "function") {
            Operations.selectFunction(Operations.state.functionIndex + delta);
        }
    }

    function press(name) {
        if (name === "module") Operations.selectModule(Operations.state.moduleIndex, { expand: true, scroll: true });
        if (name === "function") Operations.activateFunction();
    }

    function wire(name) {
        const btn = button(name);
        if (!btn) return;
        let pointerId = null;
        let lastY = 0;
        let accumulator = 0;
        let moved = false;

        btn.addEventListener("wheel", event => {
            event.preventDefault();
            step(name, event.deltaY > 0 ? 1 : -1);
        }, { passive: false });

        btn.addEventListener("keydown", event => {
            if (["ArrowRight", "ArrowUp"].includes(event.key)) {
                event.preventDefault(); step(name, 1);
            } else if (["ArrowLeft", "ArrowDown"].includes(event.key)) {
                event.preventDefault(); step(name, -1);
            } else if (event.key === "PageUp") {
                event.preventDefault(); step(name, 5);
            } else if (event.key === "PageDown") {
                event.preventDefault(); step(name, -5);
            } else if (["Enter", " "].includes(event.key)) {
                event.preventDefault(); press(name);
            }
        });

        btn.addEventListener("pointerdown", event => {
            pointerId = event.pointerId;
            lastY = event.clientY;
            accumulator = 0;
            moved = false;
            btn.setPointerCapture(pointerId);
        });

        btn.addEventListener("pointermove", event => {
            if (pointerId !== event.pointerId) return;
            accumulator += lastY - event.clientY;
            lastY = event.clientY;
            if (Math.abs(accumulator) >= 12) {
                step(name, accumulator > 0 ? 1 : -1);
                accumulator = 0;
                moved = true;
            }
        });

        btn.addEventListener("pointerup", event => {
            if (pointerId !== event.pointerId) return;
            try { btn.releasePointerCapture(pointerId); } catch (err) {}
            pointerId = null;
            if (!moved) press(name);
        });
        btn.addEventListener("pointercancel", () => { pointerId = null; });
    }

    const Rotary = {
        boot() {
            ["theme", "layout", "module", "function"].forEach(wire);
            refreshPresetVisuals();
            visual("module", 0, 1, "Loading…");
            visual("function", 0, 1, "Loading…");

            window.addEventListener("zzx-cyberchef-module-change", event => {
                const d = event.detail || {};
                visual("module", d.index || 0, d.count || 1, d.label || "—");
            });
            window.addEventListener("zzx-cyberchef-function-change", event => {
                const d = event.detail || {};
                visual("function", d.index || 0, d.count || 1, d.label || "—");
            });
            window.addEventListener("zzx-cyberchef-frame-ready", event => {
                const modified = event.detail?.mode === "modified";
                const deck = document.getElementById("cz-control-deck");
                if (deck) deck.hidden = !modified;
                Operations.reset();
                if (modified) {
                    Themes.restore();
                    Layouts.restore();
                    Themes.applyCurrent(false);
                    Layouts.applyCurrent(false);
                    refreshPresetVisuals();
                    Operations.wait();
                }
            });
        }
    };

    M.Rotary = Rotary;
})();
