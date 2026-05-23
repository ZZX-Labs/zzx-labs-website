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

    function unix(value) {
        if (!value) return "—";

        const ts = Number(value) < 10000000000
            ? Number(value) * 1000
            : Number(value);

        return new Date(ts)
            .toISOString()
            .replace("T", " ")
            .replace(".000Z", " UTC");
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

    function computeHealth(row) {
        const protocol = Number(row?.[0] || 0);
        const connectedSince = Number(row?.[2] || 0);
        const services = Number(row?.[3] || 0);
        const height = Number(row?.[4] || 0);

        const uptimeHours = connectedSince
            ? Math.max(0, (Date.now() / 1000 - connectedSince) / 3600)
            : 0;

        const latency = Math.max(10, 300 - Math.min(280, uptimeHours));

        let score = 0;

        score += Math.min(35, height / 25000);
        score += Math.min(25, uptimeHours / 24);
        score += Math.min(20, protocol / 4000);
        score += Math.min(20, services * 2);

        return {
            latency: Math.round(latency),
            uptimeHours: Math.round(uptimeHours),
            health: Math.min(100, Math.round(score))
        };
    }

    function normalize(nodes) {
        return Object.entries(nodes).map(([node, row]) => {
            const metrics = computeHealth(row);

            return {
                node,
                protocol: row?.[0],
                userAgent: row?.[1],
                connectedSince: row?.[2],
                services: row?.[3],
                height: row?.[4],
                hostname: row?.[5],
                city: row?.[6],
                country: row?.[7],
                timezone: row?.[10],
                asn: row?.[11],
                organization: row?.[12],
                latency: metrics.latency,
                uptimeHours: metrics.uptimeHours,
                health: metrics.health
            };
        });
    }

    function renderSummary(rows) {
        const avgHealth = rows.length
            ? Math.round(rows.reduce((sum, row) => sum + row.health, 0) / rows.length)
            : 0;

        const avgLatency = rows.length
            ? Math.round(rows.reduce((sum, row) => sum + row.latency, 0) / rows.length)
            : 0;

        $("#bn-summary").innerHTML = `
            <article class="bn-card"><span>Peers</span><strong>${fmt(rows.length)}</strong></article>
            <article class="bn-card"><span>Average Health</span><strong>${fmt(avgHealth)}%</strong></article>
            <article class="bn-card"><span>Average Latency</span><strong>${fmt(avgLatency)} ms</strong></article>
            <article class="bn-card"><span>Best Peer</span><strong>${fmt(rows[0]?.node)}</strong></article>
        `;
    }

    function filteredRows() {
        const search = ($("#bn-search")?.value || "").trim().toLowerCase();
        const sort = $("#bn-sort")?.value || "health";

        let rows = ROWS.filter(row => {
            if (!search) return true;

            return [
                row.node,
                row.country,
                row.organization,
                row.userAgent
            ].join(" ").toLowerCase().includes(search);
        });

        if (sort === "height") rows.sort((a, b) => b.height - a.height);
        else if (sort === "latency") rows.sort((a, b) => a.latency - b.latency);
        else if (sort === "uptime") rows.sort((a, b) => b.uptimeHours - a.uptimeHours);
        else rows.sort((a, b) => b.health - a.health);

        return rows;
    }

    function renderRows(rows) {
        const view = $("#bn-view");

        if (!rows.length) {
            view.innerHTML = `<div class="bn-empty">No peer-health telemetry matched current filters.</div>`;
            return;
        }

        view.innerHTML = `
            <div class="bn-peer-grid">
                ${rows.slice(0, 500).map(row => `
                    <article class="bn-peer-card">
                        <div class="bn-peer-header">
                            <div>
                                <div class="bn-peer-node">${fmt(row.node)}</div>
                                <div class="bn-peer-country">${fmt(row.city)}, ${fmt(row.country)}</div>
                            </div>

                            <div class="bn-peer-score">
                                <strong>${fmt(row.health)}%</strong>
                                <span>Health Score</span>
                            </div>
                        </div>

                        <div class="bn-health-bar">
                            <div class="bn-health-fill" style="width:${row.health}%"></div>
                        </div>

                        <div class="bn-peer-stats">
                            <div class="bn-peer-stat"><span>Latency</span><strong>${fmt(row.latency)} ms</strong></div>
                            <div class="bn-peer-stat"><span>Uptime</span><strong>${fmt(row.uptimeHours)} hr</strong></div>
                            <div class="bn-peer-stat"><span>Height</span><strong>${fmt(row.height)}</strong></div>
                            <div class="bn-peer-stat"><span>Protocol</span><strong>${fmt(row.protocol)}</strong></div>
                            <div class="bn-peer-stat"><span>User Agent</span><strong>${fmt(row.userAgent)}</strong></div>
                            <div class="bn-peer-stat"><span>ASN</span><strong>${fmt(row.asn)}</strong></div>
                            <div class="bn-peer-stat"><span>Organization</span><strong>${fmt(row.organization)}</strong></div>
                            <div class="bn-peer-stat"><span>Connected Since</span><strong>${unix(row.connectedSince)}</strong></div>
                        </div>
                    </article>
                `).join("")}
            </div>
        `;
    }

    function rerender() {
        renderRows(filteredRows());
    }

    async function loadPeerHealth() {
        const source = $("#bn-source")?.value || "local";
        const url = SOURCES[source] || SOURCES.local;

        setStatus(`Loading peer-health telemetry from ${source} source…`);

        try {
            const data = await getJson(url);

            ROWS = normalize(data.nodes || {});
            ROWS.sort((a, b) => b.health - a.health);

            renderSummary(ROWS);
            renderRows(ROWS);

            setStatus(`Loaded ${fmt(ROWS.length)} peer-health records.`, "ok");
        } catch (err) {
            ROWS = [];
            renderSummary([]);
            renderRows([]);

            setStatus(`Peer-health telemetry unavailable: ${err.message}`, "warn");
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("#bn-refresh")?.addEventListener("click", loadPeerHealth);
        $("#bn-source")?.addEventListener("change", loadPeerHealth);
        $("#bn-search")?.addEventListener("input", rerender);
        $("#bn-sort")?.addEventListener("change", rerender);

        loadPeerHealth();
    });
})();
