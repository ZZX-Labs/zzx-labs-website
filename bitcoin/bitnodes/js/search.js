(() => {
    "use strict";

    const BN = window.BN || {};

    function normalize(value) {
        return String(value || "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
    }

    function getRows(table) {
        return Array.from(
            table.querySelectorAll("tbody tr")
        );
    }

    function buildSearchIndex(row) {
        return Array.from(row.cells)
            .map(cell => cell.textContent || "")
            .join(" ")
            .replace(/\s+/g, " ")
            .toLowerCase()
            .trim();
    }

    function formatNumber(value) {
        if (BN.formatNumber) {
            return BN.formatNumber(value);
        }

        const n = Number(value);

        return Number.isFinite(n)
            ? n.toLocaleString()
            : String(value ?? "0");
    }

    function getTableScroll(table) {
        return table.closest(".bn-table-scroll, .bn-table-wrap");
    }

    function getToolbarContainer(table) {
        const scroll = getTableScroll(table);

        if (scroll && scroll.parentElement) {
            return scroll.parentElement;
        }

        return (
            table.closest(".bn-widget-table-section") ||
            table.closest(".bn-node-panel") ||
            table.closest(".bn-panel") ||
            table.parentElement
        );
    }

    function removeDuplicateToolbars(container) {
        if (!container) {
            return;
        }

        const toolbars = Array.from(
            container.querySelectorAll(":scope > .bn-search-toolbar")
        );

        toolbars.slice(1).forEach(toolbar => {
            toolbar.remove();
        });
    }

    function getOrCreateToolbar(table) {
        const container = getToolbarContainer(table);
        const scroll = getTableScroll(table);

        if (!container) {
            return null;
        }

        removeDuplicateToolbars(container);

        let toolbar = container.querySelector(":scope > .bn-search-toolbar");

        if (toolbar) {
            return toolbar;
        }

        toolbar = document.createElement("div");
        toolbar.className = "bn-search-toolbar";

        toolbar.innerHTML = `
            <div class="bn-searchbar-wrap">
                <div class="bn-searchbar">
                    <input
                        type="search"
                        class="bn-search-input bn-table-search-input"
                        placeholder="Search table records..."
                        autocomplete="off"
                        spellcheck="false"
                    >

                    <button
                        type="button"
                        class="bn-search-clear"
                    >
                        Clear
                    </button>

                    <div class="bn-search-meta bn-search-stats">
                        <span>
                            Showing
                            <strong>0</strong>
                            of
                            <strong>0</strong>
                            records
                        </span>
                    </div>
                </div>
            </div>
        `;

        if (scroll && scroll.parentElement === container) {
            container.insertBefore(toolbar, scroll);
        } else {
            container.prepend(toolbar);
        }

        return toolbar;
    }

    function getOrCreateEmptyState(table) {
        const scroll = getTableScroll(table);

        if (!scroll) {
            return null;
        }

        let empty = scroll.querySelector(":scope > .bn-search-empty");

        if (empty) {
            return empty;
        }

        empty = document.createElement("div");
        empty.className = "bn-search-empty bn-search-hidden";
        empty.textContent = "No records match the current search query.";

        scroll.appendChild(empty);

        return empty;
    }

    function updateCounter(counter, visible, total) {
        if (!counter) {
            return;
        }

        counter.innerHTML = `
            <span>
                Showing
                <strong>${formatNumber(visible)}</strong>
                of
                <strong>${formatNumber(total)}</strong>
                records
            </span>
        `;
    }

    function applyFilter(state) {
        const query = normalize(state.input?.value || "");
        let visible = 0;

        state.rows.forEach(row => {
            const match =
                !query ||
                row.dataset.search.includes(query);

            row.classList.toggle("bn-search-filtered", !match);

            if (match) {
                visible += 1;
            }
        });

        if (state.empty) {
            state.empty.classList.toggle(
                "bn-search-hidden",
                visible !== 0
            );
        }

        updateCounter(
            state.counter,
            visible,
            state.rows.length
        );

        if (window.BNTables?.refresh) {
            window.BNTables.refresh(state.scope || document);
        }
    }

    function attach(table) {
        if (!table || table.dataset.bnSearchReady === "true") {
            return;
        }

        const rows = getRows(table);

        if (!rows.length) {
            return;
        }

        const toolbar = getOrCreateToolbar(table);

        if (!toolbar) {
            return;
        }

        const input = toolbar.querySelector(".bn-search-input");
        const clear = toolbar.querySelector(".bn-search-clear");
        const counter = toolbar.querySelector(".bn-search-stats");
        const empty = getOrCreateEmptyState(table);

        if (!input) {
            return;
        }

        rows.forEach(row => {
            row.dataset.search = buildSearchIndex(row);
        });

        const state = {
            table,
            scope: getToolbarContainer(table) || document,
            toolbar,
            input,
            clear,
            counter,
            empty,
            rows
        };

        input.addEventListener("input", () => {
            applyFilter(state);
        });

        clear?.addEventListener("click", () => {
            input.value = "";
            applyFilter(state);
            input.focus();
        });

        table.dataset.bnSearchReady = "true";

        applyFilter(state);
    }

    function init(scope = document) {
        const tables = BN.$$ ?
            BN.$$(".bn-table", scope) :
            Array.from(scope.querySelectorAll(".bn-table"));

        tables.forEach(attach);
    }

    function refresh(scope = document) {
        const tables = BN.$$ ?
            BN.$$(".bn-table", scope) :
            Array.from(scope.querySelectorAll(".bn-table"));

        tables.forEach(table => {
            const container = getToolbarContainer(table);
            const toolbar = container?.querySelector(":scope > .bn-search-toolbar");

            if (!toolbar) {
                attach(table);
                return;
            }

            const input = toolbar.querySelector(".bn-search-input");
            const counter = toolbar.querySelector(".bn-search-stats");
            const empty = getOrCreateEmptyState(table);
            const rows = getRows(table);

            rows.forEach(row => {
                row.dataset.search = buildSearchIndex(row);
            });

            applyFilter({
                table,
                scope: container || scope,
                toolbar,
                input,
                counter,
                empty,
                rows
            });
        });
    }

    function destroy(scope = document) {
        const tables = BN.$$ ?
            BN.$$(".bn-table", scope) :
            Array.from(scope.querySelectorAll(".bn-table"));

        tables.forEach(table => {
            table.dataset.bnSearchReady = "false";
        });

        const toolbars = BN.$$ ?
            BN.$$(".bn-search-toolbar", scope) :
            Array.from(scope.querySelectorAll(".bn-search-toolbar"));

        toolbars.forEach(toolbar => {
            toolbar.remove();
        });

        const empties = BN.$$ ?
            BN.$$(".bn-search-empty", scope) :
            Array.from(scope.querySelectorAll(".bn-search-empty"));

        empties.forEach(empty => {
            empty.remove();
        });
    }

    window.BNSearchInit = init;

    window.BNSearch = {
        init,
        attach,
        refresh,
        destroy,
        applyFilter
    };
})();
