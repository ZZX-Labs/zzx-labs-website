(() => {
    "use strict";

    const DEFAULT_REFRESH_MS = 30000;

    const TILE_PROVIDERS = {
        cartodb_dark: {
            url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
            attribution: "© OpenStreetMap contributors © CARTO",
            subdomains: "abcd",
            minZoom: 2,
            maxZoom: 20
        },
        cartodb_dark_nolabels: {
            url: "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
            attribution: "© OpenStreetMap contributors © CARTO",
            subdomains: "abcd",
            minZoom: 2,
            maxZoom: 20
        },
        cartodb_light: {
            url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
            attribution: "© OpenStreetMap contributors © CARTO",
            subdomains: "abcd",
            minZoom: 2,
            maxZoom: 20
        },
        cartodb_voyager: {
            url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
            attribution: "© OpenStreetMap contributors © CARTO",
            subdomains: "abcd",
            minZoom: 2,
            maxZoom: 20
        },
        osm_standard: {
            url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            attribution: "© OpenStreetMap contributors",
            subdomains: "abc",
            minZoom: 2,
            maxZoom: 19
        },
        esri_satellite: {
            url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            attribution: "Tiles © Esri",
            subdomains: "",
            minZoom: 2,
            maxZoom: 19
        }
    };

    const BLIP_LEGEND = {
        duplicate: {
            color: "#d95c5c",
            label: "Duplicate IP / Multiple Nodes at Location"
        },
        unsynced: {
            color: "#8b5a2b",
            label: "Not Yet Synced"
        },
        synced_lt_10m: {
            color: "#e6a42b",
            label: "Synced / Uptime Less Than 10m"
        },
        synced_gt_10m: {
            color: "#f1e26b",
            label: "Synced / Uptime Over 10m"
        },
        synced_gt_48h: {
            color: "#c0d674",
            label: "Synced / Uptime Over 48h"
        },
        synced_gt_1w: {
            color: "#ffd36a",
            label: "Synced / Uptime Over 1 Week"
        },
        i2p: {
            color: "#6fffe9",
            label: "I2P Node"
        },
        tor: {
            color: "#9d67ad",
            label: "Tor Node"
        },
        vpn: {
            color: "#70b7ff",
            label: "Suspected VPN Node"
        },
        proxy: {
            color: "#ff77c8",
            label: "Suspected Proxy Node"
        },
        unreachable: {
            color: "#1b1f1b",
            label: "Node Became Unreachable"
        },
        unknown: {
            color: "#8c927e",
            label: "Unknown / Unclassified"
        }
    };

    const DEFAULT_OPTIONS = {
        mode: "map",
        refreshMs: 0,
        rootSelector: "[data-map-root]",
        statusSelector: "#bn-map-status",
        hudSelector: "#bn-map-hud",
        legendSelector: "#bn-map-legend",
        nodePanelSelector: "#bn-map-node-panel",
        themeSelectSelector: "[data-map-theme-select]",
        settingsSelectSelector: "[data-map-settings-select]",
        resetSelector: "[data-map-reset]",
        filterSelector: "[data-map-filter]",
        autoInitViews: [
            "map",
            "maps",
            "live-map"
        ],
        paths: {
            settings: [
                "./data/map-settings.json",
                "./zzxbitnodes/data/map-settings.json",
                "./global/data/map-settings.json",
                "./originalbitnodes/data/map-settings.json",
                "../maps/data/map-settings.json",
                "../maps/zzxbitnodes/data/map-settings.json",
                "../maps/global/data/map-settings.json",
                "../maps/originalbitnodes/data/map-settings.json"
            ],
            vectors: [
                "./data/map-points.geojson",
            
                "./zzxbitnodes/data/map-points.geojson",
                "./global/data/map-points.geojson",
                "./originalbitnodes/data/map-points.geojson",
            
                "./zzxbitnodes/points.json",
                "./global/points.json",
                "./originalbitnodes/points.json",
            
                "./zzxbitnodes/live-map.json",
                "./global/live-map.json",
                "./originalbitnodes/live-map.json",
            
                "./zzxbitnodes/nodes.geojson",
                "./global/nodes.geojson",
                "./originalbitnodes/nodes.geojson",
            
                "../maps/zzxbitnodes/data/map-points.geojson",
                "../maps/global/data/map-points.geojson",
                "../maps/originalbitnodes/data/map-points.geojson",
                "../maps/data/map-points.geojson"
            ],
            vectorManifest: [
                "./data/map-vectors.json",
                "./zzxbitnodes/data/map-vectors.json",
                "./global/data/map-vectors.json",
                "./originalbitnodes/data/map-vectors.json",
                "../maps/data/map-vectors.json"
            ],
            themes: [
                "./data/map-themes.json",
                "./zzxbitnodes/data/map-themes.json",
                "./global/data/map-themes.json",
                "./originalbitnodes/data/map-themes.json",
                "../maps/data/map-themes.json"
            ],
            theme: id => [
                `./data/themes/${id}.json`,
                `./zzxbitnodes/data/themes/${id}.json`,
                `./global/data/themes/${id}.json`,
                `./originalbitnodes/data/themes/${id}.json`,
                `../maps/data/themes/${id}.json`,
                "./data/map-theme.json",
                "../maps/data/map-theme.json"
            ],
            settingsProfiles: [
                "./data/map-settings-profiles.json",
                "./zzxbitnodes/data/map-settings-profiles.json",
                "./global/data/map-settings-profiles.json",
                "./originalbitnodes/data/map-settings-profiles.json",
                "../maps/data/map-settings-profiles.json"
            ],
            settingsProfile: id => [
                `./data/settings/${id}.json`,
                `./zzxbitnodes/data/settings/${id}.json`,
                `./global/data/settings/${id}.json`,
                `./originalbitnodes/data/settings/${id}.json`,
                `../maps/data/settings/${id}.json`
            ],
            polygons: [
                "./data/map-polygons.geojson",
                "./zzxbitnodes/data/map-polygons.geojson",
                "./global/data/map-polygons.geojson",
                "./originalbitnodes/data/map-polygons.geojson",
                "../maps/data/map-polygons.geojson"
            ],
            tileProviders: [
                "./data/map-tile-providers.json",
                "./zzxbitnodes/data/map-tile-providers.json",
                "./global/data/map-tile-providers.json",
                "./originalbitnodes/data/map-tile-providers.json",
                "../maps/data/map-tile-providers.json"
            ]
        }
    };

    const state = {
        options: null,
        map: null,
        tileLayer: null,
        canvasRenderer: null,
        layers: {
            points: null,
            polygons: null
        },
        vectors: null,
        settings: null,
        theme: null,
        themes: null,
        settingsProfiles: null,
        tileProviders: null,
        filter: "all",
        timer: null,
        lastPointIds: new Set(),
        latestSource: "unknown",
        initialized: false
    };

    function qs(selector, scope = document) {
        return scope.querySelector(selector);
    }

    function qsa(selector, scope = document) {
        return Array.from(scope.querySelectorAll(selector));
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function number(value, fallback = 0) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function setStatus(message, mode = "live") {
        const target = qs(state.options?.statusSelector || "#bn-map-status");

        if (!target) {
            return;
        }

        target.className = `bn-map-status ${mode}`.trim();
        target.textContent = message;
    }

    function cacheBust(path) {
        const sep = String(path).includes("?") ? "&" : "?";
        return `${path}${sep}t=${Date.now()}`;
    }

    function loadLeaflet() {
        return new Promise((resolve, reject) => {
            if (window.L) {
                resolve();
                return;
            }

            const cssExists = qsa("link").some(link => {
                return String(link.href || "").includes("leaflet");
            });

            if (!cssExists) {
                const css = document.createElement("link");
                css.rel = "stylesheet";
                css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
                document.head.appendChild(css);
            }

            const script = document.createElement("script");
            script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
            script.onload = resolve;
            script.onerror = () => reject(new Error("Failed to load Leaflet."));
            document.head.appendChild(script);
        });
    }

    async function readJson(path) {
        const response = await fetch(cacheBust(path), {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`${path}: ${response.status}`);
        }

        state.latestSource = path;

        return response.json();
    }

    async function readFirst(paths, validator = null) {
        let lastError = null;

        for (const path of paths || []) {
            try {
                const data = await readJson(path);

                if (!validator || validator(data)) {
                    return data;
                }
            } catch (err) {
                lastError = err;
            }
        }

        throw lastError || new Error("No usable JSON source paths found.");
    }

    function deepMerge(base, patch) {
        const output = { ...(base || {}) };

        Object.entries(patch || {}).forEach(([key, value]) => {
            if (
                value &&
                typeof value === "object" &&
                !Array.isArray(value) &&
                output[key] &&
                typeof output[key] === "object" &&
                !Array.isArray(output[key])
            ) {
                output[key] = deepMerge(output[key], value);
                return;
            }

            output[key] = value;
        });

        return output;
    }

    function countBy(rows, fn) {
        const out = {};

        for (const row of rows || []) {
            const key = String(fn(row) || "unknown").toLowerCase();
            out[key] = (out[key] || 0) + 1;
        }

        return out;
    }

    function uniqueCount(rows, fn) {
        return new Set((rows || []).map(fn).filter(Boolean)).size;
    }

    function pointAddress(point) {
        return point.address || point.node || point.addr || point.ip || point.id || "";
    }

    function pointNetwork(point) {
        const address = String(pointAddress(point)).toLowerCase();
        const network = String(point.network || point.network_type || "").toLowerCase();

        if (network) {
            return network;
        }

        if (point.is_tor || point.tor || address.includes(".onion")) {
            return "tor";
        }

        if (point.is_i2p || point.i2p || address.includes(".i2p")) {
            return "i2p";
        }

        if (point.is_vpn || point.vpn || point.suspected_vpn) {
            return "vpn";
        }

        if (point.is_proxy || point.proxy || point.suspected_proxy) {
            return "proxy";
        }

        if (point.is_ipv6 || address.includes(":")) {
            return "ipv6";
        }

        return "ipv4";
    }

    function pointId(point) {
        return String(
            point.id ||
            pointAddress(point) ||
            `${point.latitude ?? point.lat},${point.longitude ?? point.lon ?? point.lng}`
        );
    }

    function normalizePoint(raw = {}, fallbackAddress = "") {
        const latitude =
            raw.latitude ??
            raw.lat ??
            raw.geoip?.latitude ??
            raw.geo?.latitude ??
            raw.location?.latitude;

        const longitude =
            raw.longitude ??
            raw.lon ??
            raw.lng ??
            raw.geoip?.longitude ??
            raw.geo?.longitude ??
            raw.location?.longitude;

        const address =
            raw.address ||
            raw.node ||
            raw.addr ||
            raw.ip ||
            fallbackAddress ||
            raw.id;

        const point = {
            ...raw,
            id: raw.id || address,
            address,
            latitude,
            longitude,
            country: raw.country || raw.country_code || raw.geoip?.country || raw.geo?.country,
            country_name: raw.country_name || raw.geoip?.country_name || raw.geo?.country_name,
            continent: raw.continent || raw.geoip?.continent || raw.geo?.continent,
            region: raw.region || raw.geoip?.region || raw.geo?.region,
            city: raw.city || raw.geoip?.city || raw.geo?.city,
            county: raw.county || raw.geoip?.county || raw.geo?.county,
            territory: raw.territory || raw.geoip?.territory || raw.geo?.territory,
            postal: raw.postal || raw.zip || raw.zipcode || raw.geoip?.postal || raw.geo?.postal,
            timezone: raw.timezone || raw.tz || raw.geoip?.timezone || raw.geo?.timezone,
            asn: raw.asn || raw.geoip?.asn || raw.geo?.asn,
            provider: raw.provider || raw.geoip?.provider || raw.geo?.provider,
            isp: raw.isp || raw.provider || raw.geoip?.isp || raw.geo?.isp,
            organization: raw.organization || raw.org || raw.geoip?.organization || raw.geo?.organization,
            agent: raw.agent || raw.user_agent || raw.subver,
            version: raw.version || raw.client_version,
            protocol: raw.protocol || raw.protocol_version,
            services: raw.services || raw.service_bits,
            height: raw.height || raw.block_height,
            latency: raw.latency || raw.latency_ms,
            uptime_seconds: raw.uptime_seconds ?? raw.uptime,
            status: raw.status,
            duplicate_count: raw.duplicate_count || raw.count || raw.nodes_at_location,
            w3w: raw.w3w || raw.what3words || raw.geoip?.w3w,
            geohashid: raw.geohashid || raw.geohash || raw.geoip?.geohashid
        };

        point.network = pointNetwork(point);

        return point;
    }

    function normalizeBitnodesNodeArray(address, row) {
        return normalizePoint({
            address,
            protocol: row?.[0],
            agent: row?.[1],
            services: row?.[3],
            height: row?.[4],
            hostname: row?.[5],
            city: row?.[6],
            country: row?.[7],
            latitude: row?.[8],
            longitude: row?.[9],
            timezone: row?.[10],
            asn: row?.[11],
            organization: row?.[12],
            provider: row?.[13],
            isp: row?.[13]
        }, address);
    }

    function normalizeGeoJson(data) {
        const features = Array.isArray(data?.features) ? data.features : [];

        const points = features.map(feature => {
            const props = feature.properties || {};
            const coords = feature.geometry?.coordinates || [];

            return normalizePoint({
                ...props,
                longitude: coords[0],
                latitude: coords[1]
            });
        });

        return buildVectorEnvelope(data, points);
    }

    function normalizePointsJson(data) {
        if (data?.type === "FeatureCollection") {
            return normalizeGeoJson(data);
        }

        let points = [];

        if (Array.isArray(data)) {
            points = data.map(row => normalizePoint(row));
        } else if (Array.isArray(data?.points)) {
            points = data.points.map(row => normalizePoint(row));
        } else if (Array.isArray(data?.nodes)) {
            points = data.nodes.map(row => normalizePoint(row));
        } else if (Array.isArray(data?.features)) {
            points = normalizeGeoJson(data).points;
        } else if (data?.nodes && typeof data.nodes === "object") {
            points = Object.entries(data.nodes).map(([address, row]) => {
                return Array.isArray(row)
                    ? normalizeBitnodesNodeArray(address, row)
                    : normalizePoint(row, address);
            });
        } else if (data?.reachable_nodes && typeof data.reachable_nodes === "object") {
            points = Object.entries(data.reachable_nodes).map(([address, row]) => {
                return Array.isArray(row)
                    ? normalizeBitnodesNodeArray(address, row)
                    : normalizePoint(row, address);
            });
        }

        return buildVectorEnvelope(data, points);
    }

    function buildVectorEnvelope(data, points) {
        points = points.filter(point => {
            const lat = number(point.latitude ?? point.lat, NaN);
            const lon = number(point.longitude ?? point.lon ?? point.lng, NaN);

            return Number.isFinite(lat) && Number.isFinite(lon);
        });

        return {
            source: data?.source || data?.metadata?.source || state.latestSource,
            point_count: data?.point_count || data?.feature_count || points.length,
            node_count: data?.node_count || points.length,
            points,
            network_counts: data?.network_counts || countBy(points, pointNetwork),
            status_counts: data?.status_counts || countBy(points, point => point.status || "unknown"),
            legend: data?.legend || BLIP_LEGEND,
            build: data?.build || data?.meta || data?.metadata || null
        };
    }

    function isUsefulVectorData(data) {
        return normalizePointsJson(data).points.length > 0;
    }

    function pointClass(point) {
        const network = pointNetwork(point);
        const status = String(point.status || "").toLowerCase();
        const uptime = number(point.uptime_seconds ?? point.uptime, 0);
        const duplicate = number(point.duplicate_count || point.count || point.nodes_at_location, 1) > 1;

        if (status.includes("unreachable") || point.unreachable) {
            return "unreachable";
        }

        if (network === "tor") {
            return "tor";
        }

        if (network === "i2p") {
            return "i2p";
        }

        if (network === "vpn") {
            return "vpn";
        }

        if (network === "proxy") {
            return "proxy";
        }

        if (duplicate) {
            return "duplicate";
        }

        if (status.includes("not-yet-synced") || status.includes("unsynced")) {
            return "unsynced";
        }

        if (uptime >= 604800) {
            return "synced_gt_1w";
        }

        if (uptime >= 172800) {
            return "synced_gt_48h";
        }

        if (uptime >= 600) {
            return "synced_gt_10m";
        }

        if (status.includes("synced")) {
            return "synced_lt_10m";
        }

        return "unknown";
    }

    function themeMarkerColor(name, fallback) {
        return (
            state.theme?.markers?.[name] ||
            state.theme?.css_variables?.[`--bn-map-marker-${name.replaceAll("_", "-")}`] ||
            fallback
        );
    }

    function pointColor(point) {
        const cls = pointClass(point);

        return (
            point.color ||
            themeMarkerColor(cls, null) ||
            BLIP_LEGEND[cls]?.color ||
            BLIP_LEGEND.unknown.color
        );
    }

    function markerRadius(point) {
        const dup = number(point.duplicate_count || point.count || point.weight || 1, 1);
        const markerSettings = state.settings?.marker || state.settings?.markers || {};
        const min = number(markerSettings.radius_min, 4);
        const max = number(markerSettings.radius_max, 14);

        return Math.max(min, Math.min(max, min + Math.log2(dup + 1) * 3));
    }

    function filterHasField(point, field) {
        const map = {
            isp: point.isp,
            provider: point.provider,
            organization: point.organization || point.org,
            agent: point.agent || point.user_agent,
            version: point.version,
            protocol: point.protocol,
            height: point.height || point.block_height,
            services: point.services,
            asn: point.asn,
            country: point.country || point.country_name,
            city: point.city,
            county: point.county,
            region: point.region,
            continent: point.continent,
            territory: point.territory,
            postal: point.postal || point.zip || point.zipcode,
            timezone: point.timezone,
            w3w: point.w3w || point.what3words,
            geohashid: point.geohashid || point.geohash
        };

        return Boolean(map[field]);
    }

    function filteredPoints() {
        const points = state.vectors?.points || [];

        if (state.filter === "all") {
            return points;
        }

        return points.filter(point => {
            return (
                pointNetwork(point) === state.filter ||
                pointClass(point) === state.filter ||
                filterHasField(point, state.filter)
            );
        });
    }

    function renderNodePanel(point) {
        const panel = qs(state.options.nodePanelSelector || "#bn-map-node-panel");

        if (!panel) {
            return;
        }

        panel.innerHTML = `
            <strong>${escapeHtml(pointAddress(point) || "Unknown node")}</strong>
            <div>Status: ${escapeHtml(point.status_label || point.status || "Unknown")}</div>
            <div>Class: ${escapeHtml(pointClass(point))}</div>
            <div>Network: ${escapeHtml(pointNetwork(point))}</div>
            <div>Height: ${escapeHtml(point.height || point.block_height || "—")}</div>
            <div>Protocol: ${escapeHtml(point.protocol || "—")}</div>
            <div>Services: ${escapeHtml(point.services || "—")}</div>
            <div>Agent: ${escapeHtml(point.agent || point.user_agent || "—")}</div>
            <div>Version: ${escapeHtml(point.version || "—")}</div>
            <div>Latency: ${escapeHtml(point.latency || point.latency_ms || "—")}</div>
            <div>Uptime: ${escapeHtml(Math.round(number(point.uptime_seconds, 0)).toLocaleString())}s</div>
            <div>Continent: ${escapeHtml(point.continent || "—")}</div>
            <div>Region: ${escapeHtml(point.region || "—")}</div>
            <div>Country: ${escapeHtml(point.country_name || point.country || "—")}</div>
            <div>Territory: ${escapeHtml(point.territory || "—")}</div>
            <div>County: ${escapeHtml(point.county || "—")}</div>
            <div>City: ${escapeHtml(point.city || "—")}</div>
            <div>ZIP: ${escapeHtml(point.postal || "—")}</div>
            <div>Timezone: ${escapeHtml(point.timezone || "—")}</div>
            <div>ASN: ${escapeHtml(point.asn || "—")}</div>
            <div>Provider: ${escapeHtml(point.provider || "—")}</div>
            <div>ISP: ${escapeHtml(point.isp || "—")}</div>
            <div>Organization: ${escapeHtml(point.organization || point.org || "—")}</div>
            <div>W3W: ${escapeHtml(point.w3w || point.what3words || "—")}</div>
            <div>GeohashID: ${escapeHtml(point.geohashid || point.geohash || "—")}</div>
            <div>Lat/Lon: ${escapeHtml(point.latitude || point.lat || "—")}, ${escapeHtml(point.longitude || point.lon || point.lng || "—")}</div>
        `;
    }

    function renderHud() {
        const target = qs(state.options.hudSelector);

        if (!target || !state.vectors) {
            return;
        }

        const points = state.vectors.points || [];
        const visible = filteredPoints();
        const currentIds = new Set(points.map(pointId));
        const networks = countBy(points, pointNetwork);
        const classes = countBy(points, pointClass);

        let newCount = 0;

        for (const id of currentIds) {
            if (!state.lastPointIds.has(id)) {
                newCount += 1;
            }
        }

        const lostCount = Math.max(0, state.lastPointIds.size - currentIds.size);

        const cards = [
            ["Total Points", points.length],
            ["Visible", visible.length],
            ["New", newCount],
            ["Lost", lostCount],
            ["IPv4", networks.ipv4],
            ["IPv6", networks.ipv6],
            ["Tor", networks.tor],
            ["I2P", networks.i2p],
            ["VPN", networks.vpn],
            ["Proxy", networks.proxy],
            ["Providers", uniqueCount(points, p => p.provider)],
            ["Organizations", uniqueCount(points, p => p.organization || p.org)],
            ["ISPs", uniqueCount(points, p => p.isp)],
            ["Duplicate", classes.duplicate],
            ["Synced", (classes.synced_lt_10m || 0) + (classes.synced_gt_10m || 0) + (classes.synced_gt_48h || 0) + (classes.synced_gt_1w || 0)],
            ["Continents", uniqueCount(points, p => p.continent)],
            ["Regions", uniqueCount(points, p => p.region)],
            ["Countries", uniqueCount(points, p => p.country || p.country_name)],
            ["Territories", uniqueCount(points, p => p.territory)],
            ["Counties", uniqueCount(points, p => p.county)],
            ["Cities", uniqueCount(points, p => p.city)],
            ["ZIP Codes", uniqueCount(points, p => p.postal)],
            ["W3W", uniqueCount(points, p => p.w3w || p.what3words)],
            ["GeohashID", uniqueCount(points, p => p.geohashid || p.geohash)],
            ["Timezones", uniqueCount(points, p => p.timezone)]
        ];

        target.innerHTML = cards.map(([label, value]) => `
            <article>
                <span>${escapeHtml(label)}</span>
                <strong>${number(value).toLocaleString()}</strong>
            </article>
        `).join("");

        state.lastPointIds = currentIds;
    }

    function renderLegend() {
        const target = qs(state.options.legendSelector);

        if (!target) {
            return;
        }

        target.innerHTML = `
            <div class="bn-map-legend-title">Map Key</div>
            ${Object.entries(BLIP_LEGEND).map(([key, item]) => {
                const color = themeMarkerColor(key, item.color);

                return `
                    <span>
                        <i style="background:${escapeHtml(color)};color:${escapeHtml(color)}"></i>
                        ${escapeHtml(item.label)}
                    </span>
                `;
            }).join("")}
        `;
    }

    function renderPoints() {
        if (!state.map || !window.L) {
            return;
        }

        if (state.layers.points) {
            state.layers.points.remove();
        }

        state.layers.points = window.L.layerGroup();

        const points = filteredPoints();
        const markerSettings = state.settings?.marker || state.settings?.markers || {};

        for (const point of points) {
            const lat = number(point.latitude ?? point.lat, NaN);
            const lon = number(point.longitude ?? point.lon ?? point.lng, NaN);

            if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                continue;
            }

            const color = pointColor(point);

            const marker = window.L.circleMarker([lat, lon], {
                radius: markerRadius(point),
                color,
                fillColor: color,
                fillOpacity: number(markerSettings.fill_opacity, 0.78),
                opacity: number(markerSettings.opacity, 0.98),
                weight: number(markerSettings.stroke_weight, 1),
                renderer:
                    state.settings?.performance?.prefer_canvas_renderer !== false &&
                    state.canvasRenderer
                        ? state.canvasRenderer
                        : undefined
            });

            marker.on("click", () => {
                renderNodePanel(point);
            });

            marker.addTo(state.layers.points);
        }

        state.layers.points.addTo(state.map);

        renderHud();
        renderLegend();

        setStatus(
            `Live Map: ${points.length.toLocaleString()} visible plotted node points from ${state.vectors?.source || state.latestSource}. Total dataset: ${(state.vectors?.points || []).length.toLocaleString()} points.`,
            points.length ? "live" : "warn"
        );
    }

    async function renderPolygons() {
        const polygons = await readFirst(state.options.paths.polygons).catch(() => null);

        if (!state.map || !window.L || !polygons?.features) {
            return;
        }

        if (state.layers.polygons) {
            state.layers.polygons.remove();
        }

        state.layers.polygons = window.L.geoJSON(polygons, {
            style: feature => {
                const props = feature.properties || {};

                return {
                    color: props.stroke || "rgba(192,214,116,0.45)",
                    fillColor: props.fill || "rgba(192,214,116,0.08)",
                    fillOpacity: number(props.fill_opacity ?? props.opacity, 0.05),
                    opacity: number(props.opacity, 0.28),
                    weight: number(props.weight, 1)
                };
            },
            interactive: false
        });

        if (state.settings?.polygons?.visible === true) {
            state.layers.polygons.addTo(state.map);
        }
    }

    function applyTheme(theme) {
        if (!theme) {
            return;
        }

        state.theme = theme;

        const vars = theme.css_variables || theme.variables || {};

        Object.entries(vars).forEach(([key, value]) => {
            document.documentElement.style.setProperty(key, value);
        });

        if (theme.font_family) {
            document.documentElement.style.setProperty("--bn-map-font", theme.font_family);
        }

        if (theme.heading_font_family) {
            document.documentElement.style.setProperty("--bn-map-heading", theme.heading_font_family);
        }

        updateTileLayer();
    }

    async function loadTheme(themeId) {
        const id =
            themeId ||
            state.settings?.theme?.selected ||
            state.themes?.default_theme ||
            "zzx_dark_olive";

        const paths = typeof state.options.paths.theme === "function"
            ? state.options.paths.theme(id)
            : state.options.paths.theme;

        const theme = await readFirst(paths).catch(() => null);

        applyTheme(theme);

        return theme;
    }

    async function loadSettingsProfile(settingsId) {
        const id = settingsId || state.settings?.id || "default";
        const paths = typeof state.options.paths.settingsProfile === "function"
            ? state.options.paths.settingsProfile(id)
            : state.options.paths.settingsProfile;

        return readFirst(paths);
    }

    function populateThemeSelect() {
        const select = qs(state.options.themeSelectSelector);

        if (!select) {
            return;
        }

        const themes = state.themes?.themes || [{ id: "zzx_dark_olive", name: "ZZX Dark Olive" }];

        select.innerHTML = themes.map(theme => `
            <option value="${escapeHtml(theme.id)}">${escapeHtml(theme.name)}</option>
        `).join("");

        select.value = state.theme?.id || state.themes?.default_theme || "zzx_dark_olive";

        select.onchange = async () => {
            await loadTheme(select.value);
            renderPoints();
        };
    }

    function populateSettingsSelect() {
        const select = qs(state.options.settingsSelectSelector);

        if (!select) {
            return;
        }

        const profiles = state.settingsProfiles?.profiles || [{ id: "default", name: "Default" }];

        select.innerHTML = profiles.map(profile => `
            <option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)}</option>
        `).join("");

        select.value = state.settings?.id || state.settingsProfiles?.default_settings || "default";

        select.onchange = async () => {
            const profile = await loadSettingsProfile(select.value).catch(() => null);

            if (profile) {
                state.settings = deepMerge(state.settings || {}, profile);
                updateTileLayer();
                setStatus(`Settings profile "${profile.name || select.value}" loaded.`, "live");
                renderPoints();
            } else {
                setStatus(`Settings profile "${select.value}" unavailable.`, "warn");
            }
        };
    }

    function wireControls(view) {
        qsa(state.options.filterSelector).forEach(button => {
            button.onclick = () => {
                state.filter = button.dataset.mapFilter || "all";

                qsa(state.options.filterSelector).forEach(item => {
                    item.classList.toggle("is-active", item === button);
                });

                renderPoints();
            };
        });

        qs(state.options.resetSelector)?.addEventListener("click", () => {
            state.map.setView(
                [number(view.latitude, 20), number(view.longitude, 0)],
                number(view.zoom, 2)
            );
        });
    }

    function resolveTileConfig() {
        const providerId =
            state.settings?.tiles?.provider ||
            state.settings?.tile?.provider ||
            state.theme?.tiles?.provider ||
            state.tileProviders?.default_provider ||
            "cartodb_dark";

        const externalProvider =
            (state.tileProviders?.providers || []).find(provider => provider.id === providerId);

        const provider =
            externalProvider ||
            TILE_PROVIDERS[providerId] ||
            TILE_PROVIDERS.cartodb_dark;

        const tileObject = state.settings?.tile || {};

        return {
            providerId,
            url:
                tileObject.url ||
                provider.url ||
                TILE_PROVIDERS.cartodb_dark.url,
            attribution:
                tileObject.attribution ||
                provider.attribution ||
                "© OpenStreetMap contributors © CARTO",
            subdomains:
                tileObject.subdomains ||
                provider.subdomains ||
                "abcd",
            minZoom:
                tileObject.min_zoom ||
                tileObject.minZoom ||
                provider.min_zoom ||
                provider.minZoom ||
                2,
            maxZoom:
                tileObject.max_zoom ||
                tileObject.maxZoom ||
                provider.max_zoom ||
                provider.maxZoom ||
                20
        };
    }

    function updateTileLayer() {
        if (!state.map || !window.L) {
            return;
        }

        const tile = resolveTileConfig();

        if (state.tileLayer) {
            state.tileLayer.remove();
        }

        state.tileLayer = window.L.tileLayer(tile.url, {
            attribution: tile.attribution,
            subdomains: tile.subdomains,
            minZoom: number(tile.minZoom, 2),
            maxZoom: number(tile.maxZoom, 20)
        });

        state.tileLayer.addTo(state.map);
    }

    async function loadMapData() {
        const baseSettings = await readFirst(state.options.paths.settings).catch(() => ({}));

        state.settings = baseSettings || {};

        state.tileProviders = await readFirst(state.options.paths.tileProviders).catch(() => null);
        state.themes = await readFirst(state.options.paths.themes).catch(() => null);
        state.settingsProfiles = await readFirst(state.options.paths.settingsProfiles).catch(() => null);

        const defaultProfileId =
            state.settings?.id ||
            state.settingsProfiles?.default_settings ||
            "default";

        const profile = await loadSettingsProfile(defaultProfileId).catch(() => null);

        if (profile) {
            state.settings = deepMerge(state.settings, profile);
        }

        const rawVectors = await readFirst(
            state.options.paths.vectors,
            isUsefulVectorData
        );

        state.vectors = normalizePointsJson(rawVectors);
    }

    async function refreshData() {
        const previousIds = new Set((state.vectors?.points || []).map(pointId));

        const rawVectors = await readFirst(
            state.options.paths.vectors,
            isUsefulVectorData
        );

        state.vectors = normalizePointsJson(rawVectors);
        state.lastPointIds = previousIds;

        renderPoints();
    }

    function prepareRoot(root) {
        if (!root) {
            return;
        }

        if (state.map) {
            state.map.remove();
            state.map = null;
        }

        if (root._leaflet_id) {
            root._leaflet_id = null;
        }

        root.innerHTML = "";
    }

    async function init(userOptions = {}) {
        state.options = {
            ...DEFAULT_OPTIONS,
            ...userOptions,
            paths: {
                ...DEFAULT_OPTIONS.paths,
                ...(userOptions.paths || {})
            }
        };

        await loadLeaflet();
        await loadMapData();
        await loadTheme();

        const root = qs(state.options.rootSelector);

        if (!root) {
            throw new Error(`Map root not found: ${state.options.rootSelector}`);
        }

        prepareRoot(root);

        const view =
            state.settings.initial_view ||
            state.settings.view ||
            {};

        const interaction = state.settings.interaction || {};

        state.canvasRenderer = window.L.canvas({ padding: 0.35 });

        state.map = window.L.map(root, {
            zoomControl: false,
            scrollWheelZoom: interaction.scroll_wheel_zoom !== false,
            doubleClickZoom: interaction.double_click_zoom !== false,
            boxZoom: interaction.box_zoom !== false,
            keyboard: interaction.keyboard !== false,
            preferCanvas: state.settings?.performance?.prefer_canvas_renderer !== false
        }).setView(
            [number(view.latitude, 20), number(view.longitude, 0)],
            number(view.zoom, 2)
        );

        window.L.control.zoom({
            position: state.settings?.controls?.zoom_position || "bottomleft"
        }).addTo(state.map);

        if (state.settings?.controls?.scale !== false) {
            window.L.control.scale({
                position: state.settings?.controls?.scale_position || "bottomleft",
                metric: true,
                imperial: true
            }).addTo(state.map);
        }

        updateTileLayer();

        populateThemeSelect();
        populateSettingsSelect();
        wireControls(view);

        await renderPolygons();

        renderPoints();

        const refreshMs =
            number(state.options.refreshMs, 0) ||
            number(state.settings?.refresh?.interval_ms, 0) ||
            number(state.settings?.refresh?.interval_seconds, 0) * 1000;

        if (refreshMs > 0 && state.settings?.refresh?.enabled !== false) {
            clearInterval(state.timer);

            state.timer = setInterval(() => {
                refreshData().catch(err => {
                    console.error(err);
                    setStatus(`Live refresh failure: ${err.message}`, "error");
                });
            }, Math.max(250, refreshMs));
        }

        state.initialized = true;
    }

    function destroy() {
        clearInterval(state.timer);
        state.timer = null;

        if (state.map) {
            state.map.remove();
            state.map = null;
        }

        state.tileLayer = null;
        state.layers.points = null;
        state.layers.polygons = null;
        state.initialized = false;
    }

    window.ZZXBitnodesMap = {
        init,
        destroy,
        refresh: refreshData,
        renderPoints,
        state
    };

    document.addEventListener("DOMContentLoaded", () => {
        if (window.ZZX_BITNODES_MAP_DISABLE_AUTO_INIT === true) {
            return;
        }

        const viewName =
            document.body?.dataset?.bnView ||
            qs("main")?.dataset?.bitnodesView ||
            "";

        const shouldAutoInit = DEFAULT_OPTIONS.autoInitViews.includes(viewName);

        if (!shouldAutoInit) {
            return;
        }

        init().catch(error => {
            console.error(error);

            const root = qs(DEFAULT_OPTIONS.rootSelector);

            if (root) {
                root.innerHTML = `<div class="bn-chart-empty">${escapeHtml(error.message)}</div>`;
            }

            state.options = state.options || DEFAULT_OPTIONS;
            setStatus(`Map load failure: ${error.message}`, "error");
        });
    });
})();
