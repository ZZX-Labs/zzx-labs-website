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

    function number(value, fallback = 0) {
        if (BN.number) {
            return BN.number(value, fallback);
        }

        const n = Number(value);

        return Number.isFinite(n) ? n : fallback;
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

    function coalesce(...values) {
        for (const value of values) {
            if (value !== null && value !== undefined && value !== "") {
                return value;
            }
        }

        return null;
    }

    function cardHTML(label, value, subtitle = "", modifier = "") {
        return `
            <article class="bn-card ${escapeHtml(modifier)}">
                <span class="bn-card-label">${escapeHtml(label)}</span>
                <strong class="bn-card-value">${escapeHtml(value)}</strong>
                ${
                    subtitle
                        ? `<span class="bn-card-subtitle">${escapeHtml(subtitle)}</span>`
                        : ""
                }
            </article>
        `;
    }

    function countWhere(rows, predicate) {
        return rows.reduce((count, row) => predicate(row) ? count + 1 : count, 0);
    }

    function uniqueCount(rows, getter) {
        const values = new Set();

        rows.forEach(row => {
            const value = getter(row);

            if (
                value !== null &&
                value !== undefined &&
                value !== "" &&
                value !== "—" &&
                value !== "Unknown"
            ) {
                values.add(String(value));
            }
        });

        return values.size;
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

    function isTor(row) {
        if (BN.isTor) {
            return BN.isTor(row);
        }

        return String(row.address || row.node || "").toLowerCase().includes(".onion");
    }

    function getRows() {
        return Array.isArray(BN.state?.rows) ? BN.state.rows : [];
    }

    function getLatest() {
        return BN.state?.latest || {};
    }

    function inferMetrics(rows = getRows(), latest = getLatest()) {
        const rowTotal = rows.length;

        const total = number(
            coalesce(
                latest.total_nodes,
                latest.node_count,
                rowTotal
            ),
            rowTotal
        );

        const known = number(
            coalesce(
                latest.known_nodes,
                latest.total_known_nodes,
                latest.total_nodes,
                total,
                rowTotal
            ),
            rowTotal
        );

        const reachable = number(
            coalesce(
                latest.reachable_nodes,
                latest.reachable_now,
                latest.summary?.reachable_now,
                rows.length ? countWhere(rows, row => row.reachable !== false) : null,
                total
            ),
            total
        );

        const unreachable = number(
            coalesce(
                latest.unreachable_nodes,
                latest.unreachable_now,
                latest.summary?.unreachable_now,
                Math.max(0, known - reachable)
            ),
            0
        );

        const tor = number(
            coalesce(
                latest.tor_nodes,
                latest.onion_nodes,
                rows.length ? countWhere(rows, isTor) : null
            ),
            0
        );

        const countries = number(
            coalesce(
                latest.countries_count,
                latest.country_count,
                rows.length ? uniqueCount(rows, row => row.country || row.country_code) : null
            ),
            0
        );

        const cities = number(
            coalesce(
                latest.cities_count,
                latest.city_count,
                rows.length ? uniqueCount(rows, row => {
                    const city = row.city || "";
                    const country = row.country || row.country_code || "";

                    return city && country ? `${city},${country}` : "";
                }) : null
            ),
            0
        );

        const asns = number(
            coalesce(
                latest.asns_count,
                latest.asn_count,
                rows.length ? uniqueCount(rows, row => row.asn) : null
            ),
            0
        );

        const providers = uniqueCount(rows, row => row.provider || row.organization || row.org);
        const agents = uniqueCount(rows, row => row.agent || row.user_agent);
        const versions = uniqueCount(rows, row => row.protocol || row.version);
        const ports = uniqueCount(rows, row => row.port);

        const avgLatency = average(rows, row => row.latency_ms);

        const maxHeight = rows.length
            ? Math.max(...rows.map(row => number(row.height, 0)), 0)
            : number(coalesce(latest.latest_height, latest.height), 0);

        const ipv4 = countWhere(rows, row => {
            const address = String(row.address || row.node || "");
            return /^[0-9]+\./.test(address);
        });

        const ipv6 = countWhere(rows, row => {
            const address = String(row.address || row.node || "");
            return address.startsWith("[") || (
                address.includes(":") &&
                !address.includes(".onion") &&
                !/^[0-9]+\./.test(address)
            );
        });

        const source =
            coalesce(
                latest.source,
                latest.crawler,
                BN.state?.source,
                window.BNDataSource?.definition?.label,
                "zzxbitnodes"
            );

        return {
            total,
            rowTotal,
            known,
            reachable,
            unreachable,
            reachablePercent: percent(reachable, known),
            unreachablePercent: percent(unreachable, known),
            tor,
            torPercent: percent(tor, total || rowTotal),
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
            updatedAt: coalesce(latest.updated_at, latest.timestamp, latest.generated_at, "—"),
            source
        };
    }

    function render(target, rows = getRows(), latest = getLatest()) {
        if (!target) {
            return;
        }

        const metrics = inferMetrics(rows, latest);

        target.classList.add("bn-card-grid", "bn-summary-card-grid");
        target.classList.remove("bn-grid");

        target.innerHTML = [
            cardHTML(
                "Node Records Loaded",
                formatNumber(metrics.rowTotal || metrics.total),
                "Rows currently loaded into the frontend registry.",
                "is-primary"
            ),

            cardHTML(
                "Known Nodes",
                formatNumber(metrics.known),
                "Persistent records retained by crawler state."
            ),

            cardHTML(
                "Reachable Nodes",
                formatNumber(metrics.reachable),
                `${metrics.reachablePercent} of known nodes.`,
                "success"
            ),

            cardHTML(
                "Unreachable Nodes",
                formatNumber(metrics.unreachable),
                `${metrics.unreachablePercent} currently unreachable or stale.`,
                "warning"
            ),

            cardHTML(
                "Tor Nodes",
                formatNumber(metrics.tor),
                `${metrics.torPercent} of loaded records.`
            ),

            cardHTML(
                "Countries",
                formatNumber(metrics.countries),
                "Unique GeoIP country codes."
            ),

            cardHTML(
                "Cities",
                formatNumber(metrics.cities),
                "Unique city / country pairs."
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

    function init(scope = document) {
        const targets = $all("[data-bn-cards], #bn-summary", scope);

        targets.forEach(target => {
            render(target);
        });
    }

    document.addEventListener("bn:data-loaded", event => {
        const rows = event.detail?.rows || getRows();
        const latest = event.detail?.latest || getLatest();

        $all("[data-bn-cards], #bn-summary").forEach(target => {
            render(target, rows, latest);
        });
    });

    document.addEventListener("bn:datasource-change", () => {
        $all("[data-bn-cards], #bn-summary").forEach(target => {
            target.classList.add("bn-card-grid", "bn-summary-card-grid");
            target.innerHTML = cardHTML(
                "Loading Source",
                "—",
                "Refreshing selected Bitnodes data source."
            );
        });
    });

    window.BNCards = {
        init,
        render,
        inferMetrics
    };
})();
