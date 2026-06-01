(() => {
    "use strict";

    const SOURCES = {
        zzxbitnodes: "../api/ports.json",
        originalbitnodes: "../api/originalbitnodes/ports.json",
        aggregate: "../api/aggregate/zzxbitnodes/latest.json",
        enriched: "../api/enriched/zzxbitnodes/latest.json",
        local: "../api/ports.json",
        external: "https://bitnodes.io/api/v1/snapshots/latest/"
    };

    let ROWS = [];

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

        if (!el) {
            return;
        }

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
        if (!data || typeof data !== "object") {
            return {};
        }

        if (data.nodes && typeof data.nodes === "object") {
            return data.nodes;
        }

        if (data.reachable_nodes && typeof data.reachable_nodes === "object") {
            return data.reachable_nodes;
        }

        if (data.data && data.data.nodes && typeof data.data.nodes === "object") {
            return data.data.nodes;
        }

        if (Array.isArray(data.results)) {
            const out = {};

            for (const row of data.results) {
                const address = row.address || row.node || row.addr || row.host || row.port;

                if (address) {
                    out[address] = row;
                }
            }

            return out;
        }

        if (Array.isArray(data.rows)) {
            const out = {};

            for (const row of data.rows) {
                const address = row.address || row.node || row.addr || row.host || row.port;

                if (address) {
                    out[address] = row;
                }
            }

            return out;
        }

        return {};
    }

    function extractPort(address, row = {}) {
        if (row.port) {
            return String(row.port);
        }

        const text = String(address || row.address || row.node || row.host || "").trim();

        if (!text) {
            return "Unknown";
        }

        if (text.includes(".onion") && !text.includes(":")) {
            return "onion";
        }

        if (text.startsWith("[") && text.includes("]:")) {
            const match = text.match(/\]:(\d+)$/);
            return match ? match[1] : "Unknown";
        }

        if (text.includes(".onion:") || text.includes(".i2p:")) {
            const match = text.match(/:(\d+)$/);
            return match ? match[1] : "onion";
        }

        if (text.split(":").length === 2) {
            const match = text.match(/:(\d+)$/);
            return match ? match[1] : "Unknown";
        }

        if (text.includes(":") && !text.includes(".")) {
            return "8333";
        }

        return "Unknown";
    }

    function topValue(map) {
        return [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
    }

    function aggregate(nodes) {
        const total = Object.keys(nodes || {}).length;
        const map = new Map();

        for (const [address, row] of Object.entries(nodes || {})) {
            const isArray = Array.isArray(row);

            const port = isArray
                ? extractPort(address, {})
                : extractPort(address, row);

            const country = isArray
                ? row?.[7] || "Unknown"
                : row?.country || row?.country_code || "Unknown";

            const agent = isArray
                ? row?.[1] || "Unknown"
                : row?.agent || row?.user_agent || "Unknown";

            const services = isArray
                ? row?.[3] || "Unknown"
                : row?.services || row?.service_bits || "Unknown";

            const network = String(address).includes(".onion")
                ? "Tor"
                : String(address).includes(".i2p")
                    ? "I2P"
                    : String(address).includes(":")
                        ? "IPv6"
                        : "IPv4";

            if (!map.has(port)) {
                map.set(port, {
                    port,
                    nodes: 0,
                    countries: new Set(),
                    agents: new Map(),
                    services: new Map(),
                    networks: new Map()
                });
            }

            const item = map.get(port);

            item.nodes += 1;
            item.countries.add(country);
            item.agents.set(agent, (item.agents.get(agent) || 0) + 1);
            item.services.set(services, (item.services.get(services) || 0) + 1);
            item.networks.set(network, (item.networks.get(network) || 0) + 1);
        }

        return [...map.values()].map(item => ({
            port: item.port,
            nodes: item.nodes,
            percent: total ? ((item.nodes / total) * 100).toFixed(2) : "0.00",
            countries: item.countries.size,
            topAgent: topValue(item.agents),
            topService: topValue(item.services),
            topNetwork: topValue(item.networks)
        }));
    }

    function renderSummary(rows) {
        const target = $("#bn-summary");

        if (!target) {
            return;
        }

        const totalNodes = rows.reduce((sum, row) => sum + row.nodes, 0);
        const default8333 = rows.find(row => row.port === "8333");

        target.innerHTML = `
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

            return [
                row.port,
                row.topAgent,
                row.topService,
                row.topNetwork
            ].join(" ").toLowerCase().includes(search);
        });

        if (sort === "port") {
            rows.sort((a, b) => {
                const an = Number(a.port);
                const bn = Number(b.port);

                if (Number.isFinite(an) && Number.isFinite(bn)) {
                    return an - bn;
                }

                return String(a.port).localeCompare(String(b.port));
            });
        } else if (sort === "countries") {
            rows.sort((a, b) => b.countries - a.countries);
        } else {
            rows.sort((a, b) => b.nodes - a.nodes);
        }

        return rows;
    }

    function renderRows(rows) {
        const view = $("#bn-view");

        if (!view) {
            return;
        }

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
                                <div class="bn-port-number">${esc(fmt(row.port))}</div>
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
                                <span>Dominant Network</span>
                                <strong>${esc(fmt(row.topNetwork))}</strong>
                            </div>

                            <div class="bn-port-stat">
                                <span>Dominant Agent</span>
                                <strong>${esc(fmt(row.topAgent))}</strong>
                            </div>

                            <div class="bn-port-stat">
                                <span>Dominant Services</span>
                                <strong>${esc(fmt(row.topService))}</strong>
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
        const source = $("#bn-source")?.value || "zzxbitnodes";
        const url = SOURCES[source] || SOURCES.zzxbitnodes;

        setStatus(`Loading Bitcoin port telemetry from ${source}...`);

        try {
            const data = await getJson(url);

            ROWS = aggregate(extractNodes(data));
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
