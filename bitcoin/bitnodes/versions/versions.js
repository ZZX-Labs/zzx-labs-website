(() => {
    "use strict";

    const SOURCES = {
        zzxbitnodes: "../api/versions.json",
        originalbitnodes: "../api/originalbitnodes/versions.json",
        aggregate: "../api/aggregate/zzxbitnodes/latest.json",
        enriched: "../api/enriched/zzxbitnodes/latest.json",
        local: "../api/versions.json",
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

    function num(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
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

        if (Array.isArray(data.results)) {
            const out = {};

            for (const row of data.results) {
                const key = row.version || row.agent || row.name || row.address || row.node;

                if (key) {
                    out[key] = row;
                }
            }

            return out;
        }

        return {};
    }

    function versionFromAgent(agent) {
        const text = String(agent || "").trim();

        if (!text) {
            return "Unknown";
        }

        const slash = text.match(/\/([^/:]+):?([^/()]*)\//);

        if (slash) {
            const name = slash[1] || "Unknown";
            const version = slash[2] || "";

            return version
                ? `${name} ${version}`
                : name;
        }

        return text;
    }

    function normalizeExistingRows(data) {
        if (!Array.isArray(data?.results)) {
            return null;
        }

        return data.results.map(row => ({
            version: row.version || row.agent || row.name || "Unknown",
            nodes: Number(row.total_nodes || row.nodes || row.count || 0),
            percent: row.percent || row.share || "0.00",
            countries: Number(row.countries || row.total_countries || 0),
            highestProtocol: Number(row.highest_protocol || row.highestProtocol || row.protocol || 0),
            dominantService: row.dominant_service || row.dominantService || row.top_service || row.services || "—"
        }));
    }

    function aggregate(nodes) {
        const total = Object.keys(nodes || {}).length;
        const map = new Map();

        for (const row of Object.values(nodes || {})) {
            const isArray = Array.isArray(row);

            const agent = isArray
                ? row?.[1]
                : row?.agent || row?.user_agent || row?.subver || row?.version;

            const version = isArray
                ? versionFromAgent(row?.[1])
                : row?.version || versionFromAgent(agent);

            const protocol = isArray
                ? row?.[0]
                : row?.protocol || row?.protocol_version;

            const country = isArray
                ? row?.[7] || "Unknown"
                : row?.country || row?.country_code || "Unknown";

            const services = isArray
                ? row?.[3] || "Unknown"
                : row?.services || row?.service_bits || "Unknown";

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

            if (protocol !== undefined && protocol !== null && protocol !== "") {
                item.protocols.add(protocol);
            }

            item.services.set(
                services,
                (item.services.get(services) || 0) + 1
            );
        }

        return [...map.values()].map(item => {
            const protocols = [...item.protocols]
                .map(Number)
                .filter(Number.isFinite);

            return {
                version: item.version,
                nodes: item.nodes,
                percent: total ? ((item.nodes / total) * 100).toFixed(2) : "0.00",
                countries: item.countries.size,
                highestProtocol: protocols.length ? Math.max(...protocols) : 0,
                dominantService: topValue(item.services)
            };
        });
    }

    function normalize(data) {
        return normalizeExistingRows(data) || aggregate(extractNodes(data));
    }

    function renderSummary(rows) {
        const target = $("#bn-summary");

        if (!target) {
            return;
        }

        const totalNodes = rows.reduce((sum, row) => sum + Number(row.nodes || 0), 0);

        target.innerHTML = `
            <article class="bn-card"><span>Observed Versions</span><strong>${fmt(rows.length)}</strong></article>
            <article class="bn-card"><span>Reachable Nodes</span><strong>${fmt(totalNodes)}</strong></article>
            <article class="bn-card"><span>Dominant Version</span><strong>${esc(fmt(rows[0]?.version))}</strong></article>
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
            rows.sort((a, b) => String(a.version).localeCompare(String(b.version)));
        } else if (sort === "countries") {
            rows.sort((a, b) => num(b.countries) - num(a.countries));
        } else if (sort === "protocol") {
            rows.sort((a, b) => num(b.highestProtocol) - num(a.highestProtocol));
        } else {
            rows.sort((a, b) => num(b.nodes) - num(a.nodes));
        }

        return rows;
    }

    function renderRows(rows) {
        const view = $("#bn-view");

        if (!view) {
            return;
        }

        if (!rows.length) {
            view.innerHTML = `<div class="bn-empty">No version telemetry matched current filters.</div>`;
            return;
        }

        view.innerHTML = `
            <div class="bn-version-grid">
                ${rows.map(row => `
                    <article class="bn-version-card">
                        <div class="bn-version-header">
                            <div class="bn-version-name">${esc(fmt(row.version))}</div>

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
                                <strong>${esc(fmt(row.dominantService))}</strong>
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
        const source = $("#bn-source")?.value || "zzxbitnodes";
        const url = SOURCES[source] || SOURCES.zzxbitnodes;

        setStatus(`Loading software-version telemetry from ${source}...`);

        try {
            const data = await getJson(url);

            ROWS = normalize(data);
            ROWS.sort((a, b) => num(b.nodes) - num(a.nodes));

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
