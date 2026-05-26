(() => {
    "use strict";

    const BN = window.BN || {};
    const PAGE_SIZE = 250;

    const STATES = new WeakMap();

    function $all(selector, scope = document) {
        return Array.from(scope.querySelectorAll(selector));
    }

    function normalize(value) {
        return String(value || "")
            .toLowerCase()
            .trim();
    }

    function number(value, fallback = 0) {
        if (BN.number) {
            return BN.number(value, fallback);
        }

        const n = Number(value);

        return Number.isFinite(n) ? n : fallback;
    }

    function formatNumber(value) {
        if (BN.formatNumber) {
            return BN.formatNumber(value);
        }

        const n = Number(value);

        return Number.isFinite(n)
            ? n.toLocaleString()
            : value;
    }

    function inferValue(raw) {
        const numeric = Number(
            String(raw)
                .replace(/,/g, "")
                .replace(/ms$/i, "")
                .replace(/%$/i, "")
                .trim()
        );

        if (Number.isFinite(numeric)) {
            return numeric;
        }

        return normalize(raw);
    }

    function isFiltered(row) {
        return row.classList.contains("bn-search-filtered");
    }

    function isPagedOut(row) {
        return row.classList.contains("bn-table-paged-out");
    }

    function isVisible(row) {
        return !isFiltered(row) && !isPagedOut(row);
    }

    function getFilteredRows(state) {
        return state.rows.filter(row => !isFiltered(row));
    }

    function updateRowVisibility(row) {
        row.classList.toggle(
            "bn-search-hidden",
            isFiltered(row) || isPagedOut(row)
        );
    }

    function updateAllVisibility(state) {
        state.rows.forEach(updateRowVisibility);
    }

    function createToolbar(table, state) {
        const wrap = table.closest(".bn-table-wrap, .bn-table-scroll");

        if (!wrap || !wrap.parentElement) {
            return;
        }

        let toolbar = wrap.parentElement.querySelector(":scope > .bn-table-pagination");

        if (!toolbar) {
            toolbar = document.createElement("div");
            toolbar.className = "bn-table-pagination";

            toolbar.innerHTML = `
                <button type="button" class="bn-page-first">« First</button>
                <button type="button" class="bn-page-prev">‹ Prev</button>
                <span class="bn-page-status">Page 1</span>
                <button type="button" class="bn-page-next">Next ›</button>
                <button type="button" class="bn-page-last">Last »</button>
            `;

            wrap.parentElement.appendChild(toolbar);
        }

        state.toolbar = toolbar;
        state.first = toolbar.querySelector(".bn-page-first");
        state.prev = toolbar.querySelector(".bn-page-prev");
        state.next = toolbar.querySelector(".bn-page-next");
        state.last = toolbar.querySelector(".bn-page-last");
        state.status = toolbar.querySelector(".bn-page-status");

        if (toolbar.dataset.bnPaginationReady === "true") {
            return;
        }

        state.first?.addEventListener("click", () => {
            state.page = 0;
            renderPage(table, state);
        });

        state.prev?.addEventListener("click", () => {
            state.page = Math.max(0, state.page - 1);
            renderPage(table, state);
        });

        state.next?.addEventListener("click", () => {
            const totalPages = getTotalPages(state);

            state.page = Math.min(totalPages - 1, state.page + 1);
            renderPage(table, state);
        });

        state.last?.addEventListener("click", () => {
            state.page = Math.max(0, getTotalPages(state) - 1);
            renderPage(table, state);
        });

        toolbar.dataset.bnPaginationReady = "true";
    }

    function getTotalPages(state) {
        return Math.max(
            1,
            Math.ceil(getFilteredRows(state).length / state.pageSize)
        );
    }

    function updateButtons(state) {
        const totalPages = getTotalPages(state);

        if (state.page > totalPages - 1) {
            state.page = Math.max(0, totalPages - 1);
        }

        if (state.status) {
            state.status.textContent = `Page ${state.page + 1} of ${totalPages}`;
        }

        if (state.first) {
            state.first.disabled = state.page <= 0;
        }

        if (state.prev) {
            state.prev.disabled = state.page <= 0;
        }

        if (state.next) {
            state.next.disabled = state.page >= totalPages - 1;
        }

        if (state.last) {
            state.last.disabled = state.page >= totalPages - 1;
        }
    }

    function renderPage(table, state) {
        const filteredRows = getFilteredRows(state);
        const start = state.page * state.pageSize;
        const end = start + state.pageSize;

        state.rows.forEach(row => {
            row.classList.add("bn-table-paged-out");
        });

        filteredRows.forEach((row, index) => {
            row.classList.toggle(
                "bn-table-paged-out",
                index < start || index >= end
            );
        });

        updateAllVisibility(state);
        fixIndexes(table);
        updateButtons(state);
    }

    function fixIndexes(table) {
        const rows = Array.from(table.tBodies[0]?.rows || []);
        let visibleIndex = 1;

        rows.forEach(row => {
            if (!isVisible(row)) {
                return;
            }

            const first = row.cells[0];

            if (!first) {
                return;
            }

            first.innerHTML = `
                <span class="bn-rank">
                    ${formatNumber(visibleIndex)}
                </span>
            `;

            visibleIndex += 1;
        });
    }

    function sortTable(table, state, column, direction) {
        const tbody = table.tBodies[0];

        if (!tbody) {
            return;
        }

        state.rows.sort((a, b) => {
            const aText = a.cells[column]?.textContent || "";
            const bText = b.cells[column]?.textContent || "";
            const aValue = inferValue(aText);
            const bValue = inferValue(bText);

            if (
                typeof aValue === "number" &&
                typeof bValue === "number"
            ) {
                return direction === "asc"
                    ? aValue - bValue
                    : bValue - aValue;
            }

            return direction === "asc"
                ? String(aValue).localeCompare(String(bValue))
                : String(bValue).localeCompare(String(aValue));
        });

        state.rows.forEach(row => {
            tbody.appendChild(row);
        });

        state.page = 0;
        renderPage(table, state);
    }

    function wireSorting(table, state) {
        if (table.dataset.bnSortingReady === "true") {
            return;
        }

        const headers = Array.from(
            table.querySelectorAll("thead th")
        );

        headers.forEach((th, index) => {
            th.classList.add("bn-sortable");

            let indicator = th.querySelector(".bn-sort-indicator");

            if (!indicator) {
                indicator = document.createElement("span");
                indicator.className = "bn-sort-indicator";
                indicator.textContent = "↕";
                th.appendChild(indicator);
            }

            let direction = "desc";

            th.addEventListener("click", () => {
                direction = direction === "asc" ? "desc" : "asc";

                headers.forEach(h => {
                    const icon = h.querySelector(".bn-sort-indicator");

                    if (icon) {
                        icon.textContent = "↕";
                    }
                });

                indicator.textContent =
                    direction === "asc"
                        ? "↑"
                        : "↓";

                sortTable(table, state, index, direction);
            });
        });

        table.dataset.bnSortingReady = "true";
    }

    function wireStickyColumns(table) {
        const rows = table.querySelectorAll("thead tr, tbody tr");

        rows.forEach(row => {
            const first = row.children[0];
            const second = row.children[1];

            if (first) {
                first.style.left = "0px";
            }

            if (second) {
                second.style.left = "58px";
            }
        });
    }

    function buildState(table) {
        const existing = STATES.get(table);

        if (existing) {
            existing.rows = Array.from(table.tBodies[0]?.rows || []);
            existing.pageSize = number(table.dataset.pageSize, PAGE_SIZE);
            return existing;
        }

        const state = {
            table,
            rows: Array.from(table.tBodies[0]?.rows || []),
            page: 0,
            pageSize: number(table.dataset.pageSize, PAGE_SIZE),
            toolbar: null,
            first: null,
            prev: null,
            next: null,
            last: null,
            status: null
        };

        STATES.set(table, state);

        return state;
    }

    function initTable(table) {
        const tbody = table.tBodies[0];

        if (!tbody) {
            return;
        }

        const state = buildState(table);

        wireSorting(table, state);
        wireStickyColumns(table);
        createToolbar(table, state);
        renderPage(table, state);
    }

    function initTables() {
        $all(".bn-table").forEach(initTable);
    }

    function refresh() {
        $all(".bn-table").forEach(table => {
            const state = STATES.get(table);

            if (!state) {
                initTable(table);
                return;
            }

            state.rows = Array.from(table.tBodies[0]?.rows || []);
            renderPage(table, state);
        });
    }

    window.BNTables = {
        init: initTables,
        refresh,
        fixIndexes,
        sortTable
    };
})();