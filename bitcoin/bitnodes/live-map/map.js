(() => {"use strict";

const state = {
    map: null,
    layer: null,
    polygonLayer: null,
    vectors: null,
    settings: null,
    theme: null,
    themes: null,
    settingsProfiles: null,
    filter: "all"
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

function setStatus(message) {
    const target = qs("#bn-map-status");

    if (target) {
        target.textContent = message;
    }
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
    const response = await fetch(path, { cache: "no-store" });

    if (!response.ok) {
        throw new Error(`Failed to load ${path}: ${response.status}`);
    }

    return response.json();
}

function applyTheme(theme) {
    if (!theme) {
        return;
    }

    state.theme = theme;

    const vars = theme.css_variables || {};

    Object.entries(vars).forEach(([key, value]) => {
        document.documentElement.style.setProperty(key, value);
    });
}

async function loadTheme(themeId) {
    const id = themeId || state.settings?.theme?.selected || "zzx_dark_olive";
    const theme = await readJson(`./data/themes/${id}.json`).catch(() => readJson("./data/map-theme.json"));

    applyTheme(theme);

    return theme;
}

async function loadSettingsProfile(settingsId) {
    const id = settingsId || state.settings?.profile?.id || "default";
    const profile = await readJson(`./data/settings/${id}.json`);

    return profile;
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
            <div>Network: ${escapeHtml(point.network || "unknown")}</div>
            <div>Height: ${escapeHtml(point.height || "—")}</div>
            <div>Uptime: ${escapeHtml(Math.round(Number(point.uptime_seconds || 0)).toLocaleString())}s</div>
            <div>City: ${escapeHtml(point.city || "—")}</div>
            <div>County: ${escapeHtml(point.county || "—")}</div>
            <div>Territory: ${escapeHtml(point.territory || "—")}</div>
            <div>Country: ${escapeHtml(point.country_name || point.country || "—")}</div>
            <div>ASN: ${escapeHtml(point.asn || "—")}</div>
            <div>Provider: ${escapeHtml(point.provider || "—")}</div>
            <div>Agent: ${escapeHtml(point.agent || "—")}</div>
            <div>W3W: ${escapeHtml(point.w3w || "—")}</div>
            <div>GeohashID: ${escapeHtml(point.geohashid || "—")}</div>
        </div>
    `;
}

function filteredPoints() {
    const points = state.vectors?.points || [];

    if (state.filter === "all") {
        return points;
    }

    return points.filter(point => point.network === state.filter || point.status === state.filter);
}

function renderHud() {
    const target = qs("#bn-map-hud");

    if (!target || !state.vectors) {
        return;
    }

    const networks = state.vectors.network_counts || {};
    const statuses = state.vectors.status_counts || {};

    target.innerHTML = `
        <article><span>Total Points</span><strong>${Number(state.vectors.point_count || 0).toLocaleString()}</strong></article>
        <article><span>IPv4</span><strong>${Number(networks.ipv4 || 0).toLocaleString()}</strong></article>
        <article><span>IPv6</span><strong>${Number(networks.ipv6 || 0).toLocaleString()}</strong></article>
        <article><span>Tor</span><strong>${Number(networks.tor || 0).toLocaleString()}</strong></article>
        <article><span>I2P</span><strong>${Number(networks.i2p || 0).toLocaleString()}</strong></article>
        <article><span>Duplicate</span><strong>${Number(statuses["duplicate-location"] || 0).toLocaleString()}</strong></article>
        <article><span>Unsynced</span><strong>${Number(statuses["not-yet-synced"] || 0).toLocaleString()}</strong></article>
        <article><span>Stable 48h+</span><strong>${Number(statuses["stable-48h-plus"] || 0).toLocaleString()}</strong></article>
        <article><span>Synced 10m+</span><strong>${Number(statuses["synced-10m-plus"] || 0).toLocaleString()}</strong></article>
        <article><span>Synced</span><strong>${Number(statuses.synced || 0).toLocaleString()}</strong></article>
    `;
}

function renderLegend() {
    const target = qs("#bn-map-legend");

    if (!target || !state.vectors?.legend) {
        return;
    }

    target.innerHTML = Object.entries(state.vectors.legend).map(([key, item]) => `
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

    filteredPoints().forEach(point => {
        const lat = Number(point.latitude ?? point.lat);
        const lon = Number(point.longitude ?? point.lon);

        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return;
        }

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

    setStatus(`Loaded ${(filteredPoints().length).toLocaleString()} visible map points from ${state.vectors?.source || "selected source"}.`);
}

async function renderPolygons() {
    if (!state.map || !window.L) {
        return;
    }

    const polygons = await readJson("./data/map-polygons.geojson").catch(() => null);

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
                fillOpacity: Number(props.opacity || 0.08),
                opacity: Number(props.opacity || 0.22),
                weight: 1
            };
        },
        interactive: false
    });

    if (state.settings?.polygons?.visible === true) {
        state.polygonLayer.addTo(state.map);
    }
}

function populateThemeSelect() {
    const select = qs("[data-map-theme-select]");

    if (!select || !state.themes?.themes) {
        return;
    }

    select.innerHTML = state.themes.themes.map(theme => `
        <option value="${escapeHtml(theme.id)}">${escapeHtml(theme.name)}</option>
    `).join("");

    select.value = state.theme?.id || state.themes.default_theme || "zzx_dark_olive";

    select.addEventListener("change", async () => {
        await loadTheme(select.value);
    });
}

function populateSettingsSelect() {
    const select = qs("[data-map-settings-select]");

    if (!select || !state.settingsProfiles?.profiles) {
        return;
    }

    select.innerHTML = state.settingsProfiles.profiles.map(profile => `
        <option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)}</option>
    `).join("");

    select.value = state.settings?.profile?.id || state.settingsProfiles.default_settings || "default";

    select.addEventListener("change", async () => {
        const profile = await loadSettingsProfile(select.value);

        setStatus(`Settings profile "${profile.name || select.value}" loaded. Rebuild maps.py output to persist profile-derived normalized map settings.`);
    });
}

function wireControls(view) {
    qsa("[data-map-filter]").forEach(button => {
        button.addEventListener("click", () => {
            state.filter = button.dataset.mapFilter || "all";

            qsa("[data-map-filter]").forEach(item => {
                item.classList.toggle("is-active", item === button);
            });

            renderPoints();
        });
    });

    qs("[data-map-reset]")?.addEventListener("click", () => {
        state.map.setView(
            [Number(view.latitude || 20), Number(view.longitude || 0)],
            Number(view.zoom || 2)
        );
    });
}

async function init() {
    await loadLeaflet();

    state.settings = await readJson("./data/map-settings.json");
    state.vectors = await readJson("./data/map-vectors.json");
    state.themes = await readJson("./data/map-themes.json").catch(() => null);
    state.settingsProfiles = await readJson("./data/map-settings-profiles.json").catch(() => null);

    await loadTheme(state.settings?.theme?.selected || "zzx_dark_olive");

    const root = qs("[data-map-root]");

    if (!root) {
        return;
    }

    const view = state.settings.initial_view || {};
    const interaction = state.settings.interaction || {};

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

    window.L.tileLayer(state.settings.tile_url || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: state.settings.tile_attribution || "© OpenStreetMap contributors",
        subdomains: state.settings.tile_subdomains || undefined,
        maxZoom: Number(view.max_zoom || 18),
        minZoom: Number(view.min_zoom || 2)
    }).addTo(state.map);

    populateThemeSelect();
    populateSettingsSelect();
    wireControls(view);

    await renderPolygons();
    renderPoints();
}

document.addEventListener("DOMContentLoaded", () => {
    init().catch(error => {
        console.error(error);

        const root = qs("[data-map-root]");

        if (root) {
            root.innerHTML = `<div class="bn-chart-empty">${escapeHtml(error.message)}</div>`;
        }

        setStatus(`Map load failure: ${error.message}`);
    });
});

})();
