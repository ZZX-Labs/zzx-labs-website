(() => {
    "use strict";

    window.ZZX_BITNODES_MAP_DISABLE_AUTO_INIT = true;

    const LIVE_REFRESH_MS = 30000;

    function status(message, mode = "live") {
        const el = document.querySelector("#bn-map-status");

        if (el) {
            el.className = `bn-map-status ${mode}`.trim();
            el.textContent = message;
        }

        console.log(`[live-map] ${message}`);
    }

    function bootLiveMap() {
        if (!window.ZZXBitnodesMap) {
            status("Live map failed: core map engine missing. Load ../maps/map.js before ./live-map.js.", "error");
            return;
        }

        document.body.classList.add("bn-live-map-page");

        if (window.ZZXBitnodesMap.state?.initialized) {
            window.ZZXBitnodesMap.destroy();
        }

        window.ZZXBitnodesMap.init({
            mode: "live-map",
            refreshMs: LIVE_REFRESH_MS,

            rootSelector: "[data-map-root]",
            statusSelector: "#bn-map-status",
            hudSelector: "#bn-map-hud",
            legendSelector: "#bn-map-legend",
            nodePanelSelector: "#bn-map-node-panel",
            themeSelectSelector: "[data-map-theme-select]",
            settingsSelectSelector: "[data-map-settings-select]",
            resetSelector: "[data-map-reset]",
            filterSelector: "[data-map-filter]",

            paths: {
                settings: [
                    "./data/map-settings.json",
                    "./zzxbitnodes/data/map-settings.json",
                    "../maps/data/map-settings.json",
                    "../maps/zzxbitnodes/data/map-settings.json",
                    "../maps/originalbitnodes/data/map-settings.json"
                ],

                settingsProfiles: [
                    "./data/map-settings-profiles.json",
                    "./zzxbitnodes/data/map-settings-profiles.json",
                    "../maps/data/map-settings-profiles.json",
                    "../maps/zzxbitnodes/data/map-settings-profiles.json",
                    "../maps/originalbitnodes/data/map-settings-profiles.json"
                ],

                settingsProfile: id => [
                    `./data/settings/${id}.json`,
                    `./zzxbitnodes/data/settings/${id}.json`,
                    `../maps/data/settings/${id}.json`,
                    `../maps/zzxbitnodes/data/settings/${id}.json`,
                    `../maps/originalbitnodes/data/settings/${id}.json`
                ],

                themes: [
                    "./data/map-themes.json",
                    "./zzxbitnodes/data/map-themes.json",
                    "../maps/data/map-themes.json",
                    "../maps/zzxbitnodes/data/map-themes.json",
                    "../maps/originalbitnodes/data/map-themes.json"
                ],

                theme: id => [
                    `./data/themes/${id}.json`,
                    "./data/map-theme.json",
                    `./zzxbitnodes/data/themes/${id}.json`,
                    "./zzxbitnodes/data/map-theme.json",
                    `../maps/data/themes/${id}.json`,
                    "../maps/data/map-theme.json",
                    `../maps/zzxbitnodes/data/themes/${id}.json`,
                    "../maps/zzxbitnodes/data/map-theme.json",
                    `../maps/originalbitnodes/data/themes/${id}.json`,
                    "../maps/originalbitnodes/data/map-theme.json"
                ],

                tileProviders: [
                    "./data/map-tile-providers.json",
                    "./zzxbitnodes/data/map-tile-providers.json",
                    "../maps/data/map-tile-providers.json",
                    "../maps/zzxbitnodes/data/map-tile-providers.json",
                    "../maps/originalbitnodes/data/map-tile-providers.json"
                ],

                vectors: [
                    "./data/map-points.geojson",
                    "./zzxbitnodes/data/map-points.geojson",
                    "../maps/data/map-points.geojson",
                    "../maps/zzxbitnodes/data/map-points.geojson",
                    "../maps/originalbitnodes/data/map-points.geojson"
                ],

                vectorManifest: [
                    "./data/map-vectors.json",
                    "./zzxbitnodes/data/map-vectors.json",
                    "../maps/data/map-vectors.json",
                    "../maps/zzxbitnodes/data/map-vectors.json",
                    "../maps/originalbitnodes/data/map-vectors.json"
                ],

                polygons: [
                    "./data/map-polygons.geojson",
                    "./zzxbitnodes/data/map-polygons.geojson",
                    "../maps/data/map-polygons.geojson",
                    "../maps/zzxbitnodes/data/map-polygons.geojson",
                    "../maps/originalbitnodes/data/map-polygons.geojson"
                ],

                overlays: [
                    "./data/map-overlays.json",
                    "./zzxbitnodes/data/map-overlays.json",
                    "../maps/data/map-overlays.json",
                    "../maps/zzxbitnodes/data/map-overlays.json",
                    "../maps/originalbitnodes/data/map-overlays.json"
                ],

                layers: [
                    "./data/map-layers.json",
                    "./zzxbitnodes/data/map-layers.json",
                    "../maps/data/map-layers.json",
                    "../maps/zzxbitnodes/data/map-layers.json",
                    "../maps/originalbitnodes/data/map-layers.json"
                ]
            }
        }).then(() => {
            const s = window.ZZXBitnodesMap.state;
            const count = s?.vectors?.points?.length || s?.geojson?.features?.length || 0;

            status(
                `Live map initialized. Loaded ${count.toLocaleString()} point records from ${s?.latestSource || "unknown source"}.`,
                count ? "live" : "warn"
            );

            setTimeout(() => {
                s?.map?.invalidateSize?.();
                window.ZZXBitnodesMap.renderPoints?.();
            }, 300);
        }).catch(error => {
            console.error(error);
            status(`Live map failed: ${error.message}`, "error");
        });
    }

    document.addEventListener("DOMContentLoaded", bootLiveMap);
})();
