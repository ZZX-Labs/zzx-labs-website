(() => {
    "use strict";

    const SOURCES = {
        zzxbitnodes: "../api/enriched/zzxbitnodes/latest.json",
        originalbitnodes: "../api/enriched/originalbitnodes/latest.json",
        aggregate: "../api/aggregate/zzxbitnodes/latest.json",
        enriched: "../api/enriched/zzxbitnodes/latest.json",
        local: "../api/latest.json"
    };

    let ROWS = [];

    const $ = q => document.querySelector(q);

    function fmt(value) {
        if (value === null || value === undefined || value === "") {
            return "—";
        }

        if (typeof value === "number") {
            return value.toLocaleString();
        }

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

        if (!b) {
            return "0.00";
        }

        return ((a / b) * 100).toFixed(2);
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

    function topValue(map) {
        return [...map.entries()]
            .sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
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

        return {};
    }

    function ispFromRow(row, meta) {
        const candidates = [
            row.isp,
            row.provider,
            row.hosting_provider,
            row.network_provider,
            row.organization,
            row.org,
            row.asn_organization,
            row.asn_org,
            row.owner,
            meta.isp,
            meta.provider,
            meta.organization,
            meta.org,
            meta.asn_organization,
            meta.asn_org,
            meta.owner
        ];

        for (const value of candidates) {
            const text = String(value || "").trim();

            if (text && !/^\d+(\.\d+)?$/.test(text)) {
                return text;
            }
        }

        return "Unknown";
    }

    function aggregate(nodes) {
        const map = new Map();
        const total = Object.keys(nodes || {}).length;

        for (const [address, row] of Object.entries(nodes || {})) {
            const isArray = Array.isArray(row);

            const meta = isArray && row[19] && typeof row[19] === "object"
                ? row[19]
                : !isArray && row.metadata && typeof row.metadata === "object"
                    ? row.metadata
                    : {};

            const obj = isArray
                ? {
                    address,
                    agent: row[1],
                    services: row[3],
                    city: row[6],
                    country: row[7],
                    asn: row[11],
                    organization: row[12],
                    provider: row[13]
                }
                : row || {};

            const isp = ispFromRow(obj, meta);
            const country = obj.country || obj.country_code || meta.country || "Unknown";
            const asn = obj.asn || meta.asn || "Unknown";
            const agent = obj.agent || obj.user_agent || obj.subver || "Unknown";
            const services = obj.services || obj.service_bits || "Unknown";

            if (!map.has(isp)) {
                map.set(isp, {
                    isp,
                    nodes: 0,
                    countries: new Set(),
                    asns: new Set(),
                    agents: new Map(),
                    services: new Map()
                });
            }

            const item = map.get(isp);

            item.nodes += 1;
            item.countries.add(country);
            item.asns.add(asn);
            item.agents.set(agent, (item.agents.get(agent) || 0) + 1);
            item.services.set(services, (item.services.get(services) || 0) + 1);
        }

        return [...map.values()].map(item => ({
            isp: item.isp,
            nodes: item.nodes,
            percent: pct(item.nodes, total),
            countries: item.countries.size,
            asns: item.asns.size,
            dominantAgent: topValue(item.agents),
            dominantService: topValue(item.services),
            countryList: [...item.countries].sort().slice(0, 12)
        }));
    }

    function renderSummary(rows) {
        const target = $("#bn-summary");

        if (!target) {
            return;
        }

        const totalNodes = rows.reduce((sum, row) => sum + Number(row.nodes || 0), 0);
        const countries = new Set();

        for (const row of rows) {
            for (const country of row.countryList || []) {
                countries.add(country);
            }
        }

        target.innerHTML = `
            <article class="bn-card"><span>ISPs</span><strong>${fmt(rows.length)}</strong></article>
            <article class="bn-card"><span>Nodes</span><strong>${fmt(totalNodes)}</strong></article>
            <article class="bn-card"><span>Countries</span><strong>${fmt(countries.size)}</strong></article>
            <article class="bn-card"><span>Top ISP</span><strong>${esc(fmt(rows[0]?.isp))}</strong></article>
        `;
    }

    function filteredRows() {
        const search = ($("#bn-search")?.value || "").trim().toLowerCase();
        const sort = $("#bn-sort")?.value || "nodes";

        let rows = ROWS.filter(row => {
            if (!search) {
                return true;
            }

            return [
                row.isp,
                row.dominantAgent,
                row.dominantService,
                row.countryList.join(" "),
                row.asns,
                row.countries
            ].join(" ").toLowerCase().includes(search);
        });

        if (sort === "isp") {
            rows.sort((a, b) => String(a.isp).localeCompare(String(b.isp)));
        } else if (sort === "countries") {
            rows.sort((a, b) => b.countries - a.countries);
        } else if (sort === "asns") {
            rows.sort((a, b) => b.asns - a.asns);
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
            view.innerHTML = `<div class="bn-isp-empty">No ISP telemetry matched current filters.</div>`;
            return;
        }

        view.innerHTML = `
            <div class="bn-isp-grid">
                ${rows.map(row => `
                    <article class="bn-isp-card">
                        <div class="bn-isp-header">
                            <div>
                                <div class="bn-isp-name">${esc(row.isp)}</div>
                                <div class="bn-isp-label">Network Operator / ISP</div>
                            </div>

                            <div>
                                <div class="bn-isp-count">${fmt(row.nodes)}</div>
                                <div class="bn-isp-share">${fmt(row.percent)}%</div>
                            </div>
                        </div>

                        <div class="bn-isp-stats">
                            <div class="bn-isp-stat">
                                <span>Countries</span>
                                <strong>${fmt(row.countries)}</strong>
                            </div>

                            <div class="bn-isp-stat">
                                <span>ASNs</span>
                                <strong>${fmt(row.asns)}</strong>
                            </div>

                            <div class="bn-isp-stat">
                                <span>Dominant Agent</span>
                                <strong>${esc(row.dominantAgent)}</strong>
                            </div>

                            <div class="bn-isp-stat">
                                <span>Dominant Services</span>
                                <strong>${esc(row.dominantService)}</strong>
                            </div>
                        </div>

                        <div class="bn-isp-country-list">
                            ${row.countryList.map(country => `
                                <span class="bn-isp-country">${esc(country)}</span>
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

    async function loadISP() {
        const source = $("#bn-source")?.value || "zzxbitnodes";
        const url = SOURCES[source] || SOURCES.zzxbitnodes;

        setStatus(`Loading ISP telemetry from ${source}...`);

        try {
            const data = await getJson(url);

            ROWS = aggregate(extractNodes(data));
            ROWS.sort((a, b) => b.nodes - a.nodes);

            renderSummary(ROWS);
            renderRows(ROWS);

            setStatus(`Loaded ${fmt(ROWS.length)} ISP groups.`, "ok");
        } catch (err) {
            ROWS = [];

            renderSummary([]);
            renderRows([]);

            setStatus(`ISP telemetry unavailable: ${err.message}`, "warn");
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("#bn-refresh")?.addEventListener("click", loadISP);
        $("#bn-source")?.addEventListener("change", loadISP);
        $("#bn-search")?.addEventListener("input", rerender);
        $("#bn-sort")?.addEventListener("change", rerender);

        loadISP();
    });
})();
