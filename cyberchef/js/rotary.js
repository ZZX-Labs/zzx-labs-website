(() => {
    "use strict";

    const M = window.ZZXCyberChefModules;
    const Themes = M.Themes;
    const Layouts = M.Layouts;
    const Operations = M.Operations;
    const Macros = M.Macros;
    const names = ["theme", "layout", "module", "function", "macro-a", "macro-b", "macro-c", "macro-d"];
    const wrap = (i, n) => n ? ((Number(i) % n) + n) % n : 0;
    const root = name => document.querySelector(`.cz-rotary[data-rotary="${name}"]`);
    const button = name => root(name)?.querySelector(".cz-knob") || null;
    const value = name => root(name)?.querySelector(".cz-rotary-value") || null;
    const display = name => root(name)?.querySelector(".cz-rotary-display") || null;
    const stepping = new Map();

    function visual(name, index, count, label, pending = false) {
        const btn = button(name), card = root(name);
        if (!btn) return;
        const safe = Math.max(1, Number(count) || 1);
        const norm = wrap(index, safe);
        const fraction = safe <= 1 ? 0 : norm / (safe - 1);
        const angle = -135 + fraction * 270;
        btn.style.setProperty("--cz-knob-angle", `${angle}deg`);
        btn.style.setProperty("--cz-knob-progress", `${fraction * 100}%`);
        btn.classList.toggle("is-pending", Boolean(pending));
        if (value(name)) value(name).textContent = label || "—";
        if (card) {
            card.dataset.detent = String(norm + 1);
            card.dataset.detents = String(safe);
            card.dataset.pending = pending ? "1" : "0";
            card.style.setProperty("--cz-card-progress", `${fraction * 100}%`);
        }
        const oled = display(name);
        if (oled) oled.dataset.pending = pending ? "1" : "0";
        btn.setAttribute("aria-valuemin", "0");
        btn.setAttribute("aria-valuemax", String(Math.max(0, safe - 1)));
        btn.setAttribute("aria-valuenow", String(norm));
        btn.setAttribute("aria-valuetext", label || "Unavailable");
        const meter = card?.querySelector(".cz-rotary-meter");
        const meterText = `${String(norm + 1).padStart(2, "0")} / ${String(safe).padStart(2, "0")}`;
        if (meter) meter.textContent = meterText;
        if (btn) btn.title = `${label || "Unavailable"} · ${meterText}`;
    }

    function ensureMeters() {
        document.querySelectorAll(".cz-rotary").forEach(card => {
            if (card.querySelector(".cz-rotary-meter")) return;
            const meter = document.createElement("span");
            meter.className = "cz-rotary-meter";
            meter.textContent = "01 / 01";
            (card.querySelector(".cz-rotary-display") || card).appendChild(meter);
        });
    }

    async function ensurePresetCatalog(name) {
        if (name === "theme") {
            await Themes.ensureReady();
            return Themes;
        }
        if (name === "layout") {
            await Layouts.ensureReady();
            return Layouts;
        }
        return null;
    }

    async function refresh() {
        try {
            await Promise.all([Themes.ensureReady(), Layouts.ensureReady()]);
        } catch (_) {}
        visual("theme", Themes.index, Themes.presets.length || 1, Themes.current()?.label || "Theme unavailable");
        visual("layout", Layouts.index, Layouts.presets.length || 1, Layouts.current()?.label || "Layout unavailable");
        ["a", "b", "c", "d"].forEach(bank => {
            const selected = Macros.selected(bank);
            visual(`macro-${bank}`, selected.index, (Macros.definitions[bank] || []).length, selected.slot.name);
        });
    }

    function serialStep(name, work) {
        const previous = stepping.get(name) || Promise.resolve();
        const next = previous.catch(() => {}).then(work).catch(err => {
            console.error(`[CyberChefZZX rotary:${name}]`, err);
            M.Status?.set(err?.message || `${name} control failed.`, "error");
        });
        stepping.set(name, next);
        return next;
    }

    function step(name, delta) {
        if (!delta) return;
        if (name === "theme" || name === "layout") {
            return serialStep(name, async () => {
                const module = await ensurePresetCatalog(name);
                const nextIndex = module.index + delta;
                const preset = module.apply(nextIndex, true);
                visual(name, module.index, module.presets.length, preset?.label, true);
            });
        }
        if (name === "module") return Operations.selectModule(Operations.state.moduleIndex + delta);
        if (name === "function") return Operations.selectFunction(Operations.state.functionIndex + delta);
        if (name.startsWith("macro-")) {
            const bank = name.slice(-1);
            const selected = Macros.step(bank, delta);
            visual(name, selected.index, (Macros.definitions[bank] || []).length, selected.slot.name);
        }
    }

    function press(name) {
        if (name === "module") Operations.selectModule(Operations.state.moduleIndex, { expand: true, scroll: true });
        else if (name === "function") Operations.activateFunction();
        else if (name.startsWith("macro-")) Macros.run(name.slice(-1));
    }

    async function home(name) {
        if (name !== "theme" && name !== "layout") return;
        const module = await ensurePresetCatalog(name);
        const preset = module.apply(0, true);
        visual(name, module.index, module.presets.length, preset?.label, true);
    }

    function wire(name) {
        const btn = button(name), card = root(name);
        if (!btn || btn.dataset.czRotaryWired === "1") return;
        btn.dataset.czRotaryWired = "1";
        let pointerId = null, lastY = 0, accumulator = 0, moved = false, velocity = 0, lastTime = 0;

        btn.addEventListener("wheel", event => {
            event.preventDefault();
            const direction = event.deltaY > 0 ? 1 : -1;
            step(name, direction * (event.shiftKey ? 8 : 1));
        }, { passive: false });

        btn.addEventListener("keydown", event => {
            if (["ArrowRight", "ArrowUp"].includes(event.key)) {
                event.preventDefault();
                step(name, event.shiftKey ? 8 : 1);
            } else if (["ArrowLeft", "ArrowDown"].includes(event.key)) {
                event.preventDefault();
                step(name, event.shiftKey ? -8 : -1);
            } else if (event.key === "PageUp") {
                event.preventDefault();
                step(name, 8);
            } else if (event.key === "PageDown") {
                event.preventDefault();
                step(name, -8);
            } else if (event.key === "Home") {
                event.preventDefault();
                void home(name);
            } else if (["Enter", " "].includes(event.key)) {
                event.preventDefault();
                press(name);
            }
        });

        btn.addEventListener("pointerdown", event => {
            pointerId = event.pointerId;
            lastY = event.clientY;
            accumulator = 0;
            moved = false;
            velocity = 0;
            lastTime = performance.now();
            card?.classList.add("is-grabbing");
            btn.setPointerCapture(pointerId);
        });

        btn.addEventListener("pointermove", event => {
            if (pointerId !== event.pointerId) return;
            const now = performance.now();
            const dy = lastY - event.clientY;
            accumulator += dy;
            velocity = dy / Math.max(1, now - lastTime);
            lastY = event.clientY;
            lastTime = now;
            const threshold = event.shiftKey ? 3.5 : 7;
            if (Math.abs(accumulator) < threshold) return;
            const amount = Math.max(1, Math.min(12, Math.floor(Math.abs(accumulator) / threshold)));
            step(name, (accumulator > 0 ? 1 : -1) * amount);
            accumulator = 0;
            moved = true;
        });

        btn.addEventListener("pointerup", event => {
            if (pointerId !== event.pointerId) return;
            try { btn.releasePointerCapture(pointerId); } catch (_) {}
            pointerId = null;
            card?.classList.remove("is-grabbing");
            if (!moved) press(name);
            else if (Math.abs(velocity) > .75) step(name, velocity > 0 ? 2 : -2);
        });

        btn.addEventListener("pointercancel", () => {
            pointerId = null;
            card?.classList.remove("is-grabbing");
        });
    }

    M.Rotary = {
        async boot() {
            ensureMeters();
            names.forEach(wire);
            visual("module", 0, 1, "Loading…");
            visual("function", 0, 1, "Loading…");
            await refresh();

            window.addEventListener("zzx-cyberchef-themes-ready", () => { void refresh(); });
            window.addEventListener("zzx-cyberchef-layouts-ready", () => { void refresh(); });
            window.addEventListener("zzx-cyberchef-theme-change", event => {
                const d = event.detail || {};
                visual("theme", d.index || 0, d.count || 1, d.preset?.label || "—", Boolean(d.pending));
            });
            window.addEventListener("zzx-cyberchef-layout-change", event => {
                const d = event.detail || {};
                visual("layout", d.index || 0, d.count || 1, d.preset?.label || "—", Boolean(d.pending));
            });
            window.addEventListener("zzx-cyberchef-module-change", event => {
                const d = event.detail || {};
                visual("module", d.index || 0, d.count || 1, d.label || "—");
            });
            window.addEventListener("zzx-cyberchef-function-change", event => {
                const d = event.detail || {};
                visual("function", d.index || 0, d.count || 1, d.label || "—");
            });
            window.addEventListener("zzx-cyberchef-macro-change", event => {
                const d = event.detail || {};
                visual(`macro-${d.bank}`, d.index || 0, d.count || 1, d.label || "—");
            });
            window.addEventListener("zzx-cyberchef-frame-ready", event => {
                const modified = event.detail?.mode === "modified";
                const deck = document.getElementById("cz-control-deck");
                if (deck) deck.hidden = !modified;
                Operations.reset();
                if (modified) {
                    void refresh();
                    Operations.wait();
                }
            });
        }
    };
})();
