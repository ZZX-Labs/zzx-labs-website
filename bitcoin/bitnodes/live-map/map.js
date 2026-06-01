(() => {
    "use strict";

    const DEFAULT_REFRESH_MS = 30000;

    const DEFAULT_LEGEND = {
        ipv4: {
            color: "#c0d674",
            label: "IPv4"
        },
        ipv6: {
            color: "#70b7ff",
            label: "IPv6"
        },
        tor: {
            color: "#9d67ad",
            label: "Tor"
        },
        i2p: {
            color: "#e6a42b",
            label: "I2P"
        },
        unknown: {
            color: "#8c927e",
            label: "Unknown"
        }
    };

    const DEFAULT_OPTIONS = {
        mode: "map",
        refreshMs: 0,

        rootSelector: "[data-map-root]",
        statusSelector: "#bn-map-status",
        hudSelector: "#bn-map-hud",
        legendSelector: "#bn-map-legend",

        themeSelectSelector: "[data-map-theme-select]",
        settingsSelectSelector: "[data-map-settings-select]",

        resetSelector: "[data-map-reset]",
        filterSelector: "[data-map-filter]",

        paths: {
            settings: [
                "./data/map-settings.json",
                "./zzxbitnodes/data/map-settings.json",
                "./global/data/map-settings.json",
                "./originalbitnodes/data/map-settings.json",
                "./global/live-map.json",
                "./zzxbitnodes/live-map.json",
                "./originalbitnodes/live-map.json"
            ],

            vectors: [
                "./data/map-vectors.json",
                "./global/points.json",
                "./zzxbitnodes/points.json",
                "./originalbitnodes/points.json",
                "./global/live-map.json",
                "./zzxbitnodes/live-map.json",
                "./originalbitnodes/live-map.json",
                "./global/nodes.geojson",
                "./zzxbitnodes/nodes.geojson",
                "./originalbitnodes/nodes.geojson"
            ],

            themes: [
                "./data/map-themes.json",
                "./zzxbitnodes/data/map-themes.json",
                "./global/data/map-themes.json",
                "./originalbitnodes/data/map-themes.json"
            ],

            theme: id => [
                `./data/themes/${id}.json`,
                `./zzxbitnodes/data/themes/${id}.json`,
                `./global/data/themes/${id}.json`,
                `./originalbitnodes/data/themes/${id}.json`,
                "./data/map-theme.json",
                "./zzxbitnodes/data/map-theme.json",
                "./global/data/map-theme.json",
                "./originalbitnodes/data/map-theme.json"
            ],

            settingsProfiles: [
                "./data/map-settings-profiles.json",
                "./zzxbitnodes/data/map-settings-profiles.json",
                "./global/data/map-settings-profiles.json",
                "./originalbitnodes/data/map-settings-profiles.json"
            ],

            settingsProfile: id => [
                `./data/settings/${id}.json`,
                `./zzxbitnodes/data/settings/${id}.json`,
                `./global/data/settings/${id}.json`,
                `./originalbitnodes/data/settings/${id}.json`
            ],

            polygons: [
                "./data/map-polygons.geojson",
                "./zzxbitnodes/data/map-polygons.geojson",
                "./global/data/map-polygons.geojson",
                "./originalbitnodes/data/map-polygons.geojson"
            ]
        }
    };

    const state = {
        options: null,

        map: null,
        layer: null,
        polygonLayer: null,
        canvasRenderer: null,

        vectors: null,
        settings: null,
        theme: null,
        themes: null,
        settingsProfiles: null,

        filter: "all",
        timer: null,
        lastPointIds: new Set(),
        latestSource: "unknown"
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

    function cacheBust(path) {
        const sep = String(path).includes("?") ? "&" : "?";
        return `${path}${sep}t=${Date.now()}`;
    }

    function setStatus(message) {
        const target = qs(state.options.statusSelector);

        if (target) {
            target.textContent = message;
        }
    }

    function mergeOptions(userOptions = {}) {
        return {
            ...DEFAULT_OPTIONS,
            ...userOptions,
            paths: {
                ...DEFAULT_OPTIONS.paths,
                ...(userOptions.paths || {})
            }
        };
    }

    function loadLeaflet() {
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
        const response = await fetch(cacheBust(path), {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`Failed to load ${path}: ${response.status}`);
        }

        state.latestSource = path;

        return response.json();
    }

    async function readFirst(paths) {
        let lastError = null;

        for (const path of paths || []) {
            try {
                return await readJson(path);
            } catch (err) {
                lastError = err;
            }
        }

        throw lastError || new Error("No JSON source paths provided.");
    }

    function applyTheme(theme) {
        if (!theme || typeof theme !== "object") {
            return;
        }

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
            "zzx_dark_olive";

        const themePaths =
            typeof state.options.paths.theme === "function"
                ? state.options.paths.theme(id)
                : state.options.paths.theme;

        const theme = await readFirst(themePaths);

        applyTheme(theme);

        return theme;
    }

    async function loadSettingsProfile(settingsId) {
        const id =
            settingsId ||
            state.settings?.profile?.id ||
            state.settingsProfiles?.default_settings ||
            "default";

        const profilePaths =
            typeof state.options.paths.settingsProfile === "function"
                ? state.options.paths.settingsProfile(id)
                : state.options.paths.settingsProfile;

        return readFirst(profilePaths);
    }

    function normalizeGeoJson(data) {
        const features = Array.isArray(data?.features) ? data.features : [];

        const points = features.map(feature => {
            const props = feature.properties || {};
            const coords = feature.geometry?.coordinates || [];

            return {
                ...props,
                longitude: coords[0],
                latitude: coords[1],
                id: props.id || props.address || props.node,
                address: props.address || props.node || props.id
            };
        });

        return {
            source: data.source || state.latestSource,
            point_count: points.length,
            points,
            network_counts: countBy(points, point => point.network || "unknown"),
            status_counts: countBy(points, point => point.status || "unknown"),
            legend: DEFAULT_LEGEND
        };
    }

    function normalizePointsJson(data) {
        if (Array.isArray(data)) {
            return {
                source: state.latestSource,
                point_count: data.length,
                points: data,
                network_counts: countBy(data, point => point.network || "unknown"),
                status_counts: countBy(data, point => point.status || "unknown"),
                legend: DEFAULT_LEGEND
            };
        }

        if (Array.isArray(data?.points)) {
            return {
                source: data.source || state.latestSource,
                point_count: data.point_count || data.points.length,
                points: data.points,
                network_counts: data.network_counts || countBy(data.points, point => point.network || "unknown"),
                status_counts: data.status_counts || countBy(data.points, point => point.status || "unknown"),
                legend: data.legend || DEFAULT_LEGEND,
                build: data.build || data.meta || null
            };
        }

        if (Array.isArray(data?.nodes)) {
            return {
                source: data.source || state.latestSource,
                point_count: data.nodes.length,
                points: data.nodes,
                network_counts: data.network_counts || countBy(data.nodes, point => point.network || "unknown"),
                status_counts: data.status_counts || countBy(data.nodes, point => point.status || "unknown"),
                legend: data.legend || DEFAULT_LEGEND,
                build: data.build || data.meta || null
            };
        }

        if (data?.type === "FeatureCollection") {
            return normalizeGeoJson(data);
        }

        return {
            source: state.latestSource,
            point_count: 0,
            points: [],
            network_counts: {},
            status_counts: {},
            legend: DEFAULT_LEGEND
        };
    }

    function countBy(rows, fn) {
        const out = {};

        for (const row of rows || []) {
            const key = String(fn(row) || "unknown").toLowerCase();
            out[key] = (out[key] || 0) + 1;
        }

        return out;
    }

    function pointId(point) {
        return String(
            point.id ||
            point.address ||
            point.node ||
            point.addr ||
            `${point.latitude},${point.longitude}`
        );
    }

    function pointNetwork(point) {
        const address = String(point.address || point.node || point.id || "").toLowerCase();
        const network = String(point.network || "").toLowerCase();

        if (network) {
            return network;
        }

        if (address.includes(".onion")) {
            return "tor";
        }

        if (address.includes(".i2p")) {
            return "i2p";
        }

        if (address.includes(":")) {
            return "ipv6";
        }

        return "ipv4";
    }

    function pointColor(point) {
        const network = pointNetwork(point);
        const legend = state.vectors?.legend || DEFAULT_LEGEND;

        if (point.color) {
            return point.color;
        }

        return legend[network]?.color || legend.unknown?.color || "#8c927e";
    }

    function radius(point) {
        const dup = number(point.duplicate_count || point.count || point.weight || 1, 1);
        const min = number(state.settings?.marker?.radius_min, 4);
        const max = number(state.settings?.marker?.radius_max, 14);

        return Math.max(
            min,
            Math.min(
                max,
                min + Math.log2(dup + 1) * 3
            )
        );
    }

    function markerPopup(point) {
        return `
            <div class="bn-map-popup">
                <strong>${escapeHtml(point.address || point.node || point.id || "Unknown node")}</strong>
                <div>Status: ${escapeHtml(point.status_label || point.status || "Unknown")}</div>
                <div>Network: ${escapeHtml(pointNetwork(point))}</div>
                <div>Height: ${escapeHtml(point.height || point.block_height || "—")}</div>
                <div>Uptime: ${escapeHtml(Math.round(number(point.uptime_seconds, 0)).toLocaleString())}s</div>
                <div>City: ${escapeHtml(point.city || "—")}</div>
                <div>County: ${escapeHtml(point.county || "—")}</div>
                <div>Territory: ${escapeHtml(point.territory || "—")}</div>
                <div>Country: ${escapeHtml(point.country_name || point.country || "—")}</div>
                <div>ASN: ${escapeHtml(point.asn || "—")}</div>
                <div>Provider: ${escapeHtml(point.provider || "—")}</div>
                <div>Organization: ${escapeHtml(point.organization || point.org || "—")}</div>
                <div>Agent: ${escapeHtml(point.agent || point.user_agent || "—")}</div>
                <div>W3W: ${escapeHtml(point.w3w || "—")}</div>
                <div>GeohashID: ${escapeHtml(point.geohashid || point.geohash || "—")}</div>
            </div>
        `;
    }

    function filteredPoints() {
        const points = state.vectors?.points || [];

        if (state.filter === "all") {
            return points;
        }

        return points.filter(point => {
            const network = pointNetwork(point);
            const status = String(point.status || "").toLowerCase();

            return network === state.filter || status === state.filter;
        });
    }

    function renderHud() {
        const target = qs(state.options.hudSelector);

        if (!target || !state.vectors) {
            return;
        }

        const points = state.vectors.points || [];
        const visible = filteredPoints();
        const networks = state.vectors.network_counts || countBy(points, pointNetwork);
        const statuses = state.vectors.status_counts || countBy(points, point => point.status || "unknown");

        const currentIds = new Set(points.map(pointId));
        let newCount = 0;

        for (const id of currentIds) {
            if (!state.lastPointIds.has(id)) {
                newCount += 1;
            }
        }

        const lostCount = Math.max(0, state.lastPointIds.size - currentIds.size);

        target.innerHTML = `
            <article><span>Total Points</span><strong>${number(state.vectors.point_count || points.length).toLocaleString()}</strong></article>
            <article><span>Visible</span><strong>${number(visible.length).toLocaleString()}</strong></article>
            <article><span>New</span><strong>${number(newCount).toLocaleString()}</strong></article>
            <article><span>Lost</span><strong>${number(lostCount).toLocaleString()}</strong></article>
            <article><span>IPv4</span><strong>${number(networks.ipv4).toLocaleString()}</strong></article>
            <article><span>IPv6</span><strong>${number(networks.ipv6).toLocaleString()}</strong></article>
            <article><span>Tor</span><strong>${number(networks.tor).toLocaleString()}</strong></article>
            <article><span>I2P</span><strong>${number(networks.i2p).toLocaleString()}</strong></article>
            <article><span>Duplicate</span><strong>${number(statuses["duplicate-location"]).toLocaleString()}</strong></article>
            <article><span>Synced</span><strong>${number(statuses.synced).toLocaleString()}</strong></article>
        `;

        state.lastPointIds = currentIds;
    }

    function renderLegend() {
        const target = qs(state.options.legendSelector);

        if (!target) {
            return;
        }

        const legend = state.vectors?.legend || DEFAULT_LEGEND;

        target.innerHTML = Object.entries(legend).map(([, item]) => `
            <span>
                <i style="background:${escapeHtml(item.color)}"></i>
                ${escapeHtml(item.label)}
            </span>
        `).join("");
    }

    function renderPoints() {
        if (!state.map || !window.L) {
            return;
        }

        if (state.layer) {
            state.layer.remove();
        }

        state.layer = window.L.layerGroup();

        const points = filteredPoints();

        points.forEach(point => {
            const lat = number(point.latitude ?? point.lat, NaN);
            const lon = number(point.longitude ?? point.lon ?? point.lng, NaN);

            if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                return;
            }

            const color = pointColor(point);

            const marker = window.L.circleMarker([lat, lon], {
                radius: radius(point),
                color,
                fillColor: color,
                fillOpacity: number(state.settings?.marker?.fill_opacity, 0.72),
                opacity: number(state.settings?.marker?.opacity, 0.95),
                weight: number(state.settings?.marker?.stroke_weight, 1),
                renderer:
                    state.settings?.performance?.prefer_canvas_renderer !== false &&
                    state.canvasRenderer
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
            `Loaded ${points.length.toLocaleString()} visible ${state.options.mode} points from ${state.vectors?.source || state.latestSource || "selected source"}.`
        );
    }

    async function renderPolygons() {
        if (!state.map || !window.L) {
            return;
        }

        const polygons = await readFirst(state.options.paths.polygons).catch(() => null);

        if (!polygons || !Array.isArray(polygons.features)) {
            return;
        }

        if (state.polygonLayer) {
            state.polygonLayer.remove();
        }

        state.polygonLayer = window.L.geoJSON(polygons, {
            style: feature => {
                const props = feature.properties || {};

                return {
                    color: props.stroke || "#c0d674",
                    fillColor: props.fill || "#c0d674",
                    fillOpacity: number(props.fill_opacity ?? props.opacity, 0.08),
                    opacity: number(props.opacity, 0.22),
                    weight: number(props.weight, 1)
                };
            },
            interactive: false
        });

        if (state.settings?.polygons?.visible === true) {
            state.polygonLayer.addTo(state.map);
        }
    }

    function populateThemeSelect() {
        const select = qs(state.options.themeSelectSelector);

        if (!select) {
            return;
        }

        const themes = state.themes?.themes || [
            {
                id: "zzx_dark_olive",
                name: "ZZX Dark Olive"
            }
        ];

        select.innerHTML = themes.map(theme => `
            <option value="${escapeHtml(theme.id)}">${escapeHtml(theme.name)}</option>
        `).join("");

        select.value =
            state.theme?.id ||
            state.themes?.default_theme ||
            state.settings?.theme?.selected ||
            "zzx_dark_olive";

        select.addEventListener("change", async () => {
            await loadTheme(select.value);
            renderPoints();
        });
    }

    function populateSettingsSelect() {
        const select = qs(state.options.settingsSelectSelector);

        if (!select) {
            return;
        }

        const profiles = state.settingsProfiles?.profiles || [
            {
                id: "default",
                name: "Default"
            }
        ];

        select.innerHTML = profiles.map(profile => `
            <option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)}</option>
        `).join("");

        select.value =
            state.settings?.profile?.id ||
            state.settingsProfiles?.default_settings ||
            "default";

        select.addEventListener("change", async () => {
            const profile = await loadSettingsProfile(select.value).catch(() => null);

            if (profile) {
                state.settings = {
                    ...state.settings,
                    ...profile
                };

                setStatus(`Settings profile "${profile.name || select.value}" loaded.`);
                renderPoints();
            } else {
                setStatus(`Settings profile "${select.value}" unavailable.`);
            }
        });
    }

    function wireControls(view) {
        qsa(state.options.filterSelector).forEach(button => {
            button.addEventListener("click", () => {
                state.filter = button.dataset.mapFilter || "all";

                qsa(state.options.filterSelector).forEach(item => {
                    item.classList.toggle("is-active", item === button);
                });

                renderPoints();
            });
        });

        qs(state.options.resetSelector)?.addEventListener("click", () => {
            state.map.setView(
                [
                    number(view.latitude, 20),
                    number(view.longitude, 0)
                ],
                number(view.zoom, 2)
            );
        });
    }

    async function loadMapData() {
        const settings = await readFirst(state.options.paths.settings).catch(() => ({}));
        const vectorsRaw = await readFirst(state.options.paths.vectors);

        state.settings = settings;
        state.vectors = normalizePointsJson(vectorsRaw);

        state.themes = await readFirst(state.options.paths.themes).catch(() => null);
        state.settingsProfiles = await readFirst(state.options.paths.settingsProfiles).catch(() => null);
    }

    async function refreshData() {
        const previousIds = new Set((state.vectors?.points || []).map(pointId));

        await loadMapData();

        state.lastPointIds = previousIds;

        renderPoints();
    }

    async function init(userOptions = {}) {
        state.options = mergeOptions(userOptions);

        await loadLeaflet();
        await loadMapData();

        await loadTheme(
            state.settings?.theme?.selected ||
            state.themes?.default_theme ||
            "zzx_dark_olive"
        );

        const root = qs(state.options.rootSelector);

        if (!root) {
            return;
        }

        const view = state.settings.initial_view || {};
        const interaction = state.settings.interaction || {};

        state.canvasRenderer = window.L.canvas({
            padding: 0.35
        });

        state.map = window.L.map(root, {
            scrollWheelZoom: interaction.scroll_wheel_zoom !== false,
            doubleClickZoom: interaction.double_click_zoom !== false,
            boxZoom: interaction.box_zoom !== false,
            keyboard: interaction.keyboard !== false,
            preferCanvas: state.settings?.performance?.prefer_canvas_renderer !== false
        }).setView(
            [
                number(view.latitude, 20),
                number(view.longitude, 0)
            ],
            number(view.zoom, 2)
        );

        window.L.tileLayer(
            state.settings.tile_url ||
                "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                attribution:
                    state.settings.tile_attribution ||
                    "© OpenStreetMap contributors",
                subdomains:
                    state.settings.tile_subdomains ||
                    undefined,
                maxZoom: number(view.max_zoom, 18),
                minZoom: number(view.min_zoom, 2)
            }
        ).addTo(state.map);

        populateThemeSelect();
        populateSettingsSelect();
        wireControls(view);

        await renderPolygons();

        renderPoints();

        if (number(state.options.refreshMs, 0) > 0) {
            clearInterval(state.timer);

            state.timer = setInterval(() => {
                refreshData().catch(err => {
                    console.error(err);
                    setStatus(`Live refresh failure: ${err.message}`);
                });
            }, number(state.options.refreshMs, DEFAULT_REFRESH_MS));
        }
    }

    window.ZZXBitnodesMap = {
        init,
        refresh: refreshData,
        renderPoints,
        state
    };
})();
