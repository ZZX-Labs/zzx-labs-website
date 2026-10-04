(() => {
    "use strict";

    const config = window.ZZX?.CYBERCHEF || {};
    const STORAGE = config.storageKeys || {};

    const state = {
        themeIndex: 0,
        layoutIndex: 0,
        moduleIndex: 0,
        functionIndex: 0,
        categories: [],
        operations: [],
        observer: null,
        refreshTimer: null,
        currentMode: "modified"
    };

    function read(key, fallback = null) {
        try { return localStorage.getItem(key) ?? fallback; }
        catch (err) { return fallback; }
    }

    function write(key, value) {
        try { localStorage.setItem(key, String(value)); }
        catch (err) {}
    }

    function wrap(index, count) {
        if (!count) return 0;
        return ((index % count) + count) % count;
    }

    function cleanText(node) {
        if (!node) return "";
        const clone = node.cloneNode(true);
        clone.querySelectorAll(".op-count, .material-icons").forEach(n => n.remove());
        return clone.textContent.replace(/\s+/g, " ").trim();
    }

    function knobRoot(name) {
        return document.querySelector(`.cz-rotary[data-rotary="${name}"]`);
    }

    function knobButton(name) {
        return knobRoot(name)?.querySelector(".cz-knob") || null;
    }

    function knobValue(name) {
        return knobRoot(name)?.querySelector(".cz-rotary-value") || null;
    }

    function updateKnobVisual(name, index, count, label) {
        const button = knobButton(name);
        const pointer = button?.querySelector(".cz-knob-pointer");
        const value = knobValue(name);
        if (!button) return;

        const safeCount = Math.max(1, count);
        const angle = safeCount <= 1 ? -135 : -135 + (wrap(index, safeCount) / (safeCount - 1)) * 270;
        if (pointer) pointer.style.transform = `translateX(-50%) rotate(${angle}deg)`;
        if (value) value.textContent = label || "—";

        button.setAttribute("aria-valuemin", "0");
        button.setAttribute("aria-valuemax", String(Math.max(0, safeCount - 1)));
        button.setAttribute("aria-valuenow", String(wrap(index, safeCount)));
        button.setAttribute("aria-valuetext", label || "Unavailable");
    }

    function frameDocument() {
        return window.ZZXCyberChef?.getDocument?.() || null;
    }

    function applyTheme(index, persist = true) {
        const presets = config.themePresets || [];
        if (!presets.length) return;
        state.themeIndex = wrap(index, presets.length);
        const preset = presets[state.themeIndex];
        const doc = frameDocument();
        if (doc?.documentElement && state.currentMode === "modified") {
            doc.documentElement.dataset.zzxTheme = preset.id;
        }
        if (persist) write(STORAGE.theme || "zzxCyberChefThemeV8", preset.id);
        updateKnobVisual("theme", state.themeIndex, presets.length, preset.label);
    }

    function applyLayout(index, persist = true) {
        const presets = config.layoutPresets || [];
        if (!presets.length) return;
        state.layoutIndex = wrap(index, presets.length);
        const preset = presets[state.layoutIndex];
        const doc = frameDocument();
        if (doc?.documentElement && state.currentMode === "modified") {
            doc.documentElement.dataset.zzxLayout = preset.id;
        }
        if (persist) write(STORAGE.layout || "zzxCyberChefLayoutV8", preset.id);
        updateKnobVisual("layout", state.layoutIndex, presets.length, preset.label);
    }

    function categoriesFromFrame() {
        const doc = frameDocument();
        if (!doc) return [];
        return Array.from(doc.querySelectorAll("#categories .panel.category"));
    }

    function operationsForCategory(category) {
        if (!category) return [];
        return Array.from(category.querySelectorAll(".op-list li.operation"));
    }

    function categoryName(category) {
        return cleanText(category?.querySelector(".category-title")) || "Unnamed module";
    }

    function operationName(operation) {
        return cleanText(operation) || "Unnamed function";
    }

    function clearSelectionClasses() {
        const doc = frameDocument();
        if (!doc) return;
        doc.querySelectorAll(".zzx-knob-selected-category").forEach(node => node.classList.remove("zzx-knob-selected-category"));
        doc.querySelectorAll(".zzx-knob-selected-operation").forEach(node => node.classList.remove("zzx-knob-selected-operation"));
    }

    function selectModule(index, options = {}) {
        if (!state.categories.length) {
            updateKnobVisual("module", 0, 1, "Loading…");
            updateKnobVisual("function", 0, 1, "Loading…");
            return;
        }

        state.moduleIndex = wrap(index, state.categories.length);
        const category = state.categories[state.moduleIndex];
        const title = category.querySelector(".category-title");
        const panel = category.querySelector(".panel-collapse");
        const label = categoryName(category);

        state.categories.forEach(node => node.classList.remove("zzx-knob-selected-category"));
        category.classList.add("zzx-knob-selected-category");

        if (panel && !panel.classList.contains("show") && options.expand !== false) {
            try { title?.click(); } catch (err) {}
        }

        if (options.scroll !== false) {
            try { category.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (err) {}
        }

        write(STORAGE.module || "zzxCyberChefModuleV8", label);
        updateKnobVisual("module", state.moduleIndex, state.categories.length, label);

        state.operations = operationsForCategory(category);
        const storedFunction = read(STORAGE.function || "zzxCyberChefFunctionV8", "");
        const storedIndex = state.operations.findIndex(node => operationName(node) === storedFunction);
        state.functionIndex = storedIndex >= 0 ? storedIndex : 0;
        selectFunction(state.functionIndex, { scroll: false, persist: false });
    }

    function selectFunction(index, options = {}) {
        if (!state.operations.length) {
            updateKnobVisual("function", 0, 1, "No functions");
            return;
        }

        state.functionIndex = wrap(index, state.operations.length);
        const operation = state.operations[state.functionIndex];
        const label = operationName(operation);

        state.operations.forEach(node => node.classList.remove("zzx-knob-selected-operation"));
        operation.classList.add("zzx-knob-selected-operation");

        if (options.scroll !== false) {
            try { operation.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (err) {}
        }

        if (options.persist !== false) {
            write(STORAGE.function || "zzxCyberChefFunctionV8", label);
        }
        updateKnobVisual("function", state.functionIndex, state.operations.length, label);
    }

    function activateFunction() {
        const operation = state.operations[state.functionIndex];
        const win = window.ZZXCyberChef?.getWindow?.();
        if (!operation || !win) return;

        try {
            operation.dispatchEvent(new win.MouseEvent("dblclick", {
                bubbles: true,
                cancelable: true,
                view: win
            }));
        } catch (err) {
            console.warn("[CyberChefZZX] Could not activate selected operation:", err);
        }
    }

    function refreshNavigator() {
        const categories = categoriesFromFrame();
        if (!categories.length) {
            updateKnobVisual("module", 0, 1, "Loading…");
            updateKnobVisual("function", 0, 1, "Loading…");
            return false;
        }

        state.categories = categories;
        const storedModule = read(STORAGE.module || "zzxCyberChefModuleV8", "");
        const storedIndex = categories.findIndex(node => categoryName(node) === storedModule);
        state.moduleIndex = storedIndex >= 0 ? storedIndex : Math.min(state.moduleIndex, categories.length - 1);
        selectModule(state.moduleIndex, { scroll: false, expand: false });
        return true;
    }

    function observeFrame() {
        state.observer?.disconnect();
        state.observer = null;

        const doc = frameDocument();
        const categories = doc?.querySelector("#categories");
        if (!categories || !window.MutationObserver) return;

        state.observer = new MutationObserver(() => {
            clearTimeout(state.refreshTimer);
            state.refreshTimer = setTimeout(refreshNavigator, 100);
        });
        state.observer.observe(categories, { childList: true, subtree: true });
    }

    function waitForOperations(attempt = 0) {
        if (refreshNavigator()) {
            observeFrame();
            return;
        }
        if (attempt >= 80) {
            updateKnobVisual("module", 0, 1, "Unavailable");
            updateKnobVisual("function", 0, 1, "Unavailable");
            return;
        }
        setTimeout(() => waitForOperations(attempt + 1), 125);
    }

    function restorePresetIndexes() {
        const themes = config.themePresets || [];
        const layouts = config.layoutPresets || [];
        const storedTheme = read(STORAGE.theme || "zzxCyberChefThemeV8", themes[0]?.id || "tactical");
        const storedLayout = read(STORAGE.layout || "zzxCyberChefLayoutV8", layouts[0]?.id || "native");
        state.themeIndex = Math.max(0, themes.findIndex(item => item.id === storedTheme));
        state.layoutIndex = Math.max(0, layouts.findIndex(item => item.id === storedLayout));
        applyTheme(state.themeIndex, false);
        applyLayout(state.layoutIndex, false);
    }

    function step(name, delta) {
        if (name === "theme") applyTheme(state.themeIndex + delta);
        else if (name === "layout") applyLayout(state.layoutIndex + delta);
        else if (name === "module") selectModule(state.moduleIndex + delta);
        else if (name === "function") selectFunction(state.functionIndex + delta);
    }

    function press(name) {
        if (name === "module") selectModule(state.moduleIndex, { expand: true, scroll: true });
        else if (name === "function") activateFunction();
    }

    function wireKnob(name) {
        const button = knobButton(name);
        if (!button) return;

        let pointerId = null;
        let lastY = 0;
        let accumulator = 0;
        let moved = false;

        button.addEventListener("wheel", event => {
            event.preventDefault();
            step(name, event.deltaY > 0 ? 1 : -1);
        }, { passive: false });

        button.addEventListener("keydown", event => {
            if (["ArrowRight", "ArrowUp"].includes(event.key)) {
                event.preventDefault();
                step(name, 1);
            } else if (["ArrowLeft", "ArrowDown"].includes(event.key)) {
                event.preventDefault();
                step(name, -1);
            } else if (event.key === "PageUp") {
                event.preventDefault();
                step(name, 5);
            } else if (event.key === "PageDown") {
                event.preventDefault();
                step(name, -5);
            } else if (["Enter", " "].includes(event.key)) {
                event.preventDefault();
                press(name);
            }
        });

        button.addEventListener("pointerdown", event => {
            pointerId = event.pointerId;
            lastY = event.clientY;
            accumulator = 0;
            moved = false;
            button.setPointerCapture(pointerId);
        });

        button.addEventListener("pointermove", event => {
            if (pointerId !== event.pointerId) return;
            const delta = lastY - event.clientY;
            lastY = event.clientY;
            accumulator += delta;
            if (Math.abs(accumulator) >= 12) {
                const direction = accumulator > 0 ? 1 : -1;
                step(name, direction);
                accumulator = 0;
                moved = true;
            }
        });

        button.addEventListener("pointerup", event => {
            if (pointerId !== event.pointerId) return;
            try { button.releasePointerCapture(pointerId); } catch (err) {}
            pointerId = null;
            if (!moved) press(name);
        });

        button.addEventListener("pointercancel", () => {
            pointerId = null;
        });
    }

    function onFrameReady(event) {
        state.currentMode = event?.detail?.mode === "native" ? "native" : "modified";
        const deck = document.getElementById("cz-control-deck");
        if (deck) deck.hidden = state.currentMode !== "modified";

        state.observer?.disconnect();
        clearSelectionClasses();

        if (state.currentMode !== "modified") return;
        restorePresetIndexes();
        waitForOperations();
    }

    function boot() {
        ["theme", "layout", "module", "function"].forEach(wireKnob);
        restorePresetIndexes();
        updateKnobVisual("module", 0, 1, "Loading…");
        updateKnobVisual("function", 0, 1, "Loading…");
        window.addEventListener("zzx-cyberchef-frame-ready", onFrameReady);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }
})();
