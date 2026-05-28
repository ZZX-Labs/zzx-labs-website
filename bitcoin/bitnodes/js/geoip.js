(() => {
    "use strict";

    const BN = window.BN || {};

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

    function normalizeText(value) {
        return String(value || "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function cleanUnknown(value) {
        const text = normalizeText(value);

        if (!text || text === "null" || text === "undefined" || text === "—") {
            return "Unknown";
        }

        return text;
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

    function getCountry(row) {
        return cleanUnknown(row.country || row.country_code);
    }

    function getCity(row) {
        return cleanUnknown(row.city);
    }

    function getASN(row) {
        return cleanUnknown(row.asn);
    }

    function getProvider(row) {
        return cleanUnknown(row.provider || row.organization || row.org);
    }

    function getHostingType(row) {
        return cleanUnknown(row.hosting_type || row.network_type);
    }

    function countBy(rows, getter) {
        const counts = new Map();

        rows.forEach(row => {
            const key = cleanUnknown(getter(row));

            counts.set(key, (counts.get(key) || 0) + 1);
        });

        return Array.from(counts.entries())
            .map(([label, count]) => ({
                label,
                count
            }))
            .sort((a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label)));
    }

    function buildCountryCounts(rows) {
        return countBy(rows, getCountry).map(row => ({
            country: row.label,
            count: row.count
        }));
    }

    function buildCityCounts(rows) {
        return countBy(rows, row => {
            const city = getCity(row);
            const country = getCountry(row);

            return `${city}, ${country}`;
        }).map(row => ({
            location: row.label,
            count: row.count
        }));
    }

    function buildProviderCounts(rows) {
        return countBy(rows, getProvider).map(row => ({
            provider: row.label,
            count: row.count
        }));
    }

    function buildASNCounts(rows) {
        return countBy(rows, getASN).map(row => ({
            asn: row.label,
            count: row.count
        }));
    }

    function buildHostingCounts(rows) {
        return countBy(rows, getHostingType).map(row => ({
            hosting_type: row.label,
            count: row.count
        }));
    }

    function summarizeGeo(rows) {
        const total = rows.length;
        const geocoded = rows.filter(hasGeo).length;
        const tor = rows.filter(isTor).length;

        const countries = buildCountryCounts(rows)
            .filter(row => row.country !== "Unknown")
            .length;

        const cities = buildCityCounts(rows)
            .filter(row => !row.location.startsWith("Unknown,"))
            .length;

        const providers = buildProviderCounts(rows)
            .filter(row => row.provider !== "Unknown")
            .length;

        const asns = buildASNCounts(rows)
            .filter(row => row.asn !== "Unknown")
            .length;

        const hostingTypes = buildHostingCounts(rows)
            .filter(row => row.hosting_type !== "Unknown")
            .length;

        return {
            total,
            geocoded,
            missing: Math.max(0, total - geocoded),
            tor,
            countries,
            cities,
            providers,
            asns,
            hostingTypes,
            geocodedPercent: percent(geocoded, total),
            missingPercent: percent(Math.max(0, total - geocoded), total),
            torPercent: percent(tor, total)
        };
    }

    function topLabel(rows, key) {
        if (!rows.length) {
            return "—";
        }

        return rows[0][key] || rows[0].label || "—";
    }

    function topCount(rows) {
        if (!rows.length) {
            return 0;
        }

        return rows[0].count || 0;
    }

    function card(label, value, subtitle = "") {
        return `
            <article class="bn-card">
                <span class="bn-card-label">${escapeHtml(label)}</span>
                <strong class="bn-card-value">${escapeHtml(value)}</strong>
                ${subtitle ? `<span class="bn-card-subtitle">${escapeHtml(subtitle)}</span>` : ""}
            </article>
        `;
    }

    function renderSummary(summary, countryRows, cityRows, providerRows, asnRows) {
        return `
            <div class="bn-card-grid">
                ${card(
                    "Geocoded Nodes",
                    formatNumber(summary.geocoded),
                    `${summary.geocodedPercent} of loaded node records.`
                )}

                ${card(
                    "Missing GeoIP",
                    formatNumber(summary.missing),
                    `${summary.missingPercent} without usable latitude / longitude.`
                )}

                ${card(
                    "Countries",
                    formatNumber(summary.countries),
                    `Top: ${topLabel(countryRows, "country")} (${formatNumber(topCount(countryRows))}).`
                )}

                ${card(
                    "Cities",
                    formatNumber(summary.cities),
                    `Top: ${topLabel(cityRows, "location")} (${formatNumber(topCount(cityRows))}).`
                )}

                ${card(
                    "ASNs",
                    formatNumber(summary.asns),
                    `Top: ${topLabel(asnRows, "asn")} (${formatNumber(topCount(asnRows))}).`
                )}

                ${card(
                    "Providers",
                    formatNumber(summary.providers),
                    `Top: ${topLabel(providerRows, "provider")} (${formatNumber(topCount(providerRows))}).`
                )}

                ${card(
                    "Hosting Types",
                    formatNumber(summary.hostingTypes),
                    "Unique network / hosting classification labels."
                )}

                ${card(
                    "Tor Nodes",
                    formatNumber(summary.tor),
                    `${summary.torPercent} of loaded node records.`
                )}
            </div>
        `;
    }

    function renderTable(title, kicker, rows, columns, pageSize = 50) {
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
                                ${columns.map(col => `<th>${escapeHtml(col.label)}</th>`).join("")}
                            </tr>
                        </thead>

                        <tbody>
                            ${rows.map((row, index) => `
                                <tr>
                                    <td class="bn-rank">${formatNumber(index + 1)}</td>
                                    ${columns.map(col => `
                                        <td>${escapeHtml(col.render(row))}</td>
                                    `).join("")}
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            </section>
        `;
    }

    function renderEmpty(target) {
        target.innerHTML = `
            <section class="bn-widget-empty">
                <span class="bn-kicker">GeoIP Intelligence</span>
                <h2>Bitcoin Node Geographic and Provider Distribution</h2>
                <p>No node records are available for geographic analysis from the selected data source.</p>
            </section>
        `;
    }

    function render(target, rows = BN.state?.rows || []) {
        if (!target) {
            return;
        }

        if (!Array.isArray(rows) || !rows.length) {
            renderEmpty(target);
            return;
        }

        const summary = summarizeGeo(rows);
        const countryRows = buildCountryCounts(rows).slice(0, 50);
        const cityRows = buildCityCounts(rows).slice(0, 50);
        const providerRows = buildProviderCounts(rows).slice(0, 50);
        const asnRows = buildASNCounts(rows).slice(0, 50);
        const hostingRows = buildHostingCounts(rows).slice(0, 50);

        target.innerHTML = `
            <section class="bn-widget-suite bn-geoip-suite">
                ${renderSummary(summary, countryRows, cityRows, providerRows, asnRows)}

                ${renderTable(
                    "Top Countries",
                    "GeoIP",
                    countryRows,
                    [
                        {
                            label: "Country",
                            render: row => {
                                const flag = BN.countryFlag ? BN.countryFlag(row.country) : "";
                                return `${flag ? `${flag} ` : ""}${row.country}`;
                            }
                        },
                        {
                            label: "Node Count",
                            render: row => formatNumber(row.count)
                        },
                        {
                            label: "Share",
                            render: row => percent(row.count, rows.length)
                        }
                    ]
                )}

                ${renderTable(
                    "Top Cities",
                    "GeoIP",
                    cityRows,
                    [
                        {
                            label: "City / Country",
                            render: row => row.location
                        },
                        {
                            label: "Node Count",
                            render: row => formatNumber(row.count)
                        },
                        {
                            label: "Share",
                            render: row => percent(row.count, rows.length)
                        }
                    ]
                )}

                ${renderTable(
                    "Top ASNs",
                    "Network Geography",
                    asnRows,
                    [
                        {
                            label: "ASN",
                            render: row => row.asn
                        },
                        {
                            label: "Node Count",
                            render: row => formatNumber(row.count)
                        },
                        {
                            label: "Share",
                            render: row => percent(row.count, rows.length)
                        }
                    ]
                )}

                ${renderTable(
                    "Top Providers / Organizations",
                    "Network Geography",
                    providerRows,
                    [
                        {
                            label: "Provider / Organization",
                            render: row => row.provider
                        },
                        {
                            label: "Node Count",
                            render: row => formatNumber(row.count)
                        },
                        {
                            label: "Share",
                            render: row => percent(row.count, rows.length)
                        }
                    ]
                )}

                ${renderTable(
                    "Hosting / Network Type Distribution",
                    "Network Geography",
                    hostingRows,
                    [
                        {
                            label: "Hosting / Network Type",
                            render: row => row.hosting_type
                        },
                        {
                            label: "Node Count",
                            render: row => formatNumber(row.count)
                        },
                        {
                            label: "Share",
                            render: row => percent(row.count, rows.length)
                        }
                    ]
                )}
            </section>
        `;

        window.BNSearch?.init?.(target);
        window.BNTables?.init?.(target);
    }

    async function init() {
        const targets = $all("[data-bn-geoip], #bn-geoip");

        if (!targets.length) {
            return;
        }

        let rows = BN.state?.rows || [];

        if (!rows.length && window.BNAPI?.fetchLatest && BN.mapRows && BN.normalizeLatest) {
            const latest = await window.BNAPI.fetchLatest({
                cacheSeconds: 30
            });

            rows = BN.mapRows(BN.normalizeLatest(latest));
        }

        targets.forEach(target => {
            render(target, rows);
        });
    }

    document.addEventListener("bn:data-loaded", event => {
        const rows = event.detail?.rows || BN.state?.rows || [];

        $all("[data-bn-geoip], #bn-geoip").forEach(target => {
            render(target, rows);
        });
    });

    window.BNGeoIP = {
        init,
        render,
        summarizeGeo,
        buildCountryCounts,
        buildCityCounts,
        buildProviderCounts,
        buildASNCounts,
        buildHostingCounts,
        hasGeo
    };
})();
