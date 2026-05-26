(() => {
    "use strict";

    const BN = window.BN || {};

    BN.endpoints = {
        local: {
            latest: "./api/latest.json",
            snapshots: "./api/snapshots.json",
            nodes: "./api/nodes.json",
            reachable: "./api/reachable.json",
            unreachable: "./api/unreachable.json",
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
        }
    };

    BN.state = {
        latest: null,
        rows: [],
        source: "local",
        cache: new Map()
    };

    BN.injectHtml = async function injectHtml(selector, path) {
        const mount = BN.$(selector);

        if (!mount) {
            return;
        }

        try {
            const response = await fetch(path, {
                cache: "no-store"
            });

            if (!response.ok) {
                throw new Error(
                    `${response.status} ${response.statusText}`
                );
            }

            mount.innerHTML = await response.text();
        } catch (err) {
            console.error(
                `Include failed: ${path}`,
                err
            );
        }
    };

    BN.loadIncludes = async function loadIncludes() {
        const depth = BN.depth();

        await BN.injectHtml(
            "#bn-header",
            `${depth}/includes/header.html`
        );

        await BN.injectHtml(
            "#bn-navbar",
            `${depth}/includes/navbar.html`
        );

        await BN.injectHtml(
            "#bn-footer",
            `${depth}/includes/footer.html`
        );

        window.BNNavbarInit?.();
        window.BNHeaderInit?.();
        window.BNFooterInit?.();
    };

    BN.extractHost = function extractHost(address) {
        const value =
            String(address || "").trim();

        if (
            value.startsWith("[") &&
            value.includes("]:")
        ) {
            return value
                .split("]:")[0]
                .replace("[", "");
        }

        if (value.includes(".onion:")) {
            return value.split(":")[0];
        }

        if (
            (value.match(/:/g) || []).length === 1
        ) {
            return value.split(":")[0];
        }

        return value;
    };

    BN.extractPort = function extractPort(address) {
        const value =
            String(address || "").trim();

        if (
            value.startsWith("[") &&
            value.includes("]:")
        ) {
            return value.split("]:").pop();
        }

        if (value.includes(":")) {
            return value.split(":").pop();
        }

        return "—";
    };

    BN.isTor = function isTor(row) {

        return (
            String(
                row.address ||
                row.node ||
                ""
            )
                .toLowerCase()
                .includes(".onion")
        ) || (
            String(
                row.hostname || ""
            )
                .toLowerCase()
                .includes(".onion")
        ) || (
            String(
                row.tor_status || ""
            )
                .toLowerCase()
                .includes("onion")
        ) || (
            row.tor === true
        );
    };

    BN.normalizeLatest = function normalizeLatest(data) {

        const nodesObject =
            data?.nodes &&
            typeof data.nodes === "object"
                ? data.nodes
                : {};

        const rows =
            Array.isArray(data?.rows)
                ? data.rows
                : null;

        const nodeCount =
            rows?.length ||
            Object.keys(nodesObject).length;

        return {
            source:
                data?.source ||
                "zzx-labs-bitnodes-crawler",

            updated_at:
                data?.updated_at ||
                data?.timestamp ||
                data?.created_at ||
                null,

            total_nodes:
                data?.total_nodes ||
                nodeCount,

            known_nodes:
                data?.known_nodes ||
                data?.total_known_nodes ||
                nodeCount,

            reachable_nodes:
                data?.reachable_nodes ||
                nodeCount,

            unreachable_nodes:
                data?.unreachable_nodes ||
                0,

            latest_height:
                data?.latest_height ||
                data?.height ||
                0,

            tor_nodes:
                data?.tor_nodes ||
                0,

            countries_count:
                data?.countries_count ||
                0,

            cities_count:
                data?.cities_count ||
                0,

            asns_count:
                data?.asns_count ||
                0,

            top_agent:
                data?.top_agent ||
                "—",

            top_port:
                data?.top_port ||
                8333,

            rows,
            nodes: nodesObject
        };
    };

    BN.rowFromArray = function rowFromArray(
        address,
        arr
    ) {

        const row =
            Array.isArray(arr)
                ? arr
                : [];

        return {
            address,
            node: address,

            host:
                BN.extractHost(address),

            port:
                BN.extractPort(address),

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

            tor_status: row[16],
            exit_node: row[17],

            geohash: row[18],
            asn_region: row[19],

            network_type: row[20],
            hosting_type: row[21],

            first_seen: row[22],
            last_seen: row[23],

            uptime_seconds: row[24],
            latency_ms: row[25],

            peer_index: row[26],
            confidence_score: row[27]
        };
    };

    BN.rowFromObject = function rowFromObject(item) {

        const address =
            item.address ||
            item.node ||
            "—";

        return {
            ...item,

            address,
            node: address,

            user_agent:
                item.user_agent ||
                item.agent,

            agent:
                item.agent ||
                item.user_agent,

            org:
                item.organization ||
                item.org,

            lat:
                item.latitude ??
                item.lat,

            lon:
                item.longitude ??
                item.lon,

            port:
                item.port ||
                BN.extractPort(address),

            host:
                item.host ||
                BN.extractHost(address)
        };
    };

    BN.mapRows = function mapRows(payload) {

        if (
            Array.isArray(payload?.rows)
        ) {

            return payload.rows.map(
                BN.rowFromObject
            );
        }

        const nodes =
            payload?.nodes &&
            typeof payload.nodes === "object"
                ? payload.nodes
                : {};

        return Object.entries(nodes)
            .map(([address, data]) =>
                BN.rowFromArray(
                    address,
                    data
                )
            );
    };

    BN.renderApiRows = function renderApiRows() {

        const el =
            BN.$("#bn-api-list");

        if (!el) {
            return;
        }

        const rows = [
            [
                "Latest Snapshot",
                "./api/latest.json",
                "Current crawler snapshot."
            ],
            [
                "Nodes",
                "./api/nodes.json",
                "Full node registry."
            ],
            [
                "Countries",
                "./api/countries.json",
                "Country aggregates."
            ],
            [
                "Cities",
                "./api/cities.json",
                "City aggregates."
            ],
            [
                "ASNs",
                "./api/asns.json",
                "Autonomous systems."
            ],
            [
                "Agents",
                "./api/agents.json",
                "Bitcoin clients."
            ],
            [
                "Versions",
                "./api/versions.json",
                "Protocol versions."
            ],
            [
                "Tor",
                "./api/tor.json",
                "Onion nodes."
            ]
        ];

        el.innerHTML = `
            <div class="bn-api-grid">
                ${rows.map(row => `
                    <a
                        class="bn-api-tile"
                        href="${BN.escape(row[1])}"
                    >
                        <span class="bn-api-name">
                            ${BN.escape(row[0])}
                        </span>

                        <code>
                            ${BN.escape(row[1])}
                        </code>

                        <small>
                            ${BN.escape(row[2])}
                        </small>
                    </a>
                `).join("")}
            </div>
        `;
    };

    BN.renderNodeTable = function renderNodeTable(rows) {

        const mount =
            BN.$("#bn-table");

        if (!mount) {
            return;
        }

        if (!rows.length) {

            mount.innerHTML = `
                <div class="bn-table-empty">
                    No node rows loaded.
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
                            ${BN.formatNumber(rows.length)}
                        </strong>

                        <span>
                            Node Records Loaded
                        </span>
                    </div>

                </header>

                <div class="bn-searchbar-wrap">
                    <input
                        type="search"
                        id="bn-table-search"
                        class="bn-input bn-table-search-input"
                        placeholder="Search nodes, agents, countries, ASN, ports, Tor, providers..."
                    >
                </div>

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
                                        ${BN.formatNumber(index + 1)}
                                    </td>

                                    <td class="bn-status-cell">
                                        ${
                                            row.reachable === false
                                                ? "down"
                                                : "up"
                                        }
                                    </td>

                                    <td>
                                        ${BN.escape(row.address)}
                                    </td>

                                    <td>
                                        ${BN.escape(
                                            `${BN.countryFlag(row.country)} ${row.country || "—"}`
                                        )}
                                    </td>

                                    <td>
                                        ${BN.escape(row.city || "—")}
                                    </td>

                                    <td>
                                        ${BN.escape(row.asn || "—")}
                                    </td>

                                    <td>
                                        ${BN.escape(
                                            row.provider ||
                                            row.organization ||
                                            "—"
                                        )}
                                    </td>

                                    <td>
                                        ${BN.escape(row.protocol || "—")}
                                    </td>

                                    <td class="bn-agent-cell">
                                        ${BN.escape(
                                            row.agent || "—"
                                        )}
                                    </td>

                                    <td>
                                        ${BN.escape(
                                            row.port || "—"
                                        )}
                                    </td>

                                    <td>
                                        ${BN.escape(
                                            BN.formatNumber(
                                                row.height
                                            )
                                        )}
                                    </td>

                                    <td>
                                        ${BN.escape(
                                            BN.formatMs(
                                                row.latency_ms
                                            )
                                        )}
                                    </td>

                                    <td>
                                        ${
                                            BN.isTor(row)
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

        window.BNSearchInit?.();
        window.BNTables?.init?.();
    };

    BN.loadHome = async function loadHome() {

        const main =
            document.querySelector(
                "main[data-bitnodes-view]"
            );

        if (
            !main ||
            main.dataset.bitnodesView !== "home"
        ) {
            return;
        }

        BN.setStatus(
            "Loading Bitnodes crawler registry..."
        );

        try {

            const latest =
                await window.BNAPI.fetchLatest({
                    cacheSeconds: 0
                });

            const normalized =
                BN.normalizeLatest(latest);

            const rows =
                BN.mapRows(normalized);

            BN.state.latest =
                normalized;

            BN.state.rows =
                rows;

            BN.renderApiRows();

            BN.renderNodeTable(rows);

            window.BNCards?.init?.();

            window.BNCharts?.renderAll?.();

            window.BNKnotsVsCore?.init?.();

            BN.setStatus(
                `Loaded ${BN.formatNumber(rows.length)} node records from ${normalized.source}.`,
                "ok"
            );

        } catch (err) {

            console.error(err);

            BN.setStatus(
                `Could not load Bitnodes data: ${err.message}`,
                "warn"
            );
        }
    };

    BN.init = async function init() {

        await BN.loadIncludes();

        await BN.loadHome();
    };

    window.BN = BN;
    window.BNCore = BN;

})();