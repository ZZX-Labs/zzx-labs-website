(() => {
    "use strict";

    const BN = window.BN || {};

    function percent(part, total) {
        if (!total) {
            return "—";
        }

        return `${((part / total) * 100).toLocaleString(undefined, {
            maximumFractionDigits: 2
        })}%`;
    }

    function hasGeo(row) {
        return (
            BN.number(row.latitude ?? row.lat, null) !== null &&
            BN.number(row.longitude ?? row.lon, null) !== null
        );
    }

    function getCountry(row) {
        return row.country || row.country_code || "Unknown";
    }

    function getCity(row) {
        return row.city || "Unknown";
    }

    function getProvider(row) {
        return row.provider || row.organization || row.org || "Unknown";
    }

    function buildCountryCounts(rows) {
        const counts = new Map();

        rows.forEach(row => {
            const country = getCountry(row);

            counts.set(country, (counts.get(country) || 0) + 1);
        });

        return Array.from(counts.entries())
            .map(([country, count]) => ({
                country,
                count
            }))
            .sort((a, b) => b.count - a.count);
    }

    function buildCityCounts(rows) {
        const counts = new Map();

        rows.forEach(row => {
            const country = getCountry(row);
            const city = getCity(row);
            const key = `${city}, ${country}`;

            counts.set(key, (counts.get(key) || 0) + 1);
        });

        return Array.from(counts.entries())
            .map(([location, count]) => ({
                location,
                count
            }))
            .sort((a, b) => b.count - a.count);
    }

    function buildProviderCounts(rows) {
        const counts = new Map();

        rows.forEach(row => {
            const provider = getProvider(row);

            counts.set(provider, (counts.get(provider) || 0) + 1);
        });

        return Array.from(counts.entries())
            .map(([provider, count]) => ({
                provider,
                count
            }))
            .sort((a, b) => b.count - a.count);
    }

    function summarizeGeo(rows) {
        const total = rows.length;
        const geocoded = rows.filter(hasGeo).length;
        const tor = rows.filter(row => BN.isTor?.(row)).length;

        const countries = buildCountryCounts(rows)
            .filter(row => row.country !== "Unknown")
            .length;

        const cities = buildCityCounts(rows)
            .filter(row => !row.location.startsWith("Unknown"))
            .length;

        const providers = buildProviderCounts(rows)
            .filter(row => row.provider !== "Unknown")
            .length;

        return {
            total,
            geocoded,
            missing: Math.max(0, total - geocoded),
            tor,
            countries,
            cities,
            providers,
            geocodedPercent: percent(geocoded, total),
            torPercent: percent(tor, total)
        };
    }

    function renderSummary(summary) {
        return `
            <div class="bn-card-grid">
                <article class="bn-card">
                    <span class="bn-card-label">Geocoded Nodes</span>
                    <strong class="bn-card-value">${BN.formatNumber(summary.geocoded)}</strong>
                    <span class="bn-card-subtitle">${summary.geocodedPercent} of loaded node records.</span>
                </article>

                <article class="bn-card">
                    <span class="bn-card-label">Missing GeoIP</span>
                    <strong class="bn-card-value">${BN.formatNumber(summary.missing)}</strong>
                    <span class="bn-card-subtitle">Records without usable latitude/longitude.</span>
                </article>

                <article class="bn-card">
                    <span class="bn-card-label">Countries</span>
                    <strong class="bn-card-value">${BN.formatNumber(summary.countries)}</strong>
                    <span class="bn-card-subtitle">Unique countries in loaded registry.</span>
                </article>

                <article class="bn-card">
                    <span class="bn-card-label">Cities</span>
                    <strong class="bn-card-value">${BN.formatNumber(summary.cities)}</strong>
                    <span class="bn-card-subtitle">Unique city/country pairs.</span>
                </article>

                <article class="bn-card">
                    <span class="bn-card-label">Providers</span>
                    <strong class="bn-card-value">${BN.formatNumber(summary.providers)}</strong>
                    <span class="bn-card-subtitle">Unique provider / organization labels.</span>
                </article>

                <article class="bn-card">
                    <span class="bn-card-label">Tor Nodes</span>
                    <strong class="bn-card-value">${BN.formatNumber(summary.tor)}</strong>
                    <span class="bn-card-subtitle">${summary.torPercent} of loaded node records.</span>
                </article>
            </div>
        `;
    }

    function renderTable(title, rows, columns) {
        return `
            <section class="bn-panel">
                <header class="bn-panel-head">
                    <span class="bn-kicker">GeoIP</span>
                    <h2>${BN.escape(title)}</h2>
                </header>

                <div class="bn-table-scroll">
                    <table class="bn-table bn-compact-table">
                        <thead>
                            <tr>
                                ${columns.map(col => `<th>${BN.escape(col.label)}</th>`).join("")}
                            </tr>
                        </thead>

                        <tbody>
                            ${rows.map(row => `
                                <tr>
                                    ${columns.map(col => `
                                        <td>${BN.escape(col.render(row))}</td>
                                    `).join("")}
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            </section>
        `;
    }

    function render(target, rows) {
        const summary = summarizeGeo(rows);
        const countryRows = buildCountryCounts(rows).slice(0, 50);
        const cityRows = buildCityCounts(rows).slice(0, 50);
        const providerRows = buildProviderCounts(rows).slice(0, 50);

        target.innerHTML = `
            <section class="bn-panel">
                <header class="bn-panel-head">
                    <span class="bn-kicker">GeoIP Intelligence</span>
                    <h2>Bitcoin Node Geographic and Provider Distribution</h2>

                    <p>
                        DB-IP enriched country, city, coordinate, provider, and hosting metadata
                        for the loaded Bitcoin node registry.
                    </p>
                </header>

                ${renderSummary(summary)}
            </section>

            ${renderTable(
                "Top Countries",
                countryRows,
                [
                    {
                        label: "Country",
                        render: row => {
                            const flag = BN.countryFlag(row.country);

                            return `${flag ? `${flag} ` : ""}${row.country}`;
                        }
                    },
                    {
                        label: "Node Count",
                        render: row => BN.formatNumber(row.count)
                    },
                    {
                        label: "Share",
                        render: row => percent(row.count, rows.length)
                    }
                ]
            )}

            ${renderTable(
                "Top Cities",
                cityRows,
                [
                    {
                        label: "City / Country",
                        render: row => row.location
                    },
                    {
                        label: "Node Count",
                        render: row => BN.formatNumber(row.count)
                    },
                    {
                        label: "Share",
                        render: row => percent(row.count, rows.length)
                    }
                ]
            )}

            ${renderTable(
                "Top Providers / Organizations",
                providerRows,
                [
                    {
                        label: "Provider / Organization",
                        render: row => row.provider
                    },
                    {
                        label: "Node Count",
                        render: row => BN.formatNumber(row.count)
                    },
                    {
                        label: "Share",
                        render: row => percent(row.count, rows.length)
                    }
                ]
            )}
        `;

        window.BNSearchInit?.();
        window.BNTables?.init?.();
    }

    async function init() {
        const targets = BN.$$("[data-bn-geoip], #bn-geoip");

        if (!targets.length) {
            return;
        }

        let rows = BN.state?.rows || [];

        if (!rows.length && window.BNAPI?.fetchLatest) {
            const latest = await window.BNAPI.fetchLatest({
                cacheSeconds: 30
            });

            rows = BN.mapRows(BN.normalizeLatest(latest));
        }

        targets.forEach(target => {
            render(target, rows);
        });
    }

    window.BNGeoIP = {
        init,
        render,
        summarizeGeo,
        buildCountryCounts,
        buildCityCounts,
        buildProviderCounts,
        hasGeo
    };
})();