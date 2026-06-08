(() => {
    "use strict";

    window.ZZX_BITNODES_MAP_DISABLE_AUTO_INIT = true;

    const LIVE_REFRESH_MS = 30000;

    let refreshTimer = null;
    let bootTimer = null;

    function status(message, mode = "live") {
        const el = document.querySelector("#bn-map-status");

        if (el) {
            el.className = `bn-map-status ${mode}`.trim();
            el.textContent = message;
        }

        console.log(`[live-map] ${message}`);
    }

    function visiblePointCount(state) {
        if (!state) {
            return 0;
        }

        if (typeof window.ZZXBitnodesMap?.filteredPoints === "function") {
            return window.ZZXBitnodesMap.filteredPoints().length;
        }

        return (
            state?.vectors?.points?.length ||
            state?.vectorManifest?.points?.length ||
            state?.geojson?.features?.length ||
            state?.polygons?.features?.length ||
            0
        );
    }

    function invalidateAndRender() {
        const s = window.ZZXBitnodesMap?.state;

        window.setTimeout(() => {
            s?.map?.invalidateSize?.();
            window.ZZXBitnodesMap?.renderPoints?.();
            window.ZZXBitnodesMap?.renderHud?.();
            window.ZZXBitnodesMap?.renderLegend?.();
        }, 300);
    }

    function scheduleRefresh() {
        if (refreshTimer) {
            window.clearInterval(refreshTimer);
        }

        refreshTimer = window.setInterval(async () => {
            if (!window.ZZXBitnodesMap?.reload) {
                status("Live refresh waiting: map engine reload() API unavailable.", "warn");
                return;
            }

            try {
                await window.ZZXBitnodesMap.reload();

                const s = window.ZZXBitnodesMap.state;
                const count = visiblePointCount(s);

                status(
                    `Live map refreshed. Loaded ${count.toLocaleString()} visible point records from ${s?.latestSource || "selected source"}.`,
                    count ? "live" : "warn"
                );

                invalidateAndRender();
            } catch (error) {
                console.error(error);
                status(`Live refresh failed: ${error.message}`, "warn");
            }
        }, LIVE_REFRESH_MS);
    }

    function bootLiveMap() {
        document.body.classList.add("bn-live-map-page");

        if (bootTimer) {
            window.clearInterval(bootTimer);
        }

        let attempts = 0;

        bootTimer = window.setInterval(() => {
            attempts += 1;

            if (!window.ZZXBitnodesMap) {
                if (attempts === 10) {
                    status("Live map waiting for ./map.js engine…", "warn");
                }

                if (attempts > 80) {
                    window.clearInterval(bootTimer);
                    status("Live map failed: map engine missing. Load ./map.js before ./live-map.js.", "error");
                }

                return;
            }

            window.clearInterval(bootTimer);

            if (typeof window.ZZXBitnodesMap.init !== "function") {
                status("Live map failed: map engine has no init() API. Replace ./map.js with the API-enabled engine.", "error");
                return;
            }

            if (window.ZZXBitnodesMap.state?.initialized) {
                window.ZZXBitnodesMap.destroy?.();
            }

            window.ZZXBitnodesMap.init({
                mode: "live-map",
                refreshMs: LIVE_REFRESH_MS,

                rootSelector: "[data-map-root]",
                statusSelector: "#bn-map-status",
                hudSelector: "#bn-map-hud",
                legendSelector: "#bn-map-legend",
                legendToggleSelector: "#bn-map-legend-toggle",
                nodeInfoSelector: "#bn-map-node-info",
                themeSelectSelector: "[data-map-theme-select]",
                settingsSelectSelector: "[data-map-settings-select]",
                resetSelector: "[data-map-reset]",
                filterSelector: "[data-map-filter]",
                searchSelector: "[data-map-search]",
                searchClearSelector: "[data-map-search-clear]",
                toneToggleSelector: "[data-map-tone-toggle]",
                tileToggleSelector: "[data-map-tile-toggle]",
                measureToggleSelector: "[data-map-measure-toggle]",
                selectToggleSelector: "[data-map-select-toggle]",

                paths: {
                    settings: [
                        "./data/map-settings.json",
                        "./zzxbitnodes/data/map-settings.json",
                        "./global/data/map-settings.json",
                        "./originalbitnodes/data/map-settings.json"
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

                    themes: [
                        "./data/map-themes.json",
                        "./zzxbitnodes/data/map-themes.json",
                        "./global/data/map-themes.json",
                        "./originalbitnodes/data/map-themes.json"
                    ],

                    theme: id => [
                        `./data/themes/${id}.json`,
                        "./data/map-theme.json",
                        `./zzxbitnodes/data/themes/${id}.json`,
                        "./zzxbitnodes/data/map-theme.json",
                        `./global/data/themes/${id}.json`,
                        "./global/data/map-theme.json",
                        `./originalbitnodes/data/themes/${id}.json`,
                        "./originalbitnodes/data/map-theme.json"
                    ],

                    tileProviders: [
                        "./data/map-tile-providers.json",
                        "./data/openstreetmaps.json",
                        "./zzxbitnodes/data/map-tile-providers.json",
                        "./zzxbitnodes/data/openstreetmaps.json",
                        "./global/data/map-tile-providers.json",
                        "./global/data/openstreetmaps.json",
                        "./originalbitnodes/data/map-tile-providers.json",
                        "./originalbitnodes/data/openstreetmaps.json"
                    ],

                    vectors: [
                        "./data/map-points.geojson",
                        "./zzxbitnodes/data/map-points.geojson",
                        "./global/data/map-points.geojson",
                        "./originalbitnodes/data/map-points.geojson"
                    ],

                    vectorManifest: [
                        "./data/map-vectors.json",
                        "./zzxbitnodes/data/map-vectors.json",
                        "./global/data/map-vectors.json",
                        "./originalbitnodes/data/map-vectors.json"
                    ],

                    vectorTypes: [
                        "./data/vector-types.json",
                        "./zzxbitnodes/data/vector-types.json",
                        "./global/data/vector-types.json",
                        "./originalbitnodes/data/vector-types.json"
                    ],

                    polygons: [
                        "./data/map-polygons.geojson",
                        "./data/map-buildings.geojson",
                        "./zzxbitnodes/data/map-polygons.geojson",
                        "./zzxbitnodes/data/map-buildings.geojson",
                        "./global/data/map-polygons.geojson",
                        "./global/data/map-buildings.geojson",
                        "./originalbitnodes/data/map-polygons.geojson",
                        "./originalbitnodes/data/map-buildings.geojson"
                    ],

                    overlays: [
                        "./data/map-overlays.json",
                        "./zzxbitnodes/data/map-overlays.json",
                        "./global/data/map-overlays.json",
                        "./originalbitnodes/data/map-overlays.json"
                    ],

                    layers: [
                        "./data/map-layers.json",
                        "./data/map-region-layers.json",
                        "./data/map-continent-layers.json",
                        "./data/map-country-layers.json",
                        "./data/map-territory-layers.json",
                        "./data/map-county-layers.json",
                        "./data/map-city-layers.json",
                        "./data/map-zip-layers.json",
                        "./data/map-timezone-layers.json",
                        "./data/map-w3w-address-layers.json",
                        "./data/map-zzxgcs-address-layers.json",
                        "./data/map-geohashid-layers.json",
                        "./data/map-parcel-layers.json",
                        "./data/map-building-layers.json",
                        "./zzxbitnodes/data/map-layers.json",
                        "./global/data/map-layers.json",
                        "./originalbitnodes/data/map-layers.json"
                    ]
                }
            }).then(() => {
                const s = window.ZZXBitnodesMap.state;
                const count = visiblePointCount(s);

                status(
                    `Live map initialized. Loaded ${count.toLocaleString()} visible point records from ${s?.latestSource || "unknown source"}.`,
                    count ? "live" : "warn"
                );

                invalidateAndRender();
                scheduleRefresh();
            }).catch(error => {
                console.error(error);
                status(`Live map failed: ${error.message}`, "error");
            });
        }, 100);
    }

    window.addEventListener("beforeunload", () => {
        if (refreshTimer) {
            window.clearInterval(refreshTimer);
        }

        if (bootTimer) {
            window.clearInterval(bootTimer);
        }
    });

    document.addEventListener("DOMContentLoaded", bootLiveMap);
})();
