(() => {
    "use strict";

    const BN = window.BN || {};

    BN.endpoints = BN.endpoints || {};
    BN.state = BN.state || {
        latest: null,
        rawLatest: null,
        rows: [],
        source: "zzxbitnodes",
        cache: new Map(),
        loading: false
    };

    const API_ROWS = [
        ["Latest Snapshot", "latest", "Current crawler snapshot with summary, rows, and node map."],
        ["Snapshots", "snapshots", "Snapshot index and archive metadata."],
        ["Nodes", "nodes", "Full node registry export."],
        ["Reachable", "reachable", "Reachable node export."],
        ["Unreachable", "unreachable", "Unreachable node export."],
        ["Countries", "countries", "Country aggregate index."],
        ["Cities", "cities", "City aggregate index."],
        ["ASNs", "asns", "Autonomous system aggregate index."],
        ["Agents", "agents", "Bitcoin client user-agent index."],
        ["Versions", "versions", "Protocol version index."],
        ["Ports", "ports", "Listening port index."],
        ["Services", "services", "Bitcoin service-bit index."],
        ["Tor", "tor", "Onion node index."],
        ["Coordinates", "coordinates", "Map-ready coordinate export."],
        ["Peer Health", "peerHealth", "Peer health and score records."],
        ["Leaderboard", "leaderboard", "Ranked node-health records."],
        ["Propagation", "propagation", "Height propagation and convergence telemetry."],
        ["DNS Seeder", "dnsSeeder", "DNS seed-style export records."],
        ["Status", "status", "Crawler and API health metadata."]
    ];

    function hasOwn(value, key) {
        return Object.prototype.hasOwnProperty.call(value || {}, key);
    }

    function coalesce(...values) {
        for (const value of values) {
            if (value !== null && value !== undefined && value !== "") {
                return value;
            }
        }

        return null;
    }

    function percent(part, total) {
        if (BN.percent) {
            return BN.percent(part, total);
        }

        const p = Number(part) || 0;
        const t = Number(total) || 0;

        if (!t) {
            return "0%";
        }

        return `${((p / t) * 100).toLocaleString(undefined, {
            maximumFractionDigits: 2
        })}%`;
    }

    function safeNumber(value, fallback = 0) {
        if (BN.number) {
            return BN.number(value, fallback);
        }

        const n = Number(value);

        return Number.isFinite(n) ? n : fallback;
    }

    function formatNumber(value) {
        if (BN.formatNumber) {
            return BN.formatNumber(value);
        }

        const n = Number(value);

        return Number.isFinite(n) ? n.toLocaleString() : "—";
    }

    function escapeHtml(value) {
        if (BN.escape) {
            return BN.escape(value);
        }

        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function setStatus(message, mode = "") {
        if (BN.setStatus) {
            BN.setStatus(message, mode);
            return;
        }

        const el = document.querySelector("#bn-status");

        if (!el) {
            return;
        }

        el.className = `bn-status container ${mode}`.trim();
        el.textContent = message;
    }

    function currentSourceId() {
        if (window.BNDataSource?.getCurrentSourceId) {
            return window.BNDataSource.getCurrentSourceId();
        }

        const select = document.querySelector("#bn-source");

        if (select?.value) {
            return select.value;
        }

        return document.body?.dataset?.bnSource || "zzxbitnodes";
    }

    function currentEndpoints() {
        const source = currentSourceId();

        if (window.BNDataSource?.buildEndpointMap) {
            return window.BNDataSource.buildEndpointMap(source);
        }

        if (window.BNDataSource?.endpoints) {
            return window.BNDataSource.endpoints;
        }

        return {
            latest: "./api/zzxbitnodes/latest.json",
            snapshots: "./api/zzxbitnodes/snapshots.json",
            nodes: "./api/zzxbitnodes/nodes.json",
            reachable: "./api/zzxbitnodes/reachable.json",
            unreachable: "./api/zzxbitnodes/unreachable.json",
            leaderboard: "./api/zzxbitnodes/leaderboard.json",
            latency: "./api/zzxbitnodes/latency.json",
            peerHealth: "./api/zzxbitnodes/peer-health.json",
            countries: "./api/zzxbitnodes/countries.json",
            cities: "./api/zzxbitnodes/cities.json",
            asns: "./api/zzxbitnodes/asns.json",
            agents: "./api/zzxbitnodes/agents.json",
            versions: "./api/zzxbitnodes/versions.json",
            ports: "./api/zzxbitnodes/ports.json",
            services: "./api/zzxbitnodes/services.json",
            organizations: "./api/zzxbitnodes/organizations.json",
            providers: "./api/zzxbitnodes/providers.json",
            tor: "./api/zzxbitnodes/tor.json",
            coordinates: "./api/zzxbitnodes/coordinates.json",
            propagation: "./api/zzxbitnodes/propagation.json",
            dnsSeeder: "./api/zzxbitnodes/dns-seeder.json",
            status: "./api/zzxbitnodes/status.json"
        };
    }

    async function fetchJson(url) {
        if (!url) {
            return null;
        }

        if (window.BNAPI?.fetchJson) {
            return window.BNAPI.fetchJson(url);
        }

        const response = await fetch(url, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`${response.status} ${response.statusText}: ${url}`);
        }

        return response.json();
    }

    async function fetchJsonSafe(url) {
        if (!url) {
            return null;
        }

        try {
            return await fetchJson(url);
        } catch (err) {
            console.warn("Optional Bitnodes JSON failed:", url, err);
            return null;
        }
    }

    async function injectHtml(selector, path) {
        const mount = document.querySelector(selector);

        if (!mount || !path) {
            return;
        }

        try {
            const response = await fetch(path, {
                cache: "no-store"
            });

            if (!response.ok) {
                throw new Error(`${response.status} ${response.statusText}`);
            }

            mount.innerHTML = await response.text();
        } catch (err) {
            console.warn(`Bitnodes include failed: ${path}`, err);
        }
    }

    async function loadIncludes() {
        const depth = BN.depth ? BN.depth() : ".";

        await injectHtml("#bn-header", `${depth}/includes/header.html`);
        await injectHtml("#bn-navbar", `${depth}/includes/navbar.html`);
        await injectHtml("#bn-footer", `${depth}/includes/footer.html`);

        window.BNNavbarInit?.();
        window.BNHeaderInit?.();
        window.BNFooterInit?.();
    }

    function normalizeLatest(data) {
        const payload = data || {};
        const summary = payload.summary || {};
        const nodesObject =
            payload.nodes && typeof payload.nodes === "object"
                ? payload.nodes
                : {};

        const rows =
            Array.isArray(payload.rows)
                ? payload.rows
                : null;

        const nodeCount =
            rows?.length ||
            Object.keys(nodesObject).length ||
            safeNumber(payload.node_count, 0);

        const known =
            coalesce(
                payload.known_nodes,
                payload.total_known_nodes,
                payload.total_nodes,
                summary.total_known_nodes,
                summary.known_nodes,
                summary.reachable_24h,
                nodeCount
            );

        const reachable =
            coalesce(
                payload.reachable_nodes,
                payload.reachable_now,
                payload.total_nodes,
                summary.reachable_now,
                summary.reachable_24h,
                nodeCount
            );

        const unreachable =
            coalesce(
                payload.unreachable_nodes,
                payload.unreachable_now,
                summary.unreachable_now,
                Math.max(0, safeNumber(known, nodeCount) - safeNumber(reachable, nodeCount))
            );

        return {
            source:
                coalesce(
                    payload.source,
                    payload.crawler,
                    summary.source,
                    currentSourceId()
                ),

            updated_at:
                coalesce(
                    payload.updated_at,
                    payload.timestamp,
                    payload.created_at,
                    payload.generated_at,
                    summary.updated_at,
                    summary.last_crawl_iso
                ),

            total_nodes:
                safeNumber(
                    coalesce(
                        payload.total_nodes,
                        summary.total_nodes,
                        nodeCount
                    ),
                    nodeCount
                ),

            known_nodes:
                safeNumber(known, nodeCount),

            reachable_nodes:
                safeNumber(reachable, nodeCount),

            unreachable_nodes:
                safeNumber(unreachable, 0),

            latest_height:
                safeNumber(
                    coalesce(
                        payload.latest_height,
                        payload.height,
                        summary.latest_height,
                        summary.height
                    ),
                    0
                ),

            tor_nodes:
                safeNumber(
                    coalesce(
                        payload.tor_nodes,
                        payload.onion_nodes,
                        summary.tor_nodes,
                        summary.onion_nodes
                    ),
                    0
                ),

            countries_count:
                safeNumber(
                    coalesce(
                        payload.countries_count,
                        payload.country_count,
                        summary.countries_count,
                        summary.country_count
                    ),
                    0
                ),

            cities_count:
                safeNumber(
                    coalesce(
                        payload.cities_count,
                        payload.city_count,
                        summary.cities_count,
                        summary.city_count
                    ),
                    0
                ),

            asns_count:
                safeNumber(
                    coalesce(
                        payload.asns_count,
                        payload.asn_count,
                        summary.asns_count,
                        summary.asn_count
                    ),
                    0
                ),

            top_agent:
                coalesce(
                    payload.top_agent,
                    summary.top_agent,
                    payload.user_agent,
                    "—"
                ),

            top_port:
                coalesce(
                    payload.top_port,
                    summary.top_port,
                    8333
                ),

            summary,
            rows,
            nodes: nodesObject,
            raw: payload
        };
    }

    function rowFromArray(address, arr) {
        const row = Array.isArray(arr) ? arr : [];
        const metadata =
            row[19] && typeof row[19] === "object"
                ? row[19]
                : row[28] && typeof row[28] === "object"
                    ? row[28]
                    : {};

        return {
            address,
            node: address,
            host: BN.extractHost ? BN.extractHost(address) : address,
            port: metadata.port || (BN.extractPort ? BN.extractPort(address) : "—"),
            protocol: row[0],
            agent: row[1],
            user_agent: row[1],
            connected_since: row[2],
            services: row[3],
            height: row[4],
            hostname: row[5],
            city: row[6],
            country: row[7],
            latitude: row[8],
            longitude: row[9],
            lat: row[8],
            lon: row[9],
            timezone: row[10],
            asn: row[11],
            organization: row[12],
            org: row[12],
            provider: row[13],
            county: row[14],
            postal_code: row[15],
            zip: row[15],
            w3w: row[16],
            geohash: row[17],
            asn_location: row[18],
            network_type: metadata.network_type || row[20],
            hosting_type: metadata.hosting_type || row[21],
            first_seen: metadata.first_seen || row[22],
            last_seen: metadata.last_seen || row[23],
            uptime_seconds: metadata.uptime_seconds || metadata.total_uptime || row[24],
            latency_ms: metadata.latency_ms || row[25],
            peer_index: metadata.peer_index || row[26],
            confidence_score: metadata.confidence_score || row[27],
            reachable: hasOwn(metadata, "reachable") ? metadata.reachable : true,
            tor: BN.isTor ? BN.isTor(address, row[5], metadata) : String(address).includes(".onion")
        };
    }

    function rowFromObject(item) {
        const address = item?.address || item?.node || "—";

        return {
            ...item,
            address,
            node: address,
            host: item.host || (BN.extractHost ? BN.extractHost(address) : address),
            port: item.port || (BN.extractPort ? BN.extractPort(address) : "—"),
            user_agent: item.user_agent || item.agent,
            agent: item.agent || item.user_agent,
            org: item.organization || item.org,
            lat: item.latitude ?? item.lat,
            lon: item.longitude ?? item.lon,
            tor: BN.isTor ? BN.isTor(item) : String(address).includes(".onion")
        };
    }

    function mapRows(payload) {
        if (Array.isArray(payload?.rows)) {
            return payload.rows.map(rowFromObject);
        }

        const nodes =
            payload?.nodes && typeof payload.nodes === "object"
                ? payload.nodes
                : {};

        return Object.entries(nodes).map(([address, data]) => rowFromArray(address, data));
    }

    function mergeOptionalRows(rows, optional) {
        const byAddress = new Map();

        rows.forEach(row => {
            byAddress.set(row.address || row.node, row);
        });

        const peerRows = Array.isArray(optional.peerHealth?.results)
            ? optional.peerHealth.results
            : [];

        peerRows.forEach(peer => {
            const key = peer.address || peer.node;

            if (!key || !byAddress.has(key)) {
                return;
            }

            Object.assign(byAddress.get(key), {
                latency_ms: coalesce(byAddress.get(key).latency_ms, peer.latency_ms),
                peer_index: coalesce(byAddress.get(key).peer_index, peer.peer_index),
                uptime_seconds: coalesce(byAddress.get(key).uptime_seconds, peer.uptime_seconds),
                reachable: coalesce(byAddress.get(key).reachable, peer.reachable)
            });
        });

        return Array.from(byAddress.values());
    }

    function sortRows(rows) {
        return rows.slice().sort((a, b) => {
            const ap = safeNumber(a.peer_index, -1);
            const bp = safeNumber(b.peer_index, -1);

            if (ap !== bp) {
                return bp - ap;
            }

            const ah = safeNumber(a.height, -1);
            const bh = safeNumber(b.height, -1);

            if (ah !== bh) {
                return bh - ah;
            }

            return String(a.address || "").localeCompare(String(b.address || ""));
        });
    }

    function sourceAwarePath(endpointName) {
        const endpoints = currentEndpoints();
        return endpoints[endpointName] || "";
    }

    function renderApiRows() {
        const el = document.querySelector("#bn-api-list");

        if (!el) {
            return;
        }

        const endpoints = currentEndpoints();

        el.innerHTML = `
            <div class="bn-api-grid">
                ${API_ROWS.map(([name, key, description]) => {
                    const href = endpoints[key] || "";

                    return `
                        <a
                            class="bn-api-tile ${href ? "" : "is-disabled"}"
                            href="${escapeHtml(href || "#")}"
                            ${href ? "" : "aria-disabled=\"true\""}
                        >
                            <span class="bn-api-name">
                                ${escapeHtml(name)}
                            </span>

                            <code>
                                ${escapeHtml(href || "unavailable")}
                            </code>

                            <small>
                                ${escapeHtml(description)}
                            </small>
                        </a>
                    `;
                }).join("")}
            </div>
        `;
    }

    function renderReachable(row) {
        if (row.reachable === false) {
            return `<span class="bn-dot-bad"></span> down`;
        }

        if (row.reachable === null || row.reachable === undefined) {
            return `<span class="bn-dot-warn"></span> unknown`;
        }

        return `<span class="bn-dot-ok"></span> up`;
    }

    function renderCountry(row) {
        const cc = row.country || row.country_code;
        const flag = BN.countryFlag ? BN.countryFlag(cc) : "";

        if (!cc) {
            return "—";
        }

        return `${flag ? `${flag} ` : ""}${cc}`;
    }

    function renderNodeTable(rows) {
        const mount = document.querySelector("#bn-table");

        if (!mount) {
            return;
        }

        window.BNTables?.destroy?.(mount);
        window.BNSearch?.destroy?.(mount);

        if (!rows.length) {
            mount.innerHTML = `
                <div class="bn-table-empty">
                    No node rows loaded for the selected source.
                </div>
            `;
            return;
        }

        mount.innerHTML = `
            <section class="bn-node-panel">
                <header class="bn-node-panel-head">
                    <div>
                        <span class="bn-kicker">
                            Global Bitcoin Node Crawler Registry
                        </span>

                        <h2>
                            Reachable / Known Nodes
                        </h2>
                    </div>

                    <div class="bn-node-count">
                        <strong>
                            ${formatNumber(rows.length)}
                        </strong>

                        <span>
                            Node Records Loaded
                        </span>
                    </div>
                </header>

                <div class="bn-table-scroll">
                    <table
                        class="bn-table bn-node-preview-table"
                        data-page-size="250"
                    >
                        <thead>
                            <tr>
                                <th>№</th>
                                <th>Status</th>
                                <th>Node</th>
                                <th>Country</th>
                                <th>City</th>
                                <th>ASN</th>
                                <th>Provider</th>
                                <th>Protocol</th>
                                <th>Agent</th>
                                <th>Port</th>
                                <th>Height</th>
                                <th>Latency</th>
                                <th>Tor</th>
                            </tr>
                        </thead>

                        <tbody>
                            ${rows.map((row, index) => `
                                <tr>
                                    <td class="bn-rank">
                                        ${formatNumber(index + 1)}
                                    </td>

                                    <td class="bn-status-cell">
                                        ${renderReachable(row)}
                                    </td>

                                    <td>
                                        <span class="bn-pill">
                                            ${escapeHtml(row.address)}
                                        </span>
                                    </td>

                                    <td>
                                        ${escapeHtml(renderCountry(row))}
                                    </td>

                                    <td>
                                        ${escapeHtml(row.city || "—")}
                                    </td>

                                    <td>
                                        ${escapeHtml(row.asn || "—")}
                                    </td>

                                    <td>
                                        ${escapeHtml(row.provider || row.organization || row.org || "—")}
                                    </td>

                                    <td>
                                        ${escapeHtml(row.protocol || "—")}
                                    </td>

                                    <td class="bn-agent-cell">
                                        ${escapeHtml(row.agent || row.user_agent || "—")}
                                    </td>

                                    <td>
                                        ${escapeHtml(row.port || "—")}
                                    </td>

                                    <td>
                                        ${escapeHtml(formatNumber(row.height))}
                                    </td>

                                    <td>
                                        ${escapeHtml(BN.formatMs ? BN.formatMs(row.latency_ms) : row.latency_ms)}
                                    </td>

                                    <td>
                                        ${
                                            BN.isTor && BN.isTor(row)
                                                ? `<span class="bn-chip bn-chip-tor">onion</span>`
                                                : `<span class="bn-chip bn-chip-muted">no</span>`
                                        }
                                    </td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            </section>
        `;

        window.BNTables?.init?.(mount);
        window.BNSearchInit?.(mount);
    }

    function renderEmptyWidget(selector, title, message) {
        const el = document.querySelector(selector);

        if (!el) {
            return;
        }

        el.innerHTML = `
            <section class="bn-widget-empty">
                <span class="bn-kicker">Awaiting Data</span>
                <h2>${escapeHtml(title)}</h2>
                <p>${escapeHtml(message)}</p>
            </section>
        `;
    }

    function renderFallbackAnalytics(rows, latest) {
        if (!rows.length) {
            renderEmptyWidget("#bn-geoip", "GeoIP Intelligence", "No rows are available for GeoIP analysis.");
            renderEmptyWidget("#bn-vpn", "VPN / Datacenter Intelligence", "No rows are available for VPN and datacenter classification.");
            renderEmptyWidget("#bn-tor", "Tor Node Registry", "No rows are available for Tor node analysis.");
            renderEmptyWidget("#bn-agents", "Agent Distribution", "No rows are available for client-agent analysis.");
            renderEmptyWidget("#bn-versions", "Protocol Versions", "No rows are available for protocol-version analysis.");
            renderEmptyWidget("#bn-ports", "Port Distribution", "No rows are available for port analysis.");
            renderEmptyWidget("#bn-services", "Service Bits", "No rows are available for service-bit analysis.");
            return;
        }

        const geoip = window.BNGeoIP;
        const vpn = window.BNVPN;
        const tor = window.BNTor;
        const agents = window.BNAgents;
        const versions = window.BNVersions;
        const ports = window.BNPorts;
        const services = window.BNServices;

        if (geoip?.render) {
            const target = document.querySelector("#bn-geoip");
            if (target) {
                geoip.render(target, rows, latest);
            }
        }

        if (vpn?.render) {
            const target = document.querySelector("#bn-vpn");
            if (target) {
                vpn.loadLists?.().then(() => vpn.render(target, rows, latest));
            }
        }

        if (tor?.render) {
            const target = document.querySelector("#bn-tor");
            if (target) {
                tor.render(target, rows, latest);
            }
        }

        if (agents?.render) {
            const target = document.querySelector("#bn-agents");
            if (target) {
                agents.render(target, rows, latest);
            }
        }

        if (versions?.render) {
            const target = document.querySelector("#bn-versions");
            if (target) {
                versions.render(target, rows, latest);
            }
        }

        if (ports?.render) {
            const target = document.querySelector("#bn-ports");
            if (target) {
                ports.render(target, rows, latest);
            }
        }

        if (services?.render) {
            const target = document.querySelector("#bn-services");
            if (target) {
                services.render(target, rows, latest);
            }
        }
    }

    function registerChartDatasets(rows, latest) {
        if (!window.BNCharts?.registerDataset) {
            return;
        }

        const known = latest.known_nodes || latest.total_nodes || rows.length;
        const reachable = latest.reachable_nodes || rows.length;
        const unreachable = latest.unreachable_nodes || Math.max(0, known - reachable);

        window.BNCharts.registerDataset("known-vs-reachable", {
            labels: ["Reachable", "Unreachable"],
            values: [reachable, unreachable]
        });

        const countryCounts = countBy(rows, row => row.country || "Unknown");
        const asnCounts = countBy(rows, row => row.asn || "Unknown");
        const agentCounts = countBy(rows, row => row.agent || row.user_agent || "Unknown");
        const portCounts = countBy(rows, row => row.port || "Unknown");
        const versionCounts = countBy(rows, row => row.protocol || row.version || "Unknown");
        const clientCounts = inferClientCounts(rows);

        window.BNCharts.registerDataset("countries", toTopDataset(countryCounts, 12));
        window.BNCharts.registerDataset("asns", toTopDataset(asnCounts, 12));
        window.BNCharts.registerDataset("agents", toTopDataset(agentCounts, 12));
        window.BNCharts.registerDataset("ports", toTopDataset(portCounts, 12));
        window.BNCharts.registerDataset("versions", toTopDataset(versionCounts, 12));

        window.BNCharts.registerDataset("knots-vs-core", {
            labels: ["Bitcoin Knots", "Bitcoin Core", "Other"],
            values: [clientCounts.knots, clientCounts.core, clientCounts.other]
        });

        window.BNCharts.registerDataset("client-heights", {
            labels: ["Knots Max", "Core Max", "Other Max"],
            values: [
                maxHeight(clientCounts.knotsRows),
                maxHeight(clientCounts.coreRows),
                maxHeight(clientCounts.otherRows)
            ]
        });

        window.BNCharts.registerDataset("knots-growth", {
            labels: ["Current"],
            values: [clientCounts.knots]
        });

        window.BNCharts.registerDataset("core-growth", {
            labels: ["Current"],
            values: [clientCounts.core]
        });
    }

    function countBy(rows, getter) {
        const map = new Map();

        rows.forEach(row => {
            const key = String(getter(row) || "Unknown");

            map.set(key, (map.get(key) || 0) + 1);
        });

        return map;
    }

    function toTopDataset(map, limit = 12) {
        const entries = Array.from(map.entries())
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, limit);

        return {
            labels: entries.map(entry => entry.label),
            values: entries.map(entry => entry.value)
        };
    }

    function inferClientCounts(rows) {
        const output = {
            knots: 0,
            core: 0,
            other: 0,
            knotsRows: [],
            coreRows: [],
            otherRows: []
        };

        rows.forEach(row => {
            const agent = String(row.agent || row.user_agent || "").toLowerCase();

            if (agent.includes("knots")) {
                output.knots += 1;
                output.knotsRows.push(row);
                return;
            }

            if (agent.includes("satoshi") || agent.includes("bitcoin core")) {
                output.core += 1;
                output.coreRows.push(row);
                return;
            }

            output.other += 1;
            output.otherRows.push(row);
        });

        return output;
    }

    function maxHeight(rows) {
        const heights = rows
            .map(row => safeNumber(row.height, null))
            .filter(value => value !== null);

        if (!heights.length) {
            return 0;
        }

        return Math.max(...heights);
    }

    async function loadAllData() {
        const endpoints = currentEndpoints();

        if (window.BNAPI?.setSource) {
            window.BNAPI.setSource(currentSourceId(), endpoints);
        }

        const latestUrl = endpoints.latest || sourceAwarePath("latest");

        const [
            latestPayload,
            peerHealth,
            latency,
            leaderboard
        ] = await Promise.all([
            fetchJson(latestUrl),
            fetchJsonSafe(endpoints.peerHealth),
            fetchJsonSafe(endpoints.latency),
            fetchJsonSafe(endpoints.leaderboard)
        ]);

        const latest = normalizeLatest(latestPayload);
        let rows = mapRows(latest);

        rows = mergeOptionalRows(rows, {
            peerHealth,
            latency,
            leaderboard
        });

        rows = sortRows(rows);

        BN.setState?.({
            source: currentSourceId(),
            latest,
            rawLatest: latestPayload,
            rows,
            endpoints,
            loadedAt: Date.now()
        });

        BN.state.source = currentSourceId();
        BN.state.latest = latest;
        BN.state.rawLatest = latestPayload;
        BN.state.rows = rows;
        BN.state.endpoints = endpoints;
        BN.state.loadedAt = Date.now();

        return {
            latest,
            rows,
            endpoints,
            rawLatest: latestPayload
        };
    }

    async function loadHome() {
        const main = document.querySelector("main[data-bitnodes-view]");

        if (!main || main.dataset.bitnodesView !== "home") {
            return;
        }

        if (BN.state.loading) {
            return;
        }

        BN.state.loading = true;

        const source = currentSourceId();
        const definition = window.BNDataSource?.getSource?.(source);

        setStatus(`Loading ${definition?.label || source}...`);

        try {
            const { latest, rows } = await loadAllData();

            renderApiRows();
            renderNodeTable(rows);
            registerChartDatasets(rows, latest);

            window.BNCards?.load?.(document.querySelector("#bn-summary"));
            window.BNCharts?.renderAll?.();
            window.BNKnotsVsCore?.init?.();
            renderFallbackAnalytics(rows, latest);

            setStatus(
                `Loaded ${formatNumber(rows.length)} node records from ${latest.source || source}. Updated: ${latest.updated_at || "—"}.`,
                "ok"
            );

            document.dispatchEvent(
                new CustomEvent("bn:data-loaded", {
                    detail: {
                        source,
                        latest,
                        rows
                    }
                })
            );
        } catch (err) {
            console.error(err);

            setStatus(
                `Could not load Bitnodes data from ${source}: ${err.message}`,
                "warn"
            );

            renderApiRows();
            renderNodeTable([]);
            renderFallbackAnalytics([], null);
        } finally {
            BN.state.loading = false;
        }
    }

    let initialized = false;

    async function init() {
        if (initialized) {
            return reload();
        }

        initialized = true;

        if (window.BNDataSource?.init) {
            window.BNDataSource.init();
        }

        await loadIncludes();
        await loadHome();
    }

    async function reload() {
        BN.state.loading = false;
        await loadHome();
    }

    document.addEventListener("bn:datasource-change", () => {
        reload();
    });

    document.addEventListener("bn:datasource-refresh", () => {
        reload();
    });

    BN.injectHtml = injectHtml;
    BN.loadIncludes = loadIncludes;
    BN.normalizeLatest = normalizeLatest;
    BN.rowFromArray = rowFromArray;
    BN.rowFromObject = rowFromObject;
    BN.mapRows = mapRows;
    BN.renderApiRows = renderApiRows;
    BN.renderNodeTable = renderNodeTable;
    BN.loadHome = loadHome;
    BN.init = init;
    BN.reload = reload;

    window.BN = BN;
    window.BNCore = BN;
})();
