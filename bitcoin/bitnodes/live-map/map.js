(() => {
    "use strict";

    const state = {
        map: null,
        layer: null,
        polygonLayer: null,
        canvasRenderer: null,
        vectors: null,
        vectorTypes: null,
        settings: null,
        theme: null,
        themes: null,
        settingsProfiles: null,
        filter: "all",
        search: ""
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

    function text(value, fallback = "—") {
        const out = String(value ?? "").trim();
        return out || fallback;
    }

    function lower(value) {
        return String(value ?? "").trim().toLowerCase();
    }

    function bool(value) {
        if (value === true || value === 1 || value === "1") return true;
        return ["true", "yes", "y", "ok", "matched", "listed", "flagged", "confirmed"]
            .includes(lower(value));
    }

    function first(point, keys, fallback = "") {
        for (const key of keys) {
            const parts = key.split(".");
            let current = point;

            for (const part of parts) {
                if (!current || typeof current !== "object") {
                    current = undefined;
                    break;
                }

                current = current[part];
            }

            if (current !== undefined && current !== null && String(current).trim() !== "") {
                return current;
            }
        }

        return fallback;
    }

    function setStatus(message, mode = "") {
        const target = qs("#bn-map-status");

        if (!target) return;

        target.textContent = message;
        target.classList.remove("live", "warn", "error");

        if (mode) {
            target.classList.add(mode);
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
        if (!theme) return;

        state.theme = theme;

        Object.entries(theme.css_variables || {}).forEach(([key, value]) => {
            document.documentElement.style.setProperty(key, value);
        });
    }

    async function loadTheme(themeId) {
        const id = themeId || state.settings?.theme?.selected || "zzx_dark_olive";
        const theme = await readJson(`./data/themes/${id}.json`)
            .catch(() => readJson("./data/map-theme.json"));

        applyTheme(theme);
        return theme;
    }

    function pointNetwork(point) {
        return lower(first(point, [
            "network",
            "address_family",
            "metadata.network"
        ], "unknown"));
    }

    function pointStatus(point) {
        return lower(first(point, [
            "status",
            "metadata.status"
        ], "unknown")).replaceAll("_", "-");
    }

    function isVpn(point) {
        return bool(first(point, [
            "is_vpn",
            "suspected_vpn",
            "vpn.is_vpn",
            "vpn_data.is_vpn",
            "metadata.is_vpn"
        ]));
    }

    function isProxy(point) {
        return bool(first(point, [
            "is_proxy",
            "suspected_proxy",
            "proxy.is_proxy",
            "proxy_data.is_proxy",
            "metadata.is_proxy"
        ]));
    }

    function isSanctioned(point) {
        return bool(first(point, [
            "is_sanctioned",
            "is_sanctioned_node",
            "sanctions_data.is_sanctioned",
            "metadata.is_sanctioned_node"
        ]));
    }

    function isPolicyRestricted(point) {
        return bool(first(point, [
            "policy_restricted",
            "is_policy_restricted_node",
            "sanctions_data.is_policy_restricted",
            "metadata.is_policy_restricted_node"
        ]));
    }

    function isThreat(point) {
        const level = lower(first(point, [
            "threat_level",
            "tag_threat_level",
            "threat_infrastructure.threat_level",
            "tag_attribution.threat_level",
            "metadata.threat_level"
        ]));

        return bool(first(point, [
            "is_threat_infrastructure",
            "suspected_threat_infrastructure",
            "threat_infrastructure.is_threat_infrastructure",
            "confirmed_intelligence_match"
        ])) || ["confirmed", "high", "medium", "low"].includes(level);
    }

    function pointVisible(point) {
        const network = pointNetwork(point);
        const status = pointStatus(point);

        if (state.filter !== "all") {
            if (state.filter === "vpn" && !isVpn(point)) return false;
            else if (state.filter === "proxy" && !isProxy(point)) return false;
            else if (state.filter === "synced" && !["synced", "stable-48h-plus", "stable-1w-plus", "synced-under-10m", "synced-10m-plus"].includes(status)) return false;
            else if (state.filter === "unsynced" && !["unsynced", "not-yet-synced"].includes(status)) return false;
            else if (state.filter === "unreachable" && status !== "unreachable" && status !== "became-unreachable") return false;
            else if (!["vpn", "proxy", "synced", "unsynced", "unreachable"].includes(state.filter) && network !== state.filter && status !== state.filter) return false;
        }

        if (!state.search) return true;

        const haystack = [
            point.address,
            point.id,
            point.node,
            point.host,
            point.agent,
            point.user_agent,
            point.asn,
            point.provider,
            point.organization,
            point.org,
            point.country,
            point.country_name,
            point.city,
            point.county,
            point.territory,
            point.region,
            point.timezone,
            point.map_timezone,
            point.map_country_label,
            point.map_city_label,
            point.map_geohashid,
            point.map_zzxgcs,
            point.map_w3w,
            point.w3w,
            point.zzxgcs,
            point.geohashid,
            network,
            status
        ].join(" ").toLowerCase();

        return haystack.includes(state.search);
    }

    function filteredPoints() {
        return (state.vectors?.points || []).filter(pointVisible);
    }

    function radius(point) {
        const duplicateCount = Number(point.duplicate_count || point.point_count || 1);
        const min = Number(state.settings?.marker?.radius_min || 4);
        const max = Number(state.settings?.marker?.radius_max || 14);

        return Math.max(min, Math.min(max, min + Math.log2(duplicateCount + 1) * 3));
    }

    function pointColor(point) {
        if (isSanctioned(point)) return "#ff0000";
        if (isPolicyRestricted(point)) return "#ff3b30";
        if (isThreat(point)) return "#ff9500";

        return first(point, [
            "color",
            "map_country_color",
            "map_city_color",
            "map_geohashid_color",
            "metadata.color"
        ], "#c0d674");
    }

    function nodeInfoHtml(point) {
        const rows = [
            ["Node", first(point, ["address", "id", "node", "host"], "Unknown node")],
            ["Status", first(point, ["status_label", "status"], "Unknown")],
            ["Network", pointNetwork(point)],
            ["Height", first(point, ["height", "block_height"], "—")],
            ["Uptime", `${Math.round(Number(point.uptime_seconds || 0)).toLocaleString()}s`],
            ["City", first(point, ["city", "map_city_name", "map_city_label"], "—")],
            ["County", first(point, ["county", "map_county_label"], "—")],
            ["Territory", first(point, ["territory", "map_territory_label"], "—")],
            ["Country", first(point, ["country_name", "map_country_label", "country"], "—")],
            ["Timezone", first(point, ["timezone", "map_timezone", "map_timezone_label"], "—")],
            ["ASN", first(point, ["asn", "asn_data.asn"], "—")],
            ["Provider", first(point, ["provider", "provider_data.provider", "organization", "org"], "—")],
            ["Agent", first(point, ["agent", "user_agent"], "—")],
            ["VPN", isVpn(point) ? "yes" : "no"],
            ["Proxy", isProxy(point) ? "yes" : "no"],
            ["Sanctioned", isSanctioned(point) ? "yes" : "no"],
            ["Policy Restricted", isPolicyRestricted(point) ? "yes" : "no"],
            ["Threat Flag", isThreat(point) ? "yes" : "no"],
            ["W3W", first(point, ["w3w", "map_w3w"], "—")],
            ["ZZX-GCS", first(point, ["zzxgcs", "map_zzxgcs"], "—")],
            ["GeoHashID", first(point, ["geohashid", "map_geohashid"], "—")]
        ];

        return `
            <h3>${escapeHtml(first(point, ["address", "id", "node", "host"], "Selected Node"))}</h3>
            <div class="bn-node-grid">
                ${rows.map(([label, value]) => `
                    <div>
                        <strong>${escapeHtml(label)}</strong>
                        <span>${escapeHtml(value)}</span>
                    </div>
                `).join("")}
            </div>
        `;
    }

    function showNodeInfo(point) {
        const target = qs("#bn-map-node-info");

        if (!target) return;

        target.innerHTML = nodeInfoHtml(point);
    }

    function markerPopup(point) {
        return `
            <div class="bn-map-popup">
                <strong>${escapeHtml(first(point, ["address", "id", "node", "host"], "Unknown node"))}</strong>
                <div>Status: ${escapeHtml(first(point, ["status_label", "status"], "Unknown"))}</div>
                <div>Network: ${escapeHtml(pointNetwork(point))}</div>
                <div>Height: ${escapeHtml(first(point, ["height", "block_height"], "—"))}</div>
                <div>City: ${escapeHtml(first(point, ["city", "map_city_name", "map_city_label"], "—"))}</div>
                <div>Country: ${escapeHtml(first(point, ["country_name", "map_country_label", "country"], "—"))}</div>
                <div>ASN: ${escapeHtml(first(point, ["asn", "asn_data.asn"], "—"))}</div>
                <div>Provider: ${escapeHtml(first(point, ["provider", "provider_data.provider", "organization", "org"], "—"))}</div>
                <div>VPN: ${isVpn(point) ? "yes" : "no"}</div>
                <div>Proxy: ${isProxy(point) ? "yes" : "no"}</div>
                <div>Sanctioned: ${isSanctioned(point) ? "yes" : "no"}</div>
                <div>Threat: ${isThreat(point) ? "yes" : "no"}</div>
            </div>
        `;
    }

    function renderHud() {
        const target = qs("#bn-map-hud");

        if (!target || !state.vectors) return;

        const networks = state.vectors.network_counts || {};
        const statuses = state.vectors.status_counts || {};
        const intel = state.vectors.intelligence_counts || {};
        const security = state.vectors.security_counts || {};

        target.innerHTML = `
            <article><span>Total Points</span><strong>${Number(state.vectors.point_count || state.vectors.total_points || 0).toLocaleString()}</strong></article>
            <article><span>Visible</span><strong>${filteredPoints().length.toLocaleString()}</strong></article>
            <article><span>IPv4</span><strong>${Number(networks.ipv4 || 0).toLocaleString()}</strong></article>
            <article><span>IPv6</span><strong>${Number(networks.ipv6 || 0).toLocaleString()}</strong></article>
            <article><span>Tor</span><strong>${Number(networks.tor || 0).toLocaleString()}</strong></article>
            <article><span>I2P</span><strong>${Number(networks.i2p || 0).toLocaleString()}</strong></article>
            <article><span>Unreachable</span><strong>${Number(statuses.unreachable || statuses["became-unreachable"] || 0).toLocaleString()}</strong></article>
            <article><span>VPN</span><strong>${Number(intel.vpn_nodes || 0).toLocaleString()}</strong></article>
            <article><span>Proxy</span><strong>${Number(intel.proxy_nodes || 0).toLocaleString()}</strong></article>
            <article><span>Sanctioned</span><strong>${Number(security.sanctioned_nodes || 0).toLocaleString()}</strong></article>
        `;
    }

    function renderLegend() {
        const target = qs("#bn-map-legend");

        if (!target) return;

        const legend = state.vectors?.legend || {
            ipv4: { label: "IPv4 / Public", color: "#c0d674" },
            ipv6: { label: "IPv6", color: "#70b7ff" },
            tor: { label: "Tor", color: "#9d67ad" },
            i2p: { label: "I2P", color: "#b889ff" },
            vpn: { label: "VPN", color: "#e6a42b" },
            proxy: { label: "Proxy", color: "#d9a65c" },
            sanctioned: { label: "Sanctioned / Red Ring", color: "#ff0000" },
            threat: { label: "Threat / Policy Attention", color: "#ff9500" },
            unknown: { label: "Unknown", color: "#8c927e" }
        };

        target.innerHTML = Object.entries(legend).map(([key, item]) => {
            const className = key.includes("sanction") ? "legend-sanctioned" : key.includes("threat") ? "legend-threat" : "";

            return `
                <span class="${className}">
                    <i style="background:${escapeHtml(item.color)}"></i>${escapeHtml(item.label)}
                </span>
            `;
        }).join("");
    }

    function renderPoints() {
        if (!state.map || !window.L) return;

        if (state.layer) {
            state.layer.remove();
        }

        state.layer = window.L.layerGroup();

        filteredPoints().forEach(point => {
            const lat = Number(first(point, ["latitude", "lat", "geo.latitude", "metadata.latitude"]));
            const lon = Number(first(point, ["longitude", "lon", "lng", "geo.longitude", "metadata.longitude"]));

            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

            const color = pointColor(point);
            const marker = window.L.circleMarker([lat, lon], {
                radius: radius(point),
                color,
                fillColor: color,
                fillOpacity: Number(state.settings?.marker?.fill_opacity || 0.72),
                opacity: Number(state.settings?.marker?.opacity || 0.95),
                weight: isSanctioned(point) || isPolicyRestricted(point) || isThreat(point)
                    ? 3
                    : Number(state.settings?.marker?.stroke_weight || 1),
                renderer: state.settings?.performance?.prefer_canvas_renderer && state.canvasRenderer
                    ? state.canvasRenderer
                    : undefined
            });

            marker.bindPopup(markerPopup(point));
            marker.on("click", () => showNodeInfo(point));
            marker.addTo(state.layer);
        });

        state.layer.addTo(state.map);

        renderHud();
        renderLegend();

        setStatus(
            `Loaded ${filteredPoints().length.toLocaleString()} visible map points from ${state.vectors?.source || "selected source"}.`,
            "live"
        );
    }

    async function renderPolygons() {
        if (!state.map || !window.L) return;

        const polygons = await readJson("./data/map-polygons.geojson").catch(() => null);

        if (!polygons || !Array.isArray(polygons.features)) return;

        if (state.polygonLayer) {
            state.polygonLayer.remove();
        }

        state.polygonLayer = window.L.geoJSON(polygons, {
            style: feature => {
                const props = feature.properties || {};
                return {
                    color: props.stroke || props.color || "#c0d674",
                    fillColor: props.fill || props.color || "#c0d674",
                    fillOpacity: Number(props.fill_opacity || props.fillOpacity || 0.08),
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
        const select = qs("[data-map-theme-select]");

        if (!select || !state.themes?.themes) return;

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

        if (!select || !state.settingsProfiles?.profiles) return;

        select.innerHTML = state.settingsProfiles.profiles.map(profile => `
            <option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)}</option>
        `).join("");

        select.value = state.settings?.profile?.id || state.settingsProfiles.default_settings || "default";
    }

    function wireLegendToggle() {
        const button = qs("#bn-map-legend-toggle");
        const legend = qs("#bn-map-legend");

        if (!button || !legend) return;

        button.addEventListener("click", () => {
            const open = legend.classList.toggle("is-open");
            button.textContent = open ? "Hide Key" : "Show Key";
            button.setAttribute("aria-expanded", String(open));
        });
    }

    function wireSearch() {
        const input = qs("[data-map-search]");
        const clear = qs("[data-map-search-clear]");

        if (input) {
            input.addEventListener("input", () => {
                state.search = lower(input.value);
                renderPoints();
            });
        }

        if (clear) {
            clear.addEventListener("click", () => {
                state.search = "";

                if (input) {
                    input.value = "";
                    input.focus();
                }

                renderPoints();
            });
        }
    }

    function wireToneToggle() {
        const button = qs("[data-map-tone-toggle]");

        if (!button) return;

        document.body.classList.add("bn-map-tone-dark");

        button.addEventListener("click", () => {
            const dark = !document.body.classList.contains("bn-map-tone-dark");

            document.body.classList.toggle("bn-map-tone-dark", dark);
            document.body.classList.toggle("bn-map-tone-light", !dark);

            button.textContent = dark ? "Dark" : "Light";
            button.setAttribute("aria-pressed", String(dark));
        });
    }

    function wireTileToggle() {
        const button = qs("[data-map-tile-toggle]");

        if (!button) return;

        button.addEventListener("click", () => {
            const active = !document.body.classList.contains("bn-map-satellite");

            document.body.classList.toggle("bn-map-satellite", active);
            button.textContent = active ? "Tone+" : "Basic";
            button.setAttribute("aria-pressed", String(active));
        });
    }

    function wirePlaceholderToggle(selector, activeClass) {
        const button = qs(selector);

        if (!button) return;

        button.addEventListener("click", () => {
            const active = button.getAttribute("aria-pressed") !== "true";
            button.setAttribute("aria-pressed", String(active));
            document.body.classList.toggle(activeClass, active);
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

        wireSearch();
        wireLegendToggle();
        wireToneToggle();
        wireTileToggle();
        wirePlaceholderToggle("[data-map-measure-toggle]", "bn-map-measure-enabled");
        wirePlaceholderToggle("[data-map-select-toggle]", "bn-map-select-enabled");
    }

    async function init() {
        await loadLeaflet();

        state.settings = await readJson("./data/map-settings.json");
        state.vectors = await readJson("./data/map-vectors.json");
        state.vectorTypes = await readJson("./data/vector-types.json").catch(() => null);
        state.themes = await readJson("./data/map-themes.json").catch(() => null);
        state.settingsProfiles = await readJson("./data/map-settings-profiles.json").catch(() => null);

        await loadTheme(state.settings?.theme?.selected || "zzx_dark_olive");

        const root = qs("[data-map-root]");

        if (!root) return;

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

        window.L.tileLayer(
            state.settings.tile_url || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                attribution: state.settings.tile_attribution || "© OpenStreetMap contributors",
                subdomains: state.settings.tile_subdomains || undefined,
                maxZoom: Number(view.max_zoom || 20),
                minZoom: Number(view.min_zoom || 2)
            }
        ).addTo(state.map);

        populateThemeSelect();
        populateSettingsSelect();
        wireControls(view);

        await renderPolygons();
        renderPoints();

        window.ZZXBitnodesMap = state;
    }

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
})();
