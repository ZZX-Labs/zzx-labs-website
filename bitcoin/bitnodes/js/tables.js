(() => {
    "use strict";

    const PAGE_SIZE = 250;

    function ready(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn);
        } else {
            fn();
        }
    }

    function $all(selector, scope = document) {
        return Array.from(scope.querySelectorAll(selector));
    }

    function normalize(value) {
        return String(value || "")
            .toLowerCase()
            .trim();
    }

    function number(value, fallback = 0) {
        if (window.BNAPI && window.BNAPI.number) {
            return window.BNAPI.number(value, fallback);
        }

        const n = Number(value);

        return Number.isFinite(n) ? n : fallback;
    }

    function formatNumber(value) {
        if (window.BNAPI && window.BNAPI.formatNumber) {
            return window.BNAPI.formatNumber(value);
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
                .trim()
        );

        if (Number.isFinite(numeric)) {
            return numeric;
        }

        return normalize(raw);
    }

    function createToolbar(table, state) {
        const wrap =
            table.closest(
                ".bn-table-wrap, .bn-table-scroll"
            );

        if (!wrap) {
            return;
        }

        const existing =
            wrap.parentElement.querySelector(
                ".bn-table-pagination"
            );

        if (existing) {
            return;
        }

        const toolbar =
            document.createElement("div");

        toolbar.className =
            "bn-table-pagination";

        toolbar.innerHTML = `
            <button
                type="button"
                class="bn-page-first"
            >
                « First
            </button>

            <button
                type="button"
                class="bn-page-prev"
            >
                ‹ Prev
            </button>

            <span class="bn-page-status">
                Page 1
            </span>

            <button
                type="button"
                class="bn-page-next"
            >
                Next ›
            </button>

            <button
                type="button"
                class="bn-page-last"
            >
                Last »
            </button>
        `;

        wrap.parentElement.appendChild(
            toolbar
        );

        const first =
            toolbar.querySelector(
                ".bn-page-first"
            );

        const prev =
            toolbar.querySelector(
                ".bn-page-prev"
            );

        const next =
            toolbar.querySelector(
                ".bn-page-next"
            );

        const last =
            toolbar.querySelector(
                ".bn-page-last"
            );

        const status =
            toolbar.querySelector(
                ".bn-page-status"
            );

        function updateButtons() {

            const totalPages =
                Math.max(
                    1,
                    Math.ceil(
                        state.rows.length /
                        state.pageSize
                    )
                );

            status.textContent =
                `Page ${state.page + 1} of ${totalPages}`;

            first.disabled =
                state.page <= 0;

            prev.disabled =
                state.page <= 0;

            next.disabled =
                state.page >= totalPages - 1;

            last.disabled =
                state.page >= totalPages - 1;
        }

        first.addEventListener(
            "click",
            () => {
                state.page = 0;
                renderPage(table, state);
                updateButtons();
            }
        );

        prev.addEventListener(
            "click",
            () => {
                state.page =
                    Math.max(
                        0,
                        state.page - 1
                    );

                renderPage(table, state);
                updateButtons();
            }
        );

        next.addEventListener(
            "click",
            () => {

                const totalPages =
                    Math.ceil(
                        state.rows.length /
                        state.pageSize
                    );

                state.page =
                    Math.min(
                        totalPages - 1,
                        state.page + 1
                    );

                renderPage(table, state);
                updateButtons();
            }
        );

        last.addEventListener(
            "click",
            () => {

                const totalPages =
                    Math.ceil(
                        state.rows.length /
                        state.pageSize
                    );

                state.page =
                    Math.max(
                        0,
                        totalPages - 1
                    );

                renderPage(table, state);
                updateButtons();
            }
        );

        state.updateButtons =
            updateButtons;

        updateButtons();
    }

    function renderPage(table, state) {

        const tbody =
            table.tBodies[0];

        if (!tbody) {
            return;
        }

        const start =
            state.page *
            state.pageSize;

        const end =
            start +
            state.pageSize;

        state.rows.forEach(
            (row, index) => {

                row.classList.toggle(
                    "bn-search-hidden",
                    index < start ||
                    index >= end
                );
            }
        );

        fixIndexes(table);
    }

    function fixIndexes(table) {

        const rows =
            Array.from(
                table.tBodies[0]?.rows || []
            );

        let visibleIndex = 1;

        rows.forEach(row => {

            if (
                row.classList.contains(
                    "bn-search-hidden"
                )
            ) {
                return;
            }

            const first =
                row.cells[0];

            if (!first) {
                return;
            }

            first.innerHTML = `
                <span class="bn-rank">
                    ${formatNumber(
                        visibleIndex
                    )}
                </span>
            `;

            visibleIndex += 1;
        });
    }

    function sortTable(
        table,
        state,
        column,
        direction
    ) {

        const tbody =
            table.tBodies[0];

        if (!tbody) {
            return;
        }

        state.rows.sort(
            (a, b) => {

                const aText =
                    a.cells[column]
                        ?.textContent || "";

                const bText =
                    b.cells[column]
                        ?.textContent || "";

                const aValue =
                    inferValue(aText);

                const bValue =
                    inferValue(bText);

                if (
                    typeof aValue === "number" &&
                    typeof bValue === "number"
                ) {

                    return direction === "asc"
                        ? aValue - bValue
                        : bValue - aValue;
                }

                return direction === "asc"
                    ? String(aValue)
                        .localeCompare(
                            String(bValue)
                        )
                    : String(bValue)
                        .localeCompare(
                            String(aValue)
                        );
            }
        );

        state.rows.forEach(row => {
            tbody.appendChild(row);
        });

        state.page = 0;

        renderPage(table, state);

        if (state.updateButtons) {
            state.updateButtons();
        }
    }

    function wireSorting(
        table,
        state
    ) {

        const headers =
            Array.from(
                table.querySelectorAll(
                    "thead th"
                )
            );

        headers.forEach(
            (th, index) => {

                th.classList.add(
                    "bn-sortable"
                );

                const indicator =
                    document.createElement(
                        "span"
                    );

                indicator.className =
                    "bn-sort-indicator";

                indicator.textContent =
                    "↕";

                th.appendChild(
                    indicator
                );

                let direction =
                    "desc";

                th.addEventListener(
                    "click",
                    () => {

                        direction =
                            direction === "asc"
                                ? "desc"
                                : "asc";

                        headers.forEach(h => {

                            const icon =
                                h.querySelector(
                                    ".bn-sort-indicator"
                                );

                            if (icon) {
                                icon.textContent =
                                    "↕";
                            }
                        });

                        indicator.textContent =
                            direction === "asc"
                                ? "↑"
                                : "↓";

                        sortTable(
                            table,
                            state,
                            index,
                            direction
                        );
                    }
                );
            }
        );
    }

    function wireStickyColumns(table) {

        const rows =
            table.querySelectorAll(
                "thead tr, tbody tr"
            );

        rows.forEach(row => {

            const first =
                row.children[0];

            const second =
                row.children[1];

            if (first) {
                first.style.left = "0px";
            }

            if (second) {
                second.style.left = "58px";
            }
        });
    }

    function buildState(table) {

        return {
            table,
            rows: Array.from(
                table.tBodies[0]?.rows || []
            ),
            page: 0,
            pageSize:
                number(
                    table.dataset.pageSize,
                    PAGE_SIZE
                ),
            updateButtons: null
        };
    }

    function initTable(table) {

        const tbody =
            table.tBodies[0];

        if (!tbody) {
            return;
        }

        const state =
            buildState(table);

        wireSorting(
            table,
            state
        );

        wireStickyColumns(table);

        createToolbar(
            table,
            state
        );

        renderPage(
            table,
            state
        );
    }

    function initTables() {

        $all(".bn-table")
            .forEach(initTable);
    }

    window.BNTables = {
        init: initTables,
        fixIndexes,
        sortTable
    };

    ready(initTables);
})();