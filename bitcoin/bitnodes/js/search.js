(() => {
    "use strict";

    function normalize(value) {
        return String(value || "")
            .toLowerCase()
            .trim();
    }

    function getTableRows(table) {
        return Array.from(
            table.querySelectorAll("tbody tr")
        );
    }

    function buildSearchIndex(row) {
        const cells =
            Array.from(row.cells);

        return cells
            .map(cell => cell.textContent || "")
            .join(" ")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function updateVisibleCount(
        visible,
        total,
        output
    ) {
        if (!output) {
            return;
        }

        output.innerHTML = `
            <span>
                Showing
                <strong>${visible}</strong>
                of
                <strong>${total}</strong>
                Node Records
            </span>
        `;
    }

    function ensureEmptyState(
        tableWrap
    ) {
        let empty =
            tableWrap.querySelector(
                ".bn-search-empty"
            );

        if (!empty) {

            empty =
                document.createElement("div");

            empty.className =
                "bn-search-empty bn-search-hidden";

            empty.innerHTML = `
                <span>
                    No node records match the current search query.
                </span>
            `;

            tableWrap.appendChild(empty);
        }

        return empty;
    }

    function filterRows({
        query,
        rows,
        emptyState,
        counter
    }) {

        let visible = 0;

        rows.forEach(row => {

            const haystack =
                row.dataset.search || "";

            const match =
                !query ||
                haystack.includes(query);

            row.classList.toggle(
                "bn-search-hidden",
                !match
            );

            if (match) {
                visible += 1;
            }
        });

        if (emptyState) {

            emptyState.classList.toggle(
                "bn-search-hidden",
                visible !== 0
            );
        }

        updateVisibleCount(
            visible,
            rows.length,
            counter
        );
    }

    function attachSearch({
        table,
        input,
        clearButton,
        counter,
        tableWrap
    }) {

        const rows =
            getTableRows(table);

        rows.forEach(row => {

            row.dataset.search =
                buildSearchIndex(row);
        });

        const emptyState =
            ensureEmptyState(tableWrap);

        function runSearch() {

            const query =
                normalize(input.value);

            filterRows({
                query,
                rows,
                emptyState,
                counter
            });
        }

        input.addEventListener(
            "input",
            runSearch
        );

        if (clearButton) {

            clearButton.addEventListener(
                "click",
                () => {

                    input.value = "";

                    runSearch();

                    input.focus();
                }
            );
        }

        runSearch();
    }

    function createToolbar(table) {

        const wrap =
            table.closest(
                ".bn-table-wrap, .bn-table-scroll"
            );

        if (!wrap) {
            return;
        }

        const existing =
            wrap.parentElement.querySelector(
                ".bn-search-toolbar"
            );

        if (existing) {
            return;
        }

        const toolbar =
            document.createElement("div");

        toolbar.className =
            "bn-search-toolbar";

        toolbar.innerHTML = `
            <div class="bn-searchbar-wrap">

                <div class="bn-searchbar">

                    <input
                        type="search"
                        class="bn-search-input bn-table-search-input"
                        placeholder="Search nodes, ASN, city, country, IP, agent, version, services, latency..."
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
                            Node Records
                        </span>
                    </div>

                </div>

            </div>
        `;

        wrap.parentElement.insertBefore(
            toolbar,
            wrap
        );

        const input =
            toolbar.querySelector(
                ".bn-search-input"
            );

        const clearButton =
            toolbar.querySelector(
                ".bn-search-clear"
            );

        const counter =
            toolbar.querySelector(
                ".bn-search-stats"
            );

        attachSearch({
            table,
            input,
            clearButton,
            counter,
            tableWrap: wrap
        });
    }

    function initSearch() {

        document
            .querySelectorAll(
                ".bn-table"
            )
            .forEach(table => {

                createToolbar(table);
            });
    }

    window.BNSearchInit =
        initSearch;

    document.addEventListener(
        "DOMContentLoaded",
        initSearch
    );
})();
