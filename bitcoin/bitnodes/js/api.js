(() => {
    "use strict";

    const BN = window.BN || {};

    const API = {};

    API.cache = new Map();

    API.resolve = function resolve(endpoint) {

        const source =
            BN.state?.source || "local";

        const endpoints =
            BN.endpoints?.[source] || {};

        return endpoints[endpoint] || null;
    };

    API.fetchJson = async function fetchJson(
        url,
        options = {}
    ) {

        if (!url) {
            return null;
        }

        const cacheSeconds =
            Number(options.cacheSeconds || 0);

        const now =
            Date.now();

        const cached =
            API.cache.get(url);

        if (
            cached &&
            cacheSeconds > 0 &&
            (
                now - cached.timestamp
            ) < (
                cacheSeconds * 1000
            )
        ) {

            return cached.data;
        }

        const response =
            await fetch(url, {
                cache: "no-store",
                headers: {
                    "Accept": "application/json"
                }
            });

        if (!response.ok) {

            throw new Error(
                `${response.status} ${response.statusText}`
            );
        }

        const json =
            await response.json();

        API.cache.set(url, {
            timestamp: now,
            data: json
        });

        return json;
    };

    API.fetchEndpoint =
        async function fetchEndpoint(
            endpoint,
            options = {}
        ) {

            const url =
                API.resolve(endpoint);

            return API.fetchJson(
                url,
                options
            );
        };

    API.fetchLatest =
        async function fetchLatest(
            options = {}
        ) {

            return API.fetchEndpoint(
                "latest",
                options
            );
        };

    API.fetchNodes =
        async function fetchNodes(
            options = {}
        ) {

            return API.fetchEndpoint(
                "nodes",
                options
            );
        };

    API.fetchReachable =
        async function fetchReachable(
            options = {}
        ) {

            return API.fetchEndpoint(
                "reachable",
                options
            );
        };

    API.fetchUnreachable =
        async function fetchUnreachable(
            options = {}
        ) {

            return API.fetchEndpoint(
                "unreachable",
                options
            );
        };

    API.fetchCountries =
        async function fetchCountries(
            options = {}
        ) {

            return API.fetchEndpoint(
                "countries",
                options
            );
        };

    API.fetchCities =
        async function fetchCities(
            options = {}
        ) {

            return API.fetchEndpoint(
                "cities",
                options
            );
        };

    API.fetchASNs =
        async function fetchASNs(
            options = {}
        ) {

            return API.fetchEndpoint(
                "asns",
                options
            );
        };

    API.fetchAgents =
        async function fetchAgents(
            options = {}
        ) {

            return API.fetchEndpoint(
                "agents",
                options
            );
        };

    API.fetchVersions =
        async function fetchVersions(
            options = {}
        ) {

            return API.fetchEndpoint(
                "versions",
                options
            );
        };

    API.fetchTor =
        async function fetchTor(
            options = {}
        ) {

            return API.fetchEndpoint(
                "tor",
                options
            );
        };

    API.fetchLatency =
        async function fetchLatency(
            options = {}
        ) {

            return API.fetchEndpoint(
                "latency",
                options
            );
        };

    API.fetchPeerHealth =
        async function fetchPeerHealth(
            options = {}
        ) {

            return API.fetchEndpoint(
                "peerHealth",
                options
            );
        };

    API.fetchLeaderboard =
        async function fetchLeaderboard(
            options = {}
        ) {

            return API.fetchEndpoint(
                "leaderboard",
                options
            );
        };

    API.fetchStatus =
        async function fetchStatus(
            options = {}
        ) {

            return API.fetchEndpoint(
                "status",
                options
            );
        };

    API.fetchDNSSeeder =
        async function fetchDNSSeeder(
            options = {}
        ) {

            return API.fetchEndpoint(
                "dnsSeeder",
                options
            );
        };

    API.fetchCoordinates =
        async function fetchCoordinates(
            options = {}
        ) {

            return API.fetchEndpoint(
                "coordinates",
                options
            );
        };

    API.fetchPropagation =
        async function fetchPropagation(
            options = {}
        ) {

            return API.fetchEndpoint(
                "propagation",
                options
            );
        };

    API.fetchPorts =
        async function fetchPorts(
            options = {}
        ) {

            return API.fetchEndpoint(
                "ports",
                options
            );
        };

    API.fetchProviders =
        async function fetchProviders(
            options = {}
        ) {

            return API.fetchEndpoint(
                "providers",
                options
            );
        };

    API.fetchOrganizations =
        async function fetchOrganizations(
            options = {}
        ) {

            return API.fetchEndpoint(
                "organizations",
                options
            );
        };

    API.fetchServices =
        async function fetchServices(
            options = {}
        ) {

            return API.fetchEndpoint(
                "services",
                options
            );
        };

    API.clearCache =
        function clearCache() {

            API.cache.clear();
        };

    API.refresh =
        async function refresh() {

            API.clearCache();

            return BN.loadHome();
        };

    window.BNAPI = API;

})();