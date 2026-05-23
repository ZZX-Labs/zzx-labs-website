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

    function extractPort(address) {
        if (!address) return "Unknown";

        if (address.endsWith(".onion")) return "onion";

        const match = String(address).match(/:(\d+)$/);
        return match ? match[1] : "Unknown";
    }

    function topValue(map) {
        return [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
    }

    function aggregate(nodes) {
        const total = Object.keys(nodes).length;
        const map = new Map();

        for (const [address, row] of Object.entries(nodes)) {
            const port = extractPort(address);
            const country = row?.[7] || "Unknown";
            const agent = row?.[1] || "Unknown";
            const services = row?.[3] || "Unknown";

            if (!map.has(port)) {
                map.set(port, {
                    port,
                    nodes: 0,
                    countries: new Set(),
                    agents: new Map(),
                    services: new Map()
                });
            }

            const item = map.get(port);
            item.nodes += 1;
            item.countries.add(country);
            item.agents.set(agent, (item.agents.get(agent) || 0) + 1);
            item.services.set(services, (item.services.get(services) || 0) + 1);
        }

        return [...map.values()].map(item => ({
            port: item.port,
            nodes: item.nodes,
            percent: total ? ((item.nodes / total) * 100).toFixed(2) : "0.00",
            countries: item.countries.size,
            topAgent: topValue(item.agents),
            topService: topValue(item.services)
        }));
    }

    function renderSummary(rows) {
        const totalNodes = rows.reduce((sum, row) => sum + row.nodes, 0);
        const default8333 = rows.find(row => row.port === "8333");

        $("#bn-summary").innerHTML = `
            <article class="bn-card"><span>Observed Ports</span><strong>${fmt(rows.length)}</strong></article>
            <article class="bn-card"><span>Reachable Nodes</span><strong>${fmt(totalNodes)}</strong></article>
            <article class="bn-card"><span>Default 8333</span><strong>${fmt(default8333?.nodes || 0)}</strong></article>
            <article class="bn-card"><span>Top Port</span><strong>${fmt(rows[0]?.port)}</strong></article>
        `;
    }

    function filteredRows() {
        const search = ($("#bn-search")?.value || "").trim().toLowerCase();
        const sort = $("#bn-sort")?.value || "nodes";

        let rows = ROWS.filter(row => {
            if (!search) return true;
            return [row.port, row.topAgent, row.topService]
                .join(" ")
                .toLowerCase()
                .includes(search);
        });

        if (sort === "port") {
            rows.sort((a, b) => Number(a.port) - Number(b.port));
        } else if (sort === "countries") {
            rows.sort((a, b) => b.countries - a.countries);
        } else {
            rows.sort((a, b) => b.nodes - a.nodes);
        }

        return rows;
    }

    function renderRows(rows) {
        const view = $("#bn-view");

        if (!rows.length) {
            view.innerHTML = `<div class="bn-empty">No port telemetry matched current filters.</div>`;
            return;
        }

        view.innerHTML = `
            <div class="bn-port-grid">
                ${rows.map(row => `
                    <article class="bn-port-card">
                        <div class="bn-port-header">
                            <div>
                                <div class="bn-port-number">${fmt(row.port)}</div>
                                <div class="bn-port-label">${row.port === "8333" ? "Default Bitcoin Port" : "Observed Node Port"}</div>
                            </div>

                            <div>
                                <div class="bn-port-count">${fmt(row.nodes)}</div>
                                <div class="bn-port-share">${fmt(row.percent)}%</div>
                            </div>
                        </div>

                        <div class="bn-port-stats">
                            <div class="bn-port-stat">
                                <span>Countries</span>
                                <strong>${fmt(row.countries)}</strong>
                            </div>

                            <div class="bn-port-stat">
                                <span>Dominant Agent</span>
                                <strong>${fmt(row.topAgent)}</strong>
                            </div>

                            <div class="bn-port-stat">
                                <span>Dominant Services</span>
                                <strong>${fmt(row.topService)}</strong>
                            </div>

                            <div class="bn-port-stat">
                                <span>Network Share</span>
                                <strong>${fmt(row.percent)}%</strong>
                            </div>
                        </div>
                    </article>
                `).join("")}
            </div>
        `;
    }

    function rerender() {
        renderRows(filteredRows());
    }

    async function loadPorts() {
        const source = $("#bn-source")?.value || "local";
        const url = SOURCES[source] || SOURCES.local;

        setStatus(`Loading Bitcoin port telemetry from ${source} source…`);

        try {
            const data = await getJson(url);

            ROWS = aggregate(data.nodes || {});
            ROWS.sort((a, b) => b.nodes - a.nodes);

            renderSummary(ROWS);
            renderRows(ROWS);

            setStatus(`Loaded ${fmt(ROWS.length)} observed port groups.`, "ok");
        } catch (err) {
            ROWS = [];
            renderSummary([]);
            renderRows([]);

            setStatus(`Port telemetry unavailable: ${err.message}`, "warn");
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("#bn-refresh")?.addEventListener("click", loadPorts);
        $("#bn-source")?.addEventListener("change", loadPorts);
        $("#bn-search")?.addEventListener("input", rerender);
        $("#bn-sort")?.addEventListener("change", rerender);

        loadPorts();
    });
})();
