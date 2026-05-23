(() => {
    "use strict";

    const SOURCES = {
        local: "../api/latency.json",
        external: "../api/latency.json"
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
        return new Date(ms).toISOString().replace("T", " ").replace(".000Z", " UTC");
    }

    function setStatus(message, mode = "") {
        const el = $("#bn-status");
        if (!el) return;
        el.className = `bn-status container ${mode}`.trim();
        el.textContent = message;
    }

    async function getJson(url) {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        return await response.json();
    }

    function normalize(data) {
        const rows = [];

        if (Array.isArray(data)) {
            return data;
        }

        const nodeBlocks =
            data.nodes ||
            data.latency ||
            data.results ||
            {};

        for (const [node, block] of Object.entries(nodeBlocks)) {
            for (const period of ["daily_latency", "weekly_latency", "monthly_latency"]) {
                const points = block?.[period] || [];

                for (const point of points) {
                    rows.push({
                        node,
                        period,
                        t: point.t,
                        v: point.v
                    });
                }
            }
        }

        if (!rows.length) {
            for (const period of ["daily_latency", "weekly_latency", "monthly_latency"]) {
                const points = data?.[period] || [];

                for (const point of points) {
                    rows.push({
                        node: data.node || "sample-node",
                        period,
                        t: point.t,
                        v: point.v
                    });
                }
            }
        }

        return rows;
    }

    function renderSummary(rows) {
        const reachable = rows.filter(row => Number(row.v) > 0);
        const down = rows.filter(row => Number(row.v) < 0);
        const avg = reachable.length
            ? Math.round(reachable.reduce((sum, row) => sum + Number(row.v), 0) / reachable.length)
            : 0;

        $("#bn-summary").innerHTML = `
            <article class="bn-card"><span>Latency Points</span><strong>${fmt(rows.length)}</strong></article>
            <article class="bn-card"><span>Reachable Points</span><strong>${fmt(reachable.length)}</strong></article>
            <article class="bn-card"><span>Down Points</span><strong>${fmt(down.length)}</strong></article>
            <article class="bn-card"><span>Average Latency</span><strong>${fmt(avg)} ms</strong></article>
        `;
    }

    function filteredRows() {
        const search = ($("#bn-search")?.value || "").trim().toLowerCase();
        const period = $("#bn-period")?.value || "daily_latency";
        const sort = $("#bn-sort")?.value || "time";

        let rows = ROWS.filter(row => {
            if (period !== "all" && row.period !== period) return false;
            if (!search) return true;

            return [
                row.node,
                row.period,
                row.v
            ]
            .join(" ")
            .toLowerCase()
            .includes(search);
        });

        if (sort === "latency") {
            rows.sort((a, b) => Number(a.v) - Number(b.v));
        } else if (sort === "node") {
            rows.sort((a, b) => String(a.node).localeCompare(String(b.node)));
        } else {
            rows.sort((a, b) => Number(b.t) - Number(a.t));
        }

        return rows;
    }

    function renderRows(rows) {
        const view = $("#bn-view");

        if (!rows.length) {
            view.innerHTML = `<div class="bn-empty">No latency telemetry matched current filters.</div>`;
            return;
        }

        view.innerHTML = `
            <div class="bn-latency-table-wrap">
                <table class="bn-latency-table">
                    <thead>
                        <tr>
                            <th>Node</th>
                            <th>Period</th>
                            <th>Timestamp</th>
                            <th>Latency</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.slice(0, 500).map(row => {
                            const value = Number(row.v);
                            const status =
                                value < 0 ? "Down" :
                                value === 0 ? "No Data" :
                                "Reachable";

                            const cls =
                                value < 0 ? "bn-latency-down" :
                                value === 0 ? "bn-latency-empty" :
                                "bn-latency-good";

                            return `
                                <tr>
                                    <td class="bn-latency-node">${fmt(row.node)}</td>
                                    <td class="bn-latency-period">${fmt(row.period.replace("_latency", ""))}</td>
                                    <td>${formatTime(row.t)}</td>
                                    <td class="${cls}">${value > 0 ? `${fmt(value)} ms` : fmt(value)}</td>
                                    <td class="${cls}">${status}</td>
                                </tr>
                            `;
                        }).join("")}
                    </tbody>
                </table>
            </div>
        `;
    }

    function rerender() {
        renderRows(filteredRows());
    }

    async function loadLatency() {
        const source = $("#bn-source")?.value || "local";
        const url = SOURCES[source] || SOURCES.local;

        setStatus(`Loading latency telemetry from ${source} source…`);

        try {
            const data = await getJson(url);

            ROWS = normalize(data);

            renderSummary(ROWS);
            renderRows(filteredRows());

            setStatus(`Loaded ${fmt(ROWS.length)} latency data points.`, "ok");
        } catch (err) {
            ROWS = [];
            renderSummary([]);
            renderRows([]);

            setStatus(`Latency telemetry unavailable: ${err.message}`, "warn");
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("#bn-refresh")?.addEventListener("click", loadLatency);
        $("#bn-source")?.addEventListener("change", loadLatency);
        $("#bn-search")?.addEventListener("input", rerender);
        $("#bn-period")?.addEventListener("change", rerender);
        $("#bn-sort")?.addEventListener("change", rerender);

        loadLatency();
    });
})();
