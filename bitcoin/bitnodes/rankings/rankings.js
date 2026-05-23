(() => {
    "use strict";

    const SOURCES = {
        local: "../api/leaderboard.json",
        external: "https://bitnodes.io/api/v1/nodes/leaderboard/"
    };

    let ROWS = [];

    const $ = q => document.querySelector(q);

    function fmt(value) {
        if (value === null || value === undefined || value === "") return "—";
        if (typeof value === "number") return value.toLocaleString();
        return String(value);
    }

    function num(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
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
        if (Array.isArray(data)) return data;
        if (Array.isArray(data.results)) return data.results;
        if (Array.isArray(data.leaderboard)) return data.leaderboard;
        return [];
    }

    function renderSummary(rows) {
        $("#bn-summary").innerHTML = `
            <article class="bn-card"><span>Ranked Nodes</span><strong>${fmt(rows.length)}</strong></article>
            <article class="bn-card"><span>Top Node</span><strong>${fmt(rows[0]?.node)}</strong></article>
            <article class="bn-card"><span>Best Peer Index</span><strong>${fmt(rows[0]?.peer_index)}</strong></article>
            <article class="bn-card"><span>Best Rank</span><strong>${fmt(rows[0]?.rank)}</strong></article>
        `;
    }

    function filteredRows() {
        const search = ($("#bn-search")?.value || "").trim().toLowerCase();
        const sort = $("#bn-sort")?.value || "rank";

        let rows = ROWS.filter(row => {
            if (!search) return true;
            return [row.node, row.rank, row.peer_index]
                .join(" ")
                .toLowerCase()
                .includes(search);
        });

        if (sort === "peer_index") rows.sort((a, b) => num(b.peer_index) - num(a.peer_index));
        else if (sort === "node") rows.sort((a, b) => String(a.node).localeCompare(String(b.node)));
        else rows.sort((a, b) => num(a.rank) - num(b.rank));

        return rows;
    }

    function renderRows(rows) {
        const view = $("#bn-view");

        if (!rows.length) {
            view.innerHTML = `<div class="bn-empty">No ranking rows matched current filters.</div>`;
            return;
        }

        view.innerHTML = `
            <div class="bn-rank-table-wrap">
                <table class="bn-rank-table">
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Node</th>
                            <th>Peer Index</th>
                            <th>VI</th>
                            <th>SI</th>
                            <th>HI</th>
                            <th>AI</th>
                            <th>PI</th>
                            <th>DLI</th>
                            <th>DUI</th>
                            <th>WLI</th>
                            <th>WUI</th>
                            <th>MLI</th>
                            <th>MUI</th>
                            <th>NSI</th>
                            <th>NI</th>
                            <th>BI</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${rows.map(row => `
                            <tr>
                                <td class="bn-rank-number">${fmt(row.rank)}</td>
                                <td class="bn-rank-node">${fmt(row.node)}</td>
                                <td class="bn-score">${fmt(row.peer_index)}</td>
                                <td class="bn-score">${fmt(row.vi)}</td>
                                <td class="bn-score">${fmt(row.si)}</td>
                                <td class="bn-score">${fmt(row.hi)}</td>
                                <td class="bn-score">${fmt(row.ai)}</td>
                                <td class="bn-score">${fmt(row.pi)}</td>
                                <td class="bn-score">${fmt(row.dli)}</td>
                                <td class="bn-score">${fmt(row.dui)}</td>
                                <td class="bn-score">${fmt(row.wli)}</td>
                                <td class="bn-score">${fmt(row.wui)}</td>
                                <td class="bn-score">${fmt(row.mli)}</td>
                                <td class="bn-score">${fmt(row.mui)}</td>
                                <td class="bn-score">${fmt(row.nsi)}</td>
                                <td class="bn-score">${fmt(row.ni)}</td>
                                <td class="bn-score">${fmt(row.bi)}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;
    }

    function rerender() {
        renderRows(filteredRows());
    }

    async function loadRankings() {
        const source = $("#bn-source")?.value || "local";
        const url = SOURCES[source] || SOURCES.local;

        setStatus(`Loading rankings from ${source} source…`);

        try {
            const data = await getJson(url);

            ROWS = normalize(data);
            ROWS.sort((a, b) => num(a.rank) - num(b.rank));

            renderSummary(ROWS);
            renderRows(ROWS);

            setStatus(`Loaded ${fmt(ROWS.length)} ranked nodes.`, "ok");
        } catch (err) {
            ROWS = [];
            renderSummary([]);
            renderRows([]);

            setStatus(`Rankings unavailable: ${err.message}`, "warn");
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("#bn-refresh")?.addEventListener("click", loadRankings);
        $("#bn-source")?.addEventListener("change", loadRankings);
        $("#bn-search")?.addEventListener("input", rerender);
        $("#bn-sort")?.addEventListener("change", rerender);

        loadRankings();
    });
})();
