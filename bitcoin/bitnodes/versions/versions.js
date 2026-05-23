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
        const total = Object.keys(nodes).length;
        const map = new Map();

        for (const row of Object.values(nodes)) {
            const version = row?.[1] || "Unknown";
            const protocol = row?.[0] || "Unknown";
            const country = row?.[7] || "Unknown";
            const services = row?.[3] || "Unknown";

            if (!map.has(version)) {
                map.set(version, {
                    version,
                    nodes: 0,
                    countries: new Set(),
                    protocols: new Set(),
                    services: new Map()
                });
            }

            const item = map.get(version);

            item.nodes += 1;
            item.countries.add(country);
            item.protocols.add(protocol);
            item.services.set(services, (item.services.get(services) || 0) + 1);
        }

        return [...map.values()].map(item => ({
            version: item.version,
            nodes: item.nodes,
            percent: total ? ((item.nodes / total) * 100).toFixed(2) : "0.00",
            countries: item.countries.size,
            highestProtocol: Math.max(...[...item.protocols].map(Number).filter(Number.isFinite)),
            dominantService: topValue(item.services)
        }));
    }

    function renderSummary(rows) {
        const totalNodes = rows.reduce((sum, row) => sum + row.nodes, 0);

        $("#bn-summary").innerHTML = `
            <article class="bn-card"><span>Observed Versions</span><strong>${fmt(rows.length)}</strong></article>
            <article class="bn-card"><span>Reachable Nodes</span><strong>${fmt(totalNodes)}</strong></article>
            <article class="bn-card"><span>Dominant Version</span><strong>${fmt(rows[0]?.version)}</strong></article>
            <article class="bn-card"><span>Largest Share</span><strong>${fmt(rows[0]?.percent)}%</strong></article>
        `;
    }

    function filteredRows() {
        const search = ($("#bn-search")?.value || "").trim().toLowerCase();
        const sort = $("#bn-sort")?.value || "nodes";

        let rows = ROWS.filter(row => {
            if (!search) return true;

            return [
                row.version,
                row.highestProtocol,
                row.dominantService
            ].join(" ").toLowerCase().includes(search);
        });

        if (sort === "version") {
            rows.sort((a, b) => a.version.localeCompare(b.version));
        } else if (sort === "countries") {
            rows.sort((a, b) => b.countries - a.countries);
        } else if (sort === "protocol") {
            rows.sort((a, b) => b.highestProtocol - a.highestProtocol);
        } else {
            rows.sort((a, b) => b.nodes - a.nodes);
        }

        return rows;
    }

    function renderRows(rows) {
        const view = $("#bn-view");

        if (!rows.length) {
            view.innerHTML = `<div class="bn-empty">No version telemetry matched current filters.</div>`;
            return;
        }

        view.innerHTML = `
            <div class="bn-version-grid">
                ${rows.map(row => `
                    <article class="bn-version-card">
                        <div class="bn-version-header">
                            <div class="bn-version-name">${fmt(row.version)}</div>

                            <div>
                                <div class="bn-version-count">${fmt(row.nodes)}</div>
                                <div class="bn-version-share">${fmt(row.percent)}%</div>
                            </div>
                        </div>

                        <div class="bn-version-stats">
                            <div class="bn-version-stat">
                                <span>Countries</span>
                                <strong>${fmt(row.countries)}</strong>
                            </div>

                            <div class="bn-version-stat">
                                <span>Highest Protocol</span>
                                <strong>${fmt(row.highestProtocol || "—")}</strong>
                            </div>

                            <div class="bn-version-stat">
                                <span>Dominant Services</span>
                                <strong>${fmt(row.dominantService)}</strong>
                            </div>

                            <div class="bn-version-stat">
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

    async function loadVersions() {
        const source = $("#bn-source")?.value || "local";
        const url = SOURCES[source] || SOURCES.local;

        setStatus(`Loading software-version telemetry from ${source} source…`);

        try {
            const data = await getJson(url);

            ROWS = aggregate(data.nodes || {});
            ROWS.sort((a, b) => b.nodes - a.nodes);

            renderSummary(ROWS);
            renderRows(ROWS);

            setStatus(`Loaded ${fmt(ROWS.length)} software-version groups.`, "ok");
        } catch (err) {
            ROWS = [];

            renderSummary([]);
            renderRows([]);

            setStatus(`Version telemetry unavailable: ${err.message}`, "warn");
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("#bn-refresh")?.addEventListener("click", loadVersions);
        $("#bn-source")?.addEventListener("change", loadVersions);
        $("#bn-search")?.addEventListener("input", rerender);
        $("#bn-sort")?.addEventListener("change", rerender);

        loadVersions();
    });
})();
