(() => {
    "use strict";

    const M = window.ZZXCyberChefModules;
    const config = window.ZZX.CYBERCHEF;
    const Storage = M.Storage;
    const keys = config.storageKeys;

    const state = {
        categories: [],
        operations: [],
        moduleIndex: 0,
        functionIndex: 0,
        observer: null,
        timer: null
    };

    function wrap(index, count) {
        return count ? ((index % count) + count) % count : 0;
    }

    function cleanText(node) {
        if (!node) return "";
        const clone = node.cloneNode(true);
        clone.querySelectorAll(".op-count, .material-icons").forEach(n => n.remove());
        return clone.textContent.replace(/\s+/g, " ").trim();
    }

    function categoryName(category) {
        return cleanText(category?.querySelector(".category-title")) || "Unnamed module";
    }

    function operationName(operation) {
        return cleanText(operation) || "Unnamed function";
    }

    function categoriesFromFrame() {
        const doc = M.Runtime?.document();
        if (!doc) return [];
        return Array.from(doc.querySelectorAll("#categories .panel.category"));
    }

    function operationsFor(category) {
        return category ? Array.from(category.querySelectorAll(".op-list li.operation")) : [];
    }

    const Operations = {
        state,
        categoryName,
        operationName,

        refresh() {
            const categories = categoriesFromFrame();
            if (!categories.length) return false;
            state.categories = categories;

            const stored = Storage.read(keys.module, "");
            const storedIndex = categories.findIndex(node => categoryName(node) === stored);
            state.moduleIndex = storedIndex >= 0 ? storedIndex : Math.min(state.moduleIndex, categories.length - 1);
            this.selectModule(state.moduleIndex, { scroll: false, expand: false, persist: false });
            return true;
        },

        selectModule(index, options = {}) {
            if (!state.categories.length) return null;
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
            if (options.persist !== false) Storage.write(keys.module, label);

            state.operations = operationsFor(category);
            const savedFunction = Storage.read(keys.function, "");
            const savedIndex = state.operations.findIndex(node => operationName(node) === savedFunction);
            state.functionIndex = savedIndex >= 0 ? savedIndex : 0;
            this.selectFunction(state.functionIndex, { scroll: false, persist: false });

            window.dispatchEvent(new CustomEvent("zzx-cyberchef-module-change", {
                detail: { index: state.moduleIndex, count: state.categories.length, label }
            }));
            return { index: state.moduleIndex, count: state.categories.length, label };
        },

        selectFunction(index, options = {}) {
            if (!state.operations.length) {
                window.dispatchEvent(new CustomEvent("zzx-cyberchef-function-change", {
                    detail: { index: 0, count: 0, label: "No functions" }
                }));
                return null;
            }

            state.functionIndex = wrap(index, state.operations.length);
            const operation = state.operations[state.functionIndex];
            const label = operationName(operation);
            state.operations.forEach(node => node.classList.remove("zzx-knob-selected-operation"));
            operation.classList.add("zzx-knob-selected-operation");
            if (options.scroll !== false) {
                try { operation.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (err) {}
            }
            if (options.persist !== false) Storage.write(keys.function, label);

            window.dispatchEvent(new CustomEvent("zzx-cyberchef-function-change", {
                detail: { index: state.functionIndex, count: state.operations.length, label }
            }));
            return { index: state.functionIndex, count: state.operations.length, label };
        },

        activateFunction() {
            const operation = state.operations[state.functionIndex];
            const win = M.Runtime?.window();
            if (!operation || !win) return false;
            operation.dispatchEvent(new win.MouseEvent("dblclick", {
                bubbles: true,
                cancelable: true,
                view: win
            }));
            return true;
        },

        observe() {
            state.observer?.disconnect();
            const root = M.Runtime?.document()?.querySelector("#categories");
            if (!root || !window.MutationObserver) return;
            state.observer = new MutationObserver(() => {
                clearTimeout(state.timer);
                state.timer = setTimeout(() => this.refresh(), 100);
            });
            state.observer.observe(root, { childList: true, subtree: true });
        },

        wait(attempt = 0) {
            if (this.refresh()) {
                this.observe();
                return;
            }
            if (attempt >= 80) {
                window.dispatchEvent(new CustomEvent("zzx-cyberchef-module-change", {
                    detail: { index: 0, count: 0, label: "Unavailable" }
                }));
                return;
            }
            setTimeout(() => this.wait(attempt + 1), 125);
        },

        reset() {
            state.observer?.disconnect();
            state.categories = [];
            state.operations = [];
        }
    };

    M.Operations = Operations;
})();
