(() => {
    "use strict";

    const BN = window.BN || {};

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

    function countWhere(rowsInput, predicate) {
        return rowsInput.reduce((count, row) => predicate(row) ? count + 1 : count, 0);
    }

    function isTor(row) {
        if (BN.isTor) {
            return BN.isTor(row);
        }

        return String(row.address || row.node || "").toLowerCase().includes(".onion");
    }

    function hasGeo(row) {
        return (
            number(row.latitude ?? row.lat, null) !== null &&
            number(row.longitude ?? row.lon, null) !== null
        );
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

    function countBy(rowsInput, getter) {
        const map = new Map();

        rowsInput.forEach(row => {
            const key = String(getter(row) || "Unknown").trim() || "Unknown";

            map.set(key, (map.get(key) || 0) + 1);
        });

        return Array.from(map.entries())
            .map(([label, value]) => ({
                label,
                value
            }))
            .sort((a, b) => b.value - a.value || String(a.label).localeCompare(String(b.label)));
    }

    function metric(label, value, subtitle = "") {
        return `
            <article class="bn-display-cell">
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value)}</strong>
                ${subtitle ? `<small>${escapeHtml(subtitle)}</small>` : ""}
            </article>
        `;
    }

    function buildDisplayModel(rowsInput = rows(), latestInput = latest()) {
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
            countWhere(rowsInput, row => row.reachable !== false) ||
            rowsInput.length,
            rowsInput.length
        );

        const unreachable = number(
            latestInput.unreachable_nodes ||
            latestInput.unreachable_now,
            Math.max(0, known - reachable)
        );

        const clients = countBy(rowsInput, classifyClient);
        const countries = countBy(rowsInput, row => row.country || row.country_code || "Unknown");
        const ports = countBy(rowsInput, row => row.port || "Unknown");

        return {
            source: latestInput.source || latestInput.crawler || BN.state?.source || "zzxbitnodes",
            updated: latestInput.updated_at || latestInput.timestamp || latestInput.generated_at || "—",
            rows: rowsInput.length,
            known,
            reachable,
            unreachable,
            reachablePercent: percent(reachable, known),
            tor: countWhere(rowsInput, isTor),
            geo: countWhere(rowsInput, hasGeo),
            topClient: clients[0]?.label || "—",
            topClientCount: clients[0]?.value || 0,
            topCountry: countries[0]?.label || "—",
            topCountryCount: countries[0]?.value || 0,
            topPort: ports[0]?.label || "—",
            topPortCount: ports[0]?.value || 0
        };
    }

    function renderDisplay(target, rowsInput = rows(), latestInput = latest()) {
        const model = buildDisplayModel(rowsInput, latestInput);

        target.innerHTML = `
            <section class="bn-display-card">
                <header class="bn-display-head">
                    <span class="bn-kicker">Display</span>
                    <h2>${escapeHtml(target.dataset.title || "Bitnodes Operations Display")}</h2>
                    <p>
                        Tactical readout for the currently selected Bitnodes data source.
                    </p>
                </header>

                <div class="bn-display-marquee">
                    <span>Source: ${escapeHtml(model.source)}</span>
                    <span>Updated: ${escapeHtml(model.updated)}</span>
                    <span>Reachable: ${escapeHtml(formatNumber(model.reachable))}</span>
                    <span>Known: ${escapeHtml(formatNumber(model.known))}</span>
                </div>

                <div class="bn-display-grid">
                    ${metric("Rows Loaded", formatNumber(model.rows), "Frontend record count.")}
                    ${metric("Known Nodes", formatNumber(model.known), "Persistent state.")}
                    ${metric("Reachable", formatNumber(model.reachable), model.reachablePercent)}
                    ${metric("Unreachable", formatNumber(model.unreachable), "Offline / stale.")}
                    ${metric("Tor", formatNumber(model.tor), "Onion nodes.")}
                    ${metric("GeoIP", formatNumber(model.geo), "Coordinate records.")}
                    ${metric("Top Client", model.topClient, `${formatNumber(model.topClientCount)} records.`)}
                    ${metric("Top Country", model.topCountry, `${formatNumber(model.topCountryCount)} records.`)}
                    ${metric("Top Port", model.topPort, `${formatNumber(model.topPortCount)} records.`)}
                </div>
            </section>
        `;
    }

    function renderAll(scope = document) {
        $all("[data-bn-display], #bn-display", scope).forEach(target => {
            renderDisplay(target);
        });
    }

    function init(scope = document) {
        renderAll(scope);
    }

    document.addEventListener("bn:data-loaded", event => {
        const eventRows = event.detail?.rows || rows();
        const eventLatest = event.detail?.latest || latest();

        $all("[data-bn-display], #bn-display").forEach(target => {
            renderDisplay(target, eventRows, eventLatest);
        });
    });

    window.BNDisplays = {
        init,
        renderAll,
        renderDisplay,
        buildDisplayModel
    };
})();
