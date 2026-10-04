(() => {
    "use strict";

    const BN = window.BN || {};

    const WIDGET_MOUNTS = [
        {
            selector: "#bn-geoip, [data-bn-geoip]",
            key: "geoip",
            title: "GeoIP Intelligence",
            renderer: renderGeoIP
        },
        {
            selector: "#bn-vpn, [data-bn-vpn]",
            key: "vpn",
            title: "VPN / Hosting Intelligence",
            renderer: renderVPN
        },
        {
            selector: "#bn-tor, [data-bn-tor]",
            key: "tor",
            title: "Tor Intelligence",
            renderer: renderTor
        },
        {
            selector: "#bn-agents, [data-bn-agents]",
            key: "agents",
            title: "Agent Distribution",
            renderer: renderAgents
        },
        {
            selector: "#bn-versions, [data-bn-versions]",
            key: "versions",
            title: "Protocol Versions",
            renderer: renderVersions
        },
        {
            selector: "#bn-ports, [data-bn-ports]",
            key: "ports",
            title: "Port Distribution",
            renderer: renderPorts
        },
        {
            selector: "#bn-services, [data-bn-services]",
            key: "services",
            title: "Service Bits",
            renderer: renderServices
        }
    ];

    const SERVICE_FLAGS = {
        1: "NODE_NETWORK",
        2: "NODE_GETUTXO",
        4: "NODE_BLOOM",
        8: "NODE_WITNESS",
        16: "NODE_XTHIN",
        32: "NODE_COMPACT_FILTERS",
        64: "NODE_NETWORK_LIMITED",
        1024: "NODE_P2P_V2"
    };

    function $(selector, scope = document) {
        return scope.querySelector(selector);
    }

    function $all(selector, scope = document) {
        if (BN.$$) {
            return BN.$$(selector, scope);
        }

        return Array.from(scope.querySelectorAll(selector));
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

    function number(value, fallback = 0) {
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

    function percent(part, total) {
        if (BN.percent) {
            return BN.percent(part, total);
        }

        const p = number(part, 0);
        const t = number(total, 0);

        if (!t) {
            return "0%";
        }

        return `${((p / t) * 100).toLocaleString(undefined, {
            maximumFractionDigits: 2
        })}%`;
    }

    function cleanLabel(value, fallback = "Unknown") {
        const text = String(value ?? "")
            .replace(/\s+/g, " ")
            .trim();

        if (
            !text ||
            text === "null" ||
            text === "undefined" ||
            text === "—"
        ) {
            return fallback;
        }

        return text;
    }

    function rowsFromState() {
        return Array.isArray(BN.state?.rows) ? BN.state.rows : [];
    }

    function latestFromState() {
        return BN.state?.latest || {};
    }

    function rowAddress(row) {
        return String(row.address || row.node || row.addr || row.hostname || "");
    }

    function classifyAgent(row) {
        const agent = String(row.agent || row.user_agent || "").toLowerCase();

        if (agent.includes("knots")) {
            return "Bitcoin Knots";
        }

        if (
            agent.includes("satoshi") ||
            agent.includes("bitcoin core") ||
            agent.includes("bitcoin-core")
        ) {
            return "Bitcoin Core";
        }

        if (agent.includes("btcd")) {
            return "btcd";
        }

        if (agent.includes("bcoin")) {
            return "bcoin";
        }

        if (agent.includes("libbitcoin")) {
            return "libbitcoin";
        }

        return "Other / Unknown";
    }

    function hasGeo(row) {
        return (
            number(row.latitude ?? row.lat, null) !== null &&
            number(row.longitude ?? row.lon, null) !== null
        );
    }

    function isTor(row) {
        if (BN.isTor) {
            return BN.isTor(row);
        }

        return rowAddress(row).toLowerCase().includes(".onion");
    }

    function isIPv4(row) {
        return /^[0-9]{1,3}(\.[0-9]{1,3}){3}/.test(rowAddress(row));
    }

    function isIPv6(row) {
        const address = rowAddress(row);

        return (
            address.startsWith("[") ||
            (
                address.includes(":") &&
                !address.toLowerCase().includes(".onion") &&
                !isIPv4(row)
            )
        );
    }

    function countWhere(rows, predicate) {
        return rows.reduce((count, row) => predicate(row) ? count + 1 : count, 0);
    }

    function countBy(rows, getter) {
        const map = new Map();

        rows.forEach(row => {
            const key = cleanLabel(getter(row));
            map.set(key, (map.get(key) || 0) + 1);
        });

        return Array.from(map.entries())
            .map(([label, count]) => ({
                label,
                count
            }))
            .sort((a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label)));
    }

    function topLabel(items) {
        return items.length ? items[0].label : "—";
    }

    function topCount(items) {
        return items.length ? items[0].count : 0;
    }

    function uniqueCount(rows, getter) {
        const set = new Set();

        rows.forEach(row => {
            const value = cleanLabel(getter(row), "");

            if (value && value !== "Unknown") {
                set.add(value);
            }
        });

        return set.size;
    }

    function average(rows, getter) {
        const values = rows
            .map(getter)
            .map(value => number(value, null))
            .filter(value => value !== null && Number.isFinite(value));

        if (!values.length) {
            return null;
        }

        return values.reduce((sum, value) => sum + value, 0) / values.length;
    }

    function statCard(label, value, subtitle = "", className = "") {
        return `
            <article class="bn-card ${escapeHtml(className)}">
                <span class="bn-card-label">${escapeHtml(label)}</span>
                <strong class="bn-card-value">${escapeHtml(value)}</strong>
                ${subtitle ? `<span class="bn-card-subtitle">${escapeHtml(subtitle)}</span>` : ""}
            </article>
        `;
    }

    function compactMetric(label, value, subtitle = "") {
        return `
            <article class="bn-widget-metric">
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value)}</strong>
                ${subtitle ? `<small>${escapeHtml(subtitle)}</small>` : ""}
            </article>
        `;
    }

    function table(title, kicker, rows, columns, pageSize = 50) {
        return `
            <section class="bn-widget-table-section">
                <header class="bn-panel-head">
                    <span class="bn-kicker">${escapeHtml(kicker)}</span>
                    <h2>${escapeHtml(title)}</h2>
                </header>

                <div class="bn-table-scroll">
                    <table class="bn-table bn-compact-table" data-page-size="${escapeHtml(pageSize)}">
                        <thead>
                            <tr>
                                <th>№</th>
                                ${columns.map(column => `<th>${escapeHtml(column.label)}</th>`).join("")}
                            </tr>
                        </thead>

                        <tbody>
                            ${rows.map((row, index) => `
                                <tr>
                                    <td>
                                        <span class="bn-rank">${formatNumber(index + 1)}</span>
                                    </td>

                                    ${columns.map(column => `<td>${escapeHtml(column.render(row))}</td>`).join("")}
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            </section>
        `;
    }

    function miniBars(title, rows, total, limit = 8) {
        const data = rows.slice(0, limit);
        const max = Math.max(...data.map(row => row.count), 1);

        return `
            <section class="bn-widget-mini">
                <header>
                    <span class="bn-kicker">Distribution</span>
                    <h3>${escapeHtml(title)}</h3>
                </header>

                <div class="bn-widget-bars">
                    ${data.map(row => {
                        const width = Math.max(2, (row.count / max) * 100);

                        return `
                            <article>
                                <div>
                                    <span>${escapeHtml(row.label)}</span>
                                    <strong>${escapeHtml(formatNumber(row.count))}</strong>
                                </div>

                                <b>
                                    <i style="width: ${width.toFixed(2)}%;"></i>
                                </b>

                                <small>${escapeHtml(percent(row.count, total))}</small>
                            </article>
                        `;
                    }).join("")}
                </div>
            </section>
        `;
    }

    function suite(title, subtitle, body) {
        return `
            <section class="bn-widget-suite">
                <header class="bn-widget-suite-head">
                    <span class="bn-kicker">Widget Intelligence</span>
                    <h2>${escapeHtml(title)}</h2>
                    ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
                </header>

                ${body}
            </section>
        `;
    }

    function renderGeoIP(target, rows) {
        const total = rows.length;
        const geocoded = countWhere(rows, hasGeo);
        const torCount = countWhere(rows, isTor);

        const countries = countBy(rows, row => row.country || row.country_code || "Unknown");
        const knownCountries = countries.filter(item => item.label !== "Unknown");

        const cities = countBy(rows, row => {
            const city = cleanLabel(row.city);
            const country = cleanLabel(row.country || row.country_code);

            return `${city}, ${country}`;
        });

        const knownCities = cities.filter(item => !item.label.startsWith("Unknown"));

        const providers = countBy(rows, row => row.provider || row.organization || row.org || "Unknown");
        const knownProviders = providers.filter(item => item.label !== "Unknown");

        target.innerHTML = suite(
            "GeoIP Intelligence",
            "Country, city, provider, coordinate, and Tor distribution for the selected node registry.",
            `
                <div class="bn-card-grid">
                    ${statCard("Geocoded Nodes", formatNumber(geocoded), `${percent(geocoded, total)} of loaded records.`, "success")}
                    ${statCard("Missing GeoIP", formatNumber(Math.max(0, total - geocoded)), "Records without usable latitude / longitude.", "warning")}
                    ${statCard("Countries", formatNumber(knownCountries.length), `Top: ${topLabel(knownCountries)} (${formatNumber(topCount(knownCountries))}).`)}
                    ${statCard("Cities", formatNumber(knownCities.length), `Top: ${topLabel(knownCities)} (${formatNumber(topCount(knownCities))}).`)}
                    ${statCard("Providers", formatNumber(knownProviders.length), `Top: ${topLabel(knownProviders)} (${formatNumber(topCount(knownProviders))}).`)}
                    ${statCard("Tor Nodes", formatNumber(torCount), `${percent(torCount, total)} of loaded records.`)}
                </div>

                ${miniBars("Top Countries", knownCountries, total)}
                ${miniBars("Top Providers", knownProviders, total)}

                ${table(
                    "Top Countries",
                    "GeoIP",
                    knownCountries.slice(0, 50),
                    [
                        {
                            label: "Country",
                            render: row => {
                                const flag = BN.countryFlag ? BN.countryFlag(row.label) : "";
                                return `${flag ? `${flag} ` : ""}${row.label}`;
                            }
                        },
                        {
                            label: "Node Count",
                            render: row => formatNumber(row.count)
                        },
                        {
                            label: "Share",
                            render: row => percent(row.count, total)
                        }
                    ]
                )}

                ${table(
                    "Top Cities",
                    "GeoIP",
                    knownCities.slice(0, 50),
                    [
                        {
                            label: "City / Country",
                            render: row => row.label
                        },
                        {
                            label: "Node Count",
                            render: row => formatNumber(row.count)
                        },
                        {
                            label: "Share",
                            render: row => percent(row.count, total)
                        }
                    ]
                )}

                ${table(
                    "Top Providers / Organizations",
                    "GeoIP",
                    knownProviders.slice(0, 50),
                    [
                        {
                            label: "Provider / Organization",
                            render: row => row.label
                        },
                        {
                            label: "Node Count",
                            render: row => formatNumber(row.count)
                        },
                        {
                            label: "Share",
                            render: row => percent(row.count, total)
                        }
                    ]
                )}
            `
        );
    }

    function vpnClassification(row) {
        const text = [
            row.provider,
            row.organization,
            row.org,
            row.hostname,
            row.hosting_type,
            row.network_type,
            row.asn
        ].join(" ").toLowerCase();

        if (isTor(row)) {
            return "Tor / Onion";
        }

        if (
            text.includes("vpn") ||
            text.includes("proxy") ||
            text.includes("mullvad") ||
            text.includes("proton") ||
            text.includes("nordvpn") ||
            text.includes("expressvpn") ||
            text.includes("surfshark") ||
            text.includes("private internet access") ||
            text.includes("pia")
        ) {
            return "VPN / Proxy";
        }

        if (
            text.includes("hosting") ||
            text.includes("cloud") ||
            text.includes("datacenter") ||
            text.includes("data center") ||
            text.includes("server") ||
            text.includes("aws") ||
            text.includes("amazon") ||
            text.includes("google") ||
            text.includes("azure") ||
            text.includes("microsoft") ||
            text.includes("oracle") ||
            text.includes("digitalocean") ||
            text.includes("linode") ||
            text.includes("akamai") ||
            text.includes("vultr") ||
            text.includes("ovh") ||
            text.includes("hetzner") ||
            text.includes("leaseweb")
        ) {
            return "Datacenter / Hosting";
        }

        if (text.includes("residential") || text.includes("broadband") || text.includes("cable")) {
            return "Residential";
        }

        return "Unknown";
    }

    function renderVPN(target, rows) {
        const total = rows.length;
        const classifiedRows = rows
            .map(row => ({
                ...row,
                classification: vpnClassification(row)
            }));

        const knownRows = classifiedRows.filter(row => row.classification !== "Unknown");
        const counts = countBy(classifiedRows, row => row.classification);
        const knownCounts = counts.filter(row => row.label !== "Unknown");
        const providerCounts = countBy(knownRows, row => row.provider || row.organization || row.org || "Unknown")
            .filter(row => row.label !== "Unknown");

        target.innerHTML = suite(
            "VPN / Hosting Intelligence",
            "Heuristic classification for Tor, VPN/proxy, datacenter, residential, and unknown network hosting signals.",
            `
                <div class="bn-card-grid">
                    ${statCard("Classified Records", formatNumber(knownRows.length), `${percent(knownRows.length, total)} of loaded records.`)}
                    ${statCard("VPN / Proxy", formatNumber(counts.find(item => item.label === "VPN / Proxy")?.count || 0), "Provider / hostname heuristic matches.")}
                    ${statCard("Datacenter", formatNumber(counts.find(item => item.label === "Datacenter / Hosting")?.count || 0), "Cloud, VPS, colocation, or hosting signatures.")}
                    ${statCard("Residential", formatNumber(counts.find(item => item.label === "Residential")?.count || 0), "Residential-classification hints.")}
                </div>

                ${miniBars("Hosting Classification", counts, total)}
                ${miniBars("Top Classified Providers", providerCounts, total)}

                ${table(
                    "VPN / Hosting Classification",
                    "Hosting Intelligence",
                    counts,
                    [
                        {
                            label: "Classification",
                            render: row => row.label
                        },
                        {
                            label: "Node Count",
                            render: row => formatNumber(row.count)
                        },
                        {
                            label: "Share",
                            render: row => percent(row.count, total)
                        }
                    ]
                )}

                ${table(
                    "Top Classified Providers",
                    "Hosting Intelligence",
                    providerCounts.slice(0, 50),
                    [
                        {
                            label: "Provider / Organization",
                            render: row => row.label
                        },
                        {
                            label: "Node Count",
                            render: row => formatNumber(row.count)
                        },
                        {
                            label: "Share",
                            render: row => percent(row.count, total)
                        }
                    ]
                )}
            `
        );
    }

    function renderTor(target, rows) {
        const total = rows.length;
        const torRows = rows.filter(isTor);
        const clearnetRows = rows.filter(row => !isTor(row));
        const agents = countBy(torRows, row => row.agent || row.user_agent || "Unknown");
        const ports = countBy(torRows, row => row.port || "Unknown");
        const ipv4 = countWhere(clearnetRows, isIPv4);
        const ipv6 = countWhere(clearnetRows, isIPv6);

        target.innerHTML = suite(
            "Tor Intelligence",
            "Onion-node concentration, Tor client distribution, and clearnet comparison.",
            `
                <div class="bn-card-grid">
                    ${statCard("Tor Nodes", formatNumber(torRows.length), `${percent(torRows.length, total)} of loaded records.`)}
                    ${statCard("Clearnet Nodes", formatNumber(clearnetRows.length), `${percent(clearnetRows.length, total)} of loaded records.`)}
                    ${statCard("IPv4 Clearnet", formatNumber(ipv4), `${percent(ipv4, total)} of loaded records.`)}
                    ${statCard("IPv6 Clearnet", formatNumber(ipv6), `${percent(ipv6, total)} of loaded records.`)}
                    ${statCard("Top Tor Agent", topLabel(agents), `${formatNumber(topCount(agents))} Tor records.`)}
                    ${statCard("Top Tor Port", topLabel(ports), `${formatNumber(topCount(ports))} Tor records.`)}
                </div>

                ${miniBars("Top Tor Agents", agents, torRows.length || 1)}
                ${miniBars("Top Tor Ports", ports, torRows.length || 1)}

                ${table(
                    "Top Tor Agents",
                    "Tor Intelligence",
                    agents.slice(0, 50),
                    [
                        {
                            label: "Agent",
                            render: row => row.label
                        },
                        {
                            label: "Node Count",
                            render: row => formatNumber(row.count)
                        },
                        {
                            label: "Share of Tor",
                            render: row => percent(row.count, torRows.length)
                        }
                    ]
                )}

                ${table(
                    "Top Tor Ports",
                    "Tor Intelligence",
                    ports.slice(0, 50),
                    [
                        {
                            label: "Port",
                            render: row => row.label
                        },
                        {
                            label: "Node Count",
                            render: row => formatNumber(row.count)
                        },
                        {
                            label: "Share of Tor",
                            render: row => percent(row.count, torRows.length)
                        }
                    ]
                )}
            `
        );
    }

    function renderAgents(target, rows) {
        const total = rows.length;
        const agents = countBy(rows, row => row.agent || row.user_agent || "Unknown");
        const clients = countBy(rows, classifyAgent);
        const core = clients.find(item => item.label === "Bitcoin Core")?.count || 0;
        const knots = clients.find(item => item.label === "Bitcoin Knots")?.count || 0;

        target.innerHTML = suite(
            "Bitcoin Client Agent Distribution",
            "Client fingerprinting from advertised user-agent strings and implementation-family heuristics.",
            `
                <div class="bn-card-grid">
                    ${statCard("Unique Agents", formatNumber(agents.length), "Distinct user-agent strings.")}
                    ${statCard("Top Agent", topLabel(agents), `${formatNumber(topCount(agents))} node records.`)}
                    ${statCard("Bitcoin Core", formatNumber(core), `${percent(core, total)} of loaded records.`, "success")}
                    ${statCard("Bitcoin Knots", formatNumber(knots), `${percent(knots, total)} of loaded records.`, "warning")}
                </div>

                ${miniBars("Client Families", clients, total)}
                ${miniBars("Top User Agents", agents, total)}

                ${table(
                    "Agent Distribution",
                    "Bitcoin Clients",
                    agents.slice(0, 75),
                    [
                        {
                            label: "Agent",
                            render: row => row.label
                        },
                        {
                            label: "Node Count",
                            render: row => formatNumber(row.count)
                        },
                        {
                            label: "Share",
                            render: row => percent(row.count, total)
                        }
                    ],
                    75
                )}
            `
        );
    }

    function renderVersions(target, rows) {
        const total = rows.length;
        const versions = countBy(rows, row => row.protocol || row.version || "Unknown");
        const heights = rows
            .map(row => number(row.height, null))
            .filter(value => value !== null);

        const maxHeight = heights.length ? Math.max(...heights) : 0;
        const avgHeight = heights.length
            ? heights.reduce((sum, value) => sum + value, 0) / heights.length
            : 0;

        target.innerHTML = suite(
            "Protocol Version Intelligence",
            "Protocol-version distribution and block-height consistency signals.",
            `
                <div class="bn-card-grid">
                    ${statCard("Protocol Versions", formatNumber(versions.length), "Distinct protocol versions.")}
                    ${statCard("Top Protocol", topLabel(versions), `${formatNumber(topCount(versions))} node records.`)}
                    ${statCard("Max Height", formatNumber(maxHeight), "Highest reported block height.")}
                    ${statCard("Average Height", formatNumber(Math.round(avgHeight)), "Average reported block height.")}
                </div>

                ${miniBars("Protocol Versions", versions, total)}

                ${table(
                    "Protocol Version Distribution",
                    "Protocol Intelligence",
                    versions.slice(0, 75),
                    [
                        {
                            label: "Protocol Version",
                            render: row => row.label
                        },
                        {
                            label: "Node Count",
                            render: row => formatNumber(row.count)
                        },
                        {
                            label: "Share",
                            render: row => percent(row.count, total)
                        }
                    ],
                    75
                )}
            `
        );
    }

    function renderPorts(target, rows) {
        const total = rows.length;
        const ports = countBy(rows, row => row.port || "Unknown");
        const default8333 = ports.find(item => String(item.label) === "8333")?.count || 0;
        const nonDefault = Math.max(0, total - default8333);

        target.innerHTML = suite(
            "Listening Port Distribution",
            "Network exposure by advertised listening port, including default 8333 concentration.",
            `
                <div class="bn-card-grid">
                    ${statCard("Unique Ports", formatNumber(ports.length), "Distinct listening ports.")}
                    ${statCard("Top Port", topLabel(ports), `${formatNumber(topCount(ports))} node records.`)}
                    ${statCard("Default 8333", formatNumber(default8333), `${percent(default8333, total)} of loaded records.`, "success")}
                    ${statCard("Non-Default Ports", formatNumber(nonDefault), `${percent(nonDefault, total)} of loaded records.`)}
                </div>

                ${miniBars("Top Listening Ports", ports, total)}

                ${table(
                    "Listening Port Distribution",
                    "Network Ports",
                    ports.slice(0, 75),
                    [
                        {
                            label: "Port",
                            render: row => row.label
                        },
                        {
                            label: "Node Count",
                            render: row => formatNumber(row.count)
                        },
                        {
                            label: "Share",
                            render: row => percent(row.count, total)
                        }
                    ],
                    75
                )}
            `
        );
    }

    function parseServices(value) {
        const n = number(value, 0);
        const flags = [];

        Object.entries(SERVICE_FLAGS).forEach(([bit, name]) => {
            if ((n & Number(bit)) !== 0) {
                flags.push(name);
            }
        });

        return flags.length ? flags : ["NONE"];
    }

    function renderServices(target, rows) {
        const total = rows.length;
        const serviceRows = [];

        rows.forEach(row => {
            parseServices(row.services).forEach(service => {
                serviceRows.push({
                    service
                });
            });
        });

        const services = countBy(serviceRows, row => row.service);
        const witness = services.find(item => item.label === "NODE_WITNESS")?.count || 0;
        const compactFilters = services.find(item => item.label === "NODE_COMPACT_FILTERS")?.count || 0;
        const p2pV2 = services.find(item => item.label === "NODE_P2P_V2")?.count || 0;

        target.innerHTML = suite(
            "Bitcoin Service Bit Distribution",
            "Advertised peer-service capabilities parsed from service-bit flags.",
            `
                <div class="bn-card-grid">
                    ${statCard("Service Flags", formatNumber(services.length), "Distinct advertised service-bit flags.")}
                    ${statCard("Top Service", topLabel(services), `${formatNumber(topCount(services))} appearances.`)}
                    ${statCard("NODE_WITNESS", formatNumber(witness), `${percent(witness, total)} of loaded records.`, "success")}
                    ${statCard("Compact Filters", formatNumber(compactFilters), `${percent(compactFilters, total)} of loaded records.`)}
                    ${statCard("P2P v2", formatNumber(p2pV2), `${percent(p2pV2, total)} of loaded records.`)}
                </div>

                ${miniBars("Service Bit Flags", services, total)}

                ${table(
                    "Bitcoin Service Bit Distribution",
                    "Service Bits",
                    services,
                    [
                        {
                            label: "Service Flag",
                            render: row => row.label
                        },
                        {
                            label: "Node Count",
                            render: row => formatNumber(row.count)
                        },
                        {
                            label: "Share",
                            render: row => percent(row.count, total)
                        }
                    ]
                )}
            `
        );
    }

    function renderEmpty(target, title, message) {
        target.innerHTML = `
            <section class="bn-widget-empty">
                <span class="bn-kicker">Awaiting Data</span>
                <h2>${escapeHtml(title)}</h2>
                <p>${escapeHtml(message)}</p>
            </section>
        `;
    }

    function renderLoading() {
        WIDGET_MOUNTS.forEach(mount => {
            $all(mount.selector).forEach(target => {
                target.innerHTML = `
                    <div class="bn-widget-loading">
                        Loading ${escapeHtml(mount.title)}…
                    </div>
                `;
            });
        });
    }

    function hydrateEnhancements(scope = document) {
        window.BNSearch?.init?.(scope);
        window.BNSearchInit?.(scope);
        window.BNTables?.init?.(scope);
        window.BNPanels?.init?.(scope);
    }

    function renderAll(rows = rowsFromState(), latest = latestFromState()) {
        WIDGET_MOUNTS.forEach(mount => {
            $all(mount.selector).forEach(target => {
                if (!rows.length) {
                    renderEmpty(
                        target,
                        mount.title,
                        "No node records are available for the selected data source."
                    );

                    return;
                }

                mount.renderer(target, rows, latest);
            });
        });

        hydrateEnhancements();
    }

    function init() {
        renderAll();
    }

    document.addEventListener("bn:data-loaded", event => {
        renderAll(
            event.detail?.rows || rowsFromState(),
            event.detail?.latest || latestFromState()
        );
    });

    document.addEventListener("bn:datasource-change", () => {
        renderLoading();
    });

    document.addEventListener("bn:datasource-refresh", () => {
        renderLoading();
    });

    window.BNWidgets = {
        init,
        renderAll,
        renderLoading,
        renderGeoIP,
        renderVPN,
        renderTor,
        renderAgents,
        renderVersions,
        renderPorts,
        renderServices,
        renderEmpty,
        hydrateEnhancements,
        parseServices,
        countBy,
        countWhere,
        uniqueCount,
        average,
        classifyAgent,
        vpnClassification,
        hasGeo,
        isTor,
        isIPv4,
        isIPv6
    };
})();
