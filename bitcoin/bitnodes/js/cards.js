(() => {
    "use strict";

    const BN = window.BN || {};

    function formatNumber(value) {
        if (BN.formatNumber) {
            return BN.formatNumber(value);
        }

        const n = Number(value);

        if (!Number.isFinite(n)) {
            return value === null || value === undefined || value === "" ? "—" : String(value);
        }

        return n.toLocaleString();
    }

    function formatMs(value) {
        if (BN.formatMs) {
            return BN.formatMs(value);
        }

        const n = Number(value);

        if (!Number.isFinite(n) || n <= 0) {
            return "—";
        }

        return `${n.toLocaleString(undefined, {
            maximumFractionDigits: 2
        })} ms`;
    }

    function percent(part, total) {
        const p = BN.number ? BN.number(part, 0) : Number(part);
        const t = BN.number ? BN.number(total, 0) : Number(total);

        if (!t) {
            return "0%";
        }

        return `${((p / t) * 100).toLocaleString(undefined, {
            maximumFractionDigits: 2
        })}%`;
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

    function cardHTML(label, value, subtitle = "") {
        return `
            <article class="bn-card">
                <span class="bn-card-label">
                    ${escapeHtml(label)}
                </span>

                <strong class="bn-card-value">
                    ${escapeHtml(value)}
                </strong>

                ${
                    subtitle
                        ? `
                            <span class="bn-card-subtitle">
                                ${escapeHtml(subtitle)}
                            </span>
                        `
                        : ""
                }
            </article>
        `;
    }

    function countWhere(rows, predicate) {
        return rows.reduce((count, row) => {
            return predicate(row) ? count + 1 : count;
        }, 0);
    }

    function uniqueCount(rows, getter) {
        const values = new Set();

        rows.forEach(row => {
            const value = getter(row);

            if (
                value !== null &&
                value !== undefined &&
                value !== "" &&
                value !== "—"
            ) {
                values.add(String(value));
            }
        });

        return values.size;
    }

    function average(rows, getter) {
        const values = rows
            .map(getter)
            .map(value => BN.number ? BN.number(value, null) : Number(value))
            .filter(value => value !== null && Number.isFinite(value));

        if (!values.length) {
            return null;
        }

        return values.reduce((sum, value) => sum + value, 0) / values.length;
    }

    function getRows() {
        return Array.isArray(BN.state?.rows)
            ? BN.state.rows
            : [];
    }

    function getLatest() {
        return BN.state?.latest || {};
    }

    function inferMetrics(rows, latest) {
        const total =
            rows.length ||
            latest.total_nodes ||
            0;

        const known =
            latest.known_nodes ||
            latest.total_known_nodes ||
            latest.total_nodes ||
            total;

        const reachable =
            latest.reachable_nodes ||
            countWhere(rows, row => row.reachable !== false) ||
            total;

        const unreachable =
            latest.unreachable_nodes ||
            Math.max(0, known - reachable);

        const tor =
            latest.tor_nodes ||
            countWhere(rows, row => BN.isTor ? BN.isTor(row) : false);

        const countries =
            latest.countries_count ||
            uniqueCount(rows, row => row.country || row.country_code);

        const cities =
            latest.cities_count ||
            uniqueCount(rows, row => {
                const city = row.city || "";
                const country = row.country || row.country_code || "";

                return city && country
                    ? `${city},${country}`
                    : "";
            });

        const asns =
            latest.asns_count ||
            uniqueCount(rows, row => row.asn);

        const providers =
            uniqueCount(rows, row => row.provider || row.organization || row.org);

        const agents =
            uniqueCount(rows, row => row.agent || row.user_agent);

        const versions =
            uniqueCount(rows, row => row.protocol || row.version);

        const ports =
            uniqueCount(rows, row => row.port);

        const avgLatency =
            average(rows, row => row.latency_ms);

        const maxHeight =
            Math.max(
                ...rows.map(row => BN.number ? BN.number(row.height, 0) : Number(row.height || 0)),
                0
            );

        const ipv4 =
            countWhere(rows, row => {
                const address = String(row.address || row.node || "");

                return /^[0-9]+\./.test(address);
            });

        const ipv6 =
            countWhere(rows, row => {
                const address = String(row.address || row.node || "");

                return address.startsWith("[") ||
                    (
                        address.includes(":") &&
                        !address.includes(".onion")
                    );
            });

        return {
            total,
            known,
            reachable,
            unreachable,
            reachablePercent: percent(reachable, known),
            tor,
            countries,
            cities,
            asns,
            providers,
            agents,
            versions,
            ports,
            avgLatency,
            maxHeight,
            ipv4,
            ipv6,
            updatedAt: latest.updated_at || latest.timestamp || "—",
            source: latest.source || "zzx-labs-bitnodes-crawler"
        };
    }

    function render(target, rows = getRows(), latest = getLatest()) {
        const metrics = inferMetrics(rows, latest);

        target.classList.add("bn-card-grid");

        target.innerHTML = [
            cardHTML(
                "Node Records Loaded",
                formatNumber(metrics.total),
                "Rows currently loaded into the frontend registry."
            ),

            cardHTML(
                "Known Nodes",
                formatNumber(metrics.known),
                "Persistent records retained by the crawler state."
            ),

            cardHTML(
                "Reachable Nodes",
                formatNumber(metrics.reachable),
                `${metrics.reachablePercent} of known nodes.`
            ),

            cardHTML(
                "Unreachable Nodes",
                formatNumber(metrics.unreachable),
                "Known nodes currently offline, stale, or failing checks."
            ),

            cardHTML(
                "Tor Nodes",
                formatNumber(metrics.tor),
                "Onion nodes detected in the registry."
            ),

            cardHTML(
                "Countries",
                formatNumber(metrics.countries),
                "Unique GeoIP country codes."
            ),

            cardHTML(
                "Cities",
                formatNumber(metrics.cities),
                "Unique city/country pairs."
            ),

            cardHTML(
                "ASNs",
                formatNumber(metrics.asns),
                "Autonomous systems represented."
            ),

            cardHTML(
                "Providers",
                formatNumber(metrics.providers),
                "Provider / organization labels."
            ),

            cardHTML(
                "Agents",
                formatNumber(metrics.agents),
                "Unique Bitcoin client agent strings."
            ),

            cardHTML(
                "Versions",
                formatNumber(metrics.versions),
                "Unique protocol versions."
            ),

            cardHTML(
                "Ports",
                formatNumber(metrics.ports),
                "Unique listening ports."
            ),

            cardHTML(
                "IPv4 Nodes",
                formatNumber(metrics.ipv4),
                "Detected IPv4 node addresses."
            ),

            cardHTML(
                "IPv6 Nodes",
                formatNumber(metrics.ipv6),
                "Detected IPv6 node addresses."
            ),

            cardHTML(
                "Average Latency",
                formatMs(metrics.avgLatency),
                "Average handshake latency where available."
            ),

            cardHTML(
                "Max Height",
                formatNumber(metrics.maxHeight),
                "Highest reported block height in loaded rows."
            )
        ].join("");
    }

    function init() {
        const targets = BN.$$("[data-bn-cards], #bn-summary");

        if (!targets.length) {
            return;
        }

        targets.forEach(target => {
            render(target);
        });
    }

    window.BNCards = {
        init,
        render,
        inferMetrics
    };
})();