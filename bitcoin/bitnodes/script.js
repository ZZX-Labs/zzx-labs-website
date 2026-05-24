(() => {
    "use strict";

    const BN = {
        endpoints: {
            local: {
                latest: "./api/latest.json",
                snapshots: "./api/snapshots.json",
                nodes: "./api/nodes.json",
                leaderboard: "./api/leaderboard.json",
                latency: "./api/latency.json",
                peerHealth: "./api/peer-health.json",
                countries: "./api/countries.json",
                cities: "./api/cities.json",
                asns: "./api/asns.json",
                agents: "./api/agents.json",
                versions: "./api/versions.json",
                ports: "./api/ports.json",
                services: "./api/services.json",
                organizations: "./api/organizations.json",
                tor: "./api/tor.json",
                coordinates: "./api/coordinates.json",
                propagation: "./api/propagation.json"
            },
            legacy: {
                latest: "./api/latest.json",
                snapshots: "./api/snapshots.json",
                nodes: "./api/nodes.json",
                leaderboard: "./api/leaderboard.json",
                latency: "./api/latency.json",
                peerHealth: "./api/peer-health.json"
            },
            external: {
                latest: "https://bitnodes.io/api/v1/snapshots/latest/",
                snapshots: "https://bitnodes.io/api/v1/snapshots/",
                nodes: "https://bitnodes.io/api/v1/snapshots/latest/",
                leaderboard: "https://bitnodes.io/api/v1/nodes/leaderboard/",
                latency: "",
                peerHealth: ""
            }
        },

        apiRows: [
            ["List snapshots", "./api/snapshots.json"],
            ["List nodes", "./api/nodes.json"],
            ["Latest snapshot", "./api/latest.json"],
            ["Countries", "./api/countries.json"],
            ["Cities", "./api/cities.json"],
            ["ASNs", "./api/asns.json"],
            ["Agents", "./api/agents.json"],
            ["Versions", "./api/versions.json"],
            ["Ports", "./api/ports.json"],
            ["Services", "./api/services.json"],
            ["Organizations", "./api/organizations.json"],
            ["Tor nodes", "./api/tor.json"],
            ["Coordinates", "./api/coordinates.json"],
            ["Node latency", "./api/latency.json"],
            ["Peer health", "./api/peer-health.json"],
            ["Leaderboard", "./api/leaderboard.json"],
            ["Data propagation", "./api/propagation.json"],
            ["DNS seeder", "./api/dns-seeder.json"],
            ["Status", "./api/status.json"]
        ]
    };

    const $ = selector => document.querySelector(selector);

    function getDepth() {
        return document.body.dataset.bnDepth || ".";
    }

    async function injectHtml(selector, path) {
        const mount = $(selector);

        if (!mount) {
            return;
        }

        try {
            const res = await fetch(path, {
                cache: "no-store"
            });

            if (!res.ok) {
                throw new Error(`${res.status} ${res.statusText}`);
            }

            mount.innerHTML = await res.text();
        } catch (err) {
            console.warn(`Bitnodes include failed: ${path}`, err);
        }
    }

    async function loadIncludes() {
        const depth = getDepth();

        await injectHtml("#bn-header", `${depth}/includes/header.html`);
        await injectHtml("#bn-navbar", `${depth}/includes/navbar.html`);
        await injectHtml("#bn-footer", `${depth}/includes/footer.html`);

        markActiveNav();
    }

    function markActiveNav() {
        const path = location.pathname.replace(/\/index\.html$/, "/");

        document.querySelectorAll("#bn-navbar a").forEach(link => {
            const href = new URL(link.href).pathname.replace(/\/index\.html$/, "/");

            if (href === path) {
                link.classList.add("is-active");
            }
        });
    }

    function fmt(value) {
        if (value === null || value === undefined || value === "") {
            return "—";
        }

        if (typeof value === "number") {
            return value.toLocaleString();
        }

        return String(value);
    }

    function fmtMs(value) {
        if (value === null || value === undefined || value === "") {
            return "—";
        }

        const n = Number(value);

        if (!Number.isFinite(n)) {
            return fmt(value);
        }

        return `${n.toLocaleString(undefined, {
            maximumFractionDigits: 2
        })} ms`;
    }

    function fmtPercent(value) {
        if (value === null || value === undefined || value === "") {
            return "—";
        }

        const n = Number(value);

        if (!Number.isFinite(n)) {
            return fmt(value);
        }

        return `${n.toLocaleString(undefined, {
            maximumFractionDigits: 2
        })}%`;
    }

    function setStatus(message, mode = "") {
        const el = $("#bn-status");

        if (!el) {
            return;
        }

        el.className = `bn-status container ${mode}`.trim();
        el.textContent = message;
    }

    async function fetchJson(url) {
        if (!url) {
            return null;
        }

        const res = await fetch(url, {
            cache: "no-store"
        });

        if (!res.ok) {
            throw new Error(`${res.status} ${res.statusText}: ${url}`);
        }

        return await res.json();
    }

    async function fetchJsonSafe(url) {
        try {
            return await fetchJson(url);
        } catch (_err) {
            return null;
        }
    }

    function normalizeLatest(data) {
        const nodesObject =
            data.nodes && typeof data.nodes === "object"
                ? data.nodes
                : null;

        const nodesCount =
            nodesObject
                ? Object.keys(nodesObject).length
                : null;

        return {
            source: data.source || "bitnodes-compatible",
            updated_at: data.updated_at || data.timestamp || data.created_at || null,
            total_nodes: data.total_nodes || data.reachable_nodes || nodesCount || 0,
            latest_height: data.latest_height || data.height || 0,
            tor_nodes: data.tor_nodes || data.onion_nodes || 0,
            countries_count: data.countries_count || data.country_count || 0,
            cities_count: data.cities_count || data.city_count || 0,
            asns_count: data.asns_count || data.asn_count || 0,
            top_agent: data.top_agent || data.user_agent || "—",
            top_port: data.top_port || 8333,
            nodes: nodesObject,
            latency: data.latency || {},
            uptime: data.uptime || {}
        };
    }

    function renderSummary(latest) {
        const el = $("#bn-summary");

        if (!el) {
            return;
        }

        const cards = [
            ["Reachable Nodes", latest.total_nodes],
            ["Latest Height", latest.latest_height],
            ["Tor Nodes", latest.tor_nodes],
            ["Countries", latest.countries_count],
            ["Cities", latest.cities_count],
            ["ASNs", latest.asns_count],
            ["Top Port", latest.top_port],
            ["Top Agent", latest.top_agent]
        ];

        el.innerHTML = cards.map(([label, value]) => `
            <article class="bn-card">
                <span>${label}</span>
                <strong>${fmt(value)}</strong>
            </article>
        `).join("");
    }

    function renderApiRows() {
        const el = $("#bn-api-list");

        if (!el) {
            return;
        }

        el.innerHTML = BN.apiRows.map(([name, endpoint]) => `
            <div class="bn-api-row">
                <strong>${name}</strong>
                <code>${endpoint}</code>
            </div>
        `).join("");
    }

    function extractPort(address) {
        if (!address) {
            return "—";
        }

        if (address.startsWith("[") && address.includes("]:")) {
            return address.split("]:").pop();
        }

        const parts = address.split(":");

        if (parts.length > 1) {
            return parts[parts.length - 1];
        }

        return "—";
    }

    function isTor(address, hostname) {
        return String(address || "").toLowerCase().includes(".onion") ||
            String(hostname || "").toLowerCase().includes(".onion");
    }

    function nodeArrayToObject(address, arr) {
        return {
            node: address,
            protocol: arr?.[0],
            user_agent: arr?.[1],
            connected_since: arr?.[2],
            services: arr?.[3],
            height: arr?.[4],
            hostname: arr?.[5],
            city: arr?.[6],
            country: arr?.[7],
            lat: arr?.[8],
            lon: arr?.[9],
            timezone: arr?.[10],
            asn: arr?.[11],
            org: arr?.[12],
            port: extractPort(address),
            tor: isTor(address, arr?.[5])
        };
    }

    function buildPeerHealthMap(peerHealth) {
        const map = new Map();

        const rows =
            Array.isArray(peerHealth?.results)
                ? peerHealth.results
                : [];

        rows.forEach(row => {
            const key = row.address || row.node;

            if (key) {
                map.set(key, row);
            }
        });

        return map;
    }

    function buildLeaderboardMap(leaderboard) {
        const map = new Map();

        const rows =
            Array.isArray(leaderboard?.results)
                ? leaderboard.results
                : [];

        rows.forEach(row => {
            const key = row.node || row.address;

            if (key) {
                map.set(key, row);
            }
        });

        return map;
    }

    function getLatency(address, latest, latencyJson, peerRow) {
        if (latest.latency && latest.latency[address] !== undefined) {
            return latest.latency[address];
        }

        const nodeLatency = latencyJson?.nodes?.[address];

        if (nodeLatency?.daily_latency?.length) {
            return nodeLatency.daily_latency[nodeLatency.daily_latency.length - 1].v;
        }

        if (peerRow?.latency_ms !== undefined) {
            return peerRow.latency_ms;
        }

        return null;
    }

    function getUptime(address, latest, peerRow) {
        if (latest.uptime && latest.uptime[address] !== undefined) {
            return latest.uptime[address];
        }

        if (peerRow?.uptime_percent !== undefined) {
            return peerRow.uptime_percent;
        }

        return null;
    }

    function buildPreviewRows(latest, latencyJson, peerHealth, leaderboard) {
        const peerMap = buildPeerHealthMap(peerHealth);
        const leaderboardMap = buildLeaderboardMap(leaderboard);

        if (!latest.nodes) {
            return [];
        }

        return Object.entries(latest.nodes).map(([address, data]) => {
            const row = nodeArrayToObject(address, data);
            const peerRow = peerMap.get(address);
            const rankRow = leaderboardMap.get(address);

            return {
                ...row,
                latency_ms: getLatency(address, latest, latencyJson, peerRow),
                uptime_percent: getUptime(address, latest, peerRow),
                peer_index: peerRow?.peer_index ?? rankRow?.peer_index ?? null,
                rank: rankRow?.rank ?? null
            };
        });
    }

    function renderNodePreview(latest, latencyJson, peerHealth, leaderboard) {
        const el = $("#bn-table");

        if (!el) {
            return;
        }

        const rows = buildPreviewRows(
            latest,
            latencyJson,
            peerHealth,
            leaderboard
        )
            .sort((a, b) => {
                const ap = Number(a.peer_index || 0);
                const bp = Number(b.peer_index || 0);

                return bp - ap;
            });

        if (!rows.length) {
            el.innerHTML = `
                <p>
                    No node preview found. Add
                    <code>./api/latest.json</code>
                    or
                    <code>./api/nodes.json</code>.
                </p>
            `;
            return;
        }

        el.innerHTML = `
            <div class="bn-table-meta">
                Showing ${fmt(rows.length)} reachable node records.
            </div>

            <div class="bn-table-wrap">
                <table class="bn-table bn-node-preview-table">
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Node</th>
                            <th>Country</th>
                            <th>City</th>
                            <th>ASN</th>
                            <th>Organization</th>
                            <th>Protocol</th>
                            <th>Agent</th>
                            <th>Services</th>
                            <th>Port</th>
                            <th>Height</th>
                            <th>Latency</th>
                            <th>Uptime</th>
                            <th>Peer Index</th>
                            <th>Tor</th>
                            <th>Lat</th>
                            <th>Lon</th>
                            <th>Timezone</th>
                            <th>Hostname</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(row => `
                            <tr>
                                <td>${fmt(row.rank)}</td>
                                <td><span class="bn-pill">${fmt(row.node)}</span></td>
                                <td>${fmt(row.country)}</td>
                                <td>${fmt(row.city)}</td>
                                <td>${fmt(row.asn)}</td>
                                <td>${fmt(row.org)}</td>
                                <td>${fmt(row.protocol)}</td>
                                <td>${fmt(row.user_agent)}</td>
                                <td>${fmt(row.services)}</td>
                                <td>${fmt(row.port)}</td>
                                <td>${fmt(row.height)}</td>
                                <td>${fmtMs(row.latency_ms)}</td>
                                <td>${fmtPercent(row.uptime_percent)}</td>
                                <td>${fmt(row.peer_index)}</td>
                                <td>${row.tor ? "yes" : "no"}</td>
                                <td>${fmt(row.lat)}</td>
                                <td>${fmt(row.lon)}</td>
                                <td>${fmt(row.timezone)}</td>
                                <td>${fmt(row.hostname)}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;
    }

    async function loadBitnodesHome() {
        const main = $("main[data-bitnodes-view]");

        if (!main || main.dataset.bitnodesView !== "home") {
            return;
        }

        const sourceSelect = $("#bn-source");
        const source = sourceSelect?.value || "local";
        const endpoints = BN.endpoints[source] || BN.endpoints.local;
        const url = endpoints.latest || BN.endpoints.local.latest;

        setStatus(`Loading ${source} Bitnodes mirror source…`);

        try {
            const [
                data,
                latencyJson,
                peerHealth,
                leaderboard
            ] = await Promise.all([
                fetchJson(url),
                fetchJsonSafe(endpoints.latency),
                fetchJsonSafe(endpoints.peerHealth),
                fetchJsonSafe(endpoints.leaderboard)
            ]);

            const latest = normalizeLatest(data);

            renderSummary(latest);
            renderApiRows();
            renderNodePreview(
                latest,
                latencyJson,
                peerHealth,
                leaderboard
            );

            setStatus(
                `Loaded ${fmt(latest.total_nodes)} reachable nodes from ${latest.source}. Updated: ${fmt(latest.updated_at)}.`,
                "ok"
            );
        } catch (err) {
            renderApiRows();
            renderSummary(normalizeLatest({}));
            renderNodePreview(
                normalizeLatest({}),
                null,
                null,
                null
            );

            setStatus(
                `Could not load Bitnodes JSON yet: ${err.message}`,
                "warn"
            );
        }
    }

    document.addEventListener("DOMContentLoaded", async () => {
        await loadIncludes();

        $("#bn-refresh")?.addEventListener("click", loadBitnodesHome);
        $("#bn-source")?.addEventListener("change", loadBitnodesHome);

        loadBitnodesHome();
    });
})();