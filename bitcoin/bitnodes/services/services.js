(() => {
    "use strict";

    const SOURCES = {
        zzxbitnodes: "../api/services.json",
        originalbitnodes: "../api/originalbitnodes/services.json",
        aggregate: "../api/aggregate/zzxbitnodes/latest.json",
        enriched: "../api/enriched/zzxbitnodes/latest.json",
        local: "../api/services.json"
    };

    const SERVICE_BITS = [
        [0, "NODE_NETWORK"],
        [1, "NODE_GETUTXO"],
        [2, "NODE_BLOOM"],
        [3, "NODE_WITNESS"],
        [4, "NODE_XTHIN"],
        [6, "NODE_COMPACT_FILTERS"],
        [10, "NODE_NETWORK_LIMITED"],
        [11, "NODE_P2P_V2"]
    ];

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

    function pct(part, total) {
        const a = Number(part || 0);
        const b = Number(total || 0);

        if (!b) return "0.00";

        return ((a / b) * 100).toFixed(2);
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
        const response = await fetch(`${url}?t=${Date.now()}`, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`${response.status} ${response.statusText}`);
        }

        return response.json();
    }

    function topValue(map) {
        return [...map.entries()]
            .sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
    }

    function extractNodes(data) {
        if (!data || typeof data !== "object") return {};

        if (data.nodes && typeof data.nodes === "object") return data.nodes;
        if (data.reachable_nodes && typeof data.reachable_nodes === "object") return data.reachable_nodes;
        if (data.data && data.data.nodes && typeof data.data.nodes === "object") return data.data.nodes;

        if (Array.isArray(data.results)) {
            const out = {};

            for (const row of data.results) {
                const key = row.services || row.service_bits || row.name || row.address || row.node;

                if (key !== undefined && key !== null) {
                    out[String(key)] = row;
                }
            }

            return out;
        }

        return {};
    }

    function decodeServices(value) {
        const n = num(value);
        const flags = [];

        for (const [bit, name] of SERVICE_BITS) {
            if ((n & (1 << bit)) !== 0) {
                flags.push(name);
            }
        }

        if (!flags.length && String(value || "").trim()) {
            flags.push("UNKNOWN_FLAGS");
        }

        return flags;
    }

    function normalizeExistingRows(data) {
        if (!Array.isArray(data?.results)) {
            return null;
        }

        const total = data.total_nodes ||
            data.results.reduce((sum, row) => sum + Number(row.total_nodes || row.nodes || row.count || 0), 0);

        return data.results.map(row => {
            const services = row.services || row.service_bits || row.name || "Unknown";
            const nodes = Number(row.total_nodes || row.nodes || row.count || 0);

            return {
                services,
                nodes,
                percent: row.percent || row.share || pct(nodes, total),
                countries: Number(row.countries || row.total_countries || 0),
                flags: row.flags || decodeServices(services),
                dominantAgent: row.dominant_agent || row.top_agent || row.agent || "—",
                dominantCountry: row.dominant_country || row.top_country || row.country || "—"
            };
        });
    }

    function aggregate(nodes) {
        const total = Object.keys(nodes || {}).length;
        const map = new Map();

        for (const row of Object.values(nodes || {})) {
            const isArray = Array.isArray(row);

            const services = isArray
                ? row?.[3] ?? "Unknown"
                : row?.services ?? row?.service_bits ?? "Unknown";

            const country = isArray
                ? row?.[7] || "Unknown"
                : row?.country || row?.country_code || "Unknown";

            const agent = isArray
                ? row?.[1] || "Unknown"
                : row?.agent || row?.user_agent || row?.subver || "Unknown";

            const key = String(services);

            if (!map.has(key)) {
                map.set(key, {
                    services: key,
                    nodes: 0,
                    countries: new Set(),
                    agents: new Map(),
                    countryMap: new Map()
                });
            }

            const item = map.get(key);

            item.nodes += 1;
            item.countries.add(country);
            item.agents.set(agent, (item.agents.get(agent) || 0) + 1);
            item.countryMap.set(country, (item.countryMap.get(country) || 0) + 1);
        }

        return [...map.values()].map(item => ({
            services: item.services,
            nodes: item.nodes,
            percent: pct(item.nodes, total),
            countries: item.countries.size,
            flags: decodeServices(item.services),
            dominantAgent: topValue(item.agents),
            dominantCountry: topValue(item.countryMap)
        }));
    }

    function normalize(data) {
        return normalizeExistingRows(data) || aggregate(extractNodes(data));
    }

    function renderSummary(rows) {
        const target = $("#bn-summary");

        if (!target) return;

        const totalNodes = rows.reduce((sum, row) => sum + Number(row.nodes || 0), 0);
        const uniqueFlags = new Set();

        for (const row of rows) {
            for (const flag of row.flags || []) {
                uniqueFlags.add(flag);
            }
        }

        target.innerHTML = `
            <article class="bn-card"><span>Service Groups</span><strong>${fmt(rows.length)}</strong></article>
            <article class="bn-card"><span>Reachable Nodes</span><strong>${fmt(totalNodes)}</strong></article>
            <article class="bn-card"><span>Decoded Flags</span><strong>${fmt(uniqueFlags.size)}</strong></article>
            <article class="bn-card"><span>Top Services</span><strong>${esc(fmt(rows[0]?.services))}</strong></article>
        `;
    }

    function filteredRows() {
        const search = ($("#bn-search")?.value || "").trim().toLowerCase();
        const sort = $("#bn-sort")?.value || "nodes";

        let rows = ROWS.filter(row => {
            if (!search) return true;

            return [
                row.services,
                row.flags.join(" "),
                row.dominantAgent,
                row.dominantCountry
            ].join(" ").toLowerCase().includes(search);
        });

        if (sort === "services") {
            rows.sort((a, b) => String(a.services).localeCompare(String(b.services)));
        } else if (sort === "countries") {
            rows.sort((a, b) => Number(b.countries) - Number(a.countries));
        } else if (sort === "flags") {
            rows.sort((a, b) => Number(b.flags.length) - Number(a.flags.length));
        } else {
            rows.sort((a, b) => Number(b.nodes) - Number(a.nodes));
        }

        return rows;
    }

    function renderRows(rows) {
        const view = $("#bn-view");

        if (!view) return;

        if (!rows.length) {
            view.innerHTML = `<div class="bn-service-empty">No service-bit telemetry matched current filters.</div>`;
            return;
        }

        view.innerHTML = `
            <div class="bn-service-grid">
                ${rows.map(row => `
                    <article class="bn-service-card">
                        <div class="bn-service-header">
                            <div>
                                <div class="bn-service-code">${esc(fmt(row.services))}</div>
                                <div class="bn-service-label">Service Bit Combination</div>
                            </div>

                            <div>
                                <div class="bn-service-count">${fmt(row.nodes)}</div>
                                <div class="bn-service-share">${fmt(row.percent)}%</div>
                            </div>
                        </div>

                        <div class="bn-service-stats">
                            <div class="bn-service-stat">
                                <span>Countries</span>
                                <strong>${fmt(row.countries)}</strong>
                            </div>

                            <div class="bn-service-stat">
                                <span>Decoded Flags</span>
                                <strong>${fmt(row.flags.length)}</strong>
                            </div>

                            <div class="bn-service-stat">
                                <span>Dominant Agent</span>
                                <strong>${esc(row.dominantAgent)}</strong>
                            </div>

                            <div class="bn-service-stat">
                                <span>Dominant Country</span>
                                <strong>${esc(row.dominantCountry)}</strong>
                            </div>
                        </div>

                        <div class="bn-service-flags">
                            ${row.flags.map(flag => `
                                <span class="bn-service-flag">${esc(flag)}</span>
                            `).join("")}
                        </div>
                    </article>
                `).join("")}
            </div>
        `;
    }

    function rerender() {
        renderRows(filteredRows());
    }

    async function loadServices() {
        const source = $("#bn-source")?.value || "zzxbitnodes";
        const url = SOURCES[source] || SOURCES.zzxbitnodes;

        setStatus(`Loading service-bit telemetry from ${source}...`);

        try {
            const data = await getJson(url);

            ROWS = normalize(data);
            ROWS.sort((a, b) => Number(b.nodes) - Number(a.nodes));

            renderSummary(ROWS);
            renderRows(ROWS);

            setStatus(`Loaded ${fmt(ROWS.length)} service-bit groups.`, "ok");
        } catch (err) {
            ROWS = [];

            renderSummary([]);
            renderRows([]);

            setStatus(`Service telemetry unavailable: ${err.message}`, "warn");
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("#bn-refresh")?.addEventListener("click", loadServices);
        $("#bn-source")?.addEventListener("change", loadServices);
        $("#bn-search")?.addEventListener("input", rerender);
        $("#bn-sort")?.addEventListener("change", rerender);

        loadServices();
    });
})();
