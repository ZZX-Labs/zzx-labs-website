(() => {
    "use strict";

    const SOURCES = {
        local: "../api/nodes.json",
        external: "https://bitnodes.io/api/v1/snapshots/latest/"
    };

    let ROWS = [];

    const $ = q => document.querySelector(q);

    function fmt(value) {
        if (value === null || value === undefined || value === "") return "—";
        if (typeof value === "number") return value.toLocaleString();
        return String(value);
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

    function topValue(map) {
        return [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
    }

    function aggregate(nodes) {
        const map = new Map();
        const total = Object.keys(nodes).length;

        for (const row of Object.values(nodes)) {
            const city = row?.[6] || "Unknown";
            const country = row?.[7] || "Unknown";
            const key = `${city}|${country}`;
            const asn = row?.[11];
            const org = row?.[12];
            const agent = row?.[1];

            if (!map.has(key)) {
                map.set(key, {
                    city,
                    country,
                    nodes: 0,
                    asns: new Set(),
                    orgs: new Map(),
                    agents: new Map()
                });
            }

            const item = map.get(key);
            item.nodes += 1;
            if (asn) item.asns.add(asn);
            if (org) item.orgs.set(org, (item.orgs.get(org) || 0) + 1);
            if (agent) item.agents.set(agent, (item.agents.get(agent) || 0) + 1);
        }

        return [...map.values()].map(item => ({
            city: item.city,
            country: item.country,
            nodes: item.nodes,
            percent: total ? ((item.nodes / total) * 100).toFixed(2) : "0.00",
            asns: item.asns.size,
            topOrg: topValue(item.orgs),
            topAgent: topValue(item.agents)
        }));
    }

    function renderSummary(rows) {
        const totalNodes = rows.reduce((sum, row) => sum + row.nodes, 0);
        const countries = new Set(rows.map(row => row.country).filter(Boolean));

        $("#bn-summary").innerHTML = `
            <article class="bn-card"><span>Cities</span><strong>${fmt(rows.length)}</strong></article>
            <article class="bn-card"><span>Countries</span><strong>${fmt(countries.size)}</strong></article>
            <article class="bn-card"><span>Reachable Nodes</span><strong>${fmt(totalNodes)}</strong></article>
            <article class="bn-card"><span>Largest City</span><strong>${fmt(rows[0]?.city)}</strong></article>
        `;
    }

    function filteredRows() {
        const search = ($("#bn-search")?.value || "").trim().toLowerCase();
        const sort = $("#bn-sort")?.value || "nodes";

        let rows = ROWS.filter(row => {
            if (!search) return true;
            return [row.city, row.country, row.topOrg, row.topAgent]
                .join(" ")
                .toLowerCase()
                .includes(search);
        });

        if (sort === "city") rows.sort((a, b) => a.city.localeCompare(b.city));
        else if (sort === "country") rows.sort((a, b) => a.country.localeCompare(b.country));
        else if (sort === "asns") rows.sort((a, b) => b.asns - a.asns);
        else rows.sort((a, b) => b.nodes - a.nodes);

        return rows;
    }

    function renderRows(rows) {
        const view = $("#bn-view");

        if (!rows.length) {
            view.innerHTML = `<div class="bn-empty">No city telemetry matched current filters.</div>`;
            return;
        }

        view.innerHTML = `
            <div class="bn-city-table-wrap">
                <table class="bn-city-table">
                    <thead>
                        <tr>
                            <th>City</th>
                            <th>Country</th>
                            <th>Nodes</th>
                            <th>Share</th>
                            <th>ASNs</th>
                            <th>Dominant Agent</th>
                            <th>Largest Organization</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${rows.map(row => `
                            <tr>
                                <td class="bn-city-name">${fmt(row.city)}</td>
                                <td class="bn-city-country">${fmt(row.country)}</td>
                                <td>${fmt(row.nodes)}</td>
                                <td>${fmt(row.percent)}%</td>
                                <td>${fmt(row.asns)}</td>
                                <td>${fmt(row.topAgent)}</td>
                                <td>${fmt(row.topOrg)}</td>
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

    async function loadCities() {
        const source = $("#bn-source")?.value || "local";
        const url = SOURCES[source] || SOURCES.local;

        setStatus(`Loading city distribution telemetry from ${source} source…`);

        try {
            const data = await getJson(url);

            ROWS = aggregate(data.nodes || {});
            ROWS.sort((a, b) => b.nodes - a.nodes);

            renderSummary(ROWS);
            renderRows(ROWS);

            setStatus(`Loaded ${fmt(ROWS.length)} city distributions.`, "ok");
        } catch (err) {
            ROWS = [];
            renderSummary([]);
            renderRows([]);

            setStatus(`City telemetry unavailable: ${err.message}`, "warn");
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("#bn-refresh")?.addEventListener("click", loadCities);
        $("#bn-source")?.addEventListener("change", loadCities);
        $("#bn-search")?.addEventListener("input", rerender);
        $("#bn-sort")?.addEventListener("change", rerender);

        loadCities();
    });
})();
