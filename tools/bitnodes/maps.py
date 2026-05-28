#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib.util
import json
import math
import os
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable


APP_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = APP_ROOT / "tools" / "bitnodes"

DEFAULT_STATE_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "state"
DEFAULT_API_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "api"
DEFAULT_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "maps"
DEFAULT_LIVE_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "live-map"

MAP_MODULE_ORDER = [
    "openstreetmaps",
    "mapsettings",
    "mapthemes",
    "mapvectors",
    "maplayers",
    "mapoverlays",
    "mappolygons",
]


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    if not path.exists():
        return fallback

    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


def write_text(path: Path, payload: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8") as handle:
        handle.write(payload)


def clean(value: Any) -> str:
    text = str(value or "").strip()

    if text.lower() in {"", "unknown", "none", "null", "undefined", "—", "-", "n/a", "na"}:
        return ""

    return " ".join(text.split())


def number(value: Any, fallback: float | None = None) -> float | None:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return fallback

    if not math.isfinite(n):
        return fallback

    return n


def nested_dict(row: dict[str, Any], key: str) -> dict[str, Any]:
    value = row.get(key)

    return value if isinstance(value, dict) else {}


def row_lat_lon(row: dict[str, Any]) -> tuple[float | None, float | None]:
    lat = number(
        row.get("latitude")
        or row.get("lat")
        or nested_dict(row, "geoloc").get("latitude")
        or nested_dict(row, "city_data").get("latitude")
        or nested_dict(row, "postal_data").get("latitude")
        or nested_dict(row, "w3w_data").get("center_latitude")
        or nested_dict(row, "geohashid_data").get("center_latitude")
    )

    lon = number(
        row.get("longitude")
        or row.get("lon")
        or row.get("lng")
        or nested_dict(row, "geoloc").get("longitude")
        or nested_dict(row, "city_data").get("longitude")
        or nested_dict(row, "postal_data").get("longitude")
        or nested_dict(row, "w3w_data").get("center_longitude")
        or nested_dict(row, "geohashid_data").get("center_longitude")
    )

    if lat is None or lon is None:
        geo = nested_dict(row, "geo")

        lat = number(geo.get("latitude") or geo.get("lat"))
        lon = number(geo.get("longitude") or geo.get("lon") or geo.get("lng"))

    if lat is None or lon is None:
        return None, None

    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None, None

    return lat, lon


def load_module(module_name: str) -> Any | None:
    path = TOOLS_DIR / f"{module_name}.py"

    if not path.exists():
        return None

    spec = importlib.util.spec_from_file_location(
        f"zzx_bitnodes_maps_{module_name}",
        path,
    )

    if spec is None or spec.loader is None:
        return None

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    return module


def find_callable(module: Any) -> Callable[..., Any] | None:
    for name in (
        "build",
        "build_map",
        "build_maps",
        "render",
        "render_map",
        "process",
        "run",
    ):
        fn = getattr(module, name, None)

        if callable(fn):
            return fn

    return None


def call_module(
    name: str,
    fn: Callable[..., Any],
    payload: dict[str, Any],
    context: dict[str, Any],
) -> dict[str, Any]:
    attempts = (
        lambda: fn(payload, context),
        lambda: fn(payload=payload, context=context),
        lambda: fn(payload),
    )

    last_error: Exception | None = None

    for attempt in attempts:
        try:
            result = attempt()

            if result is None:
                return payload

            if isinstance(result, dict):
                return result

            return payload

        except TypeError as err:
            last_error = err
            continue

    if last_error:
        raise RuntimeError(f"{name} signature mismatch: {last_error}") from last_error

    return payload


def extract_nodes(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]

    if not isinstance(payload, dict):
        return []

    for key in ("nodes", "rows", "data", "results", "reachable", "node_records"):
        value = payload.get(key)

        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]

    nodes = payload.get("nodes")

    if isinstance(nodes, dict):
        output = []

        for address, value in nodes.items():
            if isinstance(value, dict):
                output.append({"address": address, **value})
            elif isinstance(value, list):
                output.append({
                    "address": address,
                    "status": value[0] if len(value) > 0 else None,
                    "protocol": value[1] if len(value) > 1 else None,
                    "agent": value[2] if len(value) > 2 else None,
                    "height": value[3] if len(value) > 3 else None,
                    "services": value[4] if len(value) > 4 else None,
                    "timestamp": value[5] if len(value) > 5 else None,
                })

        return output

    return []


def find_input_file(api_dir: Path, state_dir: Path, explicit_input: str = "") -> Path | None:
    if explicit_input:
        path = Path(explicit_input).resolve()

        if path.exists():
            return path

    candidates = [
        api_dir / "zzxbitnodes" / "nodes.json",
        api_dir / "zzxbitnodes" / "latest.json",
        api_dir / "nodes.json",
        api_dir / "latest.json",
        state_dir / "nodes.json",
        state_dir / "latest.json",
        state_dir / "registry.json",
    ]

    for path in candidates:
        if path.exists():
            return path

    return None


def node_address(row: dict[str, Any]) -> str:
    return clean(row.get("address") or row.get("node") or row.get("addr") or row.get("host"))


def is_tor(row: dict[str, Any]) -> bool:
    address = node_address(row).lower()

    return bool(row.get("is_tor") or nested_dict(row, "tor").get("is_tor") or ".onion" in address)


def is_i2p(row: dict[str, Any]) -> bool:
    address = node_address(row).lower()

    return bool(row.get("is_i2p") or nested_dict(row, "i2p").get("is_i2p") or ".i2p" in address)


def is_ipv4(row: dict[str, Any]) -> bool:
    address = node_address(row)

    return bool(row.get("is_ipv4") or address.count(".") == 3 and ":" not in address)


def is_ipv6(row: dict[str, Any]) -> bool:
    address = node_address(row)

    return bool(row.get("is_ipv6") or address.startswith("[") or (":" in address and ".onion" not in address.lower()))


def is_synced(row: dict[str, Any], max_height: int) -> bool:
    height = int(number(row.get("height"), 0) or 0)

    if max_height <= 0:
        return False

    return height >= max_height - 2


def uptime_seconds(row: dict[str, Any]) -> float:
    for key in ("uptime_seconds", "uptime", "age_seconds", "last_seen_duration"):
        value = number(row.get(key))

        if value is not None:
            return float(value)

    first_seen = number(row.get("first_seen"))
    last_seen = number(row.get("last_seen") or row.get("timestamp"))

    if first_seen is not None and last_seen is not None and last_seen >= first_seen:
        return last_seen - first_seen

    return 0.0


def marker_status(row: dict[str, Any], duplicate_count: int, max_height: int) -> dict[str, Any]:
    synced = is_synced(row, max_height)
    uptime = uptime_seconds(row)
    height = int(number(row.get("height"), 0) or 0)

    if duplicate_count > 1:
        color = "#d95c5c"
        status = "duplicate-location"
        label = "Duplicate Location"
        priority = 90
    elif not synced and height > 0:
        color = "#9d67ad"
        status = "not-yet-synced"
        label = "Not Yet Synced"
        priority = 75
    elif synced and uptime >= 172800:
        color = "#c0d674"
        status = "stable-48h-plus"
        label = "Stable 48h+"
        priority = 65
    elif synced and uptime >= 600:
        color = "#e6a42b"
        status = "synced-10m-plus"
        label = "Synced 10m+"
        priority = 55
    elif synced:
        color = "#edf7b9"
        status = "synced"
        label = "Synced"
        priority = 45
    else:
        color = "#8c927e"
        status = "unknown"
        label = "Unknown"
        priority = 10

    return {
        "status": status,
        "label": label,
        "color": color,
        "priority": priority,
        "synced": synced,
        "uptime_seconds": uptime,
    }


def classify_node(row: dict[str, Any]) -> str:
    if is_tor(row):
        return "tor"

    if is_i2p(row):
        return "i2p"

    if is_ipv6(row):
        return "ipv6"

    if is_ipv4(row):
        return "ipv4"

    return "unknown"


def build_points(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    geocoded: list[tuple[dict[str, Any], float, float]] = []

    max_height = max(
        [int(number(row.get("height"), 0) or 0) for row in nodes] or [0]
    )

    for row in nodes:
        lat, lon = row_lat_lon(row)

        if lat is None or lon is None:
            if is_tor(row):
                lat, lon = 0.0, -32.0
            elif is_i2p(row):
                lat, lon = 0.0, 32.0
            else:
                continue

        geocoded.append((row, lat, lon))

    location_counts: dict[str, int] = {}

    for _row, lat, lon in geocoded:
        key = f"{lat:.4f},{lon:.4f}"
        location_counts[key] = location_counts.get(key, 0) + 1

    points = []

    for row, lat, lon in geocoded:
        key = f"{lat:.4f},{lon:.4f}"
        duplicate_count = location_counts.get(key, 1)
        status = marker_status(row, duplicate_count, max_height)

        address = node_address(row)
        city = clean(row.get("city") or nested_dict(row, "city_data").get("city"))
        country = clean(row.get("country_code") or nested_dict(row, "country_data").get("country_code") or row.get("country"))
        agent = clean(row.get("agent") or row.get("user_agent"))
        provider = clean(row.get("provider") or row.get("organization") or row.get("org"))
        asn = clean(row.get("asn") or nested_dict(row, "isp").get("asn"))

        points.append({
            "id": address or f"{lat:.6f},{lon:.6f}",
            "address": address,
            "latitude": lat,
            "longitude": lon,
            "lat": lat,
            "lon": lon,
            "network": classify_node(row),
            "status": status["status"],
            "status_label": status["label"],
            "color": status["color"],
            "priority": status["priority"],
            "duplicate_count": duplicate_count,
            "synced": status["synced"],
            "height": int(number(row.get("height"), 0) or 0),
            "uptime_seconds": status["uptime_seconds"],
            "city": city,
            "country": country,
            "agent": agent,
            "provider": provider,
            "asn": asn,
            "port": clean(row.get("port")),
            "services": row.get("services"),
            "w3w": clean(row.get("w3w") or row.get("what3words")),
            "geohashid": clean(row.get("geohashid")),
        })

    return sorted(
        points,
        key=lambda item: (
            -int(item["priority"]),
            item["country"],
            item["city"],
            item["address"],
        ),
    )


def build_vector_payload(points: list[dict[str, Any]], source: str) -> dict[str, Any]:
    counts: dict[str, int] = {}
    statuses: dict[str, int] = {}
    countries: dict[str, int] = {}

    for point in points:
        counts[point["network"]] = counts.get(point["network"], 0) + 1
        statuses[point["status"]] = statuses.get(point["status"], 0) + 1

        country = point["country"] or "Unknown"
        countries[country] = countries.get(country, 0) + 1

    return {
        "schema": "zzx-bitnodes-map-vectors-v1",
        "generated_at": utc_now(),
        "source": source,
        "point_count": len(points),
        "network_counts": counts,
        "status_counts": statuses,
        "country_counts": countries,
        "legend": {
            "duplicate-location": {
                "color": "#d95c5c",
                "label": "Duplicate IP / Multiple Nodes at Location",
            },
            "not-yet-synced": {
                "color": "#9d67ad",
                "label": "Not Yet Synced",
            },
            "stable-48h-plus": {
                "color": "#c0d674",
                "label": "Synced / Uptime Over 48h",
            },
            "synced-10m-plus": {
                "color": "#e6a42b",
                "label": "Synced / Uptime Over 10m",
            },
            "synced": {
                "color": "#edf7b9",
                "label": "Synced",
            },
            "unknown": {
                "color": "#8c927e",
                "label": "Unknown / Unclassified",
            },
        },
        "points": points,
    }


def build_geojson(points: list[dict[str, Any]], source: str) -> dict[str, Any]:
    return {
        "type": "FeatureCollection",
        "name": "ZZX Bitnodes Live Map",
        "generated_at": utc_now(),
        "source": source,
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [
                        point["longitude"],
                        point["latitude"],
                    ],
                },
                "properties": {
                    key: value
                    for key, value in point.items()
                    if key not in {"latitude", "longitude", "lat", "lon"}
                },
            }
            for point in points
        ],
    }


def default_settings() -> dict[str, Any]:
    return {
        "schema": "zzx-bitnodes-map-settings-v1",
        "generated_at": utc_now(),
        "tile_provider": "openstreetmap",
        "tile_url": "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "tile_attribution": "© OpenStreetMap contributors",
        "initial_view": {
            "latitude": 20.0,
            "longitude": 0.0,
            "zoom": 2,
            "min_zoom": 2,
            "max_zoom": 18,
        },
        "interaction": {
            "scroll_wheel_zoom": True,
            "drag_pan": True,
            "double_click_zoom": True,
            "box_zoom": True,
            "keyboard": True,
            "middle_mouse_rotate_placeholder": True,
        },
        "marker": {
            "radius_min": 4,
            "radius_max": 14,
            "opacity": 0.88,
            "stroke_weight": 1,
        },
        "refresh": {
            "enabled": True,
            "interval_seconds": 60,
            "vectors_url": "./data/map-vectors.json",
            "geojson_url": "./data/map-points.geojson",
        },
    }


def default_theme() -> dict[str, Any]:
    return {
        "schema": "zzx-bitnodes-map-theme-v1",
        "generated_at": utc_now(),
        "name": "zzx-dark-olive",
        "colors": {
            "background": "#050705",
            "panel": "#080b08",
            "text": "#edf7b9",
            "muted": "rgba(204,216,182,0.72)",
            "accent": "#c0d674",
            "ochre": "#e6a42b",
            "duplicate": "#d95c5c",
            "unsynced": "#9d67ad",
            "unknown": "#8c927e",
        },
    }


def render_index_html(title: str, depth: str = "..") -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title} | ZZX-Labs R&D Bitnodes</title>
    <link rel="stylesheet" href="{depth}/styles.css">
    <link rel="stylesheet" href="./map.css">
    <script src="{depth}/script.js" defer></script>
    <script src="./map.js" defer></script>
</head>
<body data-bn-depth="{depth}" data-bn-view="map">
<header>
    <div id="bn-header"></div>
</header>

<main class="bn-shell">
    <section class="bn-hero container">
        <p class="bn-kicker">ZZX-Labs / Bitnodes Mirror</p>
        <h2>{title}</h2>
        <p>
            OpenStreetMap-backed Bitcoin node telemetry with GeoIP, ISP, client,
            synchronization, uptime, duplicate-location, Tor, I2P, IPv4, and IPv6 overlays.
        </p>
    </section>

    <section class="bn-panel container bn-map-panel">
        <div class="bn-map-toolbar">
            <div>
                <span class="bn-kicker">Map Mode</span>
                <h2>Live Bitcoin Node Map</h2>
            </div>

            <div class="bn-map-controls">
                <button type="button" data-map-filter="all">All</button>
                <button type="button" data-map-filter="ipv4">IPv4</button>
                <button type="button" data-map-filter="ipv6">IPv6</button>
                <button type="button" data-map-filter="tor">Tor</button>
                <button type="button" data-map-filter="i2p">I2P</button>
                <button type="button" data-map-reset>Reset View</button>
            </div>
        </div>

        <div id="bn-live-map" class="bn-live-map" data-map-root></div>

        <div id="bn-map-legend" class="bn-map-legend"></div>
    </section>
</main>

<footer>
    <div id="bn-footer"></div>
</footer>
</body>
</html>
"""


def render_map_css() -> str:
    return """.bn-map-panel {
    overflow: hidden;
}

.bn-map-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
}

.bn-map-toolbar h2 {
    margin: 0.25rem 0 0;
    color: #edf7b9;
    font-family: var(--bn-heading);
}

.bn-map-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
}

.bn-map-controls button {
    border: 1px solid rgba(192, 214, 116, 0.18);
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.24);
    color: #c0d674;
    cursor: pointer;
    font-family: var(--bn-font);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    padding: 0.55rem 0.72rem;
    text-transform: uppercase;
}

.bn-map-controls button:hover,
.bn-map-controls button.is-active {
    background: rgba(192, 214, 116, 0.1);
    border-color: rgba(192, 214, 116, 0.36);
    color: #edf7b9;
}

.bn-live-map {
    width: 100%;
    min-height: 72vh;
    border: 1px solid rgba(192, 214, 116, 0.14);
    border-radius: 18px;
    background: #050705;
    overflow: hidden;
}

.bn-map-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    margin-top: 1rem;
}

.bn-map-legend span {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    border: 1px solid rgba(192, 214, 116, 0.1);
    border-radius: 999px;
    color: rgba(204, 216, 182, 0.78);
    font-family: var(--bn-font);
    font-size: 0.72rem;
    padding: 0.45rem 0.62rem;
}

.bn-map-legend i {
    width: 10px;
    height: 10px;
    border-radius: 999px;
}

.bn-map-popup {
    color: #101410;
    font-family: IBM Plex Mono, monospace;
    font-size: 0.78rem;
    line-height: 1.45;
}

.bn-map-popup strong {
    display: block;
    margin-bottom: 0.35rem;
}

@media (max-width: 768px) {
    .bn-map-toolbar {
        align-items: flex-start;
        flex-direction: column;
    }

    .bn-live-map {
        min-height: 64vh;
    }
}
"""


def render_map_js() -> str:
    return """(() => {
    "use strict";

    const state = {
        map: null,
        layer: null,
        vectors: null,
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

    function radius(point) {
        const dup = Number(point.duplicate_count || 1);
        return Math.max(4, Math.min(14, 4 + Math.log2(dup + 1) * 3));
    }

    function markerPopup(point) {
        return `
            <div class="bn-map-popup">
                <strong>${escapeHtml(point.address || point.id || "Unknown node")}</strong>
                <div>Status: ${escapeHtml(point.status_label || point.status || "Unknown")}</div>
                <div>Network: ${escapeHtml(point.network || "unknown")}</div>
                <div>Height: ${escapeHtml(point.height || "—")}</div>
                <div>City: ${escapeHtml(point.city || "—")}</div>
                <div>Country: ${escapeHtml(point.country || "—")}</div>
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

        return points.filter(point => point.network === state.filter);
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
                fillOpacity: 0.72,
                opacity: 0.95,
                weight: 1
            });

            marker.bindPopup(markerPopup(point));
            marker.addTo(state.layer);
        });

        state.layer.addTo(state.map);
        renderLegend();
    }

    async function init() {
        await loadLeaflet();

        const settings = await readJson("./data/map-settings.json").catch(() => ({
            tile_url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            tile_attribution: "© OpenStreetMap contributors",
            initial_view: {
                latitude: 20,
                longitude: 0,
                zoom: 2
            }
        }));

        state.vectors = await readJson("./data/map-vectors.json");

        const root = qs("[data-map-root]");

        if (!root) {
            return;
        }

        const view = settings.initial_view || {};

        state.map = window.L.map(root, {
            scrollWheelZoom: true,
            doubleClickZoom: true,
            boxZoom: true,
            keyboard: true
        }).setView(
            [Number(view.latitude || 20), Number(view.longitude || 0)],
            Number(view.zoom || 2)
        );

        window.L.tileLayer(settings.tile_url || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: settings.tile_attribution || "© OpenStreetMap contributors",
            maxZoom: Number(view.max_zoom || 18),
            minZoom: Number(view.min_zoom || 2)
        }).addTo(state.map);

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

        renderPoints();
    }

    document.addEventListener("DOMContentLoaded", () => {
        init().catch(error => {
            console.error(error);

            const root = qs("[data-map-root]");

            if (root) {
                root.innerHTML = `<div class="bn-chart-empty">${escapeHtml(error.message)}</div>`;
            }
        });
    });
})();
"""


def run_component_modules(payload: dict[str, Any], context: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    report = []

    current = payload

    for name in MAP_MODULE_ORDER:
        module_report = {
            "name": name,
            "status": "skipped",
            "message": "",
            "updated_at": utc_now(),
        }

        module = load_module(name)

        if module is None:
            module_report["status"] = "missing"
            module_report["message"] = f"{name}.py not found; maps.py fallback output retained."
            report.append(module_report)
            continue

        fn = find_callable(module)

        if fn is None:
            module_report["status"] = "missing-callable"
            module_report["message"] = f"{name}.py has no supported build/render/process function."
            report.append(module_report)
            continue

        try:
            current = call_module(name, fn, current, context)
            module_report["status"] = "ok"
            module_report["message"] = f"{name}.py completed."

        except Exception as err:
            module_report["status"] = "error"
            module_report["message"] = str(err)

            if context.get("strict"):
                report.append(module_report)
                raise

        report.append(module_report)

    return current, report


def build_maps(
    *,
    input_path: Path | None,
    api_dir: Path,
    state_dir: Path,
    map_dir: Path,
    live_map_dir: Path,
    source: str,
    strict: bool = False,
    run_modules: bool = True,
) -> dict[str, Any]:
    selected_input = find_input_file(api_dir, state_dir, str(input_path) if input_path else "")

    if selected_input is None:
        raise FileNotFoundError("No Bitnodes node JSON input found.")

    payload = read_json(selected_input, fallback={})
    nodes = extract_nodes(payload)
    points = build_points(nodes)
    vectors = build_vector_payload(points, source)
    geojson = build_geojson(points, source)

    context = {
        "app_root": str(APP_ROOT),
        "tools_dir": str(TOOLS_DIR),
        "input_path": str(selected_input),
        "api_dir": str(api_dir),
        "state_dir": str(state_dir),
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "source": source,
        "strict": strict,
    }

    map_payload = {
        "vectors": vectors,
        "geojson": geojson,
        "settings": default_settings(),
        "theme": default_theme(),
    }

    module_report: list[dict[str, Any]] = []

    if run_modules:
        map_payload, module_report = run_component_modules(map_payload, context)

    for out_dir, title in (
        (map_dir, "Bitcoin Node Map"),
        (live_map_dir, "Live Bitcoin Node Map"),
    ):
        data_dir = out_dir / "data"

        write_json(data_dir / "map-vectors.json", map_payload.get("vectors", vectors))
        write_json(data_dir / "map-points.geojson", map_payload.get("geojson", geojson))
        write_json(data_dir / "map-settings.json", map_payload.get("settings", default_settings()))
        write_json(data_dir / "map-theme.json", map_payload.get("theme", default_theme()))

        write_text(out_dir / "index.html", render_index_html(title))
        write_text(out_dir / "map.css", render_map_css())
        write_text(out_dir / "map.js", render_map_js())

    report = {
        "schema": "zzx-bitnodes-maps-build-report-v1",
        "generated_at": utc_now(),
        "source": source,
        "input": str(selected_input),
        "node_count": len(nodes),
        "point_count": len(points),
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "modules": module_report,
    }

    write_json(map_dir / "data" / "map-build-report.json", report)
    write_json(live_map_dir / "data" / "map-build-report.json", report)

    return report


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build OpenStreetMap-backed Bitnodes map and live-map static frontend data."
    )

    parser.add_argument("--input", default="")
    parser.add_argument("--api-dir", default=str(DEFAULT_API_DIR))
    parser.add_argument("--state-dir", default=str(DEFAULT_STATE_DIR))
    parser.add_argument("--map-dir", default=str(DEFAULT_MAP_DIR))
    parser.add_argument("--live-map-dir", default=str(DEFAULT_LIVE_MAP_DIR))
    parser.add_argument("--source", default="zzxbitnodes")
    parser.add_argument("--strict", action="store_true")
    parser.add_argument("--no-modules", action="store_true")

    args = parser.parse_args()

    report = build_maps(
        input_path=Path(args.input).resolve() if args.input else None,
        api_dir=Path(args.api_dir).resolve(),
        state_dir=Path(args.state_dir).resolve(),
        map_dir=Path(args.map_dir).resolve(),
        live_map_dir=Path(args.live_map_dir).resolve(),
        source=args.source,
        strict=args.strict,
        run_modules=not args.no_modules,
    )

    print(
        "maps build complete: "
        f"{report['point_count']} points, "
        f"map_dir={report['map_dir']}, "
        f"live_map_dir={report['live_map_dir']}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
