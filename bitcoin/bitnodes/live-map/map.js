(() => {
    "use strict";

    const state = {
        initialized: false,
        options: {},
        map: null,
        layer: null,
        polygonLayer: null,
        canvasRenderer: null,
        geojson: null,
        vectors: null,
        vectorTypes: null,
        settings: null,
        theme: null,
        themes: null,
        settingsProfiles: null,
        latestSource: "",
        latestVectorSource: "",
        latestThemeSource: "",
        latestSettingsSource: "",
        filter: "all"
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

    function setStatus(message, mode = "") {
        const target = qs(option("statusSelector", "#bn-map-status"));

        if (target) {
            target.textContent = message;

            if (mode) {
                target.className = `bn-map-status ${mode}`.trim();
            }
        }
    }

    function normalizeList(value) {
        if (Array.isArray(value)) return value;
        if (!value) return [];
        return [value];
    }

    function mapById(items) {
        const out = {};

        normalizeList(items).forEach(item => {
            if (item && typeof item === "object" && item.id) {
                out[item.id] = item;
            }
        });

        return out;
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
                ...(state.settings || {}),
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
                    name: value?.name || value?.label || id,
                    ...(typeof value === "object" ? value : {})
                }))
            };
        }

        return {
            ...payload,
            themes: []
        };
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
                    name: value?.name || value?.label || id,
                    ...(typeof value === "object" ? value : {})
                }))
            };
        }

        return {
            ...payload,
            profiles: []
        };
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

    function pointVisible(point) {
        const filter = String(state.filter || "all").toLowerCase();

        if (filter === "all") return true;

        const network = String(point.network || point.network_type || "").toLowerCase();
        const status = String(point.status || "").toLowerCase();

        if (network === filter || status === filter) return true;

        if (filter === "vpn") {
            return point.is_vpn === true || point.suspected_vpn === true;
        }

        if (filter === "proxy") {
            return point.is_proxy === true || point.suspected_proxy === true;
        }

        return false;
    }

    function filteredPoints() {
        return allPoints().filter(pointVisible);
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
                <div>Provider: ${escapeHtml(point.provider || "—")}</div>
                <div>Agent: ${escapeHtml(point.agent || point.user_agent || "—")}</div>
                <div>VPN: ${point.is_vpn || point.suspected_vpn ? "yes" : "no"}</div>
                <div>Proxy: ${point.is_proxy || point.suspected_proxy ? "yes" : "no"}</div>
                <div>W3W: ${escapeHtml(point.w3w || point.what3words || "—")}</div>
                <div>ZZX-GCS: ${escapeHtml(point.zzxgcs || "—")}</div>
                <div>GeohashID: ${escapeHtml(point.geohashid || point.geohash || "—")}</div>
            </div>
        `;
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
        const networks = state.vectors?.network_counts || countBy(points, point => point.network || point.network_type);
        const statuses = state.vectors?.status_counts || countBy(points, point => point.status);
        const intel = state.vectors?.intelligence_counts || {};

        const vpnCount = Number(intel.vpn_nodes || points.filter(p => p.is_vpn || p.suspected_vpn).length || 0);
        const proxyCount = Number(intel.proxy_nodes || points.filter(p => p.is_proxy || p.suspected_proxy).length || 0);

        target.innerHTML = `
            <article><span>Total Points</span><strong>${Number(points.length || state.vectors?.point_count || 0).toLocaleString()}</strong></article>
            <article><span>IPv4</span><strong>${Number(networks.ipv4 || 0).toLocaleString()}</strong></article>
            <article><span>IPv6</span><strong>${Number(networks.ipv6 || 0).toLocaleString()}</strong></article>
            <article><span>Tor</span><strong>${Number(networks.tor || 0).toLocaleString()}</strong></article>
            <article><span>I2P</span><strong>${Number(networks.i2p || 0).toLocaleString()}</strong></article>
            <article><span>Duplicate</span><strong>${Number(statuses["duplicate-location"] || 0).toLocaleString()}</strong></article>
            <article><span>Unreachable</span><strong>${Number(statuses.unreachable || 0).toLocaleString()}</strong></article>
            <article><span>VPN</span><strong>${vpnCount.toLocaleString()}</strong></article>
            <article><span>Proxy</span><strong>${proxyCount.toLocaleString()}</strong></article>
            <article><span>Datacenter</span><strong>${Number(intel.datacenter_nodes || 0).toLocaleString()}</strong></article>
        `;
    }

    function renderLegend() {
        const target = qs(option("legendSelector", "#bn-map-legend"));
        if (!target) return;

        const legend = state.vectors?.legend || {};

        target.innerHTML = Object.entries(legend).map(([key, item]) => `
            <span><i style="background:${escapeHtml(item?.color || "#c0d674")}"></i>${escapeHtml(item?.label || key)}</span>
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

            const marker = window.L.circleMarker([lat, lon], {
                radius: radius(point),
                color: point.color || "#c0d674",
                fillColor: point.color || "#c0d674",
                fillOpacity: Number(state.settings?.marker?.fill_opacity || 0.72),
                opacity: Number(state.settings?.marker?.opacity || 0.95),
                weight: Number(state.settings?.marker?.stroke_weight || 1),
                renderer: state.settings?.performance?.prefer_canvas_renderer && state.canvasRenderer
                    ? state.canvasRenderer
                    : undefined
            });

            marker.bindPopup(markerPopup(point));
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
            <option value="${escapeHtml(theme.id)}">${escapeHtml(theme.name || theme.label || theme.id)}</option>
        `).join("");

        select.value =
            state.theme?.id ||
            state.settings?.theme?.selected ||
            state.themes?.default_theme ||
            "zzx_dark_olive";

        select.addEventListener("change", async () => {
            await loadTheme(select.value);
            renderPoints();
        });
    }

    function populateSettingsSelect() {
        const select = qs(option("settingsSelectSelector", "[data-map-settings-select]"));
        if (!select) return;

        const profiles = normalizeList(state.settingsProfiles?.profiles);

        select.innerHTML = profiles.map(profile => `
            <option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name || profile.label || profile.id)}</option>
        `).join("");

        select.value =
            state.settings?.profile?.id ||
            state.settingsProfiles?.default_settings ||
            state.settingsProfiles?.default_profile ||
            "live";

        select.addEventListener("change", async () => {
            await loadSettingsProfile(select.value);
            await loadTheme(state.settings?.theme?.selected || select.value);
            applyMapSettings();
            renderPoints();
        });
    }

    function wireControls(view) {
        qsa(option("filterSelector", "[data-map-filter]")).forEach(button => {
            button.addEventListener("click", () => {
                state.filter = button.dataset.mapFilter || "all";

                qsa(option("filterSelector", "[data-map-filter]")).forEach(item => {
                    item.classList.toggle("is-active", item === button);
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

    function applyMapSettings() {
        if (!state.map || !state.settings) return;

        const view = state.settings.initial_view || {};
        const tileUrl = state.settings.tile_url || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
        const tileAttribution = state.settings.tile_attribution || "© OpenStreetMap contributors";

        if (state.tileLayer) {
            state.tileLayer.remove();
        }

        state.tileLayer = window.L.tileLayer(tileUrl, {
            attribution: tileAttribution,
            subdomains: state.settings.tile_subdomains || undefined,
            maxZoom: Number(view.max_zoom || 20),
            minZoom: Number(view.min_zoom || 2)
        }).addTo(state.map);
    }

    async function loadData() {
        let result;

        result = await readFirst(paths("settings", ["./data/map-settings.json"]));
        state.settings = result.data;
        state.latestSettingsSource = result.source;

        result = await readFirst(paths("settingsProfiles", ["./data/map-settings-profiles.json"]), null).catch(() => null);
        state.settingsProfiles = normalizeSettingsProfiles(result?.data || null);

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
            if (state.map) state.map.remove();
        } catch (error) {
            console.warn(error);
        }

        state.map = null;
        state.layer = null;
        state.polygonLayer = null;
        state.tileLayer = null;
        state.canvasRenderer = null;
        state.initialized = false;
    }

    async function reload() {
        await loadData();
        await renderPolygons();
        renderPoints();

        return state;
    }

    window.ZZXBitnodesMap = {
        state,
        init,
        destroy,
        renderPoints,
        renderPolygons,
        loadTheme,
        loadSettingsProfile,
        reload
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
