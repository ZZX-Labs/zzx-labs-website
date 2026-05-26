(() => {
    "use strict";

    const DEFAULT_CACHE_SECONDS = 30;

    const ENDPOINTS = {
        latest: "api/latest.json",
        snapshots: "api/snapshots.json",
        nodes: "api/nodes.json",
        countries: "api/countries.json",
        cities: "api/cities.json",
        asns: "api/asns.json",
        agents: "api/agents.json",
        versions: "api/versions.json",
        ports: "api/ports.json",
        services: "api/services.json",
        organizations: "api/organizations.json",
        tor: "api/tor.json",
        coordinates: "api/coordinates.json",
        latency: "api/latency.json",
        peerHealth: "api/peer-health.json",
        leaderboard: "api/leaderboard.json",
        propagation: "api/propagation.json",
        dnsSeeder: "api/dns-seeder.json",
        status: "api/status.json"
    };

    function getDepth() {
        return document.body.dataset.bnDepth || ".";
    }

    function joinPath(base, path) {
        const cleanBase = String(base || ".").replace(/\/+$/, "");
        const cleanPath = String(path || "").replace(/^\/+/, "");

        return `${cleanBase}/${cleanPath}`;
    }

    function endpoint(name) {
        return joinPath(getDepth(), ENDPOINTS[name] || name);
    }

    function cacheKey(url) {
        return `BNAPI:${url}`;
    }

    function nowSeconds() {
        return Math.floor(Date.now() / 1000);
    }

    function readCache(url, cacheSeconds) {
        if (!cacheSeconds || cacheSeconds <= 0) {
            return null;
        }

        try {
            const raw = sessionStorage.getItem(cacheKey(url));

            if (!raw) {
                return null;
            }

            const cached = JSON.parse(raw);

            if (!cached || !cached.timestamp || cached.payload === undefined) {
                return null;
            }

            if ((nowSeconds() - cached.timestamp) > cacheSeconds) {
                return null;
            }

            return cached.payload;
        } catch (_err) {
            return null;
        }
    }

    function writeCache(url, payload) {
        try {
            sessionStorage.setItem(
                cacheKey(url),
                JSON.stringify({
                    timestamp: nowSeconds(),
                    payload
                })
            );
        } catch (_err) {
            /* Ignore storage failures. */
        }
    }

    async function fetchJSON(url, options = {}) {
        const cacheSeconds =
            options.cacheSeconds === undefined
                ? DEFAULT_CACHE_SECONDS
                : Number(options.cacheSeconds);

        const cached = readCache(url, cacheSeconds);

        if (cached !== null) {
            return cached;
        }

        const response = await fetch(url, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`${response.status} ${response.statusText}: ${url}`);
        }

        const payload = await response.json();

        writeCache(url, payload);

        return payload;
    }

    async function fetchEndpoint(name, options = {}) {
        return fetchJSON(endpoint(name), options);
    }

    function normalizeNodeArray(address, values) {
        const row = Array.isArray(values) ? values : [];

        return {
            address,
            node: address,
            protocol: row[0] ?? null,
            user_agent: row[1] ?? null,
            connected_since: row[2] ?? null,
            services: row[3] ?? null,
            height: row[4] ?? null,
            hostname: row[5] ?? null,
            city: row[6] ?? null,
            country: row[7] ?? null,
            latitude: row[8] ?? null,
            longitude: row[9] ?? null,
            timezone: row[10] ?? null,
            asn: row[11] ?? null,
            organization: row[12] ?? null,
            provider: row[13] ?? null,
            county: row[14] ?? null,
            postal_code: row[15] ?? null,
            tor_status: row[16] ?? null,
            exit_node: row[17] ?? null,
            geohash: row[18] ?? null,
            asn_region: row[19] ?? null,
            network_type: row[20] ?? null,
            hosting_type: row[21] ?? null,
            first_seen: row[22] ?? null,
            last_seen: row[23] ?? null,
            uptime_seconds: row[24] ?? null,
            latency_ms: row[25] ?? null,
            peer_index: row[26] ?? null,
            confidence_score: row[27] ?? null,
            raw: row
        };
    }

    function normalizeNodes(payload) {
        const nodes =
            payload && payload.nodes && typeof payload.nodes === "object"
                ? payload.nodes
                : payload && typeof payload === "object"
                    ? payload
                    : {};

        return Object
            .entries(nodes)
            .map(([address, values]) => normalizeNodeArray(address, values));
    }

    function normalizeLatest(payload) {
        const nodes =
            payload && payload.nodes && typeof payload.nodes === "object"
                ? payload.nodes
                : {};

        const nodeCount = Object.keys(nodes).length;

        return {
            source: payload?.source || "zzx-labs-bitnodes-crawler",
            timestamp: payload?.timestamp || null,
            updated_at: payload?.updated_at || null,
            total_nodes: payload?.total_nodes || nodeCount,
            reachable_nodes: payload?.reachable_nodes || nodeCount,
            known_nodes: payload?.known_nodes || payload?.total_known_nodes || nodeCount,
            unreachable_nodes: payload?.unreachable_nodes || 0,
            latest_height: payload?.latest_height || null,
            countries_count: payload?.countries_count || 0,
            cities_count: payload?.cities_count || 0,
            asns_count: payload?.asns_count || 0,
            tor_nodes: payload?.tor_nodes || 0,
            top_agent: payload?.top_agent || null,
            top_port: payload?.top_port || null,
            changes: payload?.changes || {},
            nodes
        };
    }

    function number(value, fallback = 0) {
        const n = Number(value);

        if (!Number.isFinite(n)) {
            return fallback;
        }

        return n;
    }

    function formatNumber(value) {
        const n = Number(value);

        if (!Number.isFinite(n)) {
            return value === null || value === undefined || value === "" ? "—" : String(value);
        }

        return n.toLocaleString();
    }

    function formatMS(value) {
        const n = Number(value);

        if (!Number.isFinite(n)) {
            return "—";
        }

        return `${n.toLocaleString(undefined, {
            maximumFractionDigits: 2
        })} ms`;
    }

    function formatTime(value) {
        if (!value) {
            return "—";
        }

        const n = Number(value);

        if (Number.isFinite(n)) {
            return new Date(n * 1000).toISOString().replace(".000Z", "Z");
        }

        return String(value);
    }

    function clearCache() {
        Object.keys(sessionStorage)
            .filter(key => key.startsWith("BNAPI:"))
            .forEach(key => sessionStorage.removeItem(key));
    }

    window.BNAPI = {
        endpoints: ENDPOINTS,
        endpoint,
        fetchJSON,
        fetchEndpoint,
        fetchLatest: options => fetchEndpoint("latest", options),
        fetchSnapshots: options => fetchEndpoint("snapshots", options),
        fetchNodes: options => fetchEndpoint("nodes", options),
        fetchCountries: options => fetchEndpoint("countries", options),
        fetchCities: options => fetchEndpoint("cities", options),
        fetchASNs: options => fetchEndpoint("asns", options),
        fetchAgents: options => fetchEndpoint("agents", options),
        fetchVersions: options => fetchEndpoint("versions", options),
        fetchPorts: options => fetchEndpoint("ports", options),
        fetchServices: options => fetchEndpoint("services", options),
        fetchOrganizations: options => fetchEndpoint("organizations", options),
        fetchTor: options => fetchEndpoint("tor", options),
        fetchCoordinates: options => fetchEndpoint("coordinates", options),
        fetchLatency: options => fetchEndpoint("latency", options),
        fetchPeerHealth: options => fetchEndpoint("peerHealth", options),
        fetchLeaderboard: options => fetchEndpoint("leaderboard", options),
        fetchPropagation: options => fetchEndpoint("propagation", options),
        fetchStatus: options => fetchEndpoint("status", options),
        normalizeNodeArray,
        normalizeNodes,
        normalizeLatest,
        number,
        formatNumber,
        formatMS,
        formatTime,
        clearCache
    };
})();