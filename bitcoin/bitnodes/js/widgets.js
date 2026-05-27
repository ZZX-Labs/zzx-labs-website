(() => {
    "use strict";

    const BN = window.BN || {};

    function $(selector, scope = document) {
        return scope.querySelector(selector);
    }

    function $all(selector, scope = document) {
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

    function classifyAgent(row) {
        const agent = String(row.agent || row.user_agent || "").toLowerCase();

        if (agent.includes("knots")) {
            return "knots";
        }

        if (agent.includes("satoshi") || agent.includes("bitcoin core")) {
            return "core";
        }

        return "other";
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

        return String(row.address || row.node || "").toLowerCase().includes(".onion");
    }

    function countBy(rows, getter) {
        const map = new Map();

        rows.forEach(row => {
            const key = String(getter(row) || "Unknown").trim() || "Unknown";

            map.set(key, (map.get(key) || 0) + 1);
        });

        return Array.from(map.entries())
            .map(([label, count]) => ({
                label,
                count
            }))
            .sort((a, b) => b.count - a.count);
    }

    function topLabel(items) {
        return items.length ? items[0].label : "—";
    }

    function topCount(items) {
        return items.length ? items[0].count : 0;
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

    function metricBlock(label, value, subtitle = "") {
        return `
            <article class="bn-client-metric">
                <span class="bn-client-metric-label">${escapeHtml(label)}</span>
                <strong class="bn-client-metric-value">${escapeHtml(value)}</strong>
                ${subtitle ? `<span class="bn-client-metric-subtitle">${escapeHtml(subtitle)}</span>` : ""}
            </article>
        `;
    }

    function table(title, kicker, rows, columns) {
        return `
            <section class="bn-widget-table-section">
                <header class="bn-panel-head">
                    <span class="bn-kicker">${escapeHtml(kicker)}</span>
                    <h2>${escapeHtml(title)}</h2>
                </header>

                <div class="bn-table-scroll">
                    <table class="bn-table bn-compact-table" data-page-size="50">
                        <thead>
                            <tr>
                                ${columns.map(column => `<th>${escapeHtml(column.label)}</th>`).join("")}
                            </tr>
                        </thead>

                        <tbody>
                            ${rows.map(row => `
                                <tr>
                                    ${columns.map(column => `<td>${escapeHtml(column.render(row))}</td>`).join("")}
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            </section>
        `;
    }

    function renderGeoIP(target, rows) {
        const total = rows.length;
        const geocoded = rows.filter(hasGeo).length;
        const torCount = rows.filter(isTor).length;
        const countries = countBy(rows, row => row.country || row.country_code || "Unknown");
        const cities = countBy(rows, row => {
            const city = row.city || "Unknown";
            const country = row.country || row.country_code || "Unknown";

            return `${city}, ${country}`;
        });
        const providers = countBy(rows, row => row.provider || row.organization || row.org || "Unknown");

        target.innerHTML = `
            <section class="bn-widget-suite">
                <div class="bn-card-grid">
                    ${statCard("Geocoded Nodes", formatNumber(geocoded), `${percent(geocoded, total)} of loaded records.`)}
                    ${statCard("Missing GeoIP", formatNumber(Math.max(0, total - geocoded)), "Records without latitude / longitude.")}
                    ${statCard("Countries", formatNumber(countries.filter(item => item.label !== "Unknown").length), `Top: ${topLabel(countries)} (${formatNumber(topCount(countries))}).`)}
                    ${statCard("Cities", formatNumber(cities.filter(item => !item.label.startsWith("Unknown")).length), `Top: ${topLabel(cities)} (${formatNumber(topCount(cities))}).`)}
                    ${statCard("Providers", formatNumber(providers.filter(item => item.label !== "Unknown").length), `Top: ${topLabel(providers)} (${formatNumber(topCount(providers))}).`)}
                    ${statCard("Tor Nodes", formatNumber(torCount), `${percent(torCount, total)} of loaded records.`)}
                </div>

                ${table(
                    "Top Countries",
                    "GeoIP",
                    countries.slice(0, 25),
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
                    cities.slice(0, 25),
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
                    providers.slice(0, 25),
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
            </section>
        `;
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
            return "tor";
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
            return "vpn_or_proxy";
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
            return "datacenter";
        }

        if (text.includes("residential")) {
            return "residential";
        }

        return "unknown";
    }

    function renderVPN(target, rows) {
        const total = rows.length;
        const classifiedRows = rows
            .map(row => ({
                ...row,
                classification: vpnClassification(row)
            }))
            .filter(row => row.classification !== "unknown");

        const counts = countBy(classifiedRows, row => row.classification);
        const providerCounts = countBy(classifiedRows, row => row.provider || row.organization || row.org || "Unknown");

        target.innerHTML = `
            <section class="bn-widget-suite">
                <div class="bn-card-grid">
                    ${statCard("Classified Records", formatNumber(classifiedRows.length), `${percent(classifiedRows.length, total)} of loaded records.`)}
                    ${statCard("VPN / Proxy", formatNumber(counts.find(item => item.label === "vpn_or_proxy")?.count || 0), "Provider / hostname heuristic matches.")}
                    ${statCard("Datacenter", formatNumber(counts.find(item => item.label === "datacenter")?.count || 0), "Cloud, VPS, colocation, or hosting signatures.")}
                    ${statCard("Residential", formatNumber(counts.find(item => item.label === "residential")?.count || 0), "Residential-classification hints.")}
                </div>

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
                    providerCounts.slice(0, 30),
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
            </section>
        `;
    }

    function renderTor(target, rows) {
        const total = rows.length;
        const torRows = rows.filter(isTor);
        const agents = countBy(torRows, row => row.agent || row.user_agent || "Unknown");
        const ports = countBy(torRows, row => row.port || "Unknown");

        target.innerHTML = `
            <section class="bn-widget-suite">
                <div class="bn-card-grid">
                    ${statCard("Tor Nodes", formatNumber(torRows.length), `${percent(torRows.length, total)} of loaded records.`)}
                    ${statCard("Clearnet Nodes", formatNumber(Math.max(0, total - torRows.length)), `${percent(Math.max(0, total - torRows.length), total)} of loaded records.`)}
                    ${statCard("Top Tor Agent", topLabel(agents), `${formatNumber(topCount(agents))} node records.`)}
                    ${statCard("Top Tor Port", topLabel(ports), `${formatNumber(topCount(ports))} node records.`)}
                </div>

                ${table(
                    "Top Tor Agents",
                    "Tor Intelligence",
                    agents.slice(0, 25),
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
                    ports.slice(0, 25),
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
            </section>
        `;
    }

    function renderAgents(target, rows) {
        const total = rows.length;
        const agents = countBy(rows, row => row.agent || row.user_agent || "Unknown");
        const clients = countBy(rows, classifyAgent);

        target.innerHTML = `
            <section class="bn-widget-suite">
                <div class="bn-card-grid">
                    ${statCard("Unique Agents", formatNumber(agents.length), "Distinct user-agent strings.")}
                    ${statCard("Top Agent", topLabel(agents), `${formatNumber(topCount(agents))} node records.`)}
                    ${statCard("Bitcoin Core", formatNumber(clients.find(item => item.label === "core")?.count || 0), `${percent(clients.find(item => item.label === "core")?.count || 0, total)} of loaded records.`)}
                    ${statCard("Bitcoin Knots", formatNumber(clients.find(item => item.label === "knots")?.count || 0), `${percent(clients.find(item => item.label === "knots")?.count || 0, total)} of loaded records.`)}
                </div>

                ${table(
                    "Agent Distribution",
                    "Bitcoin Clients",
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
                            label: "Share",
                            render: row => percent(row.count, total)
                        }
                    ]
                )}
            </section>
        `;
    }

    function renderVersions(target, rows) {
        const total = rows.length;
        const versions = countBy(rows, row => row.protocol || row.version || "Unknown");

        target.innerHTML = `
            <section class="bn-widget-suite">
                <div class="bn-card-grid">
                    ${statCard("Protocol Versions", formatNumber(versions.length), "Distinct protocol versions.")}
                    ${statCard("Top Protocol", topLabel(versions), `${formatNumber(topCount(versions))} node records.`)}
                </div>

                ${table(
                    "Protocol Version Distribution",
                    "Protocol Intelligence",
                    versions.slice(0, 50),
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
                    ]
                )}
            </section>
        `;
    }

    function renderPorts(target, rows) {
        const total = rows.length;
        const ports = countBy(rows, row => row.port || "Unknown");

        target.innerHTML = `
            <section class="bn-widget-suite">
                <div class="bn-card-grid">
                    ${statCard("Unique Ports", formatNumber(ports.length), "Distinct listening ports.")}
                    ${statCard("Top Port", topLabel(ports), `${formatNumber(topCount(ports))} node records.`)}
                    ${statCard("Default 8333", formatNumber(ports.find(item => item.label === "8333")?.count || 0), `${percent(ports.find(item => item.label === "8333")?.count || 0, total)} of loaded records.`)}
                </div>

                ${table(
                    "Listening Port Distribution",
                    "Network Ports",
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
                            label: "Share",
                            render: row => percent(row.count, total)
                        }
                    ]
                )}
            </section>
        `;
    }

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

        target.innerHTML = `
            <section class="bn-widget-suite">
                <div class="bn-card-grid">
                    ${statCard("Service Flags", formatNumber(services.length), "Distinct service-bit flags.")}
                    ${statCard("Top Service", topLabel(services), `${formatNumber(topCount(services))} appearances.`)}
                    ${statCard("NODE_WITNESS", formatNumber(services.find(item => item.label === "NODE_WITNESS")?.count || 0), `${percent(services.find(item => item.label === "NODE_WITNESS")?.count || 0, total)} of loaded records.`)}
                </div>

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
            </section>
        `;
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

    function renderAll(rows = BN.state?.rows || [], latest = BN.state?.latest || null) {
        const pairs = [
            ["#bn-geoip", renderGeoIP, "GeoIP Intelligence"],
            ["#bn-vpn", renderVPN, "VPN / Hosting Intelligence"],
            ["#bn-tor", renderTor, "Tor Intelligence"],
            ["#bn-agents", renderAgents, "Agent Distribution"],
            ["#bn-versions", renderVersions, "Protocol Versions"],
            ["#bn-ports", renderPorts, "Port Distribution"],
            ["#bn-services", renderServices, "Service Bits"]
        ];

        pairs.forEach(([selector, renderer, title]) => {
            const target = $(selector);

            if (!target) {
                return;
            }

            if (!rows.length) {
                renderEmpty(target, title, "No node records are available for this selected data source.");
                return;
            }

            renderer(target, rows, latest);
        });

        window.BNTables?.init?.();
    }

    function init() {
        renderAll();
    }

    document.addEventListener("bn:data-loaded", event => {
        renderAll(event.detail?.rows || [], event.detail?.latest || null);
    });

    document.addEventListener("bn:datasource-change", () => {
        const mounts = [
            "#bn-geoip",
            "#bn-vpn",
            "#bn-tor",
            "#bn-agents",
            "#bn-versions",
            "#bn-ports",
            "#bn-services"
        ];

        mounts.forEach(selector => {
            const target = $(selector);

            if (target) {
                target.innerHTML = `
                    <div class="bn-widget-loading">
                        Loading selected source analytics…
                    </div>
                `;
            }
        });
    });

    window.BNWidgets = {
        init,
        renderAll,
        renderGeoIP,
        renderVPN,
        renderTor,
        renderAgents,
        renderVersions,
        renderPorts,
        renderServices,
        parseServices,
        countBy,
        classifyAgent
    };
})();
