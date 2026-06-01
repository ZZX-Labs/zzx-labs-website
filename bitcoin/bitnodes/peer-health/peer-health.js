(() => {
    "use strict";

    const SOURCES = {
        zzxbitnodes: "../api/peer-health.json",
        originalbitnodes: "../api/originalbitnodes/peer-health.json",
        aggregate: "../api/aggregate/zzxbitnodes/latest.json",
        enriched: "../api/enriched/zzxbitnodes/latest.json",
        local: "../api/peer-health.json",
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

    function unix(value) {
        if (!value) return "—";

        const n = Number(value);

        if (!Number.isFinite(n)) {
            return String(value);
        }

        const ts = n < 10000000000 ? n * 1000 : n;

        try {
            return new Date(ts).toISOString().replace("T", " ").replace(".000Z", " UTC");
        } catch {
            return String(value);
        }
    }

    function number(value, fallback = 0) {
        const n = Number(value);

        return Number.isFinite(n)
            ? n
            : fallback;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
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
                const address = row.address || row.node || row.addr || row.host;

                if (address) {
                    out[address] = row;
                }
            }

            return out;
        }

        if (Array.isArray(data.rows)) {
            const out = {};

            for (const row of data.rows) {
                const address = row.address || row.node || row.addr || row.host;

                if (address) {
                    out[address] = row;
                }
            }

            return out;
        }

        return {};
    }

    function computeHealthFromFields(row) {
        const protocol = number(row.protocol);
        const connectedSince = number(row.connectedSince);
        const services = number(row.services);
        const height = number(row.height);
        const latency = number(row.latency, 0);

        const uptimeHours = connectedSince
            ? Math.max(0, (Date.now() / 1000 - connectedSince) / 3600)
            : number(row.uptimeHours, 0);

        let score = 0;

        score += Math.min(35, height / 25000);
        score += Math.min(25, uptimeHours / 24);
        score += Math.min(20, protocol / 4000);
        score += Math.min(20, services * 2);

        if (latency > 0) {
            score += latency < 250 ? 10 : latency < 1000 ? 4 : 0;
        }

        return {
            latency: latency || Math.max(10, Math.round(300 - Math.min(280, uptimeHours))),
            uptimeHours: Math.round(uptimeHours),
            health: clamp(Math.round(score), 0, 100)
        };
    }

    function normalizeNode(address, row) {
        if (Array.isArray(row)) {
            const meta = row[19] && typeof row[19] === "object" ? row[19] : {};
            const peerHealth = meta.peer_health && typeof meta.peer_health === "object" ? meta.peer_health : {};

            const base = {
                node: address,
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
                provider: row?.[13],
                latency: peerHealth.latency_ms || meta.latency_ms,
                uptimeHours: peerHealth.uptime_hours || meta.uptime_hours,
                health: peerHealth.health || peerHealth.score || meta.peer_index
            };

            const computed = computeHealthFromFields(base);

            return {
                ...base,
                latency: number(base.latency, computed.latency),
                uptimeHours: number(base.uptimeHours, computed.uptimeHours),
                health: clamp(number(base.health, computed.health), 0, 100)
            };
        }

        const meta = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
        const peerHealth = row?.peer_health && typeof row.peer_health === "object"
            ? row.peer_health
            : meta.peer_health && typeof meta.peer_health === "object"
                ? meta.peer_health
                : {};

        const base = {
            node: row?.address || row?.node || row?.addr || address,
            protocol: row?.protocol || row?.protocol_version || row?.version,
            userAgent: row?.user_agent || row?.agent || row?.subver,
            connectedSince: row?.connected_since || row?.timestamp || row?.seen_at || row?.last_seen,
            services: row?.services || row?.service_bits,
            height: row?.height || row?.start_height || row?.latest_height,
            hostname: row?.hostname || row?.host,
            city: row?.city || meta.city,
            country: row?.country || row?.country_code || meta.country,
            timezone: row?.timezone || row?.tz || meta.timezone,
            asn: row?.asn || meta.asn,
            organization: row?.organization || row?.org || meta.organization || meta.org,
            provider: row?.provider || meta.provider,
            latency: row?.latency_ms || peerHealth.latency_ms || meta.latency_ms,
            uptimeHours: row?.uptime_hours || peerHealth.uptime_hours || meta.uptime_hours,
            health: row?.health || row?.health_score || peerHealth.health || peerHealth.score || row?.peer_index || meta.peer_index
        };

        const computed = computeHealthFromFields(base);

        return {
            ...base,
            latency: number(base.latency, computed.latency),
            uptimeHours: number(base.uptimeHours, computed.uptimeHours),
            health: clamp(number(base.health, computed.health), 0, 100)
        };
    }

    function normalize(data) {
        const nodes = extractNodes(data);

        return Object.entries(nodes).map(([node, row]) => normalizeNode(node, row));
    }

    function renderSummary(rows) {
        const target = $("#bn-summary");

        if (!target) {
            return;
        }

        const avgHealth = rows.length
            ? Math.round(rows.reduce((sum, row) => sum + number(row.health), 0) / rows.length)
            : 0;

        const avgLatency = rows.length
            ? Math.round(rows.reduce((sum, row) => sum + number(row.latency), 0) / rows.length)
            : 0;

        target.innerHTML = `
            <article class="bn-card"><span>Peers</span><strong>${fmt(rows.length)}</strong></article>
            <article class="bn-card"><span>Average Health</span><strong>${fmt(avgHealth)}%</strong></article>
            <article class="bn-card"><span>Average Latency</span><strong>${fmt(avgLatency)} ms</strong></article>
            <article class="bn-card"><span>Best Peer</span><strong>${esc(fmt(rows[0]?.node))}</strong></article>
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
                row.city,
                row.organization,
                row.provider,
                row.userAgent,
                row.asn
            ].join(" ").toLowerCase().includes(search);
        });

        if (sort === "height") {
            rows.sort((a, b) => number(b.height) - number(a.height));
        } else if (sort === "latency") {
            rows.sort((a, b) => number(a.latency, 999999) - number(b.latency, 999999));
        } else if (sort === "uptime") {
            rows.sort((a, b) => number(b.uptimeHours) - number(a.uptimeHours));
        } else {
            rows.sort((a, b) => number(b.health) - number(a.health));
        }

        return rows;
    }

    function renderRows(rows) {
        const view = $("#bn-view");

        if (!view) {
            return;
        }

        if (!rows.length) {
            view.innerHTML = `<div class="bn-empty">No peer-health telemetry matched current filters.</div>`;
            return;
        }

        view.innerHTML = `
            <div class="bn-peer-grid">
                ${rows.slice(0, 500).map(row => {
                    const health = clamp(number(row.health), 0, 100);

                    return `
                        <article class="bn-peer-card">
                            <div class="bn-peer-header">
                                <div>
                                    <div class="bn-peer-node">${esc(fmt(row.node))}</div>
                                    <div class="bn-peer-country">${esc(fmt(row.city))}, ${esc(fmt(row.country))}</div>
                                </div>

                                <div class="bn-peer-score">
                                    <strong>${fmt(health)}%</strong>
                                    <span>Health Score</span>
                                </div>
                            </div>

                            <div class="bn-health-bar">
                                <div class="bn-health-fill" style="width:${health}%"></div>
                            </div>

                            <div class="bn-peer-stats">
                                <div class="bn-peer-stat"><span>Latency</span><strong>${fmt(row.latency)} ms</strong></div>
                                <div class="bn-peer-stat"><span>Uptime</span><strong>${fmt(row.uptimeHours)} hr</strong></div>
                                <div class="bn-peer-stat"><span>Height</span><strong>${fmt(row.height)}</strong></div>
                                <div class="bn-peer-stat"><span>Protocol</span><strong>${fmt(row.protocol)}</strong></div>
                                <div class="bn-peer-stat"><span>User Agent</span><strong>${esc(fmt(row.userAgent))}</strong></div>
                                <div class="bn-peer-stat"><span>ASN</span><strong>${fmt(row.asn)}</strong></div>
                                <div class="bn-peer-stat"><span>Organization</span><strong>${esc(fmt(row.organization))}</strong></div>
                                <div class="bn-peer-stat"><span>Provider</span><strong>${esc(fmt(row.provider))}</strong></div>
                                <div class="bn-peer-stat"><span>Connected Since</span><strong>${esc(unix(row.connectedSince))}</strong></div>
                            </div>
                        </article>
                    `;
                }).join("")}
            </div>
        `;
    }

    function rerender() {
        renderRows(filteredRows());
    }

    async function loadPeerHealth() {
        const source = $("#bn-source")?.value || "zzxbitnodes";
        const url = SOURCES[source] || SOURCES.zzxbitnodes;

        setStatus(`Loading peer-health telemetry from ${source}...`);

        try {
            const data = await getJson(url);

            ROWS = normalize(data);
            ROWS.sort((a, b) => number(b.health) - number(a.health));

            renderSummary(ROWS);
            renderRows(ROWS);

            setStatus(`Loaded ${fmt(ROWS.length)} peer-health records. Showing first 500 matching rows.`, "ok");
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
