(() => {
    "use strict";

    window.ZZX_BITNODES_MAP_DISABLE_AUTO_INIT = true;

    const LIVE_REFRESH_MS = 30000;

    function setHardFailure(message) {
        const status = document.querySelector("#bn-map-status");

        if (status) {
            status.className = "bn-map-status error";
            status.textContent = message;
        }
    }

    function bootLiveMap() {
        if (!window.ZZXBitnodesMap) {
            const message = "Live map failed: core map engine missing. Load ./map.js before ./live-map.js.";
            console.error(message);
            setHardFailure(message);
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
                    `./zzxbitnodes/data/themes/${id}.json`,
                    `./global/data/themes/${id}.json`,
                    `./originalbitnodes/data/themes/${id}.json`,
                    "./data/map-theme.json",
                    "./zzxbitnodes/data/map-theme.json",
                    "./global/data/map-theme.json",
                    "./originalbitnodes/data/map-theme.json"
                ],

                tileProviders: [
                    "./data/map-tile-providers.json",
                    "./zzxbitnodes/data/map-tile-providers.json",
                    "./global/data/map-tile-providers.json",
                    "./originalbitnodes/data/map-tile-providers.json"
                ],

                vectors: [
                    "./data/map-points.geojson",

                    "./zzxbitnodes/nodes.geojson",
                    "./zzxbitnodes/points.json",
                    "./zzxbitnodes/live-map.json",

                    "./global/nodes.geojson",
                    "./global/points.json",
                    "./global/live-map.json",

                    "./originalbitnodes/nodes.geojson",
                    "./originalbitnodes/points.json",
                    "./originalbitnodes/live-map.json"
                ],

                vectorManifest: [
                    "./data/map-vectors.json",
                    "./zzxbitnodes/data/map-vectors.json",
                    "./global/data/map-vectors.json",
                    "./originalbitnodes/data/map-vectors.json"
                ],

                polygons: [
                    "./data/map-polygons.geojson",
                    "./zzxbitnodes/data/map-polygons.geojson",
                    "./global/data/map-polygons.geojson",
                    "./originalbitnodes/data/map-polygons.geojson"
                ],

                overlays: [
                    "./data/map-overlays.json",
                    "./zzxbitnodes/data/map-overlays.json",
                    "./global/data/map-overlays.json",
                    "./originalbitnodes/data/map-overlays.json"
                ],

                layers: [
                    "./data/map-layers.json",
                    "./zzxbitnodes/data/map-layers.json",
                    "./global/data/map-layers.json",
                    "./originalbitnodes/data/map-layers.json"
                ]
            }
        }).catch(error => {
            console.error(error);
            setHardFailure(`Live map failed: ${error.message}`);
        });
    }

    document.addEventListener("DOMContentLoaded", bootLiveMap);
})();
