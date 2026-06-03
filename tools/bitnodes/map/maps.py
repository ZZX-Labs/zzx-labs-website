#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib.util
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable


APP_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = APP_ROOT / "tools" / "bitnodes"

DEFAULT_STATE_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "state"
DEFAULT_API_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "api"
DEFAULT_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "maps"
DEFAULT_LIVE_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "live-map"

DEFAULT_THEME_DIR = APP_ROOT / "tools" / "bitnodes" / "data" / "mapthemes"
DEFAULT_SETTINGS_DIR = APP_ROOT / "tools" / "bitnodes" / "data" / "mapsettings"

DEFAULT_THEME = "zzx_dark_olive"
DEFAULT_SETTINGS = "default"

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

    if text.lower() in {
        "",
        "unknown",
        "none",
        "null",
        "undefined",
        "—",
        "-",
        "n/a",
        "na",
    }:
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
            else:
                output.append({
                    "address": address,
                    "value": value,
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
        api_dir / "originalbitnodes" / "nodes.json",
        api_dir / "originalbitnodes" / "latest.json",
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

    return bool(row.get("is_ipv4") or (address.count(".") == 3 and ":" not in address))


def is_ipv6(row: dict[str, Any]) -> bool:
    address = node_address(row).lower()

    return bool(row.get("is_ipv6") or address.startswith("[") or (":" in address and ".onion" not in address and ".i2p" not in address))


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
        country_name = clean(nested_dict(row, "country_data").get("country_name"))
        continent = clean(row.get("continent") or nested_dict(row, "continent_data").get("continent"))
        region = clean(row.get("region") or nested_dict(row, "region_data").get("region"))
        territory = clean(row.get("territory") or nested_dict(row, "territory_data").get("territory"))
        county = clean(row.get("county") or nested_dict(row, "county_data").get("county"))
        postal = clean(row.get("postal_code") or row.get("zip") or nested_dict(row, "postal_data").get("postal_code"))
        timezone_name = clean(row.get("timezone") or nested_dict(row, "timezone_data").get("timezone"))

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
            "county": county,
            "territory": territory,
            "region": region,
            "continent": continent,
            "country": country,
            "country_name": country_name,
            "postal_code": postal,
            "timezone": timezone_name,
            "agent": agent,
            "provider": provider,
            "asn": asn,
            "port": clean(row.get("port")),
            "services": row.get("services"),
            "w3w": clean(row.get("w3w") or row.get("what3words")),
            "geohashid": clean(row.get("geohashid")),
            "jurisdiction_risk_level": clean(row.get("jurisdiction_risk_level")),
            "jurisdiction_recommended_action": clean(row.get("jurisdiction_recommended_action")),
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
        "tile_provider": "cartodb_dark",
        "tile_url": "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        "tile_attribution": "© OpenStreetMap contributors © CARTO",
        "tile_subdomains": ["a", "b", "c", "d"],
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
            "touch_zoom": True,
            "double_click_zoom": True,
            "box_zoom": True,
            "keyboard": True,
            "middle_mouse_reserved_for_network_map": True,
        },
        "marker": {
            "radius_min": 4,
            "radius_max": 14,
            "opacity": 0.88,
            "fill_opacity": 0.72,
            "stroke_weight": 1,
            "cluster_enabled": True,
            "heatmap_enabled": True,
        },
        "refresh": {
            "enabled": True,
            "interval_seconds": 60,
            "vectors_url": "./data/map-vectors.json",
            "geojson_url": "./data/map-points.geojson",
            "settings_url": "./data/map-settings.json",
            "theme_url": "./data/map-theme.json",
            "layers_url": "./data/map-layers.json",
            "overlays_url": "./data/map-overlays.json",
            "polygons_url": "./data/map-polygons.geojson",
        },
        "theme": {
            "selected": DEFAULT_THEME,
            "manifest_url": "./data/map-themes.json",
            "theme_url": f"./data/themes/{DEFAULT_THEME}.json",
            "user_selectable": True,
            "css_variables": {},
        },
    }


def default_theme() -> dict[str, Any]:
    return {
        "schema": "zzx-bitnodes-map-theme-v1",
        "id": DEFAULT_THEME,
        "generated_at": utc_now(),
        "name": "ZZX Dark Olive",
        "description": "Default ZZX-Labs dark tactical olive/ochre map theme.",
        "font_family": "IBM Plex Mono, monospace",
        "heading_font_family": "var(--bn-heading, IBM Plex Mono, monospace)",
        "colors": {
            "background": "#050705",
            "panel": "#080b08",
            "panel_alt": "#10140d",
            "text": "#edf7b9",
            "muted": "#ccd8b6",
            "accent": "#c0d674",
            "accent_soft": "#617039",
            "ochre": "#e6a42b",
            "danger": "#d95c5c",
            "warning": "#e6a42b",
            "purple": "#9d67ad",
            "blue": "#70b7ff",
            "unknown": "#8c927e",
        },
        "markers": {
            "duplicate_location": "#d95c5c",
            "not_yet_synced": "#9d67ad",
            "stable_48h_plus": "#c0d674",
            "synced_10m_plus": "#e6a42b",
            "synced": "#edf7b9",
            "ipv4": "#c0d674",
            "ipv6": "#70b7ff",
            "tor": "#9d67ad",
            "i2p": "#b889ff",
            "unknown": "#8c927e",
        },
        "layout": {
            "border_radius": "18px",
            "panel_padding": "1.1rem",
            "control_radius": "999px",
            "shadow": "0 16px 34px rgba(0,0,0,0.32)",
        },
        "tiles": {
            "provider": "cartodb_dark",
        },
        "css_variables": {
            "--bn-map-background": "#050705",
            "--bn-map-panel": "#080b08",
            "--bn-map-text": "#edf7b9",
            "--bn-map-muted": "#ccd8b6",
            "--bn-map-accent": "#c0d674",
            "--bn-map-ochre": "#e6a42b",
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
            synchronization, uptime, duplicate-location, Tor, I2P, IPv4, IPv6,
            GeoHashID, what3words, postal, city, county, territory, and country overlays.
        </p>
    </section>

    <section class="bn-panel container bn-map-panel">
        <div class="bn-map-toolbar">
            <div>
                <span class="bn-kicker">Map Mode</span>
                <h2>Bitcoin Node Map</h2>
            </div>

            <div class="bn-map-selectors">
                <label>
                    Theme
                    <select id="bn-map-theme-select" data-map-theme-select></select>
                </label>

                <label>
                    Settings
                    <select id="bn-map-settings-select" data-map-settings-select></select>
                </label>
            </div>

            <div class="bn-map-controls">
                <button type="button" data-map-filter="all" class="is-active">All</button>
                <button type="button" data-map-filter="ipv4">IPv4</button>
                <button type="button" data-map-filter="ipv6">IPv6</button>
                <button type="button" data-map-filter="tor">Tor</button>
                <button type="button" data-map-filter="i2p">I2P</button>
                <button type="button" data-map-reset>Reset View</button>
            </div>
        </div>

        <div id="bn-map-status" class="bn-map-status">Loading map telemetry…</div>

        <div id="bn-live-map" class="bn-live-map" data-map-root></div>

        <div id="bn-map-hud" class="bn-map-hud"></div>
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
    return """:root {
    --bn-map-background: #050705;
    --bn-map-panel: #080b08;
    --bn-map-panel-alt: #10140d;
    --bn-map-text: #edf7b9;
    --bn-map-muted: #ccd8b6;
    --bn-map-accent: #c0d674;
    --bn-map-ochre: #e6a42b;
    --bn-map-danger: #d95c5c;
    --bn-map-purple: #9d67ad;
    --bn-map-blue: #70b7ff;
    --bn-map-unknown: #8c927e;
    --bn-map-border-radius: 18px;
    --bn-map-panel-padding: 1.1rem;
    --bn-map-control-radius: 999px;
    --bn-map-shadow: 0 16px 34px rgba(0,0,0,0.32);
    --bn-map-font: var(--bn-font, IBM Plex Mono, monospace);
    --bn-map-heading: var(--bn-heading, IBM Plex Mono, monospace);
}

.bn-map-panel {
    overflow: hidden;
}

.bn-map-toolbar {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) auto auto;
    align-items: end;
    gap: 1rem;
    margin-bottom: 1rem;
}

.bn-map-toolbar h2 {
    margin: 0.25rem 0 0;
    color: var(--bn-map-text);
    font-family: var(--bn-map-heading);
}

.bn-map-selectors {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    flex-wrap: wrap;
}

.bn-map-selectors label {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    color: rgba(204,216,182,0.72);
    font-family: var(--bn-map-font);
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.bn-map-selectors select {
    min-width: 190px;
    border: 1px solid rgba(192,214,116,0.18);
    border-radius: 10px;
    background: rgba(0,0,0,0.32);
    color: var(--bn-map-text);
    font-family: var(--bn-map-font);
    font-size: 0.74rem;
    padding: 0.55rem 0.7rem;
}

.bn-map-controls {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.5rem;
}

.bn-map-controls button {
    border: 1px solid rgba(192,214,116,0.18);
    border-radius: var(--bn-map-control-radius);
    background: rgba(0,0,0,0.24);
    color: var(--bn-map-accent);
    cursor: pointer;
    font-family: var(--bn-map-font);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    padding: 0.55rem 0.72rem;
    text-transform: uppercase;
}

.bn-map-controls button:hover,
.bn-map-controls button.is-active {
    background: rgba(192,214,116,0.1);
    border-color: rgba(192,214,116,0.36);
    color: var(--bn-map-text);
}

.bn-map-status {
    margin: 0 0 0.85rem;
    border: 1px solid rgba(192,214,116,0.12);
    border-radius: 12px;
    background: rgba(0,0,0,0.22);
    color: rgba(204,216,182,0.72);
    font-family: var(--bn-map-font);
    font-size: 0.74rem;
    line-height: 1.6;
    padding: 0.7rem 0.85rem;
}

.bn-live-map {
    width: 100%;
    min-height: 72vh;
    border: 1px solid rgba(192,214,116,0.14);
    border-radius: var(--bn-map-border-radius);
    background: var(--bn-map-background);
    overflow: hidden;
    box-shadow: var(--bn-map-shadow);
}

.bn-map-hud {
    display: grid;
    grid-template-columns: repeat(5, minmax(120px, 1fr));
    gap: 0.65rem;
    margin-top: 1rem;
}

.bn-map-hud article {
    border: 1px solid rgba(192,214,116,0.12);
    border-radius: 14px;
    background: linear-gradient(180deg, rgba(16,20,13,0.9), rgba(5,7,5,0.96));
    padding: 0.8rem;
}

.bn-map-hud span {
    display: block;
    color: rgba(204,216,182,0.64);
    font-family: var(--bn-map-font);
    font-size: 0.65rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.bn-map-hud strong {
    display: block;
    margin-top: 0.35rem;
    color: var(--bn-map-text);
    font-family: var(--bn-map-font);
    font-size: 1.05rem;
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
    border: 1px solid rgba(192,214,116,0.1);
    border-radius: 999px;
    color: rgba(204,216,182,0.78);
    font-family: var(--bn-map-font);
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

@media (max-width: 1100px) {
    .bn-map-toolbar {
        grid-template-columns: 1fr;
        align-items: start;
    }

    .bn-map-controls {
        justify-content: flex-start;
    }

    .bn-map-hud {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

@media (max-width: 768px) {
    .bn-map-selectors {
        width: 100%;
    }

    .bn-map-selectors label,
    .bn-map-selectors select {
        width: 100%;
    }

    .bn-live-map {
        min-height: 64vh;
    }

    .bn-map-hud {
        grid-template-columns: 1fr;
    }
}
"""


def render_map_js() -> str:
    return """(() => {
    "use strict";

    const state = {
        map: null,
        layer: null,
        polygonLayer: null,
        vectors: null,
        settings: null,
        theme: null,
        themes: null,
        settingsProfiles: null,
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

    function setStatus(message) {
        const target = qs("#bn-map-status");

        if (target) {
            target.textContent = message;
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
        if (!theme) {
            return;
        }

        state.theme = theme;

        const vars = theme.css_variables || {};

        Object.entries(vars).forEach(([key, value]) => {
            document.documentElement.style.setProperty(key, value);
        });
    }

    async function loadTheme(themeId) {
        const id = themeId || state.settings?.theme?.selected || "zzx_dark_olive";
        const theme = await readJson(`./data/themes/${id}.json`).catch(() => readJson("./data/map-theme.json"));

        applyTheme(theme);

        return theme;
    }

    async function loadSettingsProfile(settingsId) {
        const id = settingsId || state.settings?.profile?.id || "default";
        const profile = await readJson(`./data/settings/${id}.json`);

        return profile;
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
                <div>Uptime: ${escapeHtml(Math.round(Number(point.uptime_seconds || 0)).toLocaleString())}s</div>
                <div>City: ${escapeHtml(point.city || "—")}</div>
                <div>County: ${escapeHtml(point.county || "—")}</div>
                <div>Territory: ${escapeHtml(point.territory || "—")}</div>
                <div>Country: ${escapeHtml(point.country_name || point.country || "—")}</div>
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

        return points.filter(point => point.network === state.filter || point.status === state.filter);
    }

    function renderHud() {
        const target = qs("#bn-map-hud");

        if (!target || !state.vectors) {
            return;
        }

        const networks = state.vectors.network_counts || {};
        const statuses = state.vectors.status_counts || {};

        target.innerHTML = `
            <article><span>Total Points</span><strong>${Number(state.vectors.point_count || 0).toLocaleString()}</strong></article>
            <article><span>IPv4</span><strong>${Number(networks.ipv4 || 0).toLocaleString()}</strong></article>
            <article><span>IPv6</span><strong>${Number(networks.ipv6 || 0).toLocaleString()}</strong></article>
            <article><span>Tor</span><strong>${Number(networks.tor || 0).toLocaleString()}</strong></article>
            <article><span>I2P</span><strong>${Number(networks.i2p || 0).toLocaleString()}</strong></article>
            <article><span>Duplicate</span><strong>${Number(statuses["duplicate-location"] || 0).toLocaleString()}</strong></article>
            <article><span>Unsynced</span><strong>${Number(statuses["not-yet-synced"] || 0).toLocaleString()}</strong></article>
            <article><span>Stable 48h+</span><strong>${Number(statuses["stable-48h-plus"] || 0).toLocaleString()}</strong></article>
            <article><span>Synced 10m+</span><strong>${Number(statuses["synced-10m-plus"] || 0).toLocaleString()}</strong></article>
            <article><span>Synced</span><strong>${Number(statuses.synced || 0).toLocaleString()}</strong></article>
        `;
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
                fillOpacity: Number(state.settings?.marker?.fill_opacity || 0.72),
                opacity: Number(state.settings?.marker?.opacity || 0.95),
                weight: Number(state.settings?.marker?.stroke_weight || 1),
                renderer: state.settings?.performance?.prefer_canvas_renderer && state.canvasRenderer
                    ? state.canvasRenderer
                    : undefined
            });

            marker.bindPopup(markerPopup(point));
            marker.addTo(state.layer);
        });

        state.layer.addTo(state.map);
        renderHud();
        renderLegend();

        setStatus(`Loaded ${(filteredPoints().length).toLocaleString()} visible map points from ${state.vectors?.source || "selected source"}.`);
    }

    async function renderPolygons() {
        if (!state.map || !window.L) {
            return;
        }

        const polygons = await readJson("./data/map-polygons.geojson").catch(() => null);

        if (!polygons || !Array.isArray(polygons.features)) {
            return;
        }

        if (state.polygonLayer) {
            state.polygonLayer.remove();
        }

        state.polygonLayer = window.L.geoJSON(polygons, {
            style: feature => {
                const props = feature.properties || {};

                return {
                    color: props.stroke || "#c0d674",
                    fillColor: props.fill || "#c0d674",
                    fillOpacity: Number(props.opacity || 0.08),
                    opacity: Number(props.opacity || 0.22),
                    weight: 1
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

        if (!select || !state.themes?.themes) {
            return;
        }

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

        if (!select || !state.settingsProfiles?.profiles) {
            return;
        }

        select.innerHTML = state.settingsProfiles.profiles.map(profile => `
            <option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)}</option>
        `).join("");

        select.value = state.settings?.profile?.id || state.settingsProfiles.default_settings || "default";

        select.addEventListener("change", async () => {
            const profile = await loadSettingsProfile(select.value);

            setStatus(`Settings profile "${profile.name || select.value}" loaded. Rebuild maps.py output to persist profile-derived normalized map settings.`);
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
    }

    async function init() {
        await loadLeaflet();

        state.settings = await readJson("./data/map-settings.json");
        state.vectors = await readJson("./data/map-vectors.json");
        state.themes = await readJson("./data/map-themes.json").catch(() => null);
        state.settingsProfiles = await readJson("./data/map-settings-profiles.json").catch(() => null);

        await loadTheme(state.settings?.theme?.selected || "zzx_dark_olive");

        const root = qs("[data-map-root]");

        if (!root) {
            return;
        }

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

        window.L.tileLayer(state.settings.tile_url || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: state.settings.tile_attribution || "© OpenStreetMap contributors",
            subdomains: state.settings.tile_subdomains || undefined,
            maxZoom: Number(view.max_zoom || 18),
            minZoom: Number(view.min_zoom || 2)
        }).addTo(state.map);

        populateThemeSelect();
        populateSettingsSelect();
        wireControls(view);

        await renderPolygons();
        renderPoints();
    }

    document.addEventListener("DOMContentLoaded", () => {
        init().catch(error => {
            console.error(error);

            const root = qs("[data-map-root]");

            if (root) {
                root.innerHTML = `<div class="bn-chart-empty">${escapeHtml(error.message)}</div>`;
            }

            setStatus(`Map load failure: ${error.message}`);
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


def write_directory_output(
    *,
    out_dir: Path,
    title: str,
    map_payload: dict[str, Any],
    vectors: dict[str, Any],
    geojson: dict[str, Any],
    settings: dict[str, Any],
    theme: dict[str, Any],
) -> None:
    data_dir = out_dir / "data"

    write_json(data_dir / "map-vectors.json", map_payload.get("vectors", vectors))
    write_json(data_dir / "map-points.geojson", map_payload.get("geojson", geojson))
    write_json(data_dir / "map-settings.json", map_payload.get("settings", settings))
    write_json(data_dir / "map-theme.json", map_payload.get("theme", theme))

    if "layers" in map_payload:
        write_json(data_dir / "map-layers.json", map_payload["layers"])

    if "overlays" in map_payload:
        write_json(data_dir / "map-overlays.json", map_payload["overlays"])

    if "polygons" in map_payload:
        write_json(data_dir / "map-polygons.geojson", map_payload["polygons"])

    if "themes" in map_payload:
        write_json(data_dir / "map-themes.json", map_payload["themes"])

    if "settings_profiles" in map_payload:
        write_json(data_dir / "map-settings-profiles.json", map_payload["settings_profiles"])

    selected_theme = map_payload.get("theme", theme)
    selected_theme_id = selected_theme.get("id", DEFAULT_THEME) if isinstance(selected_theme, dict) else DEFAULT_THEME

    themes_manifest = map_payload.get("themes", {})
    themes = themes_manifest.get("themes", []) if isinstance(themes_manifest, dict) else []

    if themes:
        for item in themes:
            theme_id = clean(item.get("id"))

            if not theme_id:
                continue

            src = DEFAULT_THEME_DIR / f"{theme_id}.json"
            dst = data_dir / "themes" / f"{theme_id}.json"
            theme_payload = read_json(src, fallback={})

            if theme_payload:
                write_json(dst, theme_payload)

    if selected_theme:
        write_json(data_dir / "themes" / f"{selected_theme_id}.json", selected_theme)

    settings_profiles = map_payload.get("settings_profiles", {})
    profiles = settings_profiles.get("profiles", []) if isinstance(settings_profiles, dict) else []

    if profiles:
        for item in profiles:
            settings_id = clean(item.get("id"))

            if not settings_id:
                continue

            src = DEFAULT_SETTINGS_DIR / f"{settings_id}.json"
            dst = data_dir / "settings" / f"{settings_id}.json"
            settings_payload = read_json(src, fallback={})

            if settings_payload:
                write_json(dst, settings_payload)

    write_text(out_dir / "index.html", render_index_html(title))
    write_text(out_dir / "map.css", render_map_css())
    write_text(out_dir / "map.js", render_map_js())


def build_maps(
    *,
    input_path: Path | None,
    api_dir: Path,
    state_dir: Path,
    map_dir: Path,
    live_map_dir: Path,
    source: str,
    theme_dir: Path,
    settings_dir: Path,
    theme: str,
    settings_profile: str,
    tile_provider: str,
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
        "theme_dir": str(theme_dir),
        "map_theme_dir": str(theme_dir),
        "selected_theme": theme,
        "theme": theme,
        "settings_dir": str(settings_dir),
        "map_settings_dir": str(settings_dir),
        "selected_settings": settings_profile,
        "settings": settings_profile,
        "tile_provider": tile_provider,
        "osm_tile_provider": tile_provider,
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

    final_settings = map_payload.get("settings", default_settings())
    final_theme = map_payload.get("theme", default_theme())
    final_vectors = map_payload.get("vectors", vectors)
    final_geojson = map_payload.get("geojson", geojson)

    write_directory_output(
        out_dir=map_dir,
        title="Bitcoin Node Map",
        map_payload=map_payload,
        vectors=final_vectors,
        geojson=final_geojson,
        settings=final_settings,
        theme=final_theme,
    )

    write_directory_output(
        out_dir=live_map_dir,
        title="Live Bitcoin Node Map",
        map_payload=map_payload,
        vectors=final_vectors,
        geojson=final_geojson,
        settings=final_settings,
        theme=final_theme,
    )

    report = {
        "schema": "zzx-bitnodes-maps-build-report-v2",
        "generated_at": utc_now(),
        "source": source,
        "input": str(selected_input),
        "node_count": len(nodes),
        "point_count": len(points),
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "theme_dir": str(theme_dir),
        "settings_dir": str(settings_dir),
        "selected_theme": theme,
        "selected_settings": settings_profile,
        "tile_provider": tile_provider,
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

    parser.add_argument("--theme-dir", default=str(DEFAULT_THEME_DIR))
    parser.add_argument("--settings-dir", default=str(DEFAULT_SETTINGS_DIR))
    parser.add_argument("--theme", default=DEFAULT_THEME)
    parser.add_argument("--settings", default=DEFAULT_SETTINGS)
    parser.add_argument("--tile-provider", default="cartodb_dark")

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
        theme_dir=Path(args.theme_dir).resolve(),
        settings_dir=Path(args.settings_dir).resolve(),
        theme=args.theme,
        settings_profile=args.settings,
        tile_provider=args.tile_provider,
        strict=args.strict,
        run_modules=not args.no_modules,
    )

    print(
        "maps build complete: "
        f"{report['point_count']} points, "
        f"theme={report['selected_theme']}, "
        f"settings={report['selected_settings']}, "
        f"map_dir={report['map_dir']}, "
        f"live_map_dir={report['live_map_dir']}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
