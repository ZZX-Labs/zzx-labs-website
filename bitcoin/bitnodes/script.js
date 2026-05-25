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
                providers: "./api/providers.json",
                tor: "./api/tor.json",
                coordinates: "./api/coordinates.json",
                propagation: "./api/propagation.json",
                dnsSeeder: "./api/dns-seeder.json",
                status: "./api/status.json"
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
            ["Latest Snapshot", "./api/latest.json", "Full current export with rows, summary, and node map."],
            ["Node Index", "./api/nodes.json", "All exported node records."],
            ["Reachable Nodes", "./api/reachable.json", "Nodes reachable during the current rolling window."],
            ["Unreachable Nodes", "./api/unreachable.json", "Known nodes currently failing checks."],
            ["Countries", "./api/countries.json", "Country aggregate index."],
            ["Cities", "./api/cities.json", "City aggregate index."],
            ["ASNs", "./api/asns.json", "Autonomous system aggregate index."],
            ["Organizations", "./api/organizations.json", "Network organization aggregate index."],
            ["Providers", "./api/providers.json", "GeoIP provider / ISP aggregate index."],
            ["Agents", "./api/agents.json", "Bitcoin client user-agent index."],
            ["Versions", "./api/versions.json", "Protocol version index."],
            ["Ports", "./api/ports.json", "Listening port index."],
            ["Services", "./api/services.json", "Bitcoin service-bit index."],
            ["Tor Nodes", "./api/tor.json", "Onion node index."],
            ["Coordinates", "./api/coordinates.json", "Map-ready GeoIP coordinates."],
            ["Latency", "./api/latency.json", "Latency samples per node."],
            ["Peer Health", "./api/peer-health.json", "Health and peer index records."],
            ["Leaderboard", "./api/leaderboard.json", "Ranked node health records."],
            ["Propagation", "./api/propagation.json", "Height propagation and convergence."],
            ["DNS Seeder", "./api/dns-seeder.json", "A / AAAA / TXT seed-style records."],
            ["Status", "./api/status.json", "Crawler/API health status."]
        ]
    };

    const $ = selector => document.querySelector(selector);

    function getDepth() {
        return document.body.dataset.bnDepth || ".";
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
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

    function num(value, fallback = null) {
        const n = Number(value);

        if (!Number.isFinite(n)) {
            return fallback;
        }

        return n;
    }

    function fmtMs(value) {
        const n = num(value);

        if (n === null || n <= 0) {
            return "—";
        }

        return `${n.toLocaleString(undefined, {
            maximumFractionDigits: 2
        })} ms`;
    }

    function fmtPeer(value) {
        const n = num(value);

        if (n === null) {
            return "—";
        }

        return n.toLocaleString(undefined, {
            maximumFractionDigits: 2
        });
    }

    function fmtCoord(value) {
        const n = num(value);

        if (n === null) {
            return "—";
        }

        return n.toFixed(5);
    }

    function fmtUptime(row) {
        const direct = row.uptime_human || row.uptime;

        if (direct && typeof direct === "string") {
            return direct;
        }

        const seconds = num(row.uptime_seconds ?? row.total_uptime);

        if (seconds === null) {
            return "—";
        }

        if (seconds < 60) {
            return `${Math.floor(seconds)}s`;
        }

        const minutes = Math.floor(seconds / 60);

        if (minutes < 60) {
            return `${minutes}m`;
        }

        const hours = Math.floor(minutes / 60);

        if (hours < 24) {
            return `${hours}h ${minutes % 60}m`;
        }

        const days = Math.floor(hours / 24);

        if (days < 7) {
            return `${days}d ${hours % 24}h`;
        }

        const weeks = Math.floor(days / 7);

        if (weeks < 52) {
            return `${weeks}w ${days % 7}d`;
        }

        const years = Math.floor(weeks / 52);

        return `${years}y ${weeks % 52}w`;
    }

    function countryFlag(code) {
        const cc = String(code || "").trim().toUpperCase();

        if (!/^[A-Z]{2}$/.test(cc)) {
            return "";
        }

        return cc
            .split("")
            .map(char => String.fromCodePoint(127397 + char.charCodeAt(0)))
            .join("");
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

    function extractPort(address) {
        const value = String(address || "");

        if (value.startsWith("[") && value.includes("]:")) {
            return value.rsplit ? value.rsplit(":", 1)[1] : value.split("]:").pop();
        }

        if (value.includes(":")) {
            return value.split(":").pop();
        }

        return "—";
    }

    function extractHost(address) {
        const value = String(address || "");

        if (value.startsWith("[") && value.includes("]:")) {
            return value.split("]:")[0].replace("[", "");
        }

        if (value.includes(".onion:")) {
            return value.rsplit ? value.rsplit(":", 1)[0] : value.split(":")[0];
        }

        if ((value.match(/:/g) || []).length === 1) {
            return value.split(":")[0];
        }

        return value;
    }

    function isTor(address, hostname, metadata = {}) {
        return Boolean(metadata.tor) ||
            String(address || "").toLowerCase().includes(".onion") ||
            String(hostname || "").toLowerCase().includes(".onion");
    }

    function normalizeLatest(data) {
        const nodesObject =
            data?.nodes && typeof data.nodes === "object"
                ? data.nodes
                : null;

        const rows =
            Array.isArray(data?.rows)
                ? data.rows
                : null;

        const summary = data?.summary || {};
        const nodesCount = rows?.length || (nodesObject ? Object.keys(nodesObject).length : 0);

        return {
            source: data?.source || "bitnodes-compatible",
            updated_at: data?.updated_at || data?.timestamp || data?.created_at || null,
            total_nodes: data?.total_nodes || summary.total_known_nodes || summary.reachable_24h || nodesCount || 0,
            reachable_nodes: data?.reachable_nodes || summary.reachable_now || 0,
            unreachable_nodes: data?.unreachable_nodes || summary.unreachable_now || 0,
            latest_height: data?.latest_height || summary.latest_height || data?.height || 0,
            tor_nodes: data?.tor_nodes || summary.tor_nodes || data?.onion_nodes || 0,
            countries_count: data?.countries_count || summary.countries_count || data?.country_count || 0,
            cities_count: data?.cities_count || summary.cities_count || data?.city_count || 0,
            asns_count: data?.asns_count || summary.asns_count || data?.asn_count || 0,
            top_agent: data?.top_agent || data?.user_agent || "—",
            top_port: data?.top_port || 8333,
            rows,
            nodes: nodesObject,
            latency: data?.latency || {},
            uptime: data?.uptime || {}
        };
    }

    function renderSummary(latest) {
        const el = $("#bn-summary");

        if (!el) {
            return;
        }

        const cards = [
            ["Known / 24h Nodes", latest.total_nodes],
            ["Reachable Now", latest.reachable_nodes],
            ["Unreachable Now", latest.unreachable_nodes],
            ["Latest Height", latest.latest_height],
            ["Tor Nodes", latest.tor_nodes],
            ["Countries", latest.countries_count],
            ["Cities", latest.cities_count],
            ["ASNs", latest.asns_count]
        ];

        el.innerHTML = cards.map(([label, value]) => `
            <article class="bn-card bn-stat-card">
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(fmt(value))}</strong>
            </article>
        `).join("");
    }

    function renderApiRows() {
        const el = $("#bn-api-list");

        if (!el) {
            return;
        }

        el.innerHTML = `
            <div class="bn-api-grid">
                ${BN.apiRows.map(([name, endpoint, description]) => `
                    <a class="bn-api-tile" href="${escapeHtml(endpoint)}">
                        <span class="bn-api-name">${escapeHtml(name)}</span>
                        <code>${escapeHtml(endpoint)}</code>
                        <small>${escapeHtml(description || "")}</small>
                    </a>
                `).join("")}
            </div>
        `;
    }

    function rowFromArray(address, arr) {
        const metadata =
            arr?.[19] && typeof arr[19] === "object"
                ? arr[19]
                : {};

        return {
            address,
            node: address,
            host: extractHost(address),
            port: extractPort(address),
            protocol: arr?.[0],
            agent: arr?.[1],
            user_agent: arr?.[1],
            connected_since: arr?.[2],
            services: arr?.[3],
            height: arr?.[4],
            hostname: arr?.[5],
            city: arr?.[6],
            country: arr?.[7],
            latitude: arr?.[8],
            longitude: arr?.[9],
            lat: arr?.[8],
            lon: arr?.[9],
            timezone: arr?.[10],
            asn: arr?.[11],
            organization: arr?.[12],
            org: arr?.[12],
            provider: arr?.[13],
            county: arr?.[14],
            zip: arr?.[15],
            w3w: arr?.[16],
            geohash: arr?.[17],
            asn_location: arr?.[18],
            latency_ms: metadata.latency_ms ?? (typeof arr?.[19] === "number" ? arr[19] : null),
            uptime_human: metadata.uptime_human,
            uptime_seconds: metadata.total_uptime,
            reachable: metadata.reachable,
            peer_index: metadata.peer_index,
            success_count: metadata.success_count,
            failure_count: metadata.failure_count,
            first_seen: metadata.first_seen,
            last_seen: metadata.last_seen,
            tor: isTor(address, arr?.[5], metadata)
        };
    }

    function rowFromObject(item) {
        const address = item.address || item.node || "—";

        return {
            ...item,
            address,
            node: address,
            user_agent: item.user_agent || item.agent,
            agent: item.agent || item.user_agent,
            org: item.organization || item.org,
            lat: item.latitude ?? item.lat,
            lon: item.longitude ?? item.lon,
            port: item.port || extractPort(address),
            host: item.host || extractHost(address),
            tor: isTor(address, item.hostname, item)
        };
    }

    function buildPeerHealthMap(peerHealth) {
        const map = new Map();
        const rows = Array.isArray(peerHealth?.results) ? peerHealth.results : [];

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
        const rows = Array.isArray(leaderboard?.results) ? leaderboard.results : [];

        rows.forEach(row => {
            const key = row.address || row.node;

            if (key) {
                map.set(key, row);
            }
        });

        return map;
    }

    function buildPreviewRows(latest, latencyJson, peerHealth, leaderboard) {
        const peerMap = buildPeerHealthMap(peerHealth);
        const leaderboardMap = buildLeaderboardMap(leaderboard);

        let rows = [];

        if (latest.rows) {
            rows = latest.rows.map(rowFromObject);
        } else if (latest.nodes) {
            rows = Object.entries(latest.nodes).map(([address, data]) => rowFromArray(address, data));
        }

        rows = rows.map(row => {
            const address = row.address || row.node;
            const peerRow = peerMap.get(address);
            const rankRow = leaderboardMap.get(address);
            const nodeLatency = latencyJson?.nodes?.[address];
            const latestLatency =
                nodeLatency?.latency_ms ??
                nodeLatency?.daily_latency?.at?.(-1)?.v ??
                null;

            return {
                ...row,
                latency_ms: row.latency_ms ?? peerRow?.latency_ms ?? latestLatency,
                peer_index: row.peer_index ?? peerRow?.peer_index ?? rankRow?.peer_index ?? null,
                uptime_human: row.uptime_human ?? peerRow?.uptime_human,
                uptime_seconds: row.uptime_seconds ?? peerRow?.uptime_seconds,
                reachable: row.reachable ?? peerRow?.reachable
            };
        });

        rows.sort((a, b) => {
            const bp = num(b.peer_index, -1);
            const ap = num(a.peer_index, -1);

            if (bp !== ap) {
                return bp - ap;
            }

            const bh = num(b.height, -1);
            const ah = num(a.height, -1);

            if (bh !== ah) {
                return bh - ah;
            }

            return String(a.address).localeCompare(String(b.address));
        });

        rows.forEach((row, index) => {
            row.rank = index + 1;
        });

        return rows;
    }

    function renderCountry(row) {
        const cc = row.country || row.country_code;
        const flag = countryFlag(cc);

        if (!cc) {
            return "—";
        }

        return `${flag ? `${flag} ` : ""}${cc}`;
    }

    function renderTor(row) {
        if (!row.tor) {
            return `<span class="bn-chip bn-chip-muted">n/a</span>`;
        }

        return `<span class="bn-chip bn-chip-tor">onion</span>`;
    }

    function renderReachable(row) {
        if (row.reachable === true) {
            return `<span class="bn-dot-ok"></span> up`;
        }

        if (row.reachable === false) {
            return `<span class="bn-dot-bad"></span> down`;
        }

        return `<span class="bn-dot-warn"></span> unknown`;
    }

    function td(value, className = "") {
        return `<td class="${escapeHtml(className)}">${escapeHtml(fmt(value))}</td>`;
    }

    function renderNodePreview(latest, latencyJson, peerHealth, leaderboard) {
        const el = $("#bn-table");

        if (!el) {
            return;
        }

        const rows = buildPreviewRows(latest, latencyJson, peerHealth, leaderboard);

        if (!rows.length) {
            el.innerHTML = `
                <div class="bn-empty">
                    No node preview found. Add <code>./api/latest.json</code> or <code>./api/nodes.json</code>.
                </div>
            `;
            return;
        }

        el.innerHTML = `
            <section class="bn-node-panel">
                <header class="bn-node-panel-head">
                    <div>
                        <span class="bn-kicker">Global Bitcoin Node Registry</span>
                        <h2>Reachable / Known Node Preview</h2>
                    </div>
                    <div class="bn-node-count">
                        <strong>${escapeHtml(fmt(rows.length))}</strong>
                        <span>records loaded</span>
                    </div>
                </header>

                <div class="bn-table-scroll">
                    <table class="bn-table bn-node-preview-table">
                        <thead>
                            <tr>
                                <th>№</th>
                                <th>Status</th>
                                <th>Node</th>
                                <th>Country</th>
                                <th>City</th>
                                <th>ASN</th>
                                <th>Provider / Org</th>
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
                                    <td class="bn-rank">${escapeHtml(fmt(row.rank))}</td>
                                    <td class="bn-status-cell">${renderReachable(row)}</td>
                                    <td class="bn-node-cell">
                                        <span class="bn-pill">${escapeHtml(fmt(row.address || row.node))}</span>
                                    </td>
                                    <td>${escapeHtml(renderCountry(row))}</td>
                                    ${td(row.city)}
                                    ${td(row.asn)}
                                    ${td(row.provider || row.organization || row.org)}
                                    ${td(row.protocol)}
                                    <td class="bn-agent-cell">${escapeHtml(fmt(row.agent || row.user_agent))}</td>
                                    ${td(row.services)}
                                    ${td(row.port)}
                                    ${td(row.height)}
                                    ${td(fmtMs(row.latency_ms))}
                                    ${td(fmtUptime(row))}
                                    ${td(fmtPeer(row.peer_index), "bn-peer-cell")}
                                    <td>${renderTor(row)}</td>
                                    ${td(fmtCoord(row.lat ?? row.latitude))}
                                    ${td(fmtCoord(row.lon ?? row.longitude))}
                                    ${td(row.timezone)}
                                    ${td(row.hostname)}
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            </section>
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
            const [data, latencyJson, peerHealth, leaderboard] = await Promise.all([
                fetchJson(url),
                fetchJsonSafe(endpoints.latency),
                fetchJsonSafe(endpoints.peerHealth),
                fetchJsonSafe(endpoints.leaderboard)
            ]);

            const latest = normalizeLatest(data);

            renderSummary(latest);
            renderApiRows();
            renderNodePreview(latest, latencyJson, peerHealth, leaderboard);

            setStatus(
                `Loaded ${fmt(latest.total_nodes)} node records from ${latest.source}. Updated: ${fmt(latest.updated_at)}.`,
                "ok"
            );
        } catch (err) {
            renderApiRows();
            renderSummary(normalizeLatest({}));
            renderNodePreview(normalizeLatest({}), null, null, null);

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