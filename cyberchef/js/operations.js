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
        clone.querySelectorAll(".op-count, .material-icons, .badge").forEach(n => n.remove());
        return (clone.textContent || "").replace(/\s+/g, " ").trim();
    }

    function unique(nodes) {
        return Array.from(new Set(nodes.filter(Boolean)));
    }

    function operationNodes(root) {
        if (!root) return [];
        const selectors = [
            ".op-list li.operation",
            "li.operation",
            "[data-operation]",
            ".operation"
        ];
        const nodes = unique(selectors.flatMap(selector => Array.from(root.querySelectorAll(selector))));
        return nodes.filter(node => !nodes.some(other => other !== node && other.contains(node)));
    }

    function labelForCategory(node, fallback) {
        if (!node) return fallback;
        const title = node.querySelector(
            ".category-title, .panel-title, [data-category-title], [role=\"heading\"], h2, h3, h4"
        );
        return cleanText(title) || node.getAttribute("data-category") || fallback;
    }

    function categoryModels() {
        const doc = M.Runtime?.document();
        if (!doc) return [];

        const selectors = [
            "#categories .panel.category",
            "#categories .category",
            "#operations .panel.category",
            "#operations [data-category]",
            "#operations .category"
        ];
        const candidates = unique(selectors.flatMap(selector => Array.from(doc.querySelectorAll(selector))));
        const models = candidates.map((node, index) => ({
            node,
            titleNode: node.querySelector(".category-title, .panel-title, [data-category-title], [role=\"heading\"], h2, h3, h4"),
            label: labelForCategory(node, `Module ${index + 1}`),
            operations: operationNodes(node)
        })).filter(model => model.operations.length);

        if (models.length) return models;

        // Release-independent fallback: if CyberChef changes its category wrappers,
        // retain a functional Function encoder by treating the operations pane as one
        // aggregate module instead of declaring the runtime invalid.
        const operationsRoot = doc.querySelector("#operations, [data-panel=\"operations\"], [class*=\"operations\"]");
        const ops = operationNodes(operationsRoot || doc);
        if (!ops.length) return [];
        return [{
            node: operationsRoot || doc.body,
            titleNode: null,
            label: "All Operations",
            operations: ops
        }];
    }

    function categoryName(category) {
        return category?.label || "Unnamed module";
    }

    function operationName(operation) {
        return cleanText(operation) || operation?.getAttribute?.("data-operation") || "Unnamed function";
    }

    const Operations = {
        state,
        categoryName,
        operationName,

        refresh() {
            const categories = categoryModels();
            if (!categories.length) return false;
            state.categories = categories;

            const stored = Storage.read(keys.module, "");
            const storedIndex = categories.findIndex(category => categoryName(category) === stored);
            state.moduleIndex = storedIndex >= 0 ? storedIndex : Math.min(state.moduleIndex, categories.length - 1);
            this.selectModule(state.moduleIndex, { scroll: false, expand: false, persist: false });
            return true;
        },

        selectModule(index, options = {}) {
            if (!state.categories.length) return null;
            state.moduleIndex = wrap(index, state.categories.length);
            const category = state.categories[state.moduleIndex];
            const node = category.node;
            const title = category.titleNode;
            const panel = node?.querySelector?.(".panel-collapse, [data-collapse], [role=\"region\"]");
            const label = categoryName(category);

            state.categories.forEach(item => item.node?.classList?.remove("zzx-knob-selected-category"));
            node?.classList?.add("zzx-knob-selected-category");

            if (panel && !panel.classList.contains("show") && options.expand !== false) {
                try { title?.click(); } catch (err) {}
            }
            if (options.scroll !== false) {
                try { node?.scrollIntoView?.({ block: "center", behavior: "smooth" }); } catch (err) {}
            }
            if (options.persist !== false) Storage.write(keys.module, label);

            state.operations = category.operations || [];
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
            return this.activateNode(operation);
        },

        activateNode(operation) {
            const win = M.Runtime?.window();
            if (!operation || !win) return false;
            const name = operationName(operation);
            operation.dispatchEvent(new win.MouseEvent("dblclick", { bubbles: true, cancelable: true, view: win }));
            setTimeout(() => window.dispatchEvent(new CustomEvent("zzx-cyberchef-operation-activated", { detail: { name } })), 40);
            return true;
        },

        recipeNodes() {
            const doc = M.Runtime?.document();
            return doc ? Array.from(doc.querySelectorAll("#rec-list li.operation")) : [];
        },

        recipeNodeForSelectedFunction() {
            const target = String(state.operations[state.functionIndex] ? operationName(state.operations[state.functionIndex]) : "").trim().toLowerCase();
            const nodes = this.recipeNodes();
            if (!target) return nodes[nodes.length - 1] || null;
            const matches = nodes.filter(node => cleanText(node.querySelector(".op-title") || node).toLowerCase() === target);
            return matches[matches.length - 1] || null;
        },

        allOperations() {
            return Array.from(new Set(state.categories.flatMap(category => category.operations || [])));
        },

        findByName(name) {
            const target = String(name || "").trim().toLowerCase();
            if (!target) return null;
            const all = this.allOperations();
            return all.find(node => operationName(node).toLowerCase() === target) ||
                   all.find(node => operationName(node).toLowerCase().includes(target)) || null;
        },

        activateByName(name) {
            if (!state.categories.length) this.refresh();
            return this.activateNode(this.findByName(name));
        },

        recipeOperationNames() {
            const doc = M.Runtime?.document();
            if (!doc) return [];
            const nodes = Array.from(doc.querySelectorAll("#recipe .operation, #recipe .recipe-op, #recipe [data-operation]"));
            return nodes.map(node => {
                const title = node.querySelector?.(".op-title, .operation-title, .title, [data-operation-title]");
                return cleanText(title || node) || node.getAttribute?.("data-operation") || "";
            }).filter(Boolean);
        },

        observe() {
            state.observer?.disconnect();
            const doc = M.Runtime?.document();
            const root = doc?.querySelector("#categories, #operations, [data-panel=\"operations\"]") || doc?.body;
            if (!root || !window.MutationObserver) return;
            state.observer = new MutationObserver(() => {
                clearTimeout(state.timer);
                state.timer = setTimeout(() => this.refresh(), 150);
            });
            state.observer.observe(root, { childList: true, subtree: true });
        },

        wait(attempt = 0) {
            if (this.refresh()) {
                this.observe();
                return;
            }
            if (attempt >= 120) {
                window.dispatchEvent(new CustomEvent("zzx-cyberchef-module-change", {
                    detail: { index: 0, count: 0, label: "Unavailable" }
                }));
                window.dispatchEvent(new CustomEvent("zzx-cyberchef-function-change", {
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
