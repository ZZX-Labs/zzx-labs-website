(() => {
    "use strict";

    function ready(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn);
        } else {
            fn();
        }
    }

    function $(selector, scope = document) {
        return scope.querySelector(selector);
    }

    function $all(selector, scope = document) {
        return Array.from(scope.querySelectorAll(selector));
    }

    function formatNumber(value) {
        if (window.BNAPI && window.BNAPI.formatNumber) {
            return window.BNAPI.formatNumber(value);
        }

        const n = Number(value);

        if (!Number.isFinite(n)) {
            return value === null || value === undefined || value === "" ? "—" : String(value);
        }

        return n.toLocaleString();
    }

    function formatMS(value) {
        if (window.BNAPI && window.BNAPI.formatMS) {
            return window.BNAPI.formatMS(value);
        }

        const n = Number(value);

        if (!Number.isFinite(n)) {
            return "—";
        }

        return `${n.toLocaleString(undefined, {
            maximumFractionDigits: 2
        })} ms`;
    }

    function percent(part, total) {
        const p = Number(part);
        const t = Number(total);

        if (!Number.isFinite(p) || !Number.isFinite(t) || t <= 0) {
            return "—";
        }

        return `${((p / t) * 100).toLocaleString(undefined, {
            maximumFractionDigits: 2
        })}%`;
    }

    function normalizeLatest(payload) {
        if (window.BNAPI && window.BNAPI.normalizeLatest) {
            return window.BNAPI.normalizeLatest(payload);
        }

        const nodes =
            payload && payload.nodes && typeof payload.nodes === "object"
                ? payload.nodes
                : {};

        const total = Object.keys(nodes).length;

        return {
            source: payload?.source || "zzx-labs-bitnodes-crawler",
            updated_at: payload?.updated_at || null,
            total_nodes: payload?.total_nodes || total,
            reachable_nodes: payload?.reachable_nodes || total,
            known_nodes: payload?.known_nodes || payload?.total_known_nodes || total,
            unreachable_nodes: payload?.unreachable_nodes || 0,
            latest_height: payload?.latest_height || null,
            countries_count: payload?.countries_count || 0,
            cities_count: payload?.cities_count || 0,
            asns_count: payload?.asns_count || 0,
            tor_nodes: payload?.tor_nodes || 0,
            top_agent: payload?.top_agent || null,
            top_port: payload?.top_port || null,
            nodes
        };
    }

    function countNodeField(nodes, index, predicate) {
        if (!nodes || typeof nodes !== "object") {
            return 0;
        }

        return Object.values(nodes).reduce((count, row) => {
            if (!Array.isArray(row)) {
                return count;
            }

            return predicate(row[index], row) ? count + 1 : count;
        }, 0);
    }

    function avgNodeField(nodes, index) {
        if (!nodes || typeof nodes !== "object") {
            return null;
        }

        const values = Object.values(nodes)
            .filter(Array.isArray)
            .map(row => Number(row[index]))
            .filter(Number.isFinite);

        if (!values.length) {
            return null;
        }

        const sum = values.reduce((a, b) => a + b, 0);

        return sum / values.length;
    }

    function uniqueNodeField(nodes, index) {
        if (!nodes || typeof nodes !== "object") {
            return 0;
        }

        const values = new Set();

        Object.values(nodes).forEach(row => {
            if (!Array.isArray(row)) {
                return;
            }

            const value = row[index];

            if (value !== null && value !== undefined && value !== "") {
                values.add(String(value));
            }
        });

        return values.size;
    }

    function inferMetrics(latest) {
        const nodes = latest.nodes || {};
        const total = latest.total_nodes || Object.keys(nodes).length;
        const known = latest.known_nodes || total;
        const reachable = latest.reachable_nodes || total;
        const unreachable = latest.unreachable_nodes || Math.max(0, known - reachable);

        const ipv4 = countNodeField(nodes, null, (_value, row) => {
            const address = String(row.__address || "");
            return /^[0-9]+\./.test(address);
        });

        const ipv6 = countNodeField(nodes, null, (_value, row) => {
            const address = String(row.__address || "");
            return address.startsWith("[") || address.split(":").length > 2;
        });

        const tor =
            latest.tor_nodes ||
            countNodeField(nodes, 16, value => String(value || "").toLowerCase().includes("onion")) ||
            countNodeField(nodes, null, (_value, row) => String(row.__address || "").toLowerCase().includes(".onion"));

        const avgLatency =
            avgNodeField(nodes, 25) ||
            avgNodeField(nodes, 19);

        return {
            total,
            known,
            reachable,
            unreachable,
            reachablePercent: percent(reachable, known),
            latestHeight: latest.latest_height,
            countries: latest.countries_count || uniqueNodeField(nodes, 7),
            cities: latest.cities_count || uniqueNodeField(nodes, 6),
            asns: latest.asns_count || uniqueNodeField(nodes, 11),
            tor,
            ipv4,
            ipv6,
            avgLatency,
            topAgent: latest.top_agent,
            topPort: latest.top_port,
            updatedAt: latest.updated_at,
            source: latest.source
        };
    }

    function attachAddressToRows(nodes) {
        if (!nodes || typeof nodes !== "object") {
            return nodes;
        }

        Object.entries(nodes).forEach(([address, row]) => {
            if (Array.isArray(row)) {
                row.__address = address;
            }
        });

        return nodes;
    }

    function cardHTML(label, value, subtitle = "") {
        return `
            <article class="bn-card">
                <span class="bn-card-label">${label}</span>
                <strong class="bn-card-value">${value}</strong>
                ${subtitle ? `<span class="bn-card-subtitle">${subtitle}</span>` : ""}
            </article>
        `;
    }

    function renderCards(target, latestPayload) {
        const latest = normalizeLatest(latestPayload);
        latest.nodes = attachAddressToRows(latest.nodes);

        const metrics = inferMetrics(latest);

        target.innerHTML = [
            cardHTML("Node Records Loaded", formatNumber(metrics.total), "Reachable / known nodes in the crawler registry."),
            cardHTML("Known Nodes", formatNumber(metrics.known), "Persistent registry count across crawler state."),
            cardHTML("Reachable Nodes", formatNumber(metrics.reachable), `${metrics.reachablePercent} currently reachable.`),
            cardHTML("Unreachable Nodes", formatNumber(metrics.unreachable), "Known nodes currently unreachable or stale."),
            cardHTML("Latest Height", formatNumber(metrics.latestHeight), "Highest reported block height."),
            cardHTML("Tor Nodes", formatNumber(metrics.tor), "Onion nodes in the registry."),
            cardHTML("Countries", formatNumber(metrics.countries), "GeoIP country coverage."),
            cardHTML("ASNs", formatNumber(metrics.asns), "Autonomous systems represented."),
            cardHTML("Cities", formatNumber(metrics.cities), "GeoIP city coverage."),
            cardHTML("IPv4 Nodes", formatNumber(metrics.ipv4), "Detected IPv4 node addresses."),
            cardHTML("IPv6 Nodes", formatNumber(metrics.ipv6), "Detected IPv6 node addresses."),
            cardHTML("Avg Latency", formatMS(metrics.avgLatency), "Average handshake latency where available.")
        ].join("");
    }

    async function loadCards(target) {
        if (!window.BNAPI || !window.BNAPI.fetchLatest) {
            target.innerHTML = cardHTML("Cards Offline", "—", "BNAPI is not loaded.");
            return;
        }

        try {
            const latest = await window.BNAPI.fetchLatest({
                cacheSeconds: 30
            });

            renderCards(target, latest);
        } catch (err) {
            target.innerHTML = cardHTML("Cards Error", "—", err.message || "Could not load latest snapshot.");
        }
    }

    function initCards() {
        const targets = $all("[data-bn-cards], #bn-summary");

        targets.forEach(target => {
            target.classList.add("bn-card-grid");
            loadCards(target);
        });
    }

    window.BNCards = {
        init: initCards,
        render: renderCards,
        load: loadCards
    };

    ready(initCards);
})();