(() => {
    "use strict";

    const SOURCE_FILES = {
        zzxbitnodes: "../api/zzxbitnodes/agents.json",
        originalbitnodes: "../api/originalbitnodes/agents.json",
        local: "../api/zzxbitnodes/agents.json",
        external: "https://bitnodes.io/api/v1/snapshots/latest/"
    };

    let ROWS = [];

    const $ = (q) => document.querySelector(q);

    function fmt(value) {
        if (value === null || value === undefined || value === "") {
            return "—";
        }

        if (typeof value === "number") {
            return value.toLocaleString();
        }

        const n = Number(value);

        if (Number.isFinite(n) && String(value).trim() !== "") {
            return n.toLocaleString();
        }

        return String(value);
    }

    function esc(value) {
        return String(value ?? "")
            .replace(/[&<>"']/g, (ch) => ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                "\"": "&quot;",
                "'": "&#39;"
            }[ch]));
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
        return [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
    }

    function normalizeApiRows(payload) {
        if (Array.isArray(payload?.results)) {
            return payload.results.map((row) => ({
                agent: row.agent || row.name || row.value || "Unknown",
                nodes: Number(row.total_nodes || row.nodes || row.count || 0),
                reachable: Number(row.reachable_nodes || row.reachable || 0),
                ipv4: Number(row.ipv4_nodes || row.ipv4 || 0),
                ipv6: Number(row.ipv6_nodes || row.ipv6 || 0),
                tor: Number(row.tor_nodes || row.tor || 0),
                countries: Number(row.countries || row.total_countries || 0),
                protocols: row.protocols || row.top_protocol || row.protocol || "—",
                topService: row.top_service || row.topService || row.services || "—"
            }));
        }

        return null;
    }

    function aggregateSnapshotNodes(nodes) {
        const total = Object.keys(nodes || {}).length;
        const map = new Map();

        for (const row of Object.values(nodes || {})) {
            const agent = row?.[1] || "Unknown";
            const country = row?.[7] || "Unknown";
            const protocol = row?.[0] || "Unknown";
            const services = row?.[3] || "Unknown";
            const metadata = row?.[19] && typeof row[19] === "object" ? row[19] : {};
            const reachable = metadata.reachable === true || metadata.reachable_now === true;

            if (!map.has(agent)) {
                map.set(agent, {
                    agent,
                    nodes: 0,
                    reachable: 0,
                    ipv4: 0,
                    ipv6: 0,
                    tor: 0,
                    countries: new Set(),
                    protocols: new Set(),
                    services: new Map()
                });
            }

            const item = map.get(agent);
            item.nodes += 1;

            if (reachable) {
                item.reachable += 1;
            }

            item.countries.add(country);
            item.protocols.add(protocol);
            item.services.set(services, (item.services.get(services) || 0) + 1);
        }

        return [...map.values()].map((item) => ({
            agent: item.agent,
            nodes: item.nodes,
            reachable: item.reachable,
            ipv4: item.ipv4,
            ipv6: item.ipv6,
            tor: item.tor,
            countries: item.countries.size,
            protocols: [...item.protocols].join(", "),
            topService: topValue(item.services),
            percent: total ? ((item.nodes / total) * 100).toFixed(2) : "0.00"
        }));
    }

    function finalizeRows(rows) {
        const total = rows.reduce((sum, row) => sum + Number(row.nodes || 0), 0);

        return rows.map((row) => ({
            ...row,
            percent: total ? ((Number(row.nodes || 0) / total) * 100).toFixed(2) : "0.00"
        }));
    }

    function renderSummary(rows) {
        const mount = $("#bn-summary");

        if (!mount) {
            return;
        }

        const totalNodes = rows.reduce((sum, row) => sum + Number(row.nodes || 0), 0);
        const totalReachable = rows.reduce((sum, row) => sum + Number(row.reachable || 0), 0);

        mount.innerHTML = `
            <article class="bn-card"><span>User Agents</span><strong>${fmt(rows.length)}</strong></article>
            <article class="bn-card"><span>Total Nodes</span><strong>${fmt(totalNodes)}</strong></article>
            <article class="bn-card"><span>Reachable</span><strong>${fmt(totalReachable)}</strong></article>
            <article class="bn-card"><span>Dominant Agent</span><strong>${esc(fmt(rows[0]?.agent))}</strong></article>
        `;
    }

    function filteredRows() {
        const search = ($("#bn-search")?.value || "").trim().toLowerCase();
        const sort = $("#bn-sort")?.value || "nodes";

        const rows = ROWS.filter((row) => {
            if (!search) {
                return true;
            }

            return [
                row.agent,
                row.protocols,
                row.topService
            ].join(" ").toLowerCase().includes(search);
        });

        if (sort === "agent") {
            rows.sort((a, b) => String(a.agent).localeCompare(String(b.agent)));
        } else if (sort === "reachable") {
            rows.sort((a, b) => Number(b.reachable || 0) - Number(a.reachable || 0));
        } else if (sort === "ipv4") {
            rows.sort((a, b) => Number(b.ipv4 || 0) - Number(a.ipv4 || 0));
        } else if (sort === "ipv6") {
            rows.sort((a, b) => Number(b.ipv6 || 0) - Number(a.ipv6 || 0));
        } else if (sort === "tor") {
            rows.sort((a, b) => Number(b.tor || 0) - Number(a.tor || 0));
        } else {
            rows.sort((a, b) => Number(b.nodes || 0) - Number(a.nodes || 0));
        }

        return rows;
    }

    function renderRows(rows) {
        const view = $("#bn-view");

        if (!view) {
            return;
        }

        if (!rows.length) {
            view.innerHTML = `<div class="bn-empty">No user-agent telemetry matched current filters.</div>`;
            return;
        }

        view.innerHTML = `
            <div class="bn-agent-grid">
                ${rows.map((row) => `
                    <article class="bn-agent-card">
                        <div class="bn-agent-header">
                            <div class="bn-agent-name">${esc(fmt(row.agent))}</div>
                            <div>
                                <div class="bn-agent-count">${fmt(row.nodes)}</div>
                                <div class="bn-agent-share">${fmt(row.percent)}%</div>
                            </div>
                        </div>

                        <div class="bn-agent-stats">
                            <div class="bn-agent-stat">
                                <span>Reachable</span>
                                <strong>${fmt(row.reachable)}</strong>
                            </div>

                            <div class="bn-agent-stat">
                                <span>Countries</span>
                                <strong>${fmt(row.countries)}</strong>
                            </div>

                            <div class="bn-agent-stat">
                                <span>Protocol Versions</span>
                                <strong>${esc(fmt(row.protocols))}</strong>
                            </div>

                            <div class="bn-agent-stat">
                                <span>Dominant Services</span>
                                <strong>${esc(fmt(row.topService))}</strong>
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

    async function loadAgents() {
        const source = $("#bn-source")?.value || "zzxbitnodes";
        const url = SOURCE_FILES[source] || SOURCE_FILES.zzxbitnodes;

        setStatus(`Loading Bitcoin user-agent telemetry from ${source}…`);

        try {
            const data = await getJson(url);
            const grouped = normalizeApiRows(data) || aggregateSnapshotNodes(data.nodes || {});

            ROWS = finalizeRows(grouped);
            ROWS.sort((a, b) => Number(b.nodes || 0) - Number(a.nodes || 0));

            renderSummary(ROWS);
            renderRows(ROWS);

            setStatus(`Loaded ${fmt(ROWS.length)} user-agent groups from ${source}.`, "ok");
        } catch (err) {
            ROWS = [];
            renderSummary([]);
            renderRows([]);

            setStatus(`User-agent telemetry unavailable: ${err.message}`, "warn");
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("#bn-refresh")?.addEventListener("click", loadAgents);
        $("#bn-source")?.addEventListener("change", loadAgents);
        $("#bn-search")?.addEventListener("input", rerender);
        $("#bn-sort")?.addEventListener("change", rerender);

        loadAgents();
    });
})();
