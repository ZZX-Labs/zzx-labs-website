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

    function rows() {
        return Array.isArray(BN.state?.rows) ? BN.state.rows : [];
    }

    function latest() {
        return BN.state?.latest || {};
    }

    function isTor(row) {
        if (BN.isTor) {
            return BN.isTor(row);
        }

        return String(row.address || row.node || "").toLowerCase().includes(".onion");
    }

    function classifyClient(row) {
        const agent = String(row.agent || row.user_agent || "").toLowerCase();

        if (agent.includes("knots")) {
            return "Bitcoin Knots";
        }

        if (agent.includes("satoshi") || agent.includes("bitcoin core")) {
            return "Bitcoin Core";
        }

        return "Other";
    }

    function hasGeo(row) {
        return (
            number(row.latitude ?? row.lat, null) !== null &&
            number(row.longitude ?? row.lon, null) !== null
        );
    }

    function unique(rowsInput, getter) {
        const values = new Set();

        rowsInput.forEach(row => {
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

    function countBy(rowsInput, getter) {
        const counts = new Map();

        rowsInput.forEach(row => {
            const key = String(getter(row) || "Unknown").trim() || "Unknown";

            counts.set(key, (counts.get(key) || 0) + 1);
        });

        return Array.from(counts.entries())
            .map(([label, value]) => ({
                label,
                value
            }))
            .sort((a, b) => b.value - a.value || String(a.label).localeCompare(String(b.label)));
    }

    function average(rowsInput, getter) {
        const values = rowsInput
            .map(getter)
            .map(value => number(value, null))
            .filter(value => value !== null && Number.isFinite(value));

        if (!values.length) {
            return null;
        }

        return values.reduce((sum, value) => sum + value, 0) / values.length;
    }

    function summarize(rowsInput = rows(), latestInput = latest()) {
        const known = number(
            latestInput.known_nodes ||
            latestInput.total_known_nodes ||
            latestInput.total_nodes ||
            rowsInput.length,
            rowsInput.length
        );

        const reachable = number(
            latestInput.reachable_nodes ||
            latestInput.reachable_now ||
            rowsInput.filter(row => row.reachable !== false).length ||
            rowsInput.length,
            rowsInput.length
        );

        const unreachable = number(
            latestInput.unreachable_nodes ||
            latestInput.unreachable_now,
            Math.max(0, known - reachable)
        );

        const tor = rowsInput.filter(isTor).length;
        const geocoded = rowsInput.filter(hasGeo).length;
        const clients = countBy(rowsInput, classifyClient);
        const countries = countBy(rowsInput, row => row.country || row.country_code || "Unknown");
        const asns = countBy(rowsInput, row => row.asn || "Unknown");
        const agents = countBy(rowsInput, row => row.agent || row.user_agent || "Unknown");
        const ports = countBy(rowsInput, row => row.port || "Unknown");
        const versions = countBy(rowsInput, row => row.protocol || row.version || "Unknown");

        return {
            source: latestInput.source || latestInput.crawler || BN.state?.source || "zzxbitnodes",
            updatedAt: latestInput.updated_at || latestInput.timestamp || latestInput.generated_at || "—",
            totalRows: rowsInput.length,
            known,
            reachable,
            unreachable,
            tor,
            geocoded,
            missingGeo: Math.max(0, rowsInput.length - geocoded),
            countries: unique(rowsInput, row => row.country || row.country_code),
            cities: unique(rowsInput, row => {
                const city = row.city || "";
                const country = row.country || row.country_code || "";
                return city && country ? `${city},${country}` : "";
            }),
            asns: unique(rowsInput, row => row.asn),
            agents: unique(rowsInput, row => row.agent || row.user_agent),
            ports: unique(rowsInput, row => row.port),
            versions: unique(rowsInput, row => row.protocol || row.version),
            avgLatency: average(rowsInput, row => row.latency_ms),
            maxHeight: rowsInput.length
                ? Math.max(...rowsInput.map(row => number(row.height, 0)), 0)
                : number(latestInput.latest_height || latestInput.height, 0),
            reachablePercent: percent(reachable, known),
            unreachablePercent: percent(unreachable, known),
            torPercent: percent(tor, rowsInput.length),
            geoPercent: percent(geocoded, rowsInput.length),
            clients,
            countriesRanked: countries,
            asnsRanked: asns,
            agentsRanked: agents,
            portsRanked: ports,
            versionsRanked: versions
        };
    }

    function metric(title, value, detail = "") {
        return `
            <article class="bn-analytics-metric">
                <span class="bn-analytics-label">${escapeHtml(title)}</span>
                <strong class="bn-analytics-value">${escapeHtml(value)}</strong>
                ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
            </article>
        `;
    }

    function renderSummary(target, rowsInput = rows(), latestInput = latest()) {
        const summary = summarize(rowsInput, latestInput);

        target.innerHTML = `
            <section class="bn-analytics-suite">
                <div class="bn-analytics-head">
                    <div>
                        <span class="bn-kicker">Network Analytics</span>
                        <h2>Bitcoin Network Intelligence Summary</h2>
                        <p>
                            Loaded from ${escapeHtml(summary.source)}. Updated:
                            ${escapeHtml(summary.updatedAt)}.
                        </p>
                    </div>
                </div>

                <div class="bn-analytics-grid">
                    ${metric("Loaded Records", formatNumber(summary.totalRows), "Rows available to frontend analytics.")}
                    ${metric("Known Nodes", formatNumber(summary.known), "Persistent registry records.")}
                    ${metric("Reachable", formatNumber(summary.reachable), `${summary.reachablePercent} of known nodes.`)}
                    ${metric("Unreachable", formatNumber(summary.unreachable), `${summary.unreachablePercent} of known nodes.`)}
                    ${metric("Tor Nodes", formatNumber(summary.tor), `${summary.torPercent} of loaded records.`)}
                    ${metric("Geocoded", formatNumber(summary.geocoded), `${summary.geoPercent} include coordinates.`)}
                    ${metric("Countries", formatNumber(summary.countries), "Unique country codes.")}
                    ${metric("ASNs", formatNumber(summary.asns), "Unique autonomous systems.")}
                    ${metric("Agents", formatNumber(summary.agents), "Unique client strings.")}
                    ${metric("Ports", formatNumber(summary.ports), "Unique listening ports.")}
                    ${metric("Versions", formatNumber(summary.versions), "Unique protocol versions.")}
                    ${metric("Max Height", formatNumber(summary.maxHeight), "Highest reported block height.")}
                </div>
            </section>
        `;
    }

    function renderAll(scope = document) {
        $all("[data-bn-analytics], #bn-analytics", scope).forEach(target => {
            renderSummary(target);
        });
    }

    function init(scope = document) {
        renderAll(scope);
    }

    document.addEventListener("bn:data-loaded", event => {
        const eventRows = event.detail?.rows || rows();
        const eventLatest = event.detail?.latest || latest();

        $all("[data-bn-analytics], #bn-analytics").forEach(target => {
            renderSummary(target, eventRows, eventLatest);
        });
    });

    window.BNAnalytics = {
        init,
        renderAll,
        renderSummary,
        summarize,
        countBy,
        classifyClient,
        hasGeo,
        isTor
    };
})();
