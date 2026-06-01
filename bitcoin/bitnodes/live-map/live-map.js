(() => {
    "use strict";

    window.ZZX_BITNODES_MAP_DISABLE_AUTO_INIT = true;

    const LIVE_REFRESH_MS = 30000;

    function bootLiveMap() {
        if (!window.ZZXBitnodesMap) {
            console.error(
                "ZZXBitnodesMap core map engine missing. Load ./map.js before ./live-map.js."
            );

            const status = document.querySelector("#bn-map-status");

            if (status) {
                status.textContent =
                    "Live map failed: core map engine missing. Check script load order.";
            }

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
                    "../maps/data/map-settings.json",
                    "../maps/zzxbitnodes/data/map-settings.json",
                    "../maps/global/data/map-settings.json",
                    "../maps/originalbitnodes/data/map-settings.json"
                ],

                vectors: [
                    "./data/map-vectors.json",
                    "./data/map-points.geojson",

                    "./global/points.json",
                    "./global/live-map.json",
                    "./global/nodes.geojson",
                    "./global/index.json",

                    "./zzxbitnodes/points.json",
                    "./zzxbitnodes/live-map.json",
                    "./zzxbitnodes/nodes.geojson",
                    "./zzxbitnodes/index.json",

                    "./originalbitnodes/points.json",
                    "./originalbitnodes/live-map.json",
                    "./originalbitnodes/nodes.geojson",
                    "./originalbitnodes/index.json",

                    "../maps/data/map-vectors.json",
                    "../maps/data/map-points.geojson",

                    "../maps/global/points.json",
                    "../maps/global/live-map.json",
                    "../maps/global/nodes.geojson",

                    "../maps/zzxbitnodes/points.json",
                    "../maps/zzxbitnodes/live-map.json",
                    "../maps/zzxbitnodes/nodes.geojson",

                    "../maps/originalbitnodes/points.json",
                    "../maps/originalbitnodes/live-map.json",
                    "../maps/originalbitnodes/nodes.geojson"
                ],

                themes: [
                    "./data/map-themes.json",
                    "./zzxbitnodes/data/map-themes.json",
                    "./global/data/map-themes.json",
                    "./originalbitnodes/data/map-themes.json",
                    "../maps/data/map-themes.json",
                    "../maps/zzxbitnodes/data/map-themes.json",
                    "../maps/global/data/map-themes.json",
                    "../maps/originalbitnodes/data/map-themes.json"
                ],

                theme: id => [
                    `./data/themes/${id}.json`,
                    `./zzxbitnodes/data/themes/${id}.json`,
                    `./global/data/themes/${id}.json`,
                    `./originalbitnodes/data/themes/${id}.json`,

                    `../maps/data/themes/${id}.json`,
                    `../maps/zzxbitnodes/data/themes/${id}.json`,
                    `../maps/global/data/themes/${id}.json`,
                    `../maps/originalbitnodes/data/themes/${id}.json`,

                    "./data/map-theme.json",
                    "./zzxbitnodes/data/map-theme.json",
                    "./global/data/map-theme.json",
                    "./originalbitnodes/data/map-theme.json",

                    "../maps/data/map-theme.json",
                    "../maps/zzxbitnodes/data/map-theme.json",
                    "../maps/global/data/map-theme.json",
                    "../maps/originalbitnodes/data/map-theme.json"
                ],

                settingsProfiles: [
                    "./data/map-settings-profiles.json",
                    "./zzxbitnodes/data/map-settings-profiles.json",
                    "./global/data/map-settings-profiles.json",
                    "./originalbitnodes/data/map-settings-profiles.json",
                    "../maps/data/map-settings-profiles.json",
                    "../maps/zzxbitnodes/data/map-settings-profiles.json",
                    "../maps/global/data/map-settings-profiles.json",
                    "../maps/originalbitnodes/data/map-settings-profiles.json"
                ],

                settingsProfile: id => [
                    `./data/settings/${id}.json`,
                    `./zzxbitnodes/data/settings/${id}.json`,
                    `./global/data/settings/${id}.json`,
                    `./originalbitnodes/data/settings/${id}.json`,

                    `../maps/data/settings/${id}.json`,
                    `../maps/zzxbitnodes/data/settings/${id}.json`,
                    `../maps/global/data/settings/${id}.json`,
                    `../maps/originalbitnodes/data/settings/${id}.json`
                ],

                polygons: [
                    "./data/map-polygons.geojson",
                    "./zzxbitnodes/data/map-polygons.geojson",
                    "./global/data/map-polygons.geojson",
                    "./originalbitnodes/data/map-polygons.geojson",

                    "../maps/data/map-polygons.geojson",
                    "../maps/zzxbitnodes/data/map-polygons.geojson",
                    "../maps/global/data/map-polygons.geojson",
                    "../maps/originalbitnodes/data/map-polygons.geojson"
                ],

                overlays: [
                    "./data/map-overlays.json",
                    "./zzxbitnodes/data/map-overlays.json",
                    "./global/data/map-overlays.json",
                    "./originalbitnodes/data/map-overlays.json",

                    "../maps/data/map-overlays.json",
                    "../maps/zzxbitnodes/data/map-overlays.json",
                    "../maps/global/data/map-overlays.json",
                    "../maps/originalbitnodes/data/map-overlays.json"
                ],

                layers: [
                    "./data/map-layers.json",
                    "./zzxbitnodes/data/map-layers.json",
                    "./global/data/map-layers.json",
                    "./originalbitnodes/data/map-layers.json",

                    "../maps/data/map-layers.json",
                    "../maps/zzxbitnodes/data/map-layers.json",
                    "../maps/global/data/map-layers.json",
                    "../maps/originalbitnodes/data/map-layers.json"
                ]
            }
        });
    }

    document.addEventListener("DOMContentLoaded", bootLiveMap);
})();
