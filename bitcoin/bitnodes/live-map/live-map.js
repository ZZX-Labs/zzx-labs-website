(() => {
    "use strict";

    const LIVE_REFRESH_MS = 30000;

    function bootLiveMap() {
        if (!window.ZZXBitnodesMap) {
            console.error("ZZXBitnodesMap core map engine missing. Load ../map/map.js first.");
            return;
        }

        document.body.classList.add("bn-live-map-page");

        window.ZZXBitnodesMap.init({
            mode: "live-map",
            rootSelector: "[data-map-root]",
            statusSelector: "#bn-map-status",
            hudSelector: "#bn-map-hud",
            legendSelector: "#bn-map-legend",
            themeSelectSelector: "[data-map-theme-select]",
            settingsSelectSelector: "[data-map-settings-select]",
            resetSelector: "[data-map-reset]",
            filterSelector: "[data-map-filter]",
            refreshMs: LIVE_REFRESH_MS,
            paths: {
                settings: [
                    "./data/map-settings.json",
                    "./zzxbitnodes/data/map-settings.json",
                    "./global/data/map-settings.json",
                    "../maps/zzxbitnodes/data/map-settings.json",
                    "../maps/global/data/map-settings.json"
                ],
                vectors: [
                    "./data/map-vectors.json",
                    "./zzxbitnodes/data/map-vectors.json",
                    "./global/data/map-vectors.json",
                    "./zzxbitnodes/live-map.json",
                    "./global/live-map.json",
                    "./zzxbitnodes/points.json",
                    "./global/points.json",
                    "../maps/zzxbitnodes/data/map-vectors.json",
                    "../maps/global/data/map-vectors.json"
                ],
                themes: [
                    "./data/map-themes.json",
                    "./zzxbitnodes/data/map-themes.json",
                    "./global/data/map-themes.json",
                    "../maps/zzxbitnodes/data/map-themes.json",
                    "../maps/global/data/map-themes.json"
                ],
                theme: id => [
                    `./data/themes/${id}.json`,
                    `./zzxbitnodes/data/themes/${id}.json`,
                    `./global/data/themes/${id}.json`,
                    `../maps/zzxbitnodes/data/themes/${id}.json`,
                    `../maps/global/data/themes/${id}.json`,
                    "./data/map-theme.json",
                    "./zzxbitnodes/data/map-theme.json",
                    "./global/data/map-theme.json"
                ],
                settingsProfiles: [
                    "./data/map-settings-profiles.json",
                    "./zzxbitnodes/data/map-settings-profiles.json",
                    "./global/data/map-settings-profiles.json",
                    "../maps/zzxbitnodes/data/map-settings-profiles.json",
                    "../maps/global/data/map-settings-profiles.json"
                ],
                settingsProfile: id => [
                    `./data/settings/${id}.json`,
                    `./zzxbitnodes/data/settings/${id}.json`,
                    `./global/data/settings/${id}.json`,
                    `../maps/zzxbitnodes/data/settings/${id}.json`,
                    `../maps/global/data/settings/${id}.json`
                ],
                polygons: [
                    "./data/map-polygons.geojson",
                    "./zzxbitnodes/data/map-polygons.geojson",
                    "./global/data/map-polygons.geojson",
                    "../maps/zzxbitnodes/data/map-polygons.geojson",
                    "../maps/global/data/map-polygons.geojson"
                ]
            }
        });
    }

    document.addEventListener("DOMContentLoaded", bootLiveMap);
})();
