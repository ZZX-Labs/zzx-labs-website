(() => {
    "use strict";

    const state = { map: null, layer: null, vectors: null, settings: null, theme: null, filter: "all", fallbackCanvas: false };

    function qs(selector, scope = document) { return scope.querySelector(selector); }
    function qsa(selector, scope = document) { return Array.from(scope.querySelectorAll(selector)); }

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
    }

    function setStatus(message) {
        const target = qs("#bn-map-status");
        if (target) target.textContent = message;
    }

    function loadLeaflet() {
        return new Promise((resolve, reject) => {
            if (window.L) return resolve();
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
        if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
        return response.json();
    }

    function applyTheme(theme) {
        const vars = theme?.css_variables || {};
        Object.entries(vars).forEach(([key, value]) => document.documentElement.style.setProperty(key, value));
    }

    function pointVisible(point) {
        if (state.filter === "all") return true;
        if (point.network === state.filter || point.status === state.filter) return true;
        if (state.filter === "vpn") return point.is_vpn === true;
        if (state.filter === "proxy") return point.is_proxy === true;
        if (state.filter === "sanctioned") return point.is_sanctioned_node === true || point.is_sanctioned === true;
        if (state.filter === "threat") return point.is_threat_infrastructure === true;
        return false;
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
                <div>City: ${escapeHtml(point.city || "—")}</div>
                <div>County: ${escapeHtml(point.county || "—")}</div>
                <div>Territory: ${escapeHtml(point.territory || "—")}</div>
                <div>Country: ${escapeHtml(point.country_name || point.country || "—")}</div>
                <div>ASN: ${escapeHtml(point.asn || "—")}</div>
                <div>Provider: ${escapeHtml(point.provider || "—")}</div>
                <div>Sanctioned: ${point.is_sanctioned_node ? "yes" : "no"}</div>
                <div>Policy Restricted: ${point.is_policy_restricted_node ? "yes" : "no"}</div>
                <div>Threat Infrastructure: ${point.is_threat_infrastructure ? "yes" : "no"}</div>
                <div>W3W: ${escapeHtml(point.w3w || "—")}</div>
                <div>ZZX-GCS: ${escapeHtml(point.zzxgcs || "—")}</div>
                <div>GeohashID: ${escapeHtml(point.geohashid || "—")}</div>
            </div>
        `;
    }

    function filteredPoints() {
        return (state.vectors?.points || []).filter(pointVisible);
    }

    function renderHud() {
        const target = qs("#bn-map-hud");
        if (!target || !state.vectors) return;

        const networks = state.vectors.network_counts || {};
        const intel = state.vectors.intelligence_counts || {};

        target.innerHTML = `
            <article><span>Total Points</span><strong>${Number(state.vectors.point_count || 0).toLocaleString()}</strong></article>
            <article><span>IPv4</span><strong>${Number(networks.ipv4 || 0).toLocaleString()}</strong></article>
            <article><span>IPv6</span><strong>${Number(networks.ipv6 || 0).toLocaleString()}</strong></article>
            <article><span>Tor</span><strong>${Number(networks.tor || 0).toLocaleString()}</strong></article>
            <article><span>I2P</span><strong>${Number(networks.i2p || 0).toLocaleString()}</strong></article>
            <article><span>VPN</span><strong>${Number(intel.vpn_nodes || 0).toLocaleString()}</strong></article>
            <article><span>Proxy</span><strong>${Number(intel.proxy_nodes || 0).toLocaleString()}</strong></article>
            <article><span>Sanctioned</span><strong>${Number(intel.sanctioned_nodes || 0).toLocaleString()}</strong></article>
            <article><span>Restricted</span><strong>${Number(intel.policy_restricted_nodes || 0).toLocaleString()}</strong></article>
            <article><span>Threat</span><strong>${Number(intel.threat_infrastructure_nodes || 0).toLocaleString()}</strong></article>
        `;
    }

    function renderLegend() {
        const target = qs("#bn-map-legend");
        if (!target || !state.vectors?.legend) return;
        target.innerHTML = Object.entries(state.vectors.legend).map(([_key, item]) => `
            <span><i style="background:${escapeHtml(item.color)}"></i>${escapeHtml(item.label)}</span>
        `).join("");
    }


    function renderFallbackCanvas() {
        const root = qs("[data-map-root]");
        if (!root || !state.vectors) return;

        root.classList.add("bn-map-canvas-fallback");
        let canvas = root.querySelector("canvas[data-bn-map-fallback]");
        if (!canvas) {
            root.replaceChildren();
            canvas = document.createElement("canvas");
            canvas.dataset.bnMapFallback = "1";
            root.appendChild(canvas);
        }

        const rect = root.getBoundingClientRect();
        const width = Math.max(320, Math.floor(rect.width || root.clientWidth || 1200));
        const height = Math.max(360, Math.floor(rect.height || root.clientHeight || 720));
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--bn-map-background").trim() || "#050705";
        ctx.fillRect(0, 0, width, height);

        ctx.strokeStyle = "rgba(192,214,116,0.08)";
        for (let lon = -180; lon <= 180; lon += 30) {
            const x = ((lon + 180) / 360) * width;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
        }
        for (let lat = -60; lat <= 60; lat += 30) {
            const y = ((90 - lat) / 180) * height;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
        }

        const points = filteredPoints();
        for (const point of points) {
            const lat = Number(point.latitude ?? point.lat);
            const lon = Number(point.longitude ?? point.lon ?? point.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
            const x = ((lon + 180) / 360) * width;
            const y = ((90 - lat) / 180) * height;
            const r = Math.max(1.5, Math.min(5, radius(point) * 0.35));
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = point.color || point.marker_color || "#c0d674";
            ctx.globalAlpha = 0.78;
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        state.fallbackCanvas = true;
        renderHud();
        renderLegend();
        setStatus(`Leaflet/tile service unavailable; rendered ${points.length.toLocaleString()} local node points using the offline canvas fallback.`);
    }

    function renderPoints() {
        if (!state.map || !window.L) {
            renderFallbackCanvas();
            return;
        }
        if (state.layer) state.layer.remove();

        state.layer = window.L.layerGroup();

        filteredPoints().forEach(point => {
            const lat = Number(point.latitude ?? point.lat);
            const lon = Number(point.longitude ?? point.lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

            const marker = window.L.circleMarker([lat, lon], {
                radius: radius(point),
                color: point.color || point.marker_color || "#c0d674",
                fillColor: point.color || point.marker_color || "#c0d674",
                fillOpacity: Number(state.settings?.marker?.fill_opacity || 0.72),
                opacity: Number(state.settings?.marker?.opacity || 0.95),
                weight: point.marker_ring ? 3 : Number(state.settings?.marker?.stroke_weight || 1)
            });

            marker.bindPopup(markerPopup(point));
            marker.addTo(state.layer);
        });

        state.layer.addTo(state.map);
        renderHud();
        renderLegend();
        setStatus(`Loaded ${filteredPoints().length.toLocaleString()} visible map points from ${state.vectors?.source || "selected source"}.`);
    }

    function wireControls(view) {
        qsa("[data-map-filter]").forEach(button => {
            button.addEventListener("click", () => {
                state.filter = button.dataset.mapFilter || "all";
                qsa("[data-map-filter]").forEach(item => item.classList.toggle("is-active", item === button));
                renderPoints();
            });
        });

        qs("[data-map-reset]")?.addEventListener("click", () => {
            if (state.map) {
                state.map.setView([Number(view.latitude || 20), Number(view.longitude || 0)], Number(view.zoom || 2));
            } else {
                renderFallbackCanvas();
            }
        });
    }

    function startVectorRefresh() {
        let busy = false;
        const refresh = async () => {
            if (busy || document.hidden) return;
            busy = true;
            try {
                state.vectors = await readJson("./data/map-vectors.json");
                renderPoints();
            } catch (error) {
                console.warn("Live-map vector refresh failed; retaining last-known-good vectors.", error);
            } finally {
                busy = false;
            }
        };
        const timer = window.setInterval(refresh, 15000);
        window.addEventListener("pagehide", () => window.clearInterval(timer), { once: true });
    }

    async function init() {
        state.settings = await readJson("./data/map-settings.json");
        state.vectors = await readJson("./data/map-vectors.json");
        state.theme = await readJson("./data/map-theme.json").catch(() => null);
        applyTheme(state.theme);

        const root = qs("[data-map-root]");
        if (!root) return;

        const view = state.settings.initial_view || {};
        let leafletReady = false;
        try {
            await loadLeaflet();
            leafletReady = Boolean(window.L);
        } catch (error) {
            console.warn("Leaflet unavailable; using local canvas map fallback.", error);
        }

        wireControls(view);

        if (!leafletReady) {
            renderFallbackCanvas();
            window.addEventListener("resize", renderFallbackCanvas, { passive: true });
            window.ZZXBitnodesMap = state;
            startVectorRefresh();
            return;
        }

        state.map = window.L.map(root, { preferCanvas: true }).setView(
            [Number(view.latitude || 20), Number(view.longitude || 0)],
            Number(view.zoom || 2)
        );

        window.L.tileLayer(state.settings.tile_url || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: state.settings.tile_attribution || "© OpenStreetMap contributors",
            subdomains: state.settings.tile_subdomains || undefined,
            maxZoom: Number(view.max_zoom || 20),
            minZoom: Number(view.min_zoom || 2)
        }).addTo(state.map);

        renderPoints();
        window.ZZXBitnodesMap = state;
        startVectorRefresh();
    }

    document.addEventListener("DOMContentLoaded", () => {
        init().catch(error => {
            console.error(error);
            setStatus(`Map load failure: ${error.message}`);
        });
    });
})();
