(() => {
    "use strict";

    const SOURCES = {
        local: "../api/propagation.json",
        external: "../api/propagation.json"
    };

    let ROWS = [];

    const $ = q => document.querySelector(q);

    function fmt(value) {
        if (value === null || value === undefined || value === "") return "—";
        if (typeof value === "number") return value.toLocaleString();
        return String(value);
    }

    function formatTime(value) {
        if (!value) return "—";

        const numeric = Number(value);
        const ms = numeric < 10000000000 ? numeric * 1000 : numeric;

        return new Date(ms)
            .toISOString()
            .replace("T", " ")
            .replace(".000Z", " UTC");
    }

    function setStatus(message, mode = "") {
        const el = $("#bn-status");

        if (!el) {
            return;
        }

        el.className = `bn-status container ${mode}`.trim();
        el.textContent = message;
    }

    async function getJson(url) {
        const response = await fetch(url, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`${response.status} ${response.statusText}`);
        }

        return await response.json();
    }

    function normalize(data) {
        if (Array.isArray(data)) {
            return data;
        }

        if (Array.isArray(data.results)) {
            return data.results;
        }

        if (Array.isArray(data.propagation)) {
            return data.propagation;
        }

        if (data.inv_hash && data.stats) {
            return [data];
        }

        return [];
    }

    function renderSummary(rows) {
        const heads = rows.reduce((sum, row) => sum + (row.stats?.head?.length || 0), 0);
        const fastest = rows[0]?.stats?.min;
        const slowest = rows[0]?.stats?.max;

        $("#bn-summary").innerHTML = `
            <article class="bn-card"><span>INV Records</span><strong>${fmt(rows.length)}</strong></article>
            <article class="bn-card"><span>Head Samples</span><strong>${fmt(heads)}</strong></article>
            <article class="bn-card"><span>Fastest Delta</span><strong>${fmt(fastest)} ms</strong></article>
            <article class="bn-card"><span>Slowest Delta</span><strong>${fmt(slowest)} ms</strong></article>
        `;
    }

    function filteredRows() {
        const search = ($("#bn-search")?.value || "").trim().toLowerCase();
        const sort = $("#bn-sort")?.value || "timestamp";

        let rows = ROWS.filter(row => {
            if (!search) return true;

            const headText = (row.stats?.head || [])
                .map(item => item.join(" "))
                .join(" ");

            return [
                row.inv_hash,
                row.hash,
                headText,
                row.stats?.mean,
                row.stats?.max,
                row.stats?.min
            ].join(" ").toLowerCase().includes(search);
        });

        if (sort === "node") {
            rows.sort((a, b) => {
                const an = a.stats?.head?.[0]?.[0] || "";
                const bn = b.stats?.head?.[0]?.[0] || "";
                return an.localeCompare(bn);
            });
        } else if (sort === "hash") {
            rows.sort((a, b) => String(a.inv_hash || a.hash).localeCompare(String(b.inv_hash || b.hash)));
        } else {
            rows.sort((a, b) => {
                const at = a.stats?.head?.[0]?.[1] || 0;
                const bt = b.stats?.head?.[0]?.[1] || 0;
                return at - bt;
            });
        }

        return rows;
    }

    function renderRows(rows) {
        const view = $("#bn-view");

        if (!rows.length) {
            view.innerHTML = `<div class="bn-empty">No propagation telemetry matched current filters.</div>`;
            return;
        }

        view.innerHTML = `
            <div class="bn-prop-grid">
                ${rows.map(row => {
                    const stats = row.stats || {};
                    const head = stats.head || [];

                    return `
                        <article class="bn-prop-card">
                            <div class="bn-prop-hash">
                                ${fmt(row.inv_hash || row.hash)}
                            </div>

                            <div class="bn-prop-stats">
                                <div class="bn-prop-stat"><span>Min</span><strong>${fmt(stats.min)} ms</strong></div>
                                <div class="bn-prop-stat"><span>Max</span><strong>${fmt(stats.max)} ms</strong></div>
                                <div class="bn-prop-stat"><span>Mean</span><strong>${fmt(stats.mean)} ms</strong></div>
                                <div class="bn-prop-stat"><span>Std</span><strong>${fmt(stats.std)} ms</strong></div>
                                <div class="bn-prop-stat"><span>50%</span><strong>${fmt(stats["50%"])} ms</strong></div>
                                <div class="bn-prop-stat"><span>90%</span><strong>${fmt(stats["90%"])} ms</strong></div>
                            </div>

                            <div class="bn-prop-table-wrap">
                                <table class="bn-prop-table">
                                    <thead>
                                        <tr>
                                            <th>Node</th>
                                            <th>Arrival Time</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        ${head.map(item => `
                                            <tr>
                                                <td class="bn-prop-node">${fmt(item[0])}</td>
                                                <td>${formatTime(item[1])}</td>
                                            </tr>
                                        `).join("")}
                                    </tbody>
                                </table>
                            </div>
                        </article>
                    `;
                }).join("")}
            </div>
        `;
    }

    function rerender() {
        renderRows(filteredRows());
    }

    async function loadPropagation() {
        const source = $("#bn-source")?.value || "local";
        const url = SOURCES[source] || SOURCES.local;

        setStatus(`Loading propagation telemetry from ${source} source…`);

        try {
            const data = await getJson(url);

            ROWS = normalize(data);

            renderSummary(ROWS);
            renderRows(ROWS);

            setStatus(`Loaded ${fmt(ROWS.length)} propagation records.`, "ok");
        } catch (err) {
            ROWS = [];

            renderSummary([]);
            renderRows([]);

            setStatus(`Propagation telemetry unavailable: ${err.message}`, "warn");
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("#bn-refresh")?.addEventListener("click", loadPropagation);
        $("#bn-source")?.addEventListener("change", loadPropagation);
        $("#bn-search")?.addEventListener("input", rerender);
        $("#bn-sort")?.addEventListener("change", rerender);

        loadPropagation();
    });
})();
