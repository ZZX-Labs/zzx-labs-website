(() => {
    "use strict";

    const STORAGE_KEY = "zzx.bitnodes.datasource";
    const DEFAULT_SOURCE = "zzxbitnodes";

    const COMMON_ENDPOINTS = {
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
    };

    const SOURCE_DEFINITIONS = {
        zzxbitnodes: {
            id: "zzxbitnodes",
            label: "ZZX Bitnodes Global Registry API",
            shortLabel: "ZZX Global Registry",
            description: "Default ZZX-Labs persistent global Bitnodes crawler registry with rolling 24h reachable-state memory, archive replay, GeoIP enrichment, private registry backups, and static public JSON exports.",
            basePath: "./api/zzxbitnodes",
            statusClass: "",
            endpoints: { ...COMMON_ENDPOINTS }
        },

        originalbitnodes: {
            id: "originalbitnodes",
            label: "Original Bitnodes API",
            shortLabel: "Original Bitnodes",
            description: "Original Bitnodes-compatible crawler output preserved for Addy Yeow attribution, comparison, public API continuity, and upstream-style crawler behavior.",
            basePath: "./api/originalbitnodes",
            statusClass: "is-warning",
            endpoints: { ...COMMON_ENDPOINTS }
        },

        local: {
            id: "local",
            label: "Legacy Local API",
            shortLabel: "Legacy Local",
            description: "Legacy flat local API retained for older widgets and backwards compatibility.",
            basePath: "./api",
            statusClass: "is-warning",
            endpoints: { ...COMMON_ENDPOINTS }
        },

        legacy: {
            id: "legacy",
            aliasFor: "local",
            label: "Legacy Local API",
            shortLabel: "Legacy Local",
            description: "Alias for Legacy Local API.",
            basePath: "./api",
            statusClass: "is-warning",
            endpoints: { ...COMMON_ENDPOINTS }
        },

        external: {
            id: "external",
            label: "External Bitnodes Compatible URL API",
            shortLabel: "External Compatible API",
            description: "External Bitnodes-compatible network source for third-party crawlers using the same API URL formatting. Local mirror analytics may be limited depending on CORS and endpoint availability.",
            basePath: "https://bitnodes.io/api/v1",
            statusClass: "is-warning",
            endpoints: {
                latest: "snapshots/latest/",
                snapshots: "snapshots/",
                nodes: "snapshots/latest/",
                reachable: "",
                unreachable: "",
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

    const SELECTABLE_SOURCES = [
        "zzxbitnodes",
        "originalbitnodes",
        "local",
        "external"
    ];

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

    function canonicalSourceId(source) {
        const raw = String(source || "").trim();

        if (!raw || !SOURCE_DEFINITIONS[raw]) {
            return DEFAULT_SOURCE;
        }

        return SOURCE_DEFINITIONS[raw].aliasFor || raw;
    }

    function getSource(source) {
        return SOURCE_DEFINITIONS[canonicalSourceId(source)] || SOURCE_DEFINITIONS[DEFAULT_SOURCE];
    }

    function resolveBasePath(basePath) {
        const raw = String(basePath || "").trim();

        if (!raw) {
            return "";
        }

        if (isAbsoluteUrl(raw)) {
            return raw.replace(/\/+$/, "");
        }

        if (raw.startsWith("./")) {
            return `${cleanDepth(getDepth())}/${raw.slice(2)}`.replace(/\/+$/, "");
        }

        if (raw.startsWith("../")) {
            return `${cleanDepth(getDepth())}/${raw}`.replace(/\/+$/, "");
        }

        if (raw.startsWith("/")) {
            return raw.replace(/\/+$/, "");
        }

        return `${cleanDepth(getDepth())}/${raw.replace(/^\/+/, "")}`.replace(/\/+$/, "");
    }

    function endpointUrl(source, endpointName) {
        const definition = getSource(source);
        const leaf = definition.endpoints?.[endpointName];

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

        Object.keys(definition.endpoints || {}).forEach(key => {
            output[key] = endpointUrl(definition.id, key);
        });

        return output;
    }

    function clearLegacySavedDefault() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);

            if (
                saved === "local" ||
                saved === "legacy" ||
                saved === "external" ||
                saved === "originalbitnodes"
            ) {
                localStorage.removeItem(STORAGE_KEY);
            }
        } catch (_err) {
        }
    }

    function saveSource(source) {
        try {
            localStorage.setItem(STORAGE_KEY, canonicalSourceId(source));
        } catch (_err) {
        }
    }

    function getCurrentSourceId(options = {}) {
        const forceDefault =
            options.forceDefault === true ||
            document.body?.dataset?.bnForceDefaultSource === "true";

        if (forceDefault) {
            return DEFAULT_SOURCE;
        }

        const select = document.querySelector("#bn-source");

        if (select?.value && SOURCE_DEFINITIONS[select.value]) {
            return canonicalSourceId(select.value);
        }

        const bodySource = document.body?.dataset?.bnSource;

        if (bodySource && SOURCE_DEFINITIONS[bodySource]) {
            return canonicalSourceId(bodySource);
        }

        return DEFAULT_SOURCE;
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

        select.innerHTML = SELECTABLE_SOURCES.map(id => {
            const source = getSource(id);

            return `
                <option value="${source.id}">
                    ${source.label}
                </option>
            `;
        }).join("");

        select.value = DEFAULT_SOURCE;
    }

    function applySource(sourceId, options = {}) {
        const definition = getSource(sourceId || DEFAULT_SOURCE);
        const endpoints = buildEndpointMap(definition.id);
        const select = document.querySelector("#bn-source");

        document.body.dataset.bnSource = definition.id;

        if (select && select.value !== definition.id) {
            select.value = definition.id;
        }

        if (options.persist !== false) {
            saveSource(definition.id);
        }

        setStatus(definition.id);

        window.BNDataSource.current = definition.id;
        window.BNDataSource.definition = definition;
        window.BNDataSource.endpoints = endpoints;

        if (window.BNAPI?.setSource) {
            window.BNAPI.setSource(definition.id, endpoints);
        }

        if (window.BN?.setState) {
            window.BN.setState({
                source: definition.id,
                endpoints
            });
        } else if (window.BN) {
            window.BN.state = window.BN.state || {};
            window.BN.state.source = definition.id;
            window.BN.state.endpoints = endpoints;
        }

        if (!options.silent) {
            document.dispatchEvent(
                new CustomEvent("bn:datasource-change", {
                    detail: {
                        source: definition.id,
                        definition,
                        endpoints
                    }
                })
            );
        }

        return definition;
    }

    function refreshCurrentSource() {
        const source = getCurrentSourceId();
        const definition = applySource(source, {
            silent: true
        });

        const endpoints = buildEndpointMap(definition.id);

        document.dispatchEvent(
            new CustomEvent("bn:datasource-refresh", {
                detail: {
                    source: definition.id,
                    definition,
                    endpoints
                }
            })
        );
    }

    function wireControls() {
        const select = document.querySelector("#bn-source");
        const refresh = document.querySelector("#bn-refresh");

        if (select && !select.dataset.bnDatasourceWired) {
            select.dataset.bnDatasourceWired = "1";

            select.addEventListener("change", () => {
                applySource(select.value, {
                    persist: true
                });
            });
        }

        if (refresh && !refresh.dataset.bnDatasourceWired) {
            refresh.dataset.bnDatasourceWired = "1";

            refresh.addEventListener("click", () => {
                refreshCurrentSource();
            });
        }
    }

    function init() {
        clearLegacySavedDefault();

        document.body.dataset.bnSource = DEFAULT_SOURCE;

        populateSelect();

        applySource(DEFAULT_SOURCE, {
            silent: true,
            persist: false
        });

        wireControls();
    }

    window.BNDataSource = {
        sources: SOURCE_DEFINITIONS,
        selectableSources: SELECTABLE_SOURCES,
        defaultSource: DEFAULT_SOURCE,
        current: DEFAULT_SOURCE,
        definition: SOURCE_DEFINITIONS[DEFAULT_SOURCE],
        endpoints: buildEndpointMap(DEFAULT_SOURCE),
        init,
        applySource,
        refreshCurrentSource,
        getSource,
        canonicalSourceId,
        getCurrentSourceId,
        endpointUrl,
        buildEndpointMap,
        resolveBasePath
    };
})();
