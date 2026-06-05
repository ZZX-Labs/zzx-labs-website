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
        filter: "all"
    };

    function qs(selector, scope = document) {
        return scope.querySelector(selector);
    }

    function qsa(selector, scope = document) {
        return Array.from(scope.querySelectorAll(selector));
    }

    function opt(name, fallback) {
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
        const target = qs(opt("statusSelector", "#bn-map-status"));

        if (target) {
            target.textContent = message;

            if (mode) {
                target.className = `bn-map-status ${mode}`.trim();
            }
        }
    }

    function firstArray(value, fallback = []) {
        return Array.isArray(value) ? value : fallback;
    }

    async function loadLeaflet() {
        return new Promise((resolve, reject) => {
            if (window.L) {
                resolve();
                return;
            }

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

        state.latestSource = path;

        return response.json();
    }

    async function readFirst(paths, fallback = null) {
        const list = Array.isArray(paths) ? paths : [paths];

        let lastError = null;

        for (const path of list) {
            if (!path) continue;

            try {
                return await readJson(path);
            } catch (error) {
                lastError = error;
            }
        }

        if (fallback !== null) {
            return fallback;
        }

        throw lastError || new Error("No readable map data source.");
    }

    function getPaths(name, fallback) {
        const paths = state.options?.paths || {};
        return paths[name] || fallback;
    }

    function getPathFactory(name, fallback) {
        const paths = state.options?.paths || {};
        return typeof paths[name] === "function" ? paths[name] : fallback;
    }

    function applyTheme(theme) {
        if (!theme) return;

        state.theme = theme;

        const vars = theme.css_variables || theme.variables || {};

        Object.entries(vars).forEach(([key, value]) => {
            document.documentElement.style.setProperty(key, value);
        });
    }

    async function loadTheme(themeId) {
        const id = themeId || state.settings?.theme?.selected || "zzx_dark_olive";

        const factory = getPathFactory("theme", selected => [
            `./data/themes/${selected}.json`,
            "./data/map-theme.json"
        ]);

        const theme = await readFirst(factory(id), {});
        applyTheme(theme);

        return theme;
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

    function vectorPoints() {
        const geoFeatures = state.geojson?.features;

        if (Array.isArray(geoFeatures) && geoFeatures.length) {
            return geoFeatures.map(featureToPoint);
        }

        const vectorPoints = state.vectors?.points;

        if (Array.isArray(vectorPoints)) {
            return vectorPoints;
        }

        return [];
    }

    function pointVisible(point) {
        const filter = state.filter || "all";

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
        return vectorPoints().filter(pointVisible);
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

    function countBy(points, key) {
        const counts = {};

        points.forEach(point => {
            const value = String(point[key] || "unknown").toLowerCase();
            counts[value] = (counts[value] || 0) + 1;
        });

        return counts;
    }

    function renderHud() {
        const target = qs(opt("hudSelector", "#bn-map-hud"));
        if (!target) return;

        const points = vectorPoints();
        const networks = state.vectors?.network_counts || countBy(points, "network");
        const statuses = state.vectors?.status_counts || countBy(points, "status");
        const intel = state.vectors?.intelligence_counts || {};

        target.innerHTML = `
            <article><span>Total Points</span><strong>${Number(points.length || state.vectors?.point_count || 0).toLocaleString()}</strong></article>
            <article><span>IPv4</span><strong>${Number(networks.ipv4 || 0).toLocaleString()}</strong></article>
            <article><span>IPv6</span><strong>${Number(networks.ipv6 || 0).toLocaleString()}</strong></article>
            <article><span>Tor</span><strong>${Number(networks.tor || 0).toLocaleString()}</strong></article>
            <article><span>I2P</span><strong>${Number(networks.i2p || 0).toLocaleString()}</strong></article>
            <article><span>Duplicate</span><strong>${Number(statuses["duplicate-location"] || 0).toLocaleString()}</strong></article>
            <article><span>Unreachable</span><strong>${Number(statuses.unreachable || 0).toLocaleString()}</strong></article>
            <article><span>VPN</span><strong>${Number(intel.vpn_nodes || 0).toLocaleString()}</strong></article>
            <article><span>Proxy</span><strong>${Number(intel.proxy_nodes || 0).toLocaleString()}</strong></article>
            <article><span>Datacenter</span><strong>${Number(intel.datacenter_nodes || 0).toLocaleString()}</strong></article>
        `;
    }

    function renderLegend() {
        const target = qs(opt("legendSelector", "#bn-map-legend"));
        if (!target) return;

        const legend = state.vectors?.legend || {};

        if (!Object.keys(legend).length) {
            target.innerHTML = "";
            return;
        }

        target.innerHTML = Object.entries(legend).map(([_key, item]) => `
            <span><i style="background:${escapeHtml(item.color || "#c0d674")}"></i>${escapeHtml(item.label || _key)}</span>
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
            `Loaded ${points.length.toLocaleString()} visible map points from ${state.latestSource || "selected source"}.`,
            points.length ? "live" : "warn"
        );
    }

    async function renderPolygons() {
        if (!state.map || !window.L) return;

        const polygons = await readFirst(
            getPaths("polygons", ["./data/map-polygons.geojson"]),
            null
        ).catch(() => null);

        if (!polygons || !Array.isArray(polygons.features)) return;

        if (state.polygonLayer) {
            state.polygonLayer.remove();
        }

        state.polygonLayer = window.L.geoJSON(polygons, {
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
        const select = qs(opt("themeSelectSelector", "[data-map-theme-select]"));
        if (!select || !state.themes?.themes) return;

        const themes = firstArray(state.themes.themes);

        select.innerHTML = themes.map(theme => `
            <option value="${escapeHtml(theme.id)}">${escapeHtml(theme.name || theme.id)}</option>
        `).join("");

        select.value = state.theme?.id || state.themes.default_theme || "zzx_dark_olive";

        select.addEventListener("change", async () => {
            await loadTheme(select.value);
        });
    }

    function populateSettingsSelect() {
        const select = qs(opt("settingsSelectSelector", "[data-map-settings-select]"));
        if (!select || !state.settingsProfiles?.profiles) return;

        const profiles = firstArray(state.settingsProfiles.profiles);

        select.innerHTML = profiles.map(profile => `
            <option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name || profile.id)}</option>
        `).join("");

        select.value = state.settings?.profile?.id || state.settingsProfiles.default_settings || "default";
    }

    function wireControls(view) {
        qsa(opt("filterSelector", "[data-map-filter]")).forEach(button => {
            button.addEventListener("click", () => {
                state.filter = button.dataset.mapFilter || "all";

                qsa(opt("filterSelector", "[data-map-filter]")).forEach(item => {
                    item.classList.toggle("is-active", item === button);
                });

                renderPoints();
            });
        });

        qs(opt("resetSelector", "[data-map-reset]"))?.addEventListener("click", () => {
            state.map.setView(
                [Number(view.latitude || 20), Number(view.longitude || 0)],
                Number(view.zoom || 2)
            );
        });
    }

    async function loadData() {
        state.settings = await readFirst(getPaths("settings", ["./data/map-settings.json"]));
        state.geojson = await readFirst(getPaths("vectors", ["./data/map-points.geojson"]));
        state.vectors = await readFirst(getPaths("vectorManifest", ["./data/map-vectors.json"]), {});
        state.vectorTypes = await readFirst(getPaths("vectorTypes", ["./data/vector-types.json"]), null).catch(() => null);
        state.themes = await readFirst(getPaths("themes", ["./data/map-themes.json"]), null).catch(() => null);
        state.settingsProfiles = await readFirst(getPaths("settingsProfiles", ["./data/map-settings-profiles.json"]), null).catch(() => null);

        await loadTheme(state.settings?.theme?.selected || "zzx_dark_olive");
    }

    async function init(options = {}) {
        state.options = options || {};

        await loadLeaflet();
        await loadData();

        const root = qs(opt("rootSelector", "[data-map-root]"));

        if (!root) {
            throw new Error("Map root not found.");
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

        window.L.tileLayer(
            state.settings?.tile_url || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                attribution: state.settings?.tile_attribution || "© OpenStreetMap contributors",
                subdomains: state.settings?.tile_subdomains || undefined,
                maxZoom: Number(view.max_zoom || 20),
                minZoom: Number(view.min_zoom || 2)
            }
        ).addTo(state.map);

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
            if (state.map) state.map.remove();
        } catch (error) {
            console.warn(error);
        }

        state.map = null;
        state.layer = null;
        state.polygonLayer = null;
        state.canvasRenderer = null;
        state.initialized = false;
    }

    async function reload() {
        await loadData();
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
