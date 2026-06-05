(() => {
    "use strict";

    window.ZZX_BITNODES_MAP_DISABLE_AUTO_INIT = true;

    const LIVE_REFRESH_MS = 30000;

    let refreshTimer = null;

    function status(message, mode = "live") {
        const el = document.querySelector("#bn-map-status");

        if (el) {
            el.className = `bn-map-status ${mode}`.trim();
            el.textContent = message;
        }

        console.log(`[live-map] ${message}`);
    }

    function visiblePointCount(state) {
        return (
            state?.vectors?.points?.length ||
            state?.geojson?.features?.length ||
            0
        );
    }

    function scheduleRefresh() {
        if (refreshTimer) {
            window.clearInterval(refreshTimer);
        }

        refreshTimer = window.setInterval(async () => {
            if (!window.ZZXBitnodesMap?.reload) {
                return;
            }

            try {
                await window.ZZXBitnodesMap.reload();

                const s = window.ZZXBitnodesMap.state;
                const count = visiblePointCount(s);

                status(
                    `Live map refreshed. Loaded ${count.toLocaleString()} point records from ${s?.latestSource || "selected source"}.`,
                    count ? "live" : "warn"
                );
            } catch (error) {
                console.error(error);
                status(`Live refresh failed: ${error.message}`, "warn");
            }
        }, LIVE_REFRESH_MS);
    }

    function bootLiveMap() {
        if (!window.ZZXBitnodesMap) {
            status("Live map failed: core map engine missing. Load ./map.js before ./live-map.js.", "error");
            return;
        }

        if (typeof window.ZZXBitnodesMap.init !== "function") {
            status("Live map failed: core map engine has no init() API. Replace ./map.js with the API-enabled engine.", "error");
            return;
        }

        document.body.classList.add("bn-live-map-page");

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
                    "./zzxbitnodes/data/map-tile-providers.json",
                    "./global/data/map-tile-providers.json",
                    "./originalbitnodes/data/map-tile-providers.json"
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
        }).then(() => {
            const s = window.ZZXBitnodesMap.state;
            const count = visiblePointCount(s);

            status(
                `Live map initialized. Loaded ${count.toLocaleString()} point records from ${s?.latestSource || "unknown source"}.`,
                count ? "live" : "warn"
            );

            window.setTimeout(() => {
                s?.map?.invalidateSize?.();
                window.ZZXBitnodesMap.renderPoints?.();
            }, 300);

            scheduleRefresh();
        }).catch(error => {
            console.error(error);
            status(`Live map failed: ${error.message}`, "error");
        });
    }

    window.addEventListener("beforeunload", () => {
        if (refreshTimer) {
            window.clearInterval(refreshTimer);
        }
    });

    document.addEventListener("DOMContentLoaded", bootLiveMap);
})();
