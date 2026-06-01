(() => {
    "use strict";

    const SOURCES = {
        zzxbitnodes: "../api/latest.json",
        originalbitnodes: "../api/originalbitnodes/latest.json",
        aggregate: "../api/aggregate/zzxbitnodes/latest.json",
        enriched: "../api/enriched/zzxbitnodes/latest.json",
        local: "../api/latest.json"
    };

    let CHARTS = [];

    const $ = q => document.querySelector(q);

    function fmt(value) {
        if (value === null || value === undefined || value === "") return "—";
        if (typeof value === "number") return value.toLocaleString();
        return String(value);
    }

    function esc(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    function setStatus(message, mode = "") {
        const el = $("#bn-status");

        if (!el) return;

        el.className = `bn-status container ${mode}`.trim();
        el.textContent = message;
    }

    async function getJson(url) {
        const response = await fetch(`${url}?t=${Date.now()}`, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`${response.status} ${response.statusText}`);
        }

        return response.json();
    }

    function extractNodes(data) {
        if (!data || typeof data !== "object") return {};

        if (data.nodes && typeof data.nodes === "object") return data.nodes;
        if (data.reachable_nodes && typeof data.reachable_nodes === "object") return data.reachable_nodes;
        if (data.data && data.data.nodes && typeof data.data.nodes === "object") return data.data.nodes;

        return {};
    }

    function inc(map, key) {
        const label = String(key || "Unknown");

        map.set(label, (map.get(label) || 0) + 1);
    }

    function topRows(map) {
        return [...map.entries()]
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value);
    }

    function portFromAddress(address) {
        const text = String(address || "");

        if (text.startsWith("[") && text.includes("]:")) {
            const match = text.match(/\]:(\d+)$/);
            return match ? match[1] : "Unknown";
        }

        const match = text.match(/:(\d+)$/);

        return match ? match[1] : "Unknown";
    }

    function versionFromAgent(agent) {
        const text = String(agent || "").trim();

        if (!text) return "Unknown";

        const match = text.match(/\/([^/:]+):?([^/()]*)\//);

        if (!match) return text;

        return match[2]
            ? `${match[1]} ${match[2]}`
            : match[1];
    }

    function buildCharts(nodes) {
        const countries = new Map();
        const asns = new Map();
        const agents = new Map();
        const versions = new Map();
        const services = new Map();
        const ports = new Map();
        const networks = new Map();

        for (const [address, row] of Object.entries(nodes || {})) {
            const isArray = Array.isArray(row);

            const agent = isArray
                ? row[1]
                : row.agent || row.user_agent || row.subver;

            const country = isArray
                ? row[7]
                : row.country || row.country_code;

            const asn = isArray
                ? row[11]
                : row.asn;

            const serviceBits = isArray
                ? row[3]
                : row.services || row.service_bits;

            const port = isArray
                ? portFromAddress(address)
                : row.port || portFromAddress(row.address || row.node || address);

            const hostText = String(address || row.address || row.node || "").toLowerCase();

            const network = hostText.includes(".onion")
                ? "Tor"
                : hostText.includes(".i2p")
                    ? "I2P"
                    : hostText.includes(":")
                        ? "IPv6"
                        : "IPv4";

            inc(countries, country);
            inc(asns, asn);
            inc(agents, agent);
            inc(versions, versionFromAgent(agent));
            inc(services, serviceBits);
            inc(ports, port);
            inc(networks, network);
        }

        return [
            {
                title: "Countries",
                description: "Reachable node distribution by country.",
                rows: topRows(countries)
            },
            {
                title: "ASNs",
                description: "Reachable node distribution by autonomous system.",
                rows: topRows(asns)
            },
            {
                title: "User Agents",
                description: "Bitcoin client user-agent distribution.",
                rows: topRows(agents)
            },
            {
                title: "Versions",
                description: "Client implementation and version distribution.",
                rows: topRows(versions)
            },
            {
                title: "Service Bits",
                description: "Advertised Bitcoin service-bit combinations.",
                rows: topRows(services)
            },
            {
                title: "Ports",
                description: "Observed reachable port distribution.",
                rows: topRows(ports)
            },
            {
                title: "Networks",
                description: "IPv4, IPv6, Tor, and I2P reachability split.",
                rows: topRows(networks)
            }
        ];
    }

    function renderSummary(nodes) {
        const target = $("#bn-summary");

        if (!target) return;

        const rows = Object.entries(nodes || {});
        const countries = new Set();
        const agents = new Set();
        const asns = new Set();
        let tor = 0;

        for (const [address, row] of rows) {
            const isArray = Array.isArray(row);

            countries.add(isArray ? row[7] : row.country || row.country_code);
            agents.add(isArray ? row[1] : row.agent || row.user_agent || row.subver);
            asns.add(isArray ? row[11] : row.asn);

            if (String(address).includes(".onion")) {
                tor += 1;
            }
        }

        target.innerHTML = `
            <article class="bn-card"><span>Reachable Nodes</span><strong>${fmt(rows.length)}</strong></article>
            <article class="bn-card"><span>Countries</span><strong>${fmt([...countries].filter(Boolean).length)}</strong></article>
            <article class="bn-card"><span>User Agents</span><strong>${fmt([...agents].filter(Boolean).length)}</strong></article>
            <article class="bn-card"><span>Tor Nodes</span><strong>${fmt(tor)}</strong></article>
        `;
    }

    function renderBars(chart, limit) {
        const rows = chart.rows.slice(0, limit);
        const max = Math.max(...rows.map(row => row.value), 1);

        return `
            <div class="bn-chart-bars">
                ${rows.map(row => {
                    const width = Math.max(1, (row.value / max) * 100);

                    return `
                        <div class="bn-chart-row">
                            <div class="bn-chart-label">${esc(row.label)}</div>

                            <div class="bn-chart-track">
                                <div class="bn-chart-fill" style="width:${width}%"></div>
                            </div>

                            <div class="bn-chart-value">${fmt(row.value)}</div>
                        </div>
                    `;
                }).join("")}
            </div>
        `;
    }

    function renderTable(chart, limit) {
        const rows = chart.rows.slice(0, limit);
        const total = chart.rows.reduce((sum, row) => sum + row.value, 0);

        return `
            <div class="bn-chart-table-wrap">
                <table class="bn-chart-table">
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Label</th>
                            <th>Nodes</th>
                            <th>Share</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${rows.map((row, index) => `
                            <tr>
                                <td>${index + 1}</td>
                                <td>${esc(row.label)}</td>
                                <td>${fmt(row.value)}</td>
                                <td>${total ? ((row.value / total) * 100).toFixed(2) : "0.00"}%</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;
    }

    function renderCharts() {
        const view = $("#bn-view");

        if (!view) return;

        if (!CHARTS.length) {
            view.innerHTML = `<div class="bn-chart-empty">No chart data available.</div>`;
            return;
        }

        const limit = Number($("#bn-chart-limit")?.value || 10);
        const mode = $("#bn-chart-mode")?.value || "bars";

        view.innerHTML = `
            <div class="bn-chart-grid">
                ${CHARTS.map(chart => `
                    <article class="bn-chart-card">
                        <h3>${esc(chart.title)}</h3>
                        <p>${esc(chart.description)}</p>

                        ${
                            mode === "tables"
                                ? renderTable(chart, limit)
                                : renderBars(chart, limit)
                        }
                    </article>
                `).join("")}
            </div>
        `;
    }

    async function loadCharts() {
        const source = $("#bn-source")?.value || "zzxbitnodes";
        const url = SOURCES[source] || SOURCES.zzxbitnodes;

        setStatus(`Loading chart telemetry from ${source}...`);

        try {
            const data = await getJson(url);
            const nodes = extractNodes(data);

            CHARTS = buildCharts(nodes);

            renderSummary(nodes);
            renderCharts();

            setStatus(`Loaded ${fmt(CHARTS.length)} chart groups from ${source}.`, "ok");
        } catch (err) {
            CHARTS = [];

            renderSummary({});
            renderCharts();

            setStatus(`Chart telemetry unavailable: ${err.message}`, "warn");
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("#bn-refresh")?.addEventListener("click", loadCharts);
        $("#bn-source")?.addEventListener("change", loadCharts);
        $("#bn-chart-limit")?.addEventListener("change", renderCharts);
        $("#bn-chart-mode")?.addEventListener("change", renderCharts);

        loadCharts();
    });
})();
