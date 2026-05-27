(() => {
    "use strict";

    const BN = window.BN || {};

    const API = window.BNAPI || {};

    const DEFAULT_ENDPOINTS = {
        latest: "./api/zzxbitnodes/latest.json",
        snapshots: "./api/zzxbitnodes/snapshots.json",
        nodes: "./api/zzxbitnodes/nodes.json",
        reachable: "./api/zzxbitnodes/reachable.json",
        unreachable: "./api/zzxbitnodes/unreachable.json",
        leaderboard: "./api/zzxbitnodes/leaderboard.json",
        latency: "./api/zzxbitnodes/latency.json",
        peerHealth: "./api/zzxbitnodes/peer-health.json",
        countries: "./api/zzxbitnodes/countries.json",
        cities: "./api/zzxbitnodes/cities.json",
        asns: "./api/zzxbitnodes/asns.json",
        agents: "./api/zzxbitnodes/agents.json",
        versions: "./api/zzxbitnodes/versions.json",
        ports: "./api/zzxbitnodes/ports.json",
        services: "./api/zzxbitnodes/services.json",
        organizations: "./api/zzxbitnodes/organizations.json",
        providers: "./api/zzxbitnodes/providers.json",
        tor: "./api/zzxbitnodes/tor.json",
        coordinates: "./api/zzxbitnodes/coordinates.json",
        propagation: "./api/zzxbitnodes/propagation.json",
        dnsSeeder: "./api/zzxbitnodes/dns-seeder.json",
        status: "./api/zzxbitnodes/status.json"
    };

    API.cache = API.cache || new Map();

    API.source = API.source || "zzxbitnodes";

    API.endpoints = API.endpoints || { ...DEFAULT_ENDPOINTS };

    API.number = function number(value, fallback = null) {
        if (BN.number) {
            return BN.number(value, fallback);
        }

        const n = Number(value);

        return Number.isFinite(n) ? n : fallback;
    };

    API.formatNumber = function formatNumber(value) {
        if (BN.formatNumber) {
            return BN.formatNumber(value);
        }

        const n = Number(value);

        return Number.isFinite(n) ? n.toLocaleString() : "—";
    };

    API.formatMS = function formatMS(value) {
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
    };

    API.setSource = function setSource(source, endpoints = {}) {
        API.source = source || "zzxbitnodes";
        API.endpoints = {
            ...DEFAULT_ENDPOINTS,
            ...(endpoints || {})
        };

        if (BN.setState) {
            BN.setState({
                source: API.source,
                endpoints: API.endpoints
            });
        } else {
            BN.state = BN.state || {};
            BN.state.source = API.source;
            BN.state.endpoints = API.endpoints;
        }

        return API.endpoints;
    };

    API.getSource = function getSource() {
        if (window.BNDataSource?.getCurrentSourceId) {
            return window.BNDataSource.getCurrentSourceId();
        }

        return API.source || BN.state?.source || "zzxbitnodes";
    };

    API.getEndpoints = function getEndpoints() {
        if (window.BNDataSource?.buildEndpointMap) {
            const endpoints = window.BNDataSource.buildEndpointMap(API.getSource());

            API.endpoints = {
                ...DEFAULT_ENDPOINTS,
                ...endpoints
            };

            return API.endpoints;
        }

        return API.endpoints || DEFAULT_ENDPOINTS;
    };

    API.resolve = function resolve(endpoint) {
        if (!endpoint) {
            return "";
        }

        if (/^https?:\/\//i.test(String(endpoint))) {
            return endpoint;
        }

        const endpoints = API.getEndpoints();

        return endpoints[endpoint] || "";
    };

    API.fetchJson = async function fetchJson(url, options = {}) {
        if (!url) {
            return null;
        }

        const cacheSeconds = Number(options.cacheSeconds || 0);
        const now = Date.now();
        const cached = API.cache.get(url);

        if (
            cached &&
            cacheSeconds > 0 &&
            now - cached.timestamp < cacheSeconds * 1000
        ) {
            return cached.data;
        }

        const response = await fetch(url, {
            cache: "no-store",
            headers: {
                Accept: "application/json"
            }
        });

        if (!response.ok) {
            throw new Error(`${response.status} ${response.statusText}: ${url}`);
        }

        const json = await response.json();

        API.cache.set(url, {
            timestamp: now,
            data: json
        });

        return json;
    };

    API.fetchEndpoint = async function fetchEndpoint(endpoint, options = {}) {
        const url = API.resolve(endpoint);

        if (!url) {
            return null;
        }

        return API.fetchJson(url, options);
    };

    API.fetchEndpointSafe = async function fetchEndpointSafe(endpoint, options = {}) {
        try {
            return await API.fetchEndpoint(endpoint, options);
        } catch (err) {
            console.warn(`BNAPI optional endpoint failed: ${endpoint}`, err);
            return null;
        }
    };

    API.fetchLatest = function fetchLatest(options = {}) {
        return API.fetchEndpoint("latest", options);
    };

    API.fetchSnapshots = function fetchSnapshots(options = {}) {
        return API.fetchEndpoint("snapshots", options);
    };

    API.fetchNodes = function fetchNodes(options = {}) {
        return API.fetchEndpoint("nodes", options);
    };

    API.fetchReachable = function fetchReachable(options = {}) {
        return API.fetchEndpoint("reachable", options);
    };

    API.fetchUnreachable = function fetchUnreachable(options = {}) {
        return API.fetchEndpoint("unreachable", options);
    };

    API.fetchCountries = function fetchCountries(options = {}) {
        return API.fetchEndpoint("countries", options);
    };

    API.fetchCities = function fetchCities(options = {}) {
        return API.fetchEndpoint("cities", options);
    };

    API.fetchASNs = function fetchASNs(options = {}) {
        return API.fetchEndpoint("asns", options);
    };

    API.fetchAgents = function fetchAgents(options = {}) {
        return API.fetchEndpoint("agents", options);
    };

    API.fetchVersions = function fetchVersions(options = {}) {
        return API.fetchEndpoint("versions", options);
    };

    API.fetchPorts = function fetchPorts(options = {}) {
        return API.fetchEndpoint("ports", options);
    };

    API.fetchServices = function fetchServices(options = {}) {
        return API.fetchEndpoint("services", options);
    };

    API.fetchTor = function fetchTor(options = {}) {
        return API.fetchEndpoint("tor", options);
    };

    API.fetchLatency = function fetchLatency(options = {}) {
        return API.fetchEndpoint("latency", options);
    };

    API.fetchPeerHealth = function fetchPeerHealth(options = {}) {
        return API.fetchEndpoint("peerHealth", options);
    };

    API.fetchLeaderboard = function fetchLeaderboard(options = {}) {
        return API.fetchEndpoint("leaderboard", options);
    };

    API.fetchStatus = function fetchStatus(options = {}) {
        return API.fetchEndpoint("status", options);
    };

    API.fetchDNSSeeder = function fetchDNSSeeder(options = {}) {
        return API.fetchEndpoint("dnsSeeder", options);
    };

    API.fetchCoordinates = function fetchCoordinates(options = {}) {
        return API.fetchEndpoint("coordinates", options);
    };

    API.fetchPropagation = function fetchPropagation(options = {}) {
        return API.fetchEndpoint("propagation", options);
    };

    API.fetchProviders = function fetchProviders(options = {}) {
        return API.fetchEndpoint("providers", options);
    };

    API.fetchOrganizations = function fetchOrganizations(options = {}) {
        return API.fetchEndpoint("organizations", options);
    };

    API.normalizeLatest = function normalizeLatest(payload) {
        if (BN.normalizeLatest) {
            return BN.normalizeLatest(payload);
        }

        const nodes =
            payload?.nodes && typeof payload.nodes === "object"
                ? payload.nodes
                : {};

        const rows = Array.isArray(payload?.rows) ? payload.rows : null;
        const count = rows?.length || Object.keys(nodes).length;

        return {
            source: payload?.source || payload?.crawler || API.getSource(),
            updated_at: payload?.updated_at || payload?.timestamp || payload?.created_at || null,
            total_nodes: payload?.total_nodes || count,
            known_nodes: payload?.known_nodes || payload?.total_known_nodes || payload?.total_nodes || count,
            reachable_nodes: payload?.reachable_nodes || payload?.total_nodes || count,
            unreachable_nodes: payload?.unreachable_nodes || 0,
            latest_height: payload?.latest_height || payload?.height || 0,
            tor_nodes: payload?.tor_nodes || payload?.onion_nodes || 0,
            countries_count: payload?.countries_count || payload?.country_count || 0,
            cities_count: payload?.cities_count || payload?.city_count || 0,
            asns_count: payload?.asns_count || payload?.asn_count || 0,
            rows,
            nodes,
            raw: payload
        };
    };

    API.clearCache = function clearCache() {
        API.cache.clear();
    };

    API.refresh = async function refresh() {
        API.clearCache();

        if (window.BNCore?.reload) {
            return window.BNCore.reload();
        }

        if (window.BNCore?.loadHome) {
            return window.BNCore.loadHome();
        }

        return null;
    };

    document.addEventListener("bn:datasource-change", event => {
        API.clearCache();

        if (event?.detail?.source && event?.detail?.endpoints) {
            API.setSource(event.detail.source, event.detail.endpoints);
        }
    });

    window.BNAPI = API;
})();
