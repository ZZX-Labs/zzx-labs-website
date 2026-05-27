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

    function getToolbarContainer(table) {
        return (
            table.closest(".bn-widget-table-section") ||
            table.closest(".bn-panel") ||
            table.parentElement
        );
    }

    function getOrCreateToolbar(table) {
        const container = getToolbarContainer(table);

        if (!container) {
            return null;
        }

        const existing = container.querySelector(
            ":scope > .bn-search-toolbar"
        );

        if (existing) {
            return existing;
        }

        const toolbar = document.createElement("div");

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

        const tableScroll =
            table.closest(".bn-table-scroll");

        if (tableScroll) {
            container.insertBefore(toolbar, tableScroll);
        } else {
            container.prepend(toolbar);
        }

        return toolbar;
    }

    function getOrCreateEmptyState(table) {
        const wrap =
            table.closest(".bn-table-scroll");

        if (!wrap) {
            return null;
        }

        let empty =
            wrap.querySelector(
                ":scope > .bn-search-empty"
            );

        if (empty) {
            return empty;
        }

        empty = document.createElement("div");

        empty.className =
            "bn-search-empty bn-search-hidden";

        empty.textContent =
            "No records match the current search query.";

        wrap.appendChild(empty);

        return empty;
    }

    function updateCounter(counter, visible, total) {
        if (!counter) {
            return;
        }

        const fmt =
            BN.formatNumber
                ? BN.formatNumber
                : value => String(value);

        counter.innerHTML = `
            <span>
                Showing
                <strong>${fmt(visible)}</strong>
                of
                <strong>${fmt(total)}</strong>
                records
            </span>
        `;
    }

    function applyFilter(state) {
        const query =
            normalize(state.input.value);

        let visible = 0;

        state.rows.forEach(row => {
            const match =
                !query ||
                row.dataset.search.includes(query);

            row.classList.toggle(
                "bn-search-filtered",
                !match
            );

            row.classList.toggle(
                "bn-search-hidden",
                !match
            );

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
            window.BNTables.refresh();
        } else if (window.BNTables?.fixIndexes) {
            state.tables?.forEach?.(table => {
                window.BNTables.fixIndexes(table);
            });
        }
    }

    function attach(table) {
        if (!table) {
            return;
        }

        if (table.dataset.bnSearchReady === "true") {
            return;
        }

        const rows = getRows(table);

        if (!rows.length) {
            return;
        }

        const toolbar =
            getOrCreateToolbar(table);

        if (!toolbar) {
            return;
        }

        const input =
            toolbar.querySelector(
                ".bn-search-input"
            );

        const clear =
            toolbar.querySelector(
                ".bn-search-clear"
            );

        const counter =
            toolbar.querySelector(
                ".bn-search-stats"
            );

        const empty =
            getOrCreateEmptyState(table);

        rows.forEach(row => {
            row.dataset.search =
                buildSearchIndex(row);
        });

        const state = {
            table,
            toolbar,
            input,
            clear,
            counter,
            empty,
            rows
        };

        input.addEventListener(
            "input",
            () => {
                applyFilter(state);
            }
        );

        clear?.addEventListener(
            "click",
            () => {
                input.value = "";
                applyFilter(state);
                input.focus();
            }
        );

        table.dataset.bnSearchReady = "true";

        applyFilter(state);
    }

    function init(scope = document) {
        const tables =
            BN.$$?.(".bn-table", scope) ||
            Array.from(
                scope.querySelectorAll(".bn-table")
            );

        tables.forEach(attach);
    }

    function refresh() {
        document
            .querySelectorAll(".bn-table")
            .forEach(table => {
                const toolbar =
                    getToolbarContainer(table)
                        ?.querySelector(
                            ":scope > .bn-search-toolbar"
                        );

                if (!toolbar) {
                    return;
                }

                const input =
                    toolbar.querySelector(
                        ".bn-search-input"
                    );

                if (!input) {
                    return;
                }

                const rows =
                    getRows(table);

                const counter =
                    toolbar.querySelector(
                        ".bn-search-stats"
                    );

                const empty =
                    getOrCreateEmptyState(table);

                const state = {
                    table,
                    toolbar,
                    input,
                    counter,
                    empty,
                    rows
                };

                rows.forEach(row => {
                    row.dataset.search =
                        buildSearchIndex(row);
                });

                applyFilter(state);
            });
    }

    window.BNSearchInit = init;

    window.BNSearch = {
        init,
        attach,
        refresh,
        applyFilter
    };
})();
