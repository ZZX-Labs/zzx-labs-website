(() => {
    "use strict";

    const LEGEND_ITEMS = [
        { id: "duplicate", color: "#d95c5c", label: "Duplicate IP / Multiple Nodes at Location" },
        { id: "not_synced", color: "#8b5a2b", label: "Not Yet Synced" },
        { id: "synced_under_10m", color: "#e67e22", label: "Synced / Uptime Less than 10m" },
        { id: "synced_over_10m", color: "#f4d35e", label: "Synced / Uptime Over 10m" },
        { id: "synced_over_48h", color: "#7ed957", label: "Synced / Uptime Over 48h" },
        { id: "synced_over_1w", color: "#d4af37", label: "Synced / Uptime Over 1 Week" },
        { id: "unknown", color: "#8c927e", label: "Unknown / Unclassified" },
        { id: "i2p", color: "#00e5ff", label: "I2P Node" },
        { id: "tor", color: "#9d67ad", label: "Tor Node" },
        { id: "vpn", color: "#70b7ff", label: "Suspected VPN Node" },
        { id: "proxy", color: "#ff6fb1", label: "Suspected Proxy Node" },
        { id: "unreachable", color: "#202420", label: "Node Became Unreachable" }
    ];

    const SETTINGS_PROFILE_CANDIDATES = [
        "live",
        "default",
        "tactical",
        "live-tactical",
        "research",
        "research-dense",
        "ops",
        "ops-minimal",
        "geo",
        "geo-intelligence",
        "asn",
        "asn-analysis",
        "privacy",
        "privacy-networks",
        "historic",
        "historic-replay",
        "latency",
        "latency-health",
        "debug",
        "dense",
        "minimal",
        "satellite",
        "terrain",
        "dark",
        "light"
    ];

    const TILESETS = {
        basic_dark: {
            label: "Basic Dark",
            url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            attribution: "© OpenStreetMap contributors"
        },
        basic_light: {
            label: "Basic Light",
            url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            attribution: "© OpenStreetMap contributors"
        },
        satellite: {
            label: "Satellite",
            url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            attribution: "Tiles © Esri"
        }
    };

    const state = {
        initialized: false,
        options: {},
        map: null,
        tileLayer: null,
        layer: null,
        polygonLayer: null,
        measureLayer: null,
        selectionLayer: null,
        canvasRenderer: null,
        geojson: null,
        vectors: null,
        vectorTypes: null,
        settings: null,
        baseSettings: null,
        theme: null,
        themes: null,
        settingsProfiles: null,
        latestSource: "",
        latestVectorSource: "",
        latestThemeSource: "",
        latestSettingsSource: "",
        filters: new Set(["all"]),
        searchQuery: "",
        tone: "dark",
        tileMode: "basic",
        measureMode: false,
        selectMode: false,
        measureStart: null,
        selectedPoints: []
    };

    function qs(selector, scope = document) {
        return scope.querySelector(selector);
    }

    function qsa(selector, scope = document) {
        return Array.from(scope.querySelectorAll(selector));
    }

    function option(name, fallback) {
        return state.options?.[name] || fallback;
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function normalizeList(value) {
        if (Array.isArray(value)) return value;
        if (!value) return [];
        return [value];
    }

    function titleFromId(id) {
        return String(id || "")
            .replace(/[-_]+/g, " ")
            .replace(/\b\w/g, char => char.toUpperCase());
    }

    function setStatus(message, mode = "") {
        const target = qs(option("statusSelector", "#bn-map-status"));

        if (!target) return;

        target.textContent = message;

        if (mode) {
            target.className = `bn-map-status ${mode}`.trim();
        }
    }

    async function loadLeaflet() {
        if (window.L) return;

        await new Promise((resolve, reject) => {
            const css = document.createElement("link");
            css.rel = "stylesheet";
            css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
            document.head.appendChild(css);

            const script = document.createElement("script");
            script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
            script.onload = resolve;
            script.onerror = () => reject(new Error("Failed to load Leaflet."));
            document.head.appendChild(script);
        });
    }

    async function readJson(path) {
        const response = await fetch(path, { cache: "no-store" });

        if (!response.ok) {
            throw new Error(`Failed to load ${path}: ${response.status}`);
        }

        return response.json();
    }

    async function readFirst(paths, fallback = undefined) {
        let lastError = null;

        for (const path of normalizeList(paths)) {
            if (!path) continue;

            try {
                const data = await readJson(path);
                return { data, source: path };
            } catch (error) {
                lastError = error;
            }
        }

        if (fallback !== undefined) {
            return { data: fallback, source: "" };
        }

        throw lastError || new Error("No readable JSON source.");
    }

    async function readExisting(paths) {
        const out = [];

        for (const path of normalizeList(paths)) {
            try {
                out.push({
                    path,
                    data: await readJson(path)
                });
            } catch (_) {
                /* intentionally ignored */
            }
        }

        return out;
    }

    function paths(name, fallback) {
        return state.options?.paths?.[name] || fallback;
    }

    function pathFactory(name, fallback) {
        return typeof state.options?.paths?.[name] === "function"
            ? state.options.paths[name]
            : fallback;
    }

    function settingsProfilePaths(id) {
        const factory = pathFactory("settingsProfile", profileId => [
            `./data/settings/${profileId}.json`,
            "./data/map-settings.json"
        ]);

        return factory(id);
    }

    function themePaths(id) {
        const factory = pathFactory("theme", themeId => [
            `./data/themes/${themeId}.json`,
            "./data/map-theme.json"
        ]);

        return factory(id);
    }

    function applyTheme(theme) {
        if (!theme || typeof theme !== "object") return;

        state.theme = theme;

        const vars = theme.css_variables || theme.variables || {};

        Object.entries(vars).forEach(([key, value]) => {
            document.documentElement.style.setProperty(key, value);
        });

        if (theme.tone) {
            state.tone = String(theme.tone).toLowerCase() === "light" ? "light" : "dark";
            document.body.classList.toggle("bn-map-tone-light", state.tone === "light");
            document.body.classList.toggle("bn-map-tone-dark", state.tone !== "light");
        }
    }

    async function loadTheme(themeId) {
        const id =
            themeId ||
            state.settings?.theme?.selected ||
            state.themes?.default_theme ||
            state.themes?.default ||
            "zzx_dark_olive";

        const result = await readFirst(themePaths(id), {});
        state.latestThemeSource = result.source;
        applyTheme(result.data);

        if (state.settings) {
            state.settings.theme = state.settings.theme || {};
            state.settings.theme.selected = id;
        }

        return result.data;
    }

    async function loadSettingsProfile(profileId) {
        const id =
            profileId ||
            state.settingsProfiles?.default_settings ||
            state.settingsProfiles?.default_profile ||
            state.settings?.profile?.id ||
            "live";

        const result = await readFirst(settingsProfilePaths(id), null);

        if (result.data && typeof result.data === "object") {
            state.settings = {
                ...(state.baseSettings || {}),
                ...result.data
            };

            state.settings.profile = state.settings.profile || {};
            state.settings.profile.id = id;
            state.latestSettingsSource = result.source;
        }

        return state.settings;
    }

    function normalizeThemes(payload) {
        if (!payload || typeof payload !== "object") {
            return { themes: [], default_theme: "zzx_dark_olive" };
        }

        if (Array.isArray(payload.themes)) {
            return payload;
        }

        if (payload.themes && typeof payload.themes === "object") {
            return {
                ...payload,
                themes: Object.entries(payload.themes).map(([id, value]) => ({
                    id,
                    name: value?.name || value?.label || titleFromId(id),
                    ...(typeof value === "object" ? value : {})
                }))
            };
        }

        return { ...payload, themes: [] };
    }

    function normalizeSettingsProfiles(payload) {
        if (!payload || typeof payload !== "object") {
            return { profiles: [], default_settings: "live" };
        }

        if (Array.isArray(payload.profiles)) {
            return payload;
        }

        if (payload.profiles && typeof payload.profiles === "object") {
            return {
                ...payload,
                profiles: Object.entries(payload.profiles).map(([id, value]) => ({
                    id,
                    name: value?.name || value?.label || titleFromId(id),
                    ...(typeof value === "object" ? value : {})
                }))
            };
        }

        return { ...payload, profiles: [] };
    }

    async function autoDiscoverSettingsProfiles(payload) {
        const normalized = normalizeSettingsProfiles(payload);
        const profilesById = {};

        normalizeList(normalized.profiles).forEach(profile => {
            if (profile?.id) {
                profilesById[profile.id] = profile;
            }
        });

        const discovered = await readExisting(
            SETTINGS_PROFILE_CANDIDATES.map(id => `./data/settings/${id}.json`)
        );

        discovered.forEach(item => {
            const id =
                item.data?.profile?.id ||
                item.data?.id ||
                item.path.split("/").pop().replace(/\.json$/i, "");

            if (!profilesById[id]) {
                profilesById[id] = {
                    id,
                    name: item.data?.name || item.data?.label || item.data?.profile?.name || titleFromId(id),
                    source: item.path
                };
            }
        });

        normalized.profiles = Object.values(profilesById).sort((a, b) => {
            return String(a.name || a.id).localeCompare(String(b.name || b.id));
        });

        normalized.default_settings =
            normalized.default_settings ||
            normalized.default_profile ||
            normalized.profiles[0]?.id ||
            "live";

        return normalized;
    }

    function featureToPoint(feature) {
        const props = feature?.properties || {};
        const coords = feature?.geometry?.coordinates || [];

        return {
            ...props,
            latitude: props.latitude ?? props.lat ?? coords[1],
            longitude: props.longitude ?? props.lon ?? props.lng ?? coords[0]
        };
    }

    function allPoints() {
        if (Array.isArray(state.geojson?.features) && state.geojson.features.length) {
            return state.geojson.features.map(featureToPoint);
        }

        if (Array.isArray(state.vectors?.points)) {
            return state.vectors.points;
        }

        return [];
    }

    function classifyPoint(point) {
        const network = String(point.network || point.network_type || "").toLowerCase();
        const status = String(point.status || point.status_label || "").toLowerCase();
        const uptime = Number(point.uptime_seconds || point.uptime || 0);
        const height = Number(point.height || 0);

        if (point.unreachable || status.includes("unreachable")) return "unreachable";
        if (point.duplicate_count > 1 || status.includes("duplicate")) return "duplicate";
        if (network === "i2p") return "i2p";
        if (network === "tor") return "tor";
        if (point.is_proxy || point.suspected_proxy) return "proxy";
        if (point.is_vpn || point.suspected_vpn) return "vpn";
        if (!height || status.includes("not") || status.includes("unsynced")) return "not_synced";
        if (uptime >= 604800) return "synced_over_1w";
        if (uptime >= 172800) return "synced_over_48h";
        if (uptime >= 600) return "synced_over_10m";
        if (uptime > 0) return "synced_under_10m";

        return "unknown";
    }

    function pointColor(point) {
        const item = LEGEND_ITEMS.find(entry => entry.id === classifyPoint(point));
        return point.color || item?.color || "#c0d674";
    }

    function pointMatchesFilter(point, filter) {
        const f = String(filter || "").toLowerCase();

        if (!f || f === "all") return true;

        const network = String(point.network || point.network_type || "").toLowerCase();
        const status = String(point.status || point.status_label || "").toLowerCase();
        const agent = String(point.agent || point.user_agent || "").toLowerCase();
        const version = String(point.version || point.protocol_version || "").toLowerCase();

        if (network === f || status === f || agent.includes(f) || version.includes(f)) return true;
        if (f === "vpn") return point.is_vpn === true || point.suspected_vpn === true;
        if (f === "proxy") return point.is_proxy === true || point.suspected_proxy === true;
        if (f === "synced") return !status.includes("not") && !status.includes("unsynced") && !status.includes("unreachable");
        if (f === "unsynced") return status.includes("not") || status.includes("unsynced") || Number(point.height || 0) <= 0;
        if (f === "unreachable") return point.unreachable === true || status.includes("unreachable");
        if (f === "duplicate") return Number(point.duplicate_count || 0) > 1 || status.includes("duplicate");

        return false;
    }

    function matchesFilters(point) {
        if (!state.filters.size || state.filters.has("all")) {
            return true;
        }

        for (const filter of state.filters) {
            if (pointMatchesFilter(point, filter)) {
                return true;
            }
        }

        return false;
    }

    function searchableText(point) {
        return [
            point.id,
            point.address,
            point.host,
            point.ip,
            point.port,
            point.agent,
            point.user_agent,
            point.version,
            point.services,
            point.protocol,
            point.network,
            point.network_type,
            point.status,
            point.status_label,
            point.asn,
            point.asn_name,
            point.isp,
            point.provider,
            point.organization,
            point.org,
            point.country,
            point.country_name,
            point.country_code,
            point.region,
            point.territory,
            point.county,
            point.city,
            point.zip,
            point.postal,
            point.timezone,
            point.w3w,
            point.what3words,
            point.zzxgcs,
            point.geohashid,
            point.geohash,
            point.latitude,
            point.longitude,
            point.lon,
            point.lng
        ].join(" ").toLowerCase();
    }

    function matchesSearch(point) {
        const query = String(state.searchQuery || "").trim().toLowerCase();

        if (!query) {
            return true;
        }

        return searchableText(point).includes(query);
    }

    function filteredPoints() {
        return allPoints().filter(point => matchesFilters(point) && matchesSearch(point));
    }

    function radius(point) {
        const dup = Number(point.duplicate_count || 1);
        const min = Number(state.settings?.marker?.radius_min || 4);
        const max = Number(state.settings?.marker?.radius_max || 14);

        return Math.max(min, Math.min(max, min + Math.log2(dup + 1) * 3));
    }

    function markerPopup(point) {
        return `
            <div class="bn-map-popup">
                <strong>${escapeHtml(point.address || point.id || "Unknown node")}</strong>
                <div>Status: ${escapeHtml(point.status_label || point.status || "Unknown")}</div>
                <div>Network: ${escapeHtml(point.network || point.network_type || "unknown")}</div>
                <div>Height: ${escapeHtml(point.height || "—")}</div>
                <div>Uptime: ${escapeHtml(Math.round(Number(point.uptime_seconds || 0)).toLocaleString())}s</div>
                <div>City: ${escapeHtml(point.city || "—")}</div>
                <div>County: ${escapeHtml(point.county || "—")}</div>
                <div>Territory: ${escapeHtml(point.territory || "—")}</div>
                <div>Country: ${escapeHtml(point.country_name || point.country || point.country_code || "—")}</div>
                <div>ASN: ${escapeHtml(point.asn || "—")}</div>
                <div>Provider: ${escapeHtml(point.provider || point.isp || point.organization || "—")}</div>
                <div>Agent: ${escapeHtml(point.agent || point.user_agent || "—")}</div>
                <div>VPN: ${point.is_vpn || point.suspected_vpn ? "yes" : "no"}</div>
                <div>Proxy: ${point.is_proxy || point.suspected_proxy ? "yes" : "no"}</div>
                <div>W3W: ${escapeHtml(point.w3w || point.what3words || "—")}</div>
                <div>ZZX-GCS: ${escapeHtml(point.zzxgcs || "—")}</div>
                <div>GeohashID: ${escapeHtml(point.geohashid || point.geohash || "—")}</div>
            </div>
        `;
    }

    function row(label, value) {
        return `<div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value ?? "—")}</span></div>`;
    }

    function renderNodeInfo(point) {
        const panel = qs(option("nodeInfoSelector", "#bn-map-node-info"));

        if (!panel) return;

        panel.innerHTML = `
            <h3>${escapeHtml(point.address || point.id || "Unknown Node")}</h3>
            <div class="bn-node-grid">
                ${row("Status", point.status_label || point.status || "Unknown")}
                ${row("Network", point.network || point.network_type || "Unknown")}
                ${row("IP / Host", point.ip || point.host || point.address || "—")}
                ${row("Port", point.port || "—")}
                ${row("Services", point.services || "—")}
                ${row("Protocol", point.protocol || point.protocol_version || "—")}
                ${row("Version", point.version || "—")}
                ${row("Block Height", point.height || "—")}
                ${row("Uptime", `${Math.round(Number(point.uptime_seconds || 0)).toLocaleString()}s`)}
                ${row("Latency", point.latency_ms ? `${point.latency_ms} ms` : point.latency || "—")}
                ${row("Peer Health", point.peer_health || point.health || "—")}
                ${row("ASN", point.asn || "—")}
                ${row("ASN Name", point.asn_name || "—")}
                ${row("Provider", point.provider || point.isp || "—")}
                ${row("Organization", point.organization || point.org || "—")}
                ${row("Country", point.country_name || point.country || point.country_code || "—")}
                ${row("Territory", point.territory || point.region || "—")}
                ${row("County", point.county || "—")}
                ${row("City", point.city || "—")}
                ${row("ZIP / Postal", point.zip || point.postal || "—")}
                ${row("Timezone", point.timezone || "—")}
                ${row("Latitude", point.latitude ?? point.lat ?? "—")}
                ${row("Longitude", point.longitude ?? point.lon ?? point.lng ?? "—")}
                ${row("Agent", point.agent || point.user_agent || "—")}
                ${row("Tor", String((point.network || point.network_type || "").toLowerCase() === "tor"))}
                ${row("I2P", String((point.network || point.network_type || "").toLowerCase() === "i2p"))}
                ${row("VPN", point.is_vpn || point.suspected_vpn ? "Yes" : "No")}
                ${row("Proxy", point.is_proxy || point.suspected_proxy ? "Yes" : "No")}
                ${row("what3words", point.w3w || point.what3words || "—")}
                ${row("ZZX-GCS", point.zzxgcs || "—")}
                ${row("GeohashID", point.geohashid || point.geohash || "—")}
                ${row("First Seen", point.first_seen || "—")}
                ${row("Last Seen", point.last_seen || "—")}
            </div>
        `;

        panel.classList.add("is-active");
    }

    function clearNodeInfo() {
        const panel = qs(option("nodeInfoSelector", "#bn-map-node-info"));

        if (!panel) return;

        panel.classList.remove("is-active");
        panel.innerHTML = `<p>Select a node to inspect telemetry.</p>`;
    }

    function countBy(points, getter) {
        const counts = {};

        points.forEach(point => {
            const key = String(getter(point) || "unknown").toLowerCase();
            counts[key] = (counts[key] || 0) + 1;
        });

        return counts;
    }

    function renderHud() {
        const target = qs(option("hudSelector", "#bn-map-hud"));
        if (!target) return;

        const points = allPoints();
        const visible = filteredPoints();
        const networks = state.vectors?.network_counts || countBy(points, point => point.network || point.network_type);
        const statuses = state.vectors?.status_counts || countBy(points, point => point.status);
        const intel = state.vectors?.intelligence_counts || {};

        const vpnCount = Number(intel.vpn_nodes || points.filter(p => p.is_vpn || p.suspected_vpn).length || 0);
        const proxyCount = Number(intel.proxy_nodes || points.filter(p => p.is_proxy || p.suspected_proxy).length || 0);

        target.innerHTML = `
            <article><span>Total Points</span><strong>${Number(points.length || state.vectors?.point_count || 0).toLocaleString()}</strong></article>
            <article><span>Visible</span><strong>${visible.length.toLocaleString()}</strong></article>
            <article><span>IPv4</span><strong>${Number(networks.ipv4 || 0).toLocaleString()}</strong></article>
            <article><span>IPv6</span><strong>${Number(networks.ipv6 || 0).toLocaleString()}</strong></article>
            <article><span>Tor</span><strong>${Number(networks.tor || 0).toLocaleString()}</strong></article>
            <article><span>I2P</span><strong>${Number(networks.i2p || 0).toLocaleString()}</strong></article>
            <article><span>Duplicate</span><strong>${Number(statuses["duplicate-location"] || statuses.duplicate || 0).toLocaleString()}</strong></article>
            <article><span>Unreachable</span><strong>${Number(statuses.unreachable || 0).toLocaleString()}</strong></article>
            <article><span>VPN</span><strong>${vpnCount.toLocaleString()}</strong></article>
            <article><span>Proxy</span><strong>${proxyCount.toLocaleString()}</strong></article>
            <article><span>Datacenter</span><strong>${Number(intel.datacenter_nodes || 0).toLocaleString()}</strong></article>
            <article><span>Selected</span><strong>${state.selectedPoints.length.toLocaleString()}</strong></article>
        `;
    }

    function renderLegend() {
        const target = qs(option("legendSelector", "#bn-map-legend"));
        if (!target) return;

        target.innerHTML = LEGEND_ITEMS.map(item => `
            <span data-legend-id="${escapeHtml(item.id)}">
                <i style="background:${escapeHtml(item.color)}"></i>
                ${escapeHtml(item.label)}
            </span>
        `).join("");
    }

    function renderPoints() {
        if (!state.map || !window.L) return;

        if (state.layer) {
            state.layer.remove();
        }

        state.layer = window.L.layerGroup();

        const points = filteredPoints();

        points.forEach(point => {
            const lat = Number(point.latitude ?? point.lat);
            const lon = Number(point.longitude ?? point.lon ?? point.lng);

            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
            if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return;

            const color = pointColor(point);

            const marker = window.L.circleMarker([lat, lon], {
                radius: radius(point),
                color,
                fillColor: color,
                fillOpacity: Number(state.settings?.marker?.fill_opacity || 0.72),
                opacity: Number(state.settings?.marker?.opacity || 0.95),
                weight: Number(state.settings?.marker?.stroke_weight || 1),
                renderer: state.settings?.performance?.prefer_canvas_renderer && state.canvasRenderer
                    ? state.canvasRenderer
                    : undefined
            });

            marker.bindPopup(markerPopup(point));

            marker.on("click", event => {
                if (window.L?.DomEvent) {
                    window.L.DomEvent.stopPropagation(event);
                }

                renderNodeInfo(point);

                marker.setStyle({
                    weight: Math.max(3, Number(state.settings?.marker?.stroke_weight || 1) + 2),
                    opacity: 1,
                    fillOpacity: 0.95
                });
            });

            marker.addTo(state.layer);
        });

        state.layer.addTo(state.map);

        renderHud();
        renderLegend();

        setStatus(
            `Loaded ${points.length.toLocaleString()} visible map points from ${state.latestVectorSource || state.latestSource || "selected source"}.`,
            points.length ? "live" : "warn"
        );
    }

    async function renderPolygons() {
        if (!state.map || !window.L) return;

        const result = await readFirst(paths("polygons", ["./data/map-polygons.geojson"]), null).catch(() => null);

        if (!result?.data || !Array.isArray(result.data.features)) return;

        if (state.polygonLayer) {
            state.polygonLayer.remove();
        }

        state.polygonLayer = window.L.geoJSON(result.data, {
            style: feature => {
                const props = feature.properties || {};

                return {
                    color: props.stroke || "#c0d674",
                    fillColor: props.fill || "#c0d674",
                    fillOpacity: Number(props.fill_opacity || 0.08),
                    opacity: Number(props.opacity || 0.22),
                    weight: Number(props.weight || 1)
                };
            },
            interactive: false
        });

        if (state.settings?.polygons?.visible === true) {
            state.polygonLayer.addTo(state.map);
        }
    }

    function populateThemeSelect() {
        const select = qs(option("themeSelectSelector", "[data-map-theme-select]"));
        if (!select) return;

        const themes = normalizeList(state.themes?.themes);

        select.innerHTML = themes.map(theme => `
            <option value="${escapeHtml(theme.id)}">${escapeHtml(theme.name || theme.label || titleFromId(theme.id))}</option>
        `).join("");

        select.value =
            state.theme?.id ||
            state.settings?.theme?.selected ||
            state.themes?.default_theme ||
            "zzx_dark_olive";

        select.addEventListener("change", async () => {
            await loadTheme(select.value);
            applyMapSettings();
            renderPoints();
        });
    }

    function populateSettingsSelect() {
        const select = qs(option("settingsSelectSelector", "[data-map-settings-select]"));
        if (!select) return;

        const profiles = normalizeList(state.settingsProfiles?.profiles);

        select.innerHTML = profiles.map(profile => `
            <option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name || profile.label || titleFromId(profile.id))}</option>
        `).join("");

        select.value =
            state.settings?.profile?.id ||
            state.settingsProfiles?.default_settings ||
            state.settingsProfiles?.default_profile ||
            profiles[0]?.id ||
            "live";

        select.addEventListener("change", async () => {
            await loadSettingsProfile(select.value);
            await loadTheme(state.settings?.theme?.selected || state.themes?.default_theme || "zzx_dark_olive");
            applyMapSettings();
            renderPolygons();
            renderPoints();
        });
    }

    function wireControls(view) {
        qsa(option("filterSelector", "[data-map-filter]")).forEach(button => {
            button.addEventListener("click", () => {
                const filter = button.dataset.mapFilter || "all";

                if (filter === "all") {
                    state.filters.clear();
                    state.filters.add("all");
                } else {
                    state.filters.delete("all");

                    if (state.filters.has(filter)) {
                        state.filters.delete(filter);
                    } else {
                        state.filters.add(filter);
                    }

                    if (!state.filters.size) {
                        state.filters.add("all");
                    }
                }

                qsa(option("filterSelector", "[data-map-filter]")).forEach(item => {
                    const value = item.dataset.mapFilter || "all";
                    item.classList.toggle("is-active", state.filters.has(value));
                });

                renderPoints();
            });
        });

        qs(option("resetSelector", "[data-map-reset]"))?.addEventListener("click", () => {
            const currentView = state.settings?.initial_view || view || {};

            state.map.setView(
                [Number(currentView.latitude || 20), Number(currentView.longitude || 0)],
                Number(currentView.zoom || 2)
            );
        });
    }

    function wireLegendToggle() {
        const legend = qs(option("legendSelector", "#bn-map-legend"));
        const toggle = qs(option("legendToggleSelector", "#bn-map-legend-toggle"));

        if (!legend || !toggle || toggle.dataset.bnMapLegendWired === "true") return;

        toggle.dataset.bnMapLegendWired = "true";
        legend.classList.add("is-open");
        legend.classList.remove("is-collapsed");

        toggle.addEventListener("click", () => {
            const collapsed = legend.classList.toggle("is-collapsed");

            legend.classList.toggle("is-open", !collapsed);
            document.body.classList.toggle("bn-map-key-collapsed", collapsed);

            toggle.textContent = collapsed ? "Show Key" : "Hide Key";
            toggle.setAttribute("aria-expanded", String(!collapsed));

            if (state.map) {
                window.setTimeout(() => state.map.invalidateSize(), 190);
            }
        });
    }

    function wireSearch() {
        const input = qs(option("searchSelector", "[data-map-search]"));
        const clear = qs(option("searchClearSelector", "[data-map-search-clear]"));

        if (!input || input.dataset.bnMapSearchWired === "true") return;

        input.dataset.bnMapSearchWired = "true";

        input.addEventListener("input", () => {
            state.searchQuery = input.value || "";
            renderPoints();
        });

        clear?.addEventListener("click", () => {
            input.value = "";
            state.searchQuery = "";
            renderPoints();
            input.focus();
        });
    }

    function wireMiniToggles() {
        const tone = qs("[data-map-tone-toggle]");
        const tile = qs("[data-map-tile-toggle]");
        const measure = qs("[data-map-measure-toggle]");
        const select = qs("[data-map-select-toggle]");

        tone?.addEventListener("click", () => {
            state.tone = state.tone === "dark" ? "light" : "dark";
            tone.textContent = state.tone === "dark" ? "Dark" : "Light";
            tone.setAttribute("aria-pressed", String(state.tone === "dark"));
            document.body.classList.toggle("bn-map-tone-light", state.tone === "light");
            document.body.classList.toggle("bn-map-tone-dark", state.tone !== "light");
            applyMapSettings();
        });

        tile?.addEventListener("click", () => {
            state.tileMode = state.tileMode === "basic" ? "satellite" : "basic";
            tile.textContent = state.tileMode === "basic" ? "Basic" : "Satellite";
            tile.setAttribute("aria-pressed", String(state.tileMode === "satellite"));
            applyMapSettings();
        });

        measure?.addEventListener("click", () => {
            state.measureMode = !state.measureMode;
            measure.setAttribute("aria-pressed", String(state.measureMode));
            measure.classList.toggle("is-active", state.measureMode);
            setStatus(state.measureMode ? "Measure mode enabled. Right-click or click two map points." : "Measure mode disabled.", "live");
        });

        select?.addEventListener("click", () => {
            state.selectMode = !state.selectMode;
            select.setAttribute("aria-pressed", String(state.selectMode));
            select.classList.toggle("is-active", state.selectMode);
            setStatus(state.selectMode ? "Selection mode enabled. Drag selection support is staged for the next module." : "Selection mode disabled.", "live");
        });
    }

    function haversineMeters(a, b) {
        const r = 6371000;
        const lat1 = a.lat * Math.PI / 180;
        const lat2 = b.lat * Math.PI / 180;
        const dLat = (b.lat - a.lat) * Math.PI / 180;
        const dLon = (b.lng - a.lng) * Math.PI / 180;

        const x =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

        return 2 * r * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    }

    function wireMapInteractions() {
        if (!state.map || state.map._zzxMapInteractionsWired) return;

        state.map._zzxMapInteractionsWired = true;

        state.map.on("click", event => {
            if (!state.measureMode) {
                clearNodeInfo();
                return;
            }

            if (!state.measureStart) {
                state.measureStart = event.latlng;
                setStatus("Measure start point set. Click the second point.", "live");
                return;
            }

            const end = event.latlng;
            const distance = haversineMeters(state.measureStart, end);
            const km = distance / 1000;
            const miles = distance / 1609.344;

            if (state.measureLayer) {
                state.measureLayer.remove();
            }

            state.measureLayer = window.L.polyline([state.measureStart, end], {
                color: "#c0d674",
                weight: 2,
                opacity: 0.85,
                dashArray: "6 6"
            }).addTo(state.map);

            setStatus(`Measured distance: ${km.toFixed(2)} km / ${miles.toFixed(2)} mi.`, "live");
            state.measureStart = null;
        });

        state.map.on("contextmenu", event => {
            if (!state.measureMode) return;

            if (!state.measureStart) {
                state.measureStart = event.latlng;
                setStatus("Measure start point set by right-click. Click or right-click the second point.", "live");
                return;
            }

            const end = event.latlng;
            const distance = haversineMeters(state.measureStart, end);
            const km = distance / 1000;
            const miles = distance / 1609.344;

            if (state.measureLayer) {
                state.measureLayer.remove();
            }

            state.measureLayer = window.L.polyline([state.measureStart, end], {
                color: "#c0d674",
                weight: 2,
                opacity: 0.85,
                dashArray: "6 6"
            }).addTo(state.map);

            setStatus(`Measured distance: ${km.toFixed(2)} km / ${miles.toFixed(2)} mi.`, "live");
            state.measureStart = null;
        });
    }

    function activeTileset() {
        const themeTiles = state.theme?.tiles || {};
        const settingTiles = state.settings?.tiles || {};

        if (state.tileMode === "satellite") {
            return {
                ...TILESETS.satellite,
                ...(settingTiles.satellite || {}),
                ...(themeTiles.satellite || {})
            };
        }

        if (state.tone === "light") {
            return {
                ...TILESETS.basic_light,
                ...(settingTiles.light || {}),
                ...(themeTiles.light || {})
            };
        }

        return {
            ...TILESETS.basic_dark,
            url: state.settings?.tile_url || TILESETS.basic_dark.url,
            attribution: state.settings?.tile_attribution || TILESETS.basic_dark.attribution,
            subdomains: state.settings?.tile_subdomains,
            ...(settingTiles.dark || {}),
            ...(themeTiles.dark || {})
        };
    }

    function applyMapSettings() {
        if (!state.map || !state.settings) return;

        const view = state.settings.initial_view || {};
        const tiles = activeTileset();

        if (state.tileLayer) {
            state.tileLayer.remove();
        }

        state.tileLayer = window.L.tileLayer(tiles.url, {
            attribution: tiles.attribution || "© OpenStreetMap contributors",
            subdomains: tiles.subdomains || undefined,
            maxZoom: Number(tiles.max_zoom || view.max_zoom || 20),
            minZoom: Number(tiles.min_zoom || view.min_zoom || 2)
        }).addTo(state.map);

        document.body.classList.toggle("bn-map-tone-light", state.tone === "light");
        document.body.classList.toggle("bn-map-tone-dark", state.tone !== "light");
        document.body.classList.toggle("bn-map-satellite", state.tileMode === "satellite");
    }

    async function loadData() {
        let result;

        result = await readFirst(paths("settings", ["./data/map-settings.json"]), {});
        state.baseSettings = result.data || {};
        state.settings = state.baseSettings;
        state.latestSettingsSource = result.source;

        result = await readFirst(paths("settingsProfiles", ["./data/map-settings-profiles.json"]), null).catch(() => null);
        state.settingsProfiles = await autoDiscoverSettingsProfiles(result?.data || null);

        result = await readFirst(paths("vectors", ["./data/map-points.geojson"]), { type: "FeatureCollection", features: [] });
        state.geojson = result.data;
        state.latestVectorSource = result.source;
        state.latestSource = result.source;

        result = await readFirst(paths("vectorManifest", ["./data/map-vectors.json"]), {});
        state.vectors = result.data;

        result = await readFirst(paths("vectorTypes", ["./data/vector-types.json"]), null).catch(() => null);
        state.vectorTypes = result?.data || null;

        result = await readFirst(paths("themes", ["./data/map-themes.json"]), null).catch(() => null);
        state.themes = normalizeThemes(result?.data || null);

        await loadSettingsProfile(
            state.settings?.profile?.id ||
            state.settingsProfiles?.default_settings ||
            state.settingsProfiles?.default_profile ||
            "live"
        );

        await loadTheme(
            state.settings?.theme?.selected ||
            state.themes?.default_theme ||
            "zzx_dark_olive"
        );
    }

    async function init(options = {}) {
        state.options = options || {};

        await loadLeaflet();
        await loadData();

        const root = qs(option("rootSelector", "[data-map-root]"));

        if (!root) {
            throw new Error("Map root not found.");
        }

        if (state.map) {
            destroy();
        }

        const view = state.settings?.initial_view || {};
        const interaction = state.settings?.interaction || {};

        state.canvasRenderer = window.L.canvas({ padding: 0.35 });

        state.map = window.L.map(root, {
            scrollWheelZoom: interaction.scroll_wheel_zoom !== false,
            doubleClickZoom: interaction.double_click_zoom !== false,
            boxZoom: interaction.box_zoom !== false,
            keyboard: interaction.keyboard !== false,
            preferCanvas: state.settings?.performance?.prefer_canvas_renderer !== false
        }).setView(
            [Number(view.latitude || 20), Number(view.longitude || 0)],
            Number(view.zoom || 2)
        );

        applyMapSettings();

        populateThemeSelect();
        populateSettingsSelect();
        wireControls(view);
        wireLegendToggle();
        wireSearch();
        wireMiniToggles();
        wireMapInteractions();

        await renderPolygons();
        renderPoints();

        state.initialized = true;

        return state;
    }

    function destroy() {
        try {
            if (state.layer) state.layer.remove();
            if (state.polygonLayer) state.polygonLayer.remove();
            if (state.tileLayer) state.tileLayer.remove();
            if (state.measureLayer) state.measureLayer.remove();
            if (state.selectionLayer) state.selectionLayer.remove();
            if (state.map) state.map.remove();
        } catch (error) {
            console.warn(error);
        }

        state.map = null;
        state.layer = null;
        state.polygonLayer = null;
        state.tileLayer = null;
        state.measureLayer = null;
        state.selectionLayer = null;
        state.canvasRenderer = null;
        state.initialized = false;
    }

    async function reload() {
        await loadData();
        await renderPolygons();
        renderPoints();
        wireLegendToggle();
        wireSearch();

        return state;
    }

    function exportVisibleNodes() {
        const payload = {
            exported_at: new Date().toISOString(),
            source: state.latestVectorSource || state.latestSource,
            filters: Array.from(state.filters),
            search: state.searchQuery,
            points: filteredPoints()
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], {
            type: "application/json"
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `zzx-bitnodes-visible-${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    window.ZZXBitnodesMap = {
        state,
        init,
        destroy,
        renderPoints,
        renderPolygons,
        renderNodeInfo,
        clearNodeInfo,
        loadTheme,
        loadSettingsProfile,
        reload,
        exportVisibleNodes
    };

    if (!window.ZZX_BITNODES_MAP_DISABLE_AUTO_INIT) {
        document.addEventListener("DOMContentLoaded", () => {
            init().catch(error => {
                console.error(error);

                const root = qs("[data-map-root]");

                if (root) {
                    root.innerHTML = `<div class="bn-chart-empty">${escapeHtml(error.message)}</div>`;
                }

                setStatus(`Map load failure: ${error.message}`, "error");
            });
        });
    }
})();
