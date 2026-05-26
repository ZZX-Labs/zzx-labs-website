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

    function getOrCreateToolbar(table) {
        const wrap = table.closest(".bn-table-wrap, .bn-table-scroll");

        if (!wrap || !wrap.parentElement) {
            return null;
        }

        let toolbar = wrap.parentElement.querySelector(":scope > .bn-search-toolbar");

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
                        placeholder="Search any column..."
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

        wrap.parentElement.insertBefore(toolbar, wrap);

        return toolbar;
    }

    function getOrCreateEmptyState(wrap) {
        let empty = wrap.querySelector(":scope > .bn-search-empty");

        if (empty) {
            return empty;
        }

        empty = document.createElement("div");
        empty.className = "bn-search-empty bn-search-hidden";
        empty.textContent = "No records match the current search query.";

        wrap.appendChild(empty);

        return empty;
    }

    function updateCounter(counter, visible, total) {
        if (!counter) {
            return;
        }

        counter.innerHTML = `
            <span>
                Showing
                <strong>${BN.formatNumber ? BN.formatNumber(visible) : visible}</strong>
                of
                <strong>${BN.formatNumber ? BN.formatNumber(total) : total}</strong>
                records
            </span>
        `;
    }

    function applyFilter(state) {
        const query = normalize(state.input.value);
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

        state.empty.classList.toggle(
            "bn-search-hidden",
            visible !== 0
        );

        updateCounter(
            state.counter,
            visible,
            state.rows.length
        );

        window.BNTables?.refresh?.();
    }

    function attach(table) {
        if (table.dataset.bnSearchReady === "true") {
            return;
        }

        const wrap = table.closest(".bn-table-wrap, .bn-table-scroll");

        if (!wrap) {
            return;
        }

        const toolbar = getOrCreateToolbar(table);

        if (!toolbar) {
            return;
        }

        const input = toolbar.querySelector(".bn-search-input");
        const clear = toolbar.querySelector(".bn-search-clear");
        const counter = toolbar.querySelector(".bn-search-stats");
        const empty = getOrCreateEmptyState(wrap);
        const rows = getRows(table);

        rows.forEach(row => {
            row.dataset.search = buildSearchIndex(row);
        });

        const state = {
            table,
            wrap,
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

    function init() {
        BN.$$(".bn-table").forEach(attach);
    }

    window.BNSearchInit = init;

    window.BNSearch = {
        init,
        attach,
        applyFilter
    };
})();