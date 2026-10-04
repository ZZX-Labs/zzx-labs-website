(() => {
    "use strict";

    const BN = window.BN || {};

    const TILE_SIZE = 256;
    const MIN_ZOOM = 1;
    const MAX_ZOOM = 8;

    const DEFAULT_VIEW = {
        lat: 20,
        lon: 0,
        zoom: 2,
        rotation: 0
    };

    const TOR_POINT = {
        lat: 0,
        lon: -32,
        label: "Tor / Onion Nodes"
    };

    const TILE_SERVERS = [
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    ];

    const state = {
        initialized: false,
        canvas: null,
        ctx: null,
        container: null,
        rows: [],
        view: { ...DEFAULT_VIEW },
        dragging: false,
        dragStart: null,
        viewStart: null,
        tileCache: new Map(),
        animationFrame: null,
        hoveredPoint: null
    };

    function $(selector, scope = document) {
        return scope.querySelector(selector);
    }

    function $all(selector, scope = document) {
        if (BN.$$) {
            return BN.$$(selector, scope);
        }

        return Array.from(scope.querySelectorAll(selector));
    }

    function number(value, fallback = null) {
        if (BN.number) {
            return BN.number(value, fallback);
        }

        const n = Number(value);

        return Number.isFinite(n) ? n : fallback;
    }

    function formatNumber(value) {
        if (BN.formatNumber) {
            return BN.formatNumber(value);
        }

        const n = Number(value);

        return Number.isFinite(n) ? n.toLocaleString() : "—";
    }

    function escapeHtml(value) {
        if (BN.escape) {
            return BN.escape(value);
        }

        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function isTor(row) {
        if (BN.isTor) {
            return BN.isTor(row);
        }

        return String(row.address || row.node || "").toLowerCase().includes(".onion");
    }

    function hasCoordinate(row) {
        return (
            number(row.latitude ?? row.lat, null) !== null &&
            number(row.longitude ?? row.lon, null) !== null
        );
    }

    function lonToX(lon, zoom) {
        return ((lon + 180) / 360) * TILE_SIZE * Math.pow(2, zoom);
    }

    function latToY(lat, zoom) {
        const safeLat = clamp(lat, -85.05112878, 85.05112878);
        const rad = safeLat * Math.PI / 180;
        const n = Math.log(Math.tan(Math.PI / 4 + rad / 2));

        return ((1 - n / Math.PI) / 2) * TILE_SIZE * Math.pow(2, zoom);
    }

    function xToLon(x, zoom) {
        return (x / (TILE_SIZE * Math.pow(2, zoom))) * 360 - 180;
    }

    function yToLat(y, zoom) {
        const n = Math.PI - (2 * Math.PI * y) / (TILE_SIZE * Math.pow(2, zoom));

        return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    }

    function project(lat, lon, view = state.view) {
        const centerX = lonToX(view.lon, view.zoom);
        const centerY = latToY(view.lat, view.zoom);
        const x = lonToX(lon, view.zoom) - centerX;
        const y = latToY(lat, view.zoom) - centerY;

        const angle = view.rotation * Math.PI / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        return {
            x: state.canvas.width / devicePixelRatio / 2 + x * cos - y * sin,
            y: state.canvas.height / devicePixelRatio / 2 + x * sin + y * cos
        };
    }

    function unproject(screenX, screenY, view = state.view) {
        const width = state.canvas.width / devicePixelRatio;
        const height = state.canvas.height / devicePixelRatio;

        const dx = screenX - width / 2;
        const dy = screenY - height / 2;

        const angle = -view.rotation * Math.PI / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const rx = dx * cos - dy * sin;
        const ry = dx * sin + dy * cos;

        const centerX = lonToX(view.lon, view.zoom);
        const centerY = latToY(view.lat, view.zoom);

        return {
            lon: xToLon(centerX + rx, view.zoom),
            lat: yToLat(centerY + ry, view.zoom)
        };
    }

    function resizeCanvas() {
        if (!state.canvas || !state.container) {
            return;
        }

        const rect = state.container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const width = Math.max(320, rect.width || 960);
        const height = Math.max(420, number(state.container.dataset.mapHeight, 620));

        state.canvas.width = Math.floor(width * dpr);
        state.canvas.height = Math.floor(height * dpr);
        state.canvas.style.width = `${width}px`;
        state.canvas.style.height = `${height}px`;

        state.ctx = state.canvas.getContext("2d");
        state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function tileUrl(z, x, y) {
        const template = TILE_SERVERS[Math.abs(x + y + z) % TILE_SERVERS.length];

        return template
            .replace("{z}", z)
            .replace("{x}", x)
            .replace("{y}", y);
    }

    function loadTile(z, x, y) {
        const key = `${z}/${x}/${y}`;

        if (state.tileCache.has(key)) {
            return state.tileCache.get(key);
        }

        const img = new Image();

        img.crossOrigin = "anonymous";
        img.referrerPolicy = "no-referrer";
        img.src = tileUrl(z, x, y);
        img.onload = scheduleDraw;
        img.onerror = scheduleDraw;

        state.tileCache.set(key, img);

        return img;
    }

    function drawBackground(ctx, width, height) {
        const gradient = ctx.createLinearGradient(0, 0, 0, height);

        gradient.addColorStop(0, "#070a07");
        gradient.addColorStop(1, "#030403");

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    }

    function drawTiles(ctx, width, height) {
        const zoom = Math.round(state.view.zoom);
        const scale = Math.pow(2, state.view.zoom - zoom);
        const worldSize = TILE_SIZE * Math.pow(2, zoom);
        const centerX = lonToX(state.view.lon, zoom);
        const centerY = latToY(state.view.lat, zoom);

        const angle = state.view.rotation * Math.PI / 180;

        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.rotate(angle);
        ctx.scale(scale, scale);

        const viewWidth = width / scale;
        const viewHeight = height / scale;

        const startX = Math.floor((centerX - viewWidth / 2) / TILE_SIZE) - 1;
        const endX = Math.floor((centerX + viewWidth / 2) / TILE_SIZE) + 1;
        const startY = Math.floor((centerY - viewHeight / 2) / TILE_SIZE) - 1;
        const endY = Math.floor((centerY + viewHeight / 2) / TILE_SIZE) + 1;
        const maxTile = Math.pow(2, zoom);

        ctx.globalAlpha = 0.82;

        for (let ty = startY; ty <= endY; ty += 1) {
            if (ty < 0 || ty >= maxTile) {
                continue;
            }

            for (let tx = startX; tx <= endX; tx += 1) {
                const wrappedX = ((tx % maxTile) + maxTile) % maxTile;
                const img = loadTile(zoom, wrappedX, ty);

                const dx = tx * TILE_SIZE - centerX;
                const dy = ty * TILE_SIZE - centerY;

                if (img.complete && img.naturalWidth > 0) {
                    ctx.drawImage(img, dx, dy, TILE_SIZE, TILE_SIZE);
                } else {
                    ctx.fillStyle = "rgba(192,214,116,0.025)";
                    ctx.fillRect(dx, dy, TILE_SIZE, TILE_SIZE);
                }
            }
        }

        ctx.globalAlpha = 1;
        ctx.restore();

        ctx.fillStyle = "rgba(0,0,0,0.26)";
        ctx.fillRect(0, 0, width, height);
    }

    function groupPoints(rows) {
        const map = new Map();
        let torCount = 0;

        rows.forEach(row => {
            if (isTor(row)) {
                torCount += 1;
                return;
            }

            if (!hasCoordinate(row)) {
                return;
            }

            const lat = number(row.latitude ?? row.lat, null);
            const lon = number(row.longitude ?? row.lon, null);

            if (lat === null || lon === null) {
                return;
            }

            const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;

            if (!map.has(key)) {
                map.set(key, {
                    lat,
                    lon,
                    count: 0,
                    rows: [],
                    country: row.country || row.country_code || "Unknown",
                    city: row.city || "Unknown",
                    provider: row.provider || row.organization || row.org || "Unknown"
                });
            }

            const item = map.get(key);

            item.count += 1;
            item.rows.push(row);
        });

        const points = Array.from(map.values());

        if (torCount > 0) {
            points.push({
                ...TOR_POINT,
                count: torCount,
                tor: true,
                rows: rows.filter(isTor),
                country: "Tor",
                city: "Everywhere / Nowhere",
                provider: "Onion Routing"
            });
        }

        return points;
    }

    function drawOnion(ctx, x, y, radius) {
        ctx.save();

        ctx.translate(x, y);

        ctx.fillStyle = "rgba(230,164,43,0.92)";
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(90,42,92,0.88)";
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.72, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "rgba(237,247,185,0.82)";
        ctx.lineWidth = Math.max(1, radius * 0.08);

        for (let i = 0; i < 3; i += 1) {
            ctx.beginPath();
            ctx.arc(0, 0, radius * (0.35 + i * 0.18), 0.15, Math.PI * 1.85);
            ctx.stroke();
        }

        ctx.fillStyle = "rgba(237,247,185,0.9)";
        ctx.beginPath();
        ctx.moveTo(0, -radius * 1.1);
        ctx.quadraticCurveTo(radius * 0.38, -radius * 0.7, 0, -radius * 0.45);
        ctx.quadraticCurveTo(-radius * 0.38, -radius * 0.7, 0, -radius * 1.1);
        ctx.fill();

        ctx.restore();
    }

    function drawPoints(ctx, width, height) {
        const points = groupPoints(state.rows);
        const hovered = state.hoveredPoint;

        points.forEach(point => {
            const projected = project(point.lat, point.lon);
            const visible =
                projected.x >= -80 &&
                projected.x <= width + 80 &&
                projected.y >= -80 &&
                projected.y <= height + 80;

            if (!visible) {
                return;
            }

            const radius = clamp(4 + Math.sqrt(point.count) * 1.65, 5, 28);

            if (point.tor) {
                drawOnion(ctx, projected.x, projected.y, radius + 5);
            } else {
                ctx.beginPath();
                ctx.arc(projected.x, projected.y, radius + 8, 0, Math.PI * 2);
                ctx.fillStyle = "rgba(192,214,116,0.08)";
                ctx.fill();

                ctx.beginPath();
                ctx.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
                ctx.fillStyle = "rgba(192,214,116,0.72)";
                ctx.fill();

                ctx.beginPath();
                ctx.arc(projected.x, projected.y, Math.max(2, radius * 0.36), 0, Math.PI * 2);
                ctx.fillStyle = "rgba(237,247,185,0.86)";
                ctx.fill();
            }

            if (hovered === point) {
                ctx.strokeStyle = "rgba(230,164,43,0.92)";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(projected.x, projected.y, radius + 12, 0, Math.PI * 2);
                ctx.stroke();
            }

            point.screenX = projected.x;
            point.screenY = projected.y;
            point.radius = radius;
        });

        state.points = points;
    }

    function drawHud(ctx, width, height) {
        const total = state.rows.length;
        const geo = state.rows.filter(hasCoordinate).length;
        const tor = state.rows.filter(isTor).length;

        ctx.save();

        ctx.fillStyle = "rgba(3,5,3,0.82)";
        ctx.strokeStyle = "rgba(192,214,116,0.16)";
        ctx.lineWidth = 1;

        const boxWidth = Math.min(460, width - 28);
        const boxHeight = 92;
        const x = 14;
        const y = 14;

        ctx.fillRect(x, y, boxWidth, boxHeight);
        ctx.strokeRect(x + 0.5, y + 0.5, boxWidth - 1, boxHeight - 1);

        ctx.fillStyle = "#c0d674";
        ctx.font = "800 13px IBM Plex Mono, monospace";
        ctx.textAlign = "left";
        ctx.fillText("ZZX BITNODES GEOIP MAP", x + 14, y + 24);

        ctx.fillStyle = "rgba(204,216,182,0.75)";
        ctx.font = "11px IBM Plex Mono, monospace";
        ctx.fillText(`records: ${formatNumber(total)} | geo: ${formatNumber(geo)} | tor: ${formatNumber(tor)}`, x + 14, y + 48);
        ctx.fillText(`zoom: ${state.view.zoom.toFixed(2)} | lat: ${state.view.lat.toFixed(3)} | lon: ${state.view.lon.toFixed(3)} | rot: ${state.view.rotation.toFixed(0)}°`, x + 14, y + 68);

        ctx.fillStyle = "rgba(176,190,156,0.58)";
        ctx.fillText("drag to pan | wheel to zoom | shift+wheel to rotate | double-click to reset", x + 14, y + 86);

        ctx.restore();
    }

    function drawTooltip(ctx, point, width, height) {
        if (!point) {
            return;
        }

        const lines = [
            point.tor ? "Tor / Onion Node Cloud" : `${point.city || "Unknown"}, ${point.country || "Unknown"}`,
            `${formatNumber(point.count)} node record${point.count === 1 ? "" : "s"}`,
            point.provider || "Unknown provider",
            point.tor ? "Everywhere and nowhere, plotted in the Atlantic." : `${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}`
        ];

        ctx.save();

        ctx.font = "11px IBM Plex Mono, monospace";

        const padding = 10;
        const lineHeight = 16;
        const textWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
        const boxWidth = textWidth + padding * 2;
        const boxHeight = lines.length * lineHeight + padding * 2;

        let x = point.screenX + 18;
        let y = point.screenY - boxHeight - 18;

        if (x + boxWidth > width - 10) {
            x = width - boxWidth - 10;
        }

        if (y < 10) {
            y = point.screenY + 18;
        }

        ctx.fillStyle = "rgba(3,5,3,0.92)";
        ctx.strokeStyle = "rgba(230,164,43,0.42)";
        ctx.lineWidth = 1;

        ctx.fillRect(x, y, boxWidth, boxHeight);
        ctx.strokeRect(x + 0.5, y + 0.5, boxWidth - 1, boxHeight - 1);

        lines.forEach((line, index) => {
            ctx.fillStyle = index === 0 ? "#e6a42b" : "rgba(237,247,185,0.78)";
            ctx.fillText(line, x + padding, y + padding + 11 + index * lineHeight);
        });

        ctx.restore();
    }

    function draw() {
        state.animationFrame = null;

        if (!state.canvas || !state.ctx) {
            return;
        }

        resizeCanvas();

        const ctx = state.ctx;
        const width = state.canvas.width / devicePixelRatio;
        const height = state.canvas.height / devicePixelRatio;

        drawBackground(ctx, width, height);
        drawTiles(ctx, width, height);
        drawPoints(ctx, width, height);
        drawTooltip(ctx, state.hoveredPoint, width, height);
        drawHud(ctx, width, height);
    }

    function scheduleDraw() {
        if (state.animationFrame) {
            return;
        }

        state.animationFrame = requestAnimationFrame(draw);
    }

    function updateHover(event) {
        if (!state.points) {
            return;
        }

        const rect = state.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        let best = null;
        let bestDistance = Infinity;

        state.points.forEach(point => {
            if (point.screenX === undefined || point.screenY === undefined) {
                return;
            }

            const dx = point.screenX - x;
            const dy = point.screenY - y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= point.radius + 12 && distance < bestDistance) {
                best = point;
                bestDistance = distance;
            }
        });

        if (state.hoveredPoint !== best) {
            state.hoveredPoint = best;
            scheduleDraw();
        }
    }

    function wireEvents() {
        if (!state.canvas || state.canvas.dataset.bnMapWired === "true") {
            return;
        }

        state.canvas.dataset.bnMapWired = "true";

        state.canvas.addEventListener("mousedown", event => {
            state.dragging = true;
            state.dragStart = {
                x: event.clientX,
                y: event.clientY
            };
            state.viewStart = { ...state.view };
            state.canvas.classList.add("is-dragging");
        });

        window.addEventListener("mouseup", () => {
            state.dragging = false;
            state.canvas?.classList.remove("is-dragging");
        });

        window.addEventListener("mousemove", event => {
            if (!state.dragging || !state.dragStart || !state.viewStart) {
                updateHover(event);
                return;
            }

            const dx = event.clientX - state.dragStart.x;
            const dy = event.clientY - state.dragStart.y;

            const angle = -state.viewStart.rotation * Math.PI / 180;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            const rx = dx * cos - dy * sin;
            const ry = dx * sin + dy * cos;

            const centerX = lonToX(state.viewStart.lon, state.viewStart.zoom) - rx;
            const centerY = latToY(state.viewStart.lat, state.viewStart.zoom) - ry;

            state.view.lon = xToLon(centerX, state.viewStart.zoom);
            state.view.lat = clamp(yToLat(centerY, state.viewStart.zoom), -85, 85);

            scheduleDraw();
        });

        state.canvas.addEventListener("wheel", event => {
            event.preventDefault();

            if (event.shiftKey) {
                state.view.rotation =
                    (state.view.rotation + Math.sign(event.deltaY) * 5) % 360;

                scheduleDraw();
                return;
            }

            const rect = state.canvas.getBoundingClientRect();
            const before = unproject(
                event.clientX - rect.left,
                event.clientY - rect.top
            );

            const delta = event.deltaY < 0 ? 0.35 : -0.35;

            state.view.zoom = clamp(
                state.view.zoom + delta,
                MIN_ZOOM,
                MAX_ZOOM
            );

            const after = unproject(
                event.clientX - rect.left,
                event.clientY - rect.top
            );

            state.view.lon += before.lon - after.lon;
            state.view.lat += before.lat - after.lat;

            scheduleDraw();
        }, { passive: false });

        state.canvas.addEventListener("mousemove", updateHover);

        state.canvas.addEventListener("dblclick", () => {
            state.view = { ...DEFAULT_VIEW };
            scheduleDraw();
        });

        window.addEventListener("resize", scheduleDraw);
    }

    function buildMapShell(target) {
        target.innerHTML = `
            <section class="bn-map-shell">
                <div class="bn-map-toolbar">
                    <button type="button" data-bn-map-action="zoom-in">Zoom In</button>
                    <button type="button" data-bn-map-action="zoom-out">Zoom Out</button>
                    <button type="button" data-bn-map-action="rotate-left">Rotate Left</button>
                    <button type="button" data-bn-map-action="rotate-right">Rotate Right</button>
                    <button type="button" data-bn-map-action="reset">Reset</button>
                </div>

                <div class="bn-map-canvas-wrap" data-map-height="620">
                    <canvas class="bn-map-canvas" aria-label="Bitnodes GeoIP map"></canvas>
                </div>
            </section>
        `;

        state.container = $(".bn-map-canvas-wrap", target);
        state.canvas = $(".bn-map-canvas", target);
        state.ctx = state.canvas.getContext("2d");

        $all("[data-bn-map-action]", target).forEach(button => {
            button.addEventListener("click", () => {
                const action = button.dataset.bnMapAction;

                if (action === "zoom-in") {
                    state.view.zoom = clamp(state.view.zoom + 0.5, MIN_ZOOM, MAX_ZOOM);
                }

                if (action === "zoom-out") {
                    state.view.zoom = clamp(state.view.zoom - 0.5, MIN_ZOOM, MAX_ZOOM);
                }

                if (action === "rotate-left") {
                    state.view.rotation = (state.view.rotation - 10) % 360;
                }

                if (action === "rotate-right") {
                    state.view.rotation = (state.view.rotation + 10) % 360;
                }

                if (action === "reset") {
                    state.view = { ...DEFAULT_VIEW };
                }

                scheduleDraw();
            });
        });

        resizeCanvas();
        wireEvents();
        scheduleDraw();
    }

    function render(target, rows = BN.state?.rows || []) {
        state.rows = Array.isArray(rows) ? rows : [];

        if (!target) {
            return;
        }

        if (!state.initialized || !target.querySelector(".bn-map-canvas")) {
            buildMapShell(target);
            state.initialized = true;
        }

        scheduleDraw();
    }

    function init(scope = document) {
        const targets = $all("[data-bn-map], #bn-map", scope);

        targets.forEach(target => {
            render(target, BN.state?.rows || []);
        });
    }

    document.addEventListener("bn:data-loaded", event => {
        const rows = event.detail?.rows || BN.state?.rows || [];

        $all("[data-bn-map], #bn-map").forEach(target => {
            render(target, rows);
        });
    });

    document.addEventListener("bn:datasource-change", () => {
        state.rows = [];
        scheduleDraw();
    });

    window.BNMaps = {
        init,
        render,
        scheduleDraw,
        project,
        unproject,
        state
    };
})();
