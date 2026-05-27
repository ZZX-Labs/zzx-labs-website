(() => {
    "use strict";

    const STORAGE_KEY = "zzx.bitnodes.datasource";

    const SOURCE_DEFINITIONS = {
        zzxbitnodes: {
            id: "zzxbitnodes",
            label: "ZZX Bitnodes Global Registry",
            description: "Persistent ZZX-Labs crawler with rolling 24h reachable-state memory, archive replay, GeoIP enrichment, and registry analytics.",
            basePath: "./api/zzxbitnodes",
            statusClass: "",
            endpoints: {
                latest: "latest.json",
                snapshots: "snapshots.json",
                nodes: "nodes.json",
                reachable: "reachable.json",
                unreachable: "unreachable.json",
                leaderboard: "leaderboard.json",
                latency: "latency.json",
                peerHealth: "peer-health.json",
                countries: "countries.json",
                cities: "cities.json",
                asns: "asns.json",
                agents: "agents.json",
                versions: "versions.json",
                ports: "ports.json",
                services: "services.json",
                organizations: "organizations.json",
                providers: "providers.json",
                tor: "tor.json",
                coordinates: "coordinates.json",
                propagation: "propagation.json",
                dnsSeeder: "dns-seeder.json",
                status: "status.json"
            }
        },

        originalbitnodes: {
            id: "originalbitnodes",
            label: "Original Bitnodes Compatible",
            description: "Conservative upstream-style crawler output for comparison with the ZZX global registry.",
            basePath: "./api/originalbitnodes",
            statusClass: "is-warning",
            endpoints: {
                latest: "latest.json",
                snapshots: "snapshots.json",
                nodes: "nodes.json",
                reachable: "reachable.json",
                unreachable: "unreachable.json",
                leaderboard: "leaderboard.json",
                latency: "latency.json",
                peerHealth: "peer-health.json",
                countries: "countries.json",
                cities: "cities.json",
                asns: "asns.json",
                agents: "agents.json",
                versions: "versions.json",
                ports: "ports.json",
                services: "services.json",
                organizations: "organizations.json",
                providers: "providers.json",
                tor: "tor.json",
                coordinates: "coordinates.json",
                propagation: "propagation.json",
                dnsSeeder: "dns-seeder.json",
                status: "status.json"
            }
        },

        local: {
            id: "local",
            label: "Legacy Local API",
            description: "Legacy flat Bitnodes API path retained for older widgets and backwards compatibility.",
            basePath: "./api",
            statusClass: "is-warning",
            endpoints: {
                latest: "latest.json",
                snapshots: "snapshots.json",
                nodes: "nodes.json",
                reachable: "reachable.json",
                unreachable: "unreachable.json",
                leaderboard: "leaderboard.json",
                latency: "latency.json",
                peerHealth: "peer-health.json",
                countries: "countries.json",
                cities: "cities.json",
                asns: "asns.json",
                agents: "agents.json",
                versions: "versions.json",
                ports: "ports.json",
                services: "services.json",
                organizations: "organizations.json",
                providers: "providers.json",
                tor: "tor.json",
                coordinates: "coordinates.json",
                propagation: "propagation.json",
                dnsSeeder: "dns-seeder.json",
                status: "status.json"
            }
        },

        external: {
            id: "external",
            label: "External Compatible API",
            description: "External Bitnodes-compatible network source. Some local analytics may be unavailable.",
            basePath: "https://bitnodes.io/api/v1",
            statusClass: "is-warning",
            endpoints: {
                latest: "snapshots/latest/",
                snapshots: "snapshots/",
                nodes: "snapshots/latest/",
                leaderboard: "nodes/leaderboard/",
                latency: "",
                peerHealth: "",
                countries: "",
                cities: "",
                asns: "",
                agents: "",
                versions: "",
                ports: "",
                services: "",
                organizations: "",
                providers: "",
                tor: "",
                coordinates: "",
                propagation: "",
                dnsSeeder: "",
                status: ""
            }
        }
    };

    function getDepth() {
        return document.body?.dataset?.bnDepth || ".";
    }

    function cleanDepth(depth) {
        return String(depth || ".").replace(/\/+$/, "") || ".";
    }

    function isAbsoluteUrl(value) {
        return /^https?:\/\//i.test(String(value || ""));
    }

    function joinPath(base, leaf) {
        const cleanBase = String(base || "").replace(/\/+$/, "");
        const cleanLeaf = String(leaf || "").replace(/^\/+/, "");

        if (!cleanBase || !cleanLeaf) {
            return cleanBase || cleanLeaf || "";
        }

        return `${cleanBase}/${cleanLeaf}`;
    }

    function resolveBasePath(basePath) {
        if (isAbsoluteUrl(basePath)) {
            return basePath.replace(/\/+$/, "");
        }

        if (String(basePath || "").startsWith("./")) {
            return `${cleanDepth(getDepth())}/${String(basePath).slice(2)}`.replace(/\/+$/, "");
        }

        return `${cleanDepth(getDepth())}/${String(basePath || "").replace(/^\/+/, "")}`.replace(/\/+$/, "");
    }

    function endpointUrl(source, endpointName) {
        const definition = getSource(source);
        const leaf = definition.endpoints[endpointName];

        if (!leaf) {
            return "";
        }

        if (isAbsoluteUrl(leaf)) {
            return leaf;
        }

        return joinPath(resolveBasePath(definition.basePath), leaf);
    }

    function buildEndpointMap(source) {
        const definition = getSource(source);
        const output = {};

        Object.keys(definition.endpoints).forEach(key => {
            output[key] = endpointUrl(definition.id, key);
        });

        return output;
    }

    function getSavedSource() {
        try {
            return localStorage.getItem(STORAGE_KEY);
        } catch (_err) {
            return null;
        }
    }

    function saveSource(source) {
        try {
            localStorage.setItem(STORAGE_KEY, source);
        } catch (_err) {
        }
    }

    function getSource(source) {
        const key = source && SOURCE_DEFINITIONS[source]
            ? source
            : "zzxbitnodes";

        return SOURCE_DEFINITIONS[key];
    }

    function getCurrentSourceId() {
        const select = document.querySelector("#bn-source");

        if (select && SOURCE_DEFINITIONS[select.value]) {
            return select.value;
        }

        const bodySource = document.body?.dataset?.bnSource;

        if (bodySource && SOURCE_DEFINITIONS[bodySource]) {
            return bodySource;
        }

        const saved = getSavedSource();

        if (saved && SOURCE_DEFINITIONS[saved]) {
            return saved;
        }

        return "zzxbitnodes";
    }

    function setStatus(sourceId) {
        const status = document.querySelector("#bn-source-status");
        const definition = getSource(sourceId);

        if (!status) {
            return;
        }

        status.classList.remove("is-warning", "is-error");

        if (definition.statusClass) {
            status.classList.add(definition.statusClass);
        }

        status.textContent = `Source: ${definition.label}`;
        status.title = definition.description;
    }

    function populateSelect() {
        const select = document.querySelector("#bn-source");

        if (!select) {
            return;
        }

        const current = getCurrentSourceId();

        select.innerHTML = Object.values(SOURCE_DEFINITIONS).map(source => `
            <option value="${source.id}">
                ${source.label}
            </option>
        `).join("");

        select.value = SOURCE_DEFINITIONS[current] ? current : "zzxbitnodes";
    }

    function applySource(sourceId, options = {}) {
        const definition = getSource(sourceId);
        const select = document.querySelector("#bn-source");

        document.body.dataset.bnSource = definition.id;

        if (select && select.value !== definition.id) {
            select.value = definition.id;
        }

        saveSource(definition.id);
        setStatus(definition.id);

        window.BNDataSource.current = definition.id;
        window.BNDataSource.definition = definition;
        window.BNDataSource.endpoints = buildEndpointMap(definition.id);

        if (window.BNAPI && typeof window.BNAPI.setSource === "function") {
            window.BNAPI.setSource(definition.id, window.BNDataSource.endpoints);
        }

        if (!options.silent) {
            document.dispatchEvent(
                new CustomEvent(
                    "bn:datasource-change",
                    {
                        detail: {
                            source: definition.id,
                            definition,
                            endpoints: window.BNDataSource.endpoints
                        }
                    }
                )
            );
        }

        return definition;
    }

    function wireControls() {
        const select = document.querySelector("#bn-source");
        const refresh = document.querySelector("#bn-refresh");

        if (select && !select.dataset.bnDatasourceWired) {
            select.dataset.bnDatasourceWired = "1";

            select.addEventListener("change", () => {
                applySource(select.value);

                if (window.BNCore && typeof window.BNCore.reload === "function") {
                    window.BNCore.reload();
                } else if (window.BNCore && typeof window.BNCore.init === "function") {
                    window.BNCore.init();
                }
            });
        }

        if (refresh && !refresh.dataset.bnDatasourceWired) {
            refresh.dataset.bnDatasourceWired = "1";

            refresh.addEventListener("click", () => {
                applySource(getCurrentSourceId(), { silent: true });

                document.dispatchEvent(
                    new CustomEvent(
                        "bn:datasource-refresh",
                        {
                            detail: {
                                source: getCurrentSourceId(),
                                endpoints: window.BNDataSource.endpoints
                            }
                        }
                    )
                );

                if (window.BNCore && typeof window.BNCore.reload === "function") {
                    window.BNCore.reload();
                } else if (window.BNCore && typeof window.BNCore.init === "function") {
                    window.BNCore.init();
                }
            });
        }
    }

    function init() {
        populateSelect();
        applySource(getCurrentSourceId(), { silent: true });
        wireControls();
    }

    window.BNDataSource = {
        sources: SOURCE_DEFINITIONS,
        current: "zzxbitnodes",
        definition: SOURCE_DEFINITIONS.zzxbitnodes,
        endpoints: buildEndpointMap("zzxbitnodes"),
        init,
        applySource,
        getSource,
        getCurrentSourceId,
        endpointUrl,
        buildEndpointMap,
        resolveBasePath
    };
})();
