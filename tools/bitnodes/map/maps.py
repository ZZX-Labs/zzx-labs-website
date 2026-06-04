#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib.util
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping


APP_ROOT = Path(__file__).resolve().parents[3]
TOOLS_DIR = APP_ROOT / "tools" / "bitnodes"
MAP_TOOLS_DIR = TOOLS_DIR / "map"

DEFAULT_STATE_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "state"
DEFAULT_API_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "api"
DEFAULT_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "maps"
DEFAULT_LIVE_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "live-map"

DEFAULT_THEME_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "mapthemes"
DEFAULT_SETTINGS_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "mapsettings"

DEFAULT_THEME = "zzx_dark_olive"
DEFAULT_SETTINGS = "default"

MAP_MODULE_ORDER = [
    "openstreetmaps",
    "mapsettings",
    "mapthemes",
    "vector_types",
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

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json(path: Path, payload: Any, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    text = json.dumps(
        payload,
        ensure_ascii=False,
        indent=None if compact else 2,
        separators=(",", ":") if compact else None,
        sort_keys=not compact,
    )

    path.write_text(text + "\n", encoding="utf-8")


def write_text(path: Path, payload: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(payload, encoding="utf-8")


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


def boolish(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value

    if value in (1, "1"):
        return True

    if value in (0, "0"):
        return False

    text = str(value or "").strip().lower()

    if text in {"true", "yes", "y", "ok", "1", "reachable", "online", "success"}:
        return True

    if text in {"false", "no", "n", "0", "unreachable", "offline", "failed", "timeout", "error"}:
        return False

    return None


def deep_get(row: Mapping[str, Any], key: str) -> Any:
    if "." not in key:
        return row.get(key)

    current: Any = row

    for part in key.split("."):
        if not isinstance(current, Mapping):
            return None

        current = current.get(part)

    return current


def first(row: Mapping[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        value = deep_get(row, key)

        if value not in ("", None):
            return value

    return None


def nested_dict(row: Mapping[str, Any], key: str) -> dict[str, Any]:
    value = row.get(key)
    return value if isinstance(value, dict) else {}


def row_lat_lon(row: Mapping[str, Any]) -> tuple[float | None, float | None]:
    lat = number(first(row, (
        "latitude",
        "lat",
        "geoloc.latitude",
        "city_data.latitude",
        "postal_data.latitude",
        "w3w_data.center_latitude",
        "zzxgcs_data.center_latitude",
        "geohashid_data.center_latitude",
        "geo.latitude",
        "geo.lat",
        "geoip.latitude",
        "geoip.lat",
        "geoip_data.latitude",
        "location.latitude",
        "metadata.latitude",
    )))

    lon = number(first(row, (
        "longitude",
        "lon",
        "lng",
        "geoloc.longitude",
        "geoloc.lon",
        "city_data.longitude",
        "postal_data.longitude",
        "w3w_data.center_longitude",
        "zzxgcs_data.center_longitude",
        "geohashid_data.center_longitude",
        "geo.longitude",
        "geo.lon",
        "geo.lng",
        "geoip.longitude",
        "geoip.lon",
        "geoip_data.longitude",
        "location.longitude",
        "metadata.longitude",
    )))

    if lat is None or lon is None:
        return None, None

    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None, None

    return lat, lon


def load_module(module_name: str) -> Any | None:
    path = MAP_TOOLS_DIR / f"{module_name}.py"

    if not path.exists():
        return None

    spec = importlib.util.spec_from_file_location(
        f"zzx_bitnodes_map_{module_name}",
        path,
    )

    if spec is None or spec.loader is None:
        return None

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    return module


def find_callable(module: Any) -> Callable[..., Any] | None:
    for name in ("build", "build_map", "build_maps", "render", "render_map", "process", "run"):
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


def array_node_to_dict(address: str, row: list[Any]) -> dict[str, Any]:
    metadata = row[19] if len(row) > 19 and isinstance(row[19], dict) else {}

    return {
        "address": address,
        "protocol": row[0] if len(row) > 0 else None,
        "agent": row[1] if len(row) > 1 else None,
        "connected_since": row[2] if len(row) > 2 else None,
        "services": row[3] if len(row) > 3 else None,
        "height": row[4] if len(row) > 4 else None,
        "hostname": row[5] if len(row) > 5 else None,
        "city": row[6] if len(row) > 6 else None,
        "country": row[7] if len(row) > 7 else None,
        "country_code": row[7] if len(row) > 7 else None,
        "latitude": row[8] if len(row) > 8 else None,
        "longitude": row[9] if len(row) > 9 else None,
        "timezone": row[10] if len(row) > 10 else None,
        "asn": row[11] if len(row) > 11 else None,
        "organization": row[12] if len(row) > 12 else None,
        "provider": row[13] if len(row) > 13 else None,
        "county": row[14] if len(row) > 14 else None,
        "zip": row[15] if len(row) > 15 else None,
        "postal_code": row[15] if len(row) > 15 else None,
        "w3w": row[16] if len(row) > 16 else None,
        "what3words": row[16] if len(row) > 16 else None,
        "geohash": row[17] if len(row) > 17 else None,
        "geohashid": row[17] if len(row) > 17 else None,
        "asn_location": row[18] if len(row) > 18 else None,
        "metadata": metadata,
        **metadata,
    }


def extract_nodes(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]

    if not isinstance(payload, dict):
        return []

    for key in ("rows", "data", "results", "reachable", "unreachable", "node_records", "peers"):
        value = payload.get(key)

        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]

    nodes = payload.get("nodes")

    if isinstance(nodes, list):
        return [item for item in nodes if isinstance(item, dict)]

    if isinstance(nodes, dict):
        output: list[dict[str, Any]] = []

        for address, value in nodes.items():
            if isinstance(value, dict):
                record = dict(value)
                record.setdefault("address", address)
                output.append(record)
            elif isinstance(value, list):
                output.append(array_node_to_dict(str(address), value))
            else:
                output.append({"address": address, "value": value})

        return output

    vectors = payload.get("vectors")

    if isinstance(vectors, dict):
        value = vectors.get("points")

        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]

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
        DEFAULT_LIVE_MAP_DIR / "data" / "live-map.json",
        DEFAULT_LIVE_MAP_DIR / "data" / "map-vectors.json",
    ]

    for path in candidates:
        if path.exists():
            return path

    return None


def node_address(row: Mapping[str, Any]) -> str:
    return clean(first(row, ("address", "node", "addr", "host", "hostname")))


def is_tor(row: Mapping[str, Any]) -> bool:
    address = node_address(row).lower()
    return boolish(first(row, ("is_tor", "tor.is_tor", "metadata.is_tor"))) is True or ".onion" in address


def is_i2p(row: Mapping[str, Any]) -> bool:
    address = node_address(row).lower()
    return boolish(first(row, ("is_i2p", "i2p.is_i2p", "metadata.is_i2p"))) is True or ".i2p" in address


def is_ipv4(row: Mapping[str, Any]) -> bool:
    address = node_address(row)
    host = address.rsplit(":", 1)[0] if address.count(":") == 1 else address
    return boolish(first(row, ("is_ipv4", "metadata.is_ipv4"))) is True or host.count(".") == 3


def is_ipv6(row: Mapping[str, Any]) -> bool:
    address = node_address(row).lower()
    return boolish(first(row, ("is_ipv6", "metadata.is_ipv6"))) is True or address.startswith("[") or (
        ":" in address and ".onion" not in address and ".i2p" not in address
    )


def classify_node(row: Mapping[str, Any]) -> str:
    network = clean(first(row, ("network", "metadata.network"))).lower()

    if network:
        return network

    if is_tor(row):
        return "tor"

    if is_i2p(row):
        return "i2p"

    if is_ipv6(row):
        return "ipv6"

    if is_ipv4(row):
        return "ipv4"

    return "unknown"


def is_synced(row: Mapping[str, Any], max_height: int) -> bool:
    height = int(number(first(row, ("height",)), 0) or 0)

    if max_height <= 0:
        return False

    return height >= max_height - 2


def uptime_seconds(row: Mapping[str, Any]) -> float:
    for key in ("uptime_seconds", "uptime", "age_seconds", "last_seen_duration", "metadata.uptime_seconds"):
        value = number(first(row, (key,)))

        if value is not None:
            return float(value)

    first_seen = number(first(row, ("first_seen", "metadata.first_seen")))
    last_seen = number(first(row, ("last_seen", "timestamp", "metadata.last_seen")))

    if first_seen is not None and last_seen is not None and last_seen >= first_seen:
        return last_seen - first_seen

    return 0.0


def marker_status(row: Mapping[str, Any], duplicate_count: int, max_height: int) -> dict[str, Any]:
    reachable = boolish(first(row, ("reachable", "metadata.reachable")))
    reachable_now = boolish(first(row, ("reachable_now", "metadata.reachable_now")))
    synced = is_synced(row, max_height)
    uptime = uptime_seconds(row)
    height = int(number(first(row, ("height",)), 0) or 0)

    if duplicate_count > 1:
        color = "#d95c5c"
        status = "duplicate-location"
        label = "Duplicate Location"
        priority = 95
    elif reachable is False or reachable_now is False:
        color = "#d95c5c"
        status = "unreachable"
        label = "Node Became Unreachable"
        priority = 85
    elif not synced and height > 0:
        color = "#9d67ad"
        status = "not-yet-synced"
        label = "Not Yet Synced"
        priority = 75
    elif synced and uptime >= 604800:
        color = "#9fdb6d"
        status = "stable-1w-plus"
        label = "Stable 1w+"
        priority = 70
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
        status = "synced-under-10m"
        label = "Synced <10m"
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


def flag(row: Mapping[str, Any], keys: tuple[str, ...]) -> bool:
    return any(boolish(first(row, (key,))) is True for key in keys)


def build_points(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    geocoded: list[tuple[dict[str, Any], float, float]] = []

    max_height = max([int(number(first(row, ("height",)), 0) or 0) for row in nodes] or [0])

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

        points.append({
            "id": address or f"{lat:.6f},{lon:.6f}",
            "address": address,
            "host": clean(first(row, ("host", "hostname"))) or address,
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
            "reachable": boolish(first(row, ("reachable", "metadata.reachable"))),
            "reachable_now": boolish(first(row, ("reachable_now", "metadata.reachable_now"))),
            "reachable_24h": boolish(first(row, ("reachable_24h", "metadata.reachable_24h"))),
            "height": int(number(first(row, ("height",)), 0) or 0),
            "uptime_seconds": status["uptime_seconds"],
            "city": clean(first(row, ("city", "city_data.city"))),
            "county": clean(first(row, ("county", "county_data.county"))),
            "territory": clean(first(row, ("territory", "territory_data.territory"))),
            "region": clean(first(row, ("region", "region_data.region"))),
            "continent": clean(first(row, ("continent", "continent_data.continent"))),
            "country": clean(first(row, ("country_code", "country_data.country_code", "country"))) or "Unknown",
            "country_name": clean(first(row, ("country_name", "country_data.country_name"))),
            "postal_code": clean(first(row, ("postal_code", "zip", "postal_data.postal_code"))),
            "zip": clean(first(row, ("zip", "postal_code", "postal_data.postal_code"))),
            "timezone": clean(first(row, ("timezone", "iana_timezone", "timezone_data.timezone"))),
            "agent": clean(first(row, ("agent", "user_agent"))),
            "provider": clean(first(row, ("provider", "provider_data.provider", "organization", "org"))),
            "organization": clean(first(row, ("organization", "org", "organization_data.organization"))),
            "asn": clean(first(row, ("asn", "asn_data.asn", "isp.asn"))),
            "port": clean(first(row, ("port",))),
            "services": first(row, ("services",)),
            "latency_ms": first(row, ("latency_ms", "metadata.latency_ms")),
            "peer_index": first(row, ("peer_index", "metadata.peer_index")),
            "w3w": clean(first(row, ("w3w", "what3words", "w3w_data.w3w"))),
            "what3words": clean(first(row, ("what3words", "w3w", "w3w_data.words"))),
            "geohash": clean(first(row, ("geohash", "geohashid_data.geohash"))),
            "geohashid": clean(first(row, ("geohashid", "geohashid_data.geohashid"))),
            "zzxgcs": clean(first(row, ("zzxgcs", "zzxgcs_data.zzxgcs"))),
            "jurisdiction_risk_level": clean(first(row, ("jurisdiction_risk_level", "sanctions_data.risk_level"))),
            "jurisdiction_recommended_action": clean(first(row, ("jurisdiction_recommended_action", "sanctions_data.recommended_action"))),
            "is_vpn": flag(row, ("is_vpn", "suspected_vpn", "vpn_data.is_vpn", "metadata.is_vpn")),
            "is_proxy": flag(row, ("is_proxy", "suspected_proxy", "proxy_data.is_proxy", "metadata.is_proxy")),
            "is_datacenter": flag(row, ("is_datacenter", "datacenter_data.is_datacenter", "provider_data.is_datacenter")),
            "is_government": flag(row, ("is_government", "government_data.is_government", "organization_data.is_government")),
            "is_military": flag(row, ("is_military", "military_data.is_military", "organization_data.is_military")),
            "is_university": flag(row, ("is_university", "is_academic", "is_institute", "organization_data.is_university")),
            "is_private": flag(row, ("is_private", "is_commercial", "organization_data.is_private")),
            "is_public": flag(row, ("is_public", "is_residential", "organization_data.is_public")),
            "is_sanctioned": flag(row, ("is_sanctioned", "is_sanctioned_node", "sanctions_data.is_sanctioned")),
            "is_apt": flag(row, ("is_apt", "apt_data.is_apt", "aptattribution.is_apt")),
            "is_threat_actor": flag(row, ("is_threat_actor", "threat_actor_data.is_threat_actor", "tagattribution.is_threat_actor")),
            "is_known_malactor": flag(row, ("is_known_malactor", "known_malactor_data.is_known_malactor", "knownmalactor.is_known_malactor")),
        })

    return sorted(
        points,
        key=lambda item: (-int(item["priority"]), item["country"], item["city"], item["address"]),
    )


def count_by(points: list[dict[str, Any]], key: str) -> dict[str, int]:
    counts: dict[str, int] = {}

    for point in points:
        value = clean(point.get(key)) or "Unknown"
        counts[value] = counts.get(value, 0) + 1

    return dict(sorted(counts.items(), key=lambda item: (-item[1], item[0])))


def build_vector_payload(points: list[dict[str, Any]], source: str) -> dict[str, Any]:
    return {
        "schema": "zzx-bitnodes-map-vectors-v2",
        "generated_at": utc_now(),
        "source": source,
        "point_count": len(points),
        "network_counts": count_by(points, "network"),
        "status_counts": count_by(points, "status"),
        "country_counts": count_by(points, "country"),
        "agent_counts": count_by(points, "agent"),
        "provider_counts": count_by(points, "provider"),
        "asn_counts": count_by(points, "asn"),
        "points": points,
    }


def build_geojson(points: list[dict[str, Any]], source: str) -> dict[str, Any]:
    return {
        "type": "FeatureCollection",
        "schema": "zzx-bitnodes-map-points-geojson-v2",
        "name": "ZZX Bitnodes Live Map",
        "generated_at": utc_now(),
        "source": source,
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [point["longitude"], point["latitude"]],
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
        "schema": "zzx-bitnodes-map-settings-fallback-v2",
        "generated_at": utc_now(),
        "tile_provider": "cartodb_dark",
        "tile_url": "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        "tile_attribution": "© OpenStreetMap contributors © CARTO",
        "tile_subdomains": ["a", "b", "c", "d"],
        "initial_view": {"latitude": 20.0, "longitude": 0.0, "zoom": 2, "min_zoom": 2, "max_zoom": 20},
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
            "vector_types_url": "./data/vector-types.json",
        },
    }


def default_theme() -> dict[str, Any]:
    return {
        "schema": "zzx-bitnodes-map-theme-fallback-v2",
        "id": DEFAULT_THEME,
        "generated_at": utc_now(),
        "name": "ZZX Dark Olive",
        "css_variables": {
            "--bn-map-background": "#050705",
            "--bn-map-panel": "#080b08",
            "--bn-map-text": "#edf7b9",
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
<header><div id="bn-header"></div></header>
<main class="bn-shell">
    <section class="bn-hero container">
        <p class="bn-kicker">ZZX-Labs / Bitnodes Mirror</p>
        <h2>{title}</h2>
        <p>OpenStreetMap-backed Bitcoin node telemetry with GeoIP, ISP, synchronization, uptime, Tor, I2P, IPv4, IPv6, GeoHashID, ZZX-GCS, what3words, and policy overlays.</p>
    </section>
    <section class="bn-panel container bn-map-panel">
        <div class="bn-map-toolbar">
            <div><span class="bn-kicker">Map Mode</span><h2>Bitcoin Node Map</h2></div>
            <div class="bn-map-selectors">
                <label>Theme<select id="bn-map-theme-select" data-map-theme-select></select></label>
                <label>Settings<select id="bn-map-settings-select" data-map-settings-select></select></label>
            </div>
            <div class="bn-map-controls">
                <button type="button" data-map-filter="all" class="is-active">All</button>
                <button type="button" data-map-filter="ipv4">IPv4</button>
                <button type="button" data-map-filter="ipv6">IPv6</button>
                <button type="button" data-map-filter="tor">Tor</button>
                <button type="button" data-map-filter="i2p">I2P</button>
                <button type="button" data-map-filter="vpn">VPN</button>
                <button type="button" data-map-filter="proxy">Proxy</button>
                <button type="button" data-map-reset>Reset View</button>
            </div>
        </div>
        <div id="bn-map-status" class="bn-map-status">Loading map telemetry…</div>
        <div id="bn-live-map" class="bn-live-map" data-map-root></div>
        <div id="bn-map-hud" class="bn-map-hud"></div>
        <div id="bn-map-legend" class="bn-map-legend"></div>
    </section>
</main>
<footer><div id="bn-footer"></div></footer>
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
    --bn-map-control-radius: 999px;
    --bn-map-shadow: 0 16px 34px rgba(0,0,0,0.32);
}

.bn-map-toolbar {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) auto auto;
    align-items: end;
    gap: 1rem;
    margin-bottom: 1rem;
}

.bn-map-selectors {
    display: flex;
    gap: 0.65rem;
    flex-wrap: wrap;
}

.bn-map-selectors label {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    color: rgba(204,216,182,0.72);
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
    font-family: inherit;
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
    font-family: inherit;
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
    font-size: 0.65rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.bn-map-hud strong {
    display: block;
    margin-top: 0.35rem;
    color: var(--bn-map-text);
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
    .bn-map-toolbar { grid-template-columns: 1fr; align-items: start; }
    .bn-map-controls { justify-content: flex-start; }
    .bn-map-hud { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 768px) {
    .bn-map-selectors,
    .bn-map-selectors label,
    .bn-map-selectors select { width: 100%; }
    .bn-live-map { min-height: 64vh; }
    .bn-map-hud { grid-template-columns: 1fr; }
}
"""


def render_map_js() -> str:
    return """(() => {
    "use strict";

    const state = {
        map: null,
        layer: null,
        polygonLayer: null,
        canvasRenderer: null,
        vectors: null,
        vectorTypes: null,
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
        if (target) target.textContent = message;
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
        if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
        return response.json();
    }

    function applyTheme(theme) {
        if (!theme) return;
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

    function pointVisible(point) {
        if (state.filter === "all") return true;
        if (point.network === state.filter || point.status === state.filter) return true;
        if (state.filter === "vpn") return point.is_vpn === true;
        if (state.filter === "proxy") return point.is_proxy === true;
        return false;
    }

    function filteredPoints() {
        return (state.vectors?.points || []).filter(pointVisible);
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
                <div>VPN: ${point.is_vpn ? "yes" : "no"}</div>
                <div>Proxy: ${point.is_proxy ? "yes" : "no"}</div>
                <div>W3W: ${escapeHtml(point.w3w || "—")}</div>
                <div>ZZX-GCS: ${escapeHtml(point.zzxgcs || "—")}</div>
                <div>GeohashID: ${escapeHtml(point.geohashid || "—")}</div>
            </div>
        `;
    }

    function renderHud() {
        const target = qs("#bn-map-hud");
        if (!target || !state.vectors) return;

        const networks = state.vectors.network_counts || {};
        const statuses = state.vectors.status_counts || {};
        const intel = state.vectors.intelligence_counts || {};

        target.innerHTML = `
            <article><span>Total Points</span><strong>${Number(state.vectors.point_count || 0).toLocaleString()}</strong></article>
            <article><span>IPv4</span><strong>${Number(networks.ipv4 || 0).toLocaleString()}</strong></article>
            <article><span>IPv6</span><strong>${Number(networks.ipv6 || 0).toLocaleString()}</strong></article>
            <article><span>Tor</span><strong>${Number(networks.tor || 0).toLocaleString()}</strong></article>
            <article><span>I2P</span><strong>${Number(networks.i2p || 0).toLocaleString()}</strong></article>
            <article><span>Duplicate</span><strong>${Number(statuses["duplicate-location"] || 0).toLocaleString()}</strong></article>
            <article><span>Unreachable</span><strong>${Number(statuses.unreachable || 0).toLocaleString()}</strong></article>
            <article><span>VPN</span><strong>${Number(intel.vpn_nodes || 0).toLocaleString()}</strong></article>
            <article><span>Proxy</span><strong>${Number(intel.proxy_nodes || 0).toLocaleString()}</strong></article>
            <article><span>Datacenter</span><strong>${Number(intel.datacenter_nodes || 0).toLocaleString()}</strong></article>
        `;
    }

    function renderLegend() {
        const target = qs("#bn-map-legend");
        if (!target || !state.vectors?.legend) return;

        target.innerHTML = Object.entries(state.vectors.legend).map(([_key, item]) => `
            <span><i style="background:${escapeHtml(item.color)}"></i>${escapeHtml(item.label)}</span>
        `).join("");
    }

    function renderPoints() {
        if (!state.map || !window.L) return;

        if (state.layer) state.layer.remove();

        state.layer = window.L.layerGroup();

        filteredPoints().forEach(point => {
            const lat = Number(point.latitude ?? point.lat);
            const lon = Number(point.longitude ?? point.lon);

            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

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
        setStatus(`Loaded ${filteredPoints().length.toLocaleString()} visible map points from ${state.vectors?.source || "selected source"}.`);
    }

    async function renderPolygons() {
        if (!state.map || !window.L) return;

        const polygons = await readJson("./data/map-polygons.geojson").catch(() => null);
        if (!polygons || !Array.isArray(polygons.features)) return;

        if (state.polygonLayer) state.polygonLayer.remove();

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
        if (!select || !state.themes?.themes) return;

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
        if (!select || !state.settingsProfiles?.profiles) return;

        select.innerHTML = state.settingsProfiles.profiles.map(profile => `
            <option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)}</option>
        `).join("");

        select.value = state.settings?.profile?.id || state.settingsProfiles.default_settings || "default";
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
        state.vectorTypes = await readJson("./data/vector-types.json").catch(() => null);
        state.themes = await readJson("./data/map-themes.json").catch(() => null);
        state.settingsProfiles = await readJson("./data/map-settings-profiles.json").catch(() => null);

        await loadTheme(state.settings?.theme?.selected || "zzx_dark_olive");

        const root = qs("[data-map-root]");
        if (!root) return;

        const view = state.settings.initial_view || {};
        const interaction = state.settings.interaction || {};

        state.canvasRenderer = window.L.canvas({ padding: 0.35 });

        state.map = window.L.map(root, {
            scrollWheelZoom: interaction.scroll_wheel_zoom !== false,
            doubleClickZoom: interaction.double_click_zoom !== false,
            boxZoom: interaction.box_zoom !== false,
            keyboard: interaction.keyboard !== false,
            preferCanvas: state.settings?.performance?.prefer_canvas_renderer !== false
        }).setView([Number(view.latitude || 20), Number(view.longitude || 0)], Number(view.zoom || 2));

        window.L.tileLayer(state.settings.tile_url || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: state.settings.tile_attribution || "© OpenStreetMap contributors",
            subdomains: state.settings.tile_subdomains || undefined,
            maxZoom: Number(view.max_zoom || 20),
            minZoom: Number(view.min_zoom || 2)
        }).addTo(state.map);

        populateThemeSelect();
        populateSettingsSelect();
        wireControls(view);

        await renderPolygons();
        renderPoints();

        window.ZZXBitnodesMap = state;
    }

    document.addEventListener("DOMContentLoaded", () => {
        init().catch(error => {
            console.error(error);
            const root = qs("[data-map-root]");
            if (root) root.innerHTML = `<div class="bn-chart-empty">${escapeHtml(error.message)}</div>`;
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
    compact: bool = False,
) -> None:
    data_dir = out_dir / "data"

    write_json(data_dir / "map-vectors.json", map_payload.get("vectors", vectors), compact=compact)
    write_json(data_dir / "map-points.geojson", map_payload.get("geojson", geojson), compact=compact)
    write_json(data_dir / "map-settings.json", map_payload.get("settings", settings), compact=compact)
    write_json(data_dir / "map-theme.json", map_payload.get("theme", theme), compact=compact)

    for key, filename in (
        ("layers", "map-layers.json"),
        ("overlays", "map-overlays.json"),
        ("polygons", "map-polygons.geojson"),
        ("themes", "map-themes.json"),
        ("settings_profiles", "map-settings-profiles.json"),
        ("vector_types", "vector-types.json"),
    ):
        if key in map_payload:
            write_json(data_dir / filename, map_payload[key], compact=compact)

    selected_theme = map_payload.get("theme", theme)
    selected_theme_id = selected_theme.get("id", DEFAULT_THEME) if isinstance(selected_theme, dict) else DEFAULT_THEME

    if selected_theme:
        write_json(data_dir / "themes" / f"{selected_theme_id}.json", selected_theme, compact=compact)

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
    compact: bool = False,
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
        "map_tools_dir": str(MAP_TOOLS_DIR),
        "input_path": str(selected_input),
        "api_dir": str(api_dir),
        "state_dir": str(state_dir),
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "source": source,
        "strict": strict,
        "compact": compact,
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
        compact=compact,
    )

    write_directory_output(
        out_dir=live_map_dir,
        title="Live Bitcoin Node Map",
        map_payload=map_payload,
        vectors=final_vectors,
        geojson=final_geojson,
        settings=final_settings,
        theme=final_theme,
        compact=compact,
    )

    report = {
        "schema": "zzx-bitnodes-maps-build-report-v3",
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

    write_json(map_dir / "data" / "map-build-report.json", report, compact=compact)
    write_json(live_map_dir / "data" / "map-build-report.json", report, compact=compact)

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
    parser.add_argument("--compact", action="store_true")

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
        compact=args.compact,
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
