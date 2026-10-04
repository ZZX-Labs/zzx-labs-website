(() => {
    "use strict";

    if (window.BNPageRuntime?.version >= 3) {
        return;
    }

    const DEFAULT_SOURCE = "zzxbitnodes";
    const PRIMARY_SOURCE = "zzxbitnodes";
    const FALLBACK_SOURCE = "originalbitnodes";

    const ENDPOINTS = {
        zzxbitnodes: {
            latest: "api/zzxbitnodes/latest.json",
            nodes: "api/zzxbitnodes/nodes.json",
            reachable: "api/zzxbitnodes/reachable.json",
            unreachable: "api/zzxbitnodes/unreachable.json",
            snapshots: "api/zzxbitnodes/snapshots.json",
            countries: "api/zzxbitnodes/countries.json",
            cities: "api/zzxbitnodes/cities.json",
            asns: "api/zzxbitnodes/asns.json",
            agents: "api/zzxbitnodes/agents.json",
            versions: "api/zzxbitnodes/versions.json",
            ports: "api/zzxbitnodes/ports.json",
            services: "api/zzxbitnodes/services.json",
            organizations: "api/zzxbitnodes/organizations.json",
            providers: "api/zzxbitnodes/providers.json",
            tor: "api/zzxbitnodes/tor.json",
            i2p: "api/zzxbitnodes/i2p.json",
            vpn: "api/zzxbitnodes/vpn.json",
            proxy: "api/zzxbitnodes/proxy.json",
            latency: "api/zzxbitnodes/latency.json",
            peerHealth: "api/zzxbitnodes/peer-health.json",
            leaderboard: "api/zzxbitnodes/leaderboard.json",
            propagation: "api/zzxbitnodes/propagation.json",
            dnsSeeder: "api/zzxbitnodes/dns-seeder.json",
            coordinates: "api/zzxbitnodes/coordinates.json",
            status: "api/zzxbitnodes/status.json",
            index: "api/zzxbitnodes/index.json",
            manifest: "api/zzxbitnodes/manifest.json"
        },
        originalbitnodes: {
            // The Addy Yeow-style crawler currently guarantees latest.json.
            // Specialized views derive their tables/statistics from it.
            latest: "api/originalbitnodes/latest.json"
        },
        local: {
            latest: "api/latest.json",
            nodes: "api/nodes.json",
            reachable: "api/reachable.json",
            unreachable: "api/unreachable.json",
            snapshots: "api/snapshots.json",
            countries: "api/countries.json",
            cities: "api/cities.json",
            asns: "api/asns.json",
            agents: "api/agents.json",
            versions: "api/versions.json",
            ports: "api/ports.json",
            services: "api/services.json",
            organizations: "api/organizations.json",
            providers: "api/providers.json",
            tor: "api/tor.json",
            latency: "api/latency/latest.json",
            peerHealth: "api/peer-health.json",
            leaderboard: "api/leaderboard.json",
            propagation: "api/propagation.json",
            dnsSeeder: "api/dns-seeder.json",
            coordinates: "api/coordinates.json",
            status: "api/status.json"
        }
    };

    const SOURCE_LABELS = {
        zzxbitnodes: "ZZX Bitnodes (btcnodes.io live mirror)",
        originalbitnodes: "Original Bitnodes (Addy Yeow-style fallback)",
        local: "Legacy local compatibility API",
        external: "External compatible API"
    };

    function depth() {
        return String(document.body?.dataset?.bnDepth || ".").replace(/\/+$/, "") || ".";
    }

    function rootPath(relative) {
        const clean = String(relative || "").replace(/^\/+/, "");
        return `${depth()}/${clean}`.replace(/\/\.(?=\/)/g, "");
    }

    function cacheBust(url) {
        const glue = String(url).includes("?") ? "&" : "?";
        return `${url}${glue}_=${Date.now()}`;
    }

    function sourceId(value) {
        const raw = String(value || "").trim().toLowerCase();
        if (raw === "zzx" || raw === "primary" || raw === "btcnodes") return "zzxbitnodes";
        if (raw === "original" || raw === "fallback") return "originalbitnodes";
        if (raw === "legacy") return "local";
        return raw || DEFAULT_SOURCE;
    }

    function endpoint(source, name) {
        const id = sourceId(source);
        if (id === "external") {
            if (name === "leaderboard") return "https://bitnodes.io/api/v1/nodes/leaderboard/";
            return "https://bitnodes.io/api/v1/snapshots/latest/";
        }

        const defs = ENDPOINTS[id] || ENDPOINTS[DEFAULT_SOURCE];
        const relative = defs[name] || defs.latest;
        return relative ? rootPath(relative) : "";
    }

    function candidates(source, name, extras = []) {
        const id = sourceId(source);
        const out = [];
        const add = value => {
            if (value && !out.includes(value)) out.push(value);
        };

        add(endpoint(id, name));

        if (id === PRIMARY_SOURCE) {
            // Keep old flat API paths as compatibility fallbacks, never as primary.
            const legacy = ENDPOINTS.local[name] || ENDPOINTS.local.latest;
            if (legacy) add(rootPath(legacy));
        }

        if (id === FALLBACK_SOURCE && name !== "latest") {
            add(endpoint(FALLBACK_SOURCE, "latest"));
        }

        for (const extra of extras || []) add(extra);
        return out;
    }

    async function fetchJson(url, options = {}) {
        const controller = new AbortController();
        const timeoutMs = Math.max(1000, Number(options.timeoutMs || 15000));
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(cacheBust(url), {
                cache: "no-store",
                headers: { Accept: "application/json" },
                signal: controller.signal
            });
            if (!response.ok) {
                throw new Error(`${response.status} ${response.statusText}: ${url}`);
            }
            return await response.json();
        } finally {
            clearTimeout(timer);
        }
    }

    async function fetchFirst(urls, options = {}) {
        let lastError = null;
        for (const url of urls) {
            try {
                return {
                    data: await fetchJson(url, options),
                    url
                };
            } catch (err) {
                lastError = err;
            }
        }
        throw lastError || new Error("No Bitnodes data source was available.");
    }

    async function fetchEndpoint(source, name, options = {}) {
        return fetchFirst(candidates(source, name, options.extras || []), options);
    }

    function addressFrom(row, fallback = "") {
        if (!row || typeof row !== "object") return fallback;
        return String(
            row.address || row.node || row.addr || row.endpoint || row.canonical_address ||
            (row.host && row.port ? `${row.host}:${row.port}` : row.host) || fallback || ""
        ).trim();
    }

    function nodeEntries(payload) {
        if (!payload || typeof payload !== "object") return [];

        const containers = [
            payload.nodes,
            payload.reachable_nodes,
            payload.rows,
            payload.results,
            payload.data?.nodes,
            payload.data?.rows,
            payload.data?.results
        ];

        for (const container of containers) {
            if (Array.isArray(container)) {
                return container
                    .map((row, index) => [addressFrom(row, String(index)), row])
                    .filter(([address]) => Boolean(address));
            }
            if (container && typeof container === "object") {
                return Object.entries(container);
            }
        }

        // Classic Bitnodes address -> tuple map.
        const keys = Object.keys(payload);
        const addressish = keys.filter(key => key.includes(":") || key.includes(".onion") || key.includes(".i2p"));
        if (keys.length && addressish.length >= Math.max(1, Math.floor(keys.length / 2))) {
            return Object.entries(payload);
        }
        return [];
    }

    function normalizeNode(address, row) {
        if (Array.isArray(row)) {
            const meta = row[19] && typeof row[19] === "object" ? row[19] : {};
            return {
                address,
                node: address,
                protocol: row[0], protocol_version: row[0],
                agent: row[1], user_agent: row[1],
                connected_since: row[2], services: row[3], height: row[4],
                hostname: row[5], city: row[6], country: row[7], country_code: row[7],
                latitude: row[8], longitude: row[9], lat: row[8], lon: row[9],
                timezone: row[10], asn: row[11], organization: row[12], org: row[12],
                provider: row[13], county: row[14], postal_code: row[15], zip: row[15],
                w3w: row[16], geohash: row[17], metadata: meta,
                reachable: Object.prototype.hasOwnProperty.call(meta, "reachable") ? meta.reachable : true
            };
        }

        const item = row && typeof row === "object" ? row : {};
        const meta = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
        const geo = item.geo && typeof item.geo === "object" ? item.geo : {};
        const resolved = addressFrom(item, address);
        return {
            ...item,
            address: resolved,
            node: resolved,
            protocol: item.protocol ?? item.protocol_version ?? item.version,
            protocol_version: item.protocol_version ?? item.protocol ?? item.version,
            agent: item.agent || item.user_agent || item.subver,
            user_agent: item.user_agent || item.agent || item.subver,
            connected_since: item.connected_since ?? item.timestamp ?? item.seen_at ?? item.last_seen,
            services: item.services ?? item.service_bits,
            height: item.height ?? item.start_height ?? item.latest_height,
            hostname: item.hostname || item.host,
            city: item.city || geo.city || meta.city,
            country: item.country || item.country_code || geo.country || geo.country_code || meta.country,
            country_code: item.country_code || item.country || geo.country_code || geo.country || meta.country,
            latitude: item.latitude ?? item.lat ?? geo.latitude ?? geo.lat ?? meta.latitude,
            longitude: item.longitude ?? item.lon ?? item.lng ?? geo.longitude ?? geo.lon ?? meta.longitude,
            lat: item.lat ?? item.latitude ?? geo.lat ?? geo.latitude ?? meta.latitude,
            lon: item.lon ?? item.lng ?? item.longitude ?? geo.lon ?? geo.longitude ?? meta.longitude,
            timezone: item.timezone || item.tz || geo.timezone || meta.timezone,
            asn: item.asn || item.as_number || geo.asn || meta.asn,
            organization: item.organization || item.org || item.isp || geo.organization || meta.organization || meta.org,
            org: item.org || item.organization || item.isp || geo.organization || meta.org || meta.organization,
            provider: item.provider || geo.provider || meta.provider,
            county: item.county || item.admin2 || geo.county || geo.admin2 || meta.county,
            region: item.region || item.state || item.admin1 || geo.region || geo.state || geo.admin1 || meta.region,
            reachable: Object.prototype.hasOwnProperty.call(item, "reachable") ? item.reachable :
                (Object.prototype.hasOwnProperty.call(meta, "reachable") ? meta.reachable : true),
            metadata: meta
        };
    }

    function normalizeNodes(payload) {
        return nodeEntries(payload).map(([address, row]) => normalizeNode(address, row));
    }

    function timestamp(payload) {
        const value = payload?.updated_at || payload?.generated_at || payload?.created_at ||
            payload?.timestamp || payload?.summary?.updated_at || payload?.summary?.last_crawl_iso;
        if (typeof value === "number") return value < 1e11 ? value * 1000 : value;
        const parsed = Date.parse(String(value || ""));
        return Number.isFinite(parsed) ? parsed : null;
    }

    function ageSeconds(payload) {
        const ts = timestamp(payload);
        return ts === null ? null : Math.max(0, (Date.now() - ts) / 1000);
    }

    function ensureSourceSelect(select) {
        if (!select || select.dataset.bnSemantic !== "source") return;
        const current = sourceId(select.value || DEFAULT_SOURCE);
        select.innerHTML = [
            ["zzxbitnodes", SOURCE_LABELS.zzxbitnodes],
            ["originalbitnodes", SOURCE_LABELS.originalbitnodes],
            ["local", SOURCE_LABELS.local],
            ["external", SOURCE_LABELS.external]
        ].map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
        select.value = ["zzxbitnodes", "originalbitnodes", "local", "external"].includes(current)
            ? current : DEFAULT_SOURCE;
    }

    function initSourceControls() {
        document.querySelectorAll("select#bn-source[data-bn-semantic='source']").forEach(ensureSourceSelect);
    }

    function startAutoRefresh() {
        const button = document.querySelector("#bn-refresh");
        if (!button || button.dataset.bnAutoRefresh === "off") return;

        const intervalMs = Math.max(15000, Number(document.body?.dataset?.bnRefreshMs || 30000));
        let running = false;

        const tick = () => {
            if (running || document.hidden || !document.body.isConnected) return;
            running = true;
            try {
                button.click();
            } finally {
                window.setTimeout(() => { running = false; }, Math.min(5000, intervalMs / 2));
            }
        };

        const timer = window.setInterval(tick, intervalMs);
        window.addEventListener("pagehide", () => window.clearInterval(timer), { once: true });
    }

    document.addEventListener("DOMContentLoaded", () => {
        initSourceControls();
        startAutoRefresh();
    });

    window.BNPageRuntime = {
        version: 3,
        DEFAULT_SOURCE,
        PRIMARY_SOURCE,
        FALLBACK_SOURCE,
        SOURCE_LABELS,
        sourceId,
        endpoint,
        candidates,
        fetchJson,
        fetchFirst,
        fetchEndpoint,
        nodeEntries,
        normalizeNode,
        normalizeNodes,
        timestamp,
        ageSeconds,
        ensureSourceSelect,
        initSourceControls,
        startAutoRefresh
    };
})();
