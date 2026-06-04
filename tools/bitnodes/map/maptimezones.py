#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping


APP_ROOT = Path(__file__).resolve().parents[3]

DEFAULT_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "maps"
DEFAULT_LIVE_MAP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "live-map"
DEFAULT_TIMEZONE_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "geo" / "timezones"

SCHEMA = "zzx-bitnodes-map-timezones-v1"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


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


def vectors(payload: Mapping[str, Any]) -> dict[str, Any]:
    value = payload.get("vectors", {})
    return value if isinstance(value, dict) else {}


def points(payload: Mapping[str, Any]) -> list[dict[str, Any]]:
    vp = vectors(payload)

    for key in ("points", "results", "data"):
        value = vp.get(key)
        if isinstance(value, list):
            return [row for row in value if isinstance(row, dict)]

    for key in ("points", "results", "data"):
        value = payload.get(key)
        if isinstance(value, list):
            return [row for row in value if isinstance(row, dict)]

    return []


def point_timezone(point: Mapping[str, Any]) -> str:
    tz = clean(first(point, (
        "timezone",
        "iana_timezone",
        "tz",
        "time_zone",
        "map_timezone",
        "timezone_data.timezone",
        "timezone_data.iana_timezone",
        "geoip.timezone",
        "geoip.tz",
        "metadata.timezone",
        "metadata.tz",
    )))

    network = clean(first(point, ("network", "metadata.network"))).lower()
    address = clean(first(point, ("address", "host", "node", "addr"))).lower()

    if network in {"tor", "i2p"} or ".onion" in address or ".i2p" in address:
        return "UTC"

    return tz or "Unknown"


def point_lat_lon(point: Mapping[str, Any]) -> tuple[float | None, float | None]:
    lat = number(first(point, (
        "latitude", "lat",
        "geoloc.latitude",
        "geo.latitude", "geo.lat",
        "geoip.latitude", "geoip.lat",
        "location.latitude",
        "metadata.latitude",
    )))

    lon = number(first(point, (
        "longitude", "lon", "lng",
        "geoloc.longitude", "geoloc.lon",
        "geo.longitude", "geo.lon", "geo.lng",
        "geoip.longitude", "geoip.lon",
        "location.longitude",
        "metadata.longitude",
    )))

    if lat is None or lon is None:
        return None, None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None, None
    return lat, lon


def point_country(point: Mapping[str, Any]) -> str:
    return clean(first(point, (
        "map_country",
        "country",
        "country_code",
        "geoip.country_code",
        "metadata.country_code",
    ))).upper() or "UNKNOWN"


def point_network(point: Mapping[str, Any]) -> str:
    network = clean(first(point, ("network", "metadata.network"))).lower()
    if network:
        return network

    address = clean(first(point, ("address", "host", "node", "addr"))).lower()
    if ".onion" in address:
        return "tor"
    if ".i2p" in address:
        return "i2p"
    if ":" in address and ".onion" not in address and ".i2p" not in address:
        return "ipv6"
    if address.count(".") >= 3:
        return "ipv4"
    return "unknown"


def point_status(point: Mapping[str, Any]) -> str:
    return clean(first(point, ("status", "metadata.status"))).lower() or "unknown"


def offset_from_longitude(lon: float | None) -> int | None:
    if lon is None:
        return None
    return max(-12, min(14, int(round(lon / 15.0))))


def load_timezone_reference(timezone_dir: Path) -> dict[str, dict[str, Any]]:
    refs: dict[str, dict[str, Any]] = {}

    for candidate in (
        timezone_dir / "timezones.json",
        timezone_dir / "maptimezones.json",
        timezone_dir / "global.json",
    ):
        data = read_json(candidate, fallback={})
        if not isinstance(data, dict):
            continue

        rows = data.get("timezones", data.get("zones", data))

        if isinstance(rows, dict):
            for tz, row in rows.items():
                if isinstance(row, dict):
                    refs[str(tz)] = row

        elif isinstance(rows, list):
            for row in rows:
                if not isinstance(row, dict):
                    continue
                tz = clean(row.get("timezone") or row.get("iana_timezone") or row.get("tz") or row.get("name"))
                if tz:
                    refs[tz] = row

    refs.setdefault("UTC", {
        "timezone": "UTC",
        "iana_timezone": "UTC",
        "utc_offset_hours": 0,
        "color": "#9d67ad",
    })

    refs.setdefault("Unknown", {
        "timezone": "Unknown",
        "iana_timezone": "Unknown",
        "utc_offset_hours": None,
        "color": "#8c927e",
    })

    return refs


def build_timezone_summary(rows: list[dict[str, Any]], refs: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    grouped: dict[str, dict[str, Any]] = {}

    for row in rows:
        tz = point_timezone(row)
        lat, lon = point_lat_lon(row)
        ref = refs.get(tz, {})
        offset = number(
            ref.get("utc_offset_hours")
            or first(row, ("timezone_data.utc_offset_hours", "utc_offset_hours")),
            offset_from_longitude(lon),
        )

        item = grouped.setdefault(tz, {
            "id": tz,
            "timezone": tz,
            "iana_timezone": clean(ref.get("iana_timezone") or ref.get("timezone")) or tz,
            "utc_offset_hours": offset,
            "color": clean(ref.get("color")) or "#8c927e",
            "point_count": 0,
            "country_counts": {},
            "network_counts": {},
            "status_counts": {},
            "coordinates": [],
        })

        item["point_count"] += 1

        country = point_country(row)
        network = point_network(row)
        status = point_status(row)

        item["country_counts"][country] = item["country_counts"].get(country, 0) + 1
        item["network_counts"][network] = item["network_counts"].get(network, 0) + 1
        item["status_counts"][status] = item["status_counts"].get(status, 0) + 1

        if lat is not None and lon is not None:
            item["coordinates"].append((lat, lon))

    timezones = {}

    for tz, item in grouped.items():
        coords = item.pop("coordinates", [])

        if coords:
            lats = [lat for lat, _lon in coords]
            lons = [lon for _lat, lon in coords]
            item["centroid"] = {
                "latitude": sum(lats) / len(lats),
                "longitude": sum(lons) / len(lons),
                "south": min(lats),
                "north": max(lats),
                "west": min(lons),
                "east": max(lons),
            }
        else:
            item["centroid"] = {}

        item["country_counts"] = dict(sorted(item["country_counts"].items(), key=lambda pair: (-pair[1], pair[0])))
        item["network_counts"] = dict(sorted(item["network_counts"].items()))
        item["status_counts"] = dict(sorted(item["status_counts"].items()))
        timezones[tz] = item

    return {
        "schema": SCHEMA,
        "generated_at": utc_now(),
        "total_points": len(rows),
        "timezone_count": len(timezones),
        "timezones": dict(sorted(timezones.items(), key=lambda pair: (-pair[1]["point_count"], pair[0]))),
    }


def build_timezone_layers(payload: Mapping[str, Any]) -> dict[str, Any]:
    timezones = payload.get("timezones", {})
    if not isinstance(timezones, Mapping):
        timezones = {}

    layers = []

    for tz, item in timezones.items():
        if not isinstance(item, Mapping):
            continue

        layers.append({
            "id": f"timezone:{tz}",
            "label": item.get("iana_timezone", tz),
            "kind": "timezone-filter",
            "enabled": True,
            "visible": False,
            "color": item.get("color", "#8c927e"),
            "point_count": item.get("point_count", 0),
            "filter": {
                "type": "timezone",
                "key": "map_timezone",
                "value": tz,
            },
        })

    return {
        "schema": "zzx-bitnodes-map-timezone-layers-v1",
        "generated_at": utc_now(),
        "layers": sorted(layers, key=lambda item: (-int(item.get("point_count", 0) or 0), item["id"])),
    }


def annotate_points(rows: list[dict[str, Any]], timezone_payload: Mapping[str, Any]) -> list[dict[str, Any]]:
    timezones = timezone_payload.get("timezones", {})
    if not isinstance(timezones, Mapping):
        timezones = {}

    output = []

    for row in rows:
        item = dict(row)
        tz = point_timezone(item)
        ref = timezones.get(tz, {})

        item["map_timezone"] = tz
        item["map_timezone_label"] = clean(ref.get("iana_timezone")) or tz
        item["map_timezone_color"] = clean(ref.get("color")) or "#8c927e"
        item["map_timezone_offset_hours"] = ref.get("utc_offset_hours")

        output.append(item)

    return output


def merge_timezones(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    context = context or {}
    timezone_dir = Path(context.get("timezone_dir") or context.get("map_timezone_dir") or DEFAULT_TIMEZONE_DIR)

    output = dict(payload)
    vectors_payload = dict(output.get("vectors", {}))
    rows = points(output)
    refs = load_timezone_reference(timezone_dir)

    timezone_payload = build_timezone_summary(rows, refs)
    timezone_layers = build_timezone_layers(timezone_payload)
    annotated = annotate_points(rows, timezone_payload)

    if vectors_payload:
        vectors_payload["points"] = annotated
        output["vectors"] = vectors_payload

    output["timezones"] = timezone_payload
    output["timezone_layers"] = timezone_layers

    settings = dict(output.get("settings", {}))
    settings["timezones"] = {
        "url": "./data/map-timezones.json",
        "layers_url": "./data/map-timezone-layers.json",
        "timezone_dir": str(timezone_dir),
        "enabled": True,
        "user_selectable": True,
    }
    output["settings"] = settings

    return output


def build(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    return merge_timezones(payload, context)


def build_standalone(
    *,
    vectors_path: Path,
    map_dir: Path,
    live_map_dir: Path,
    timezone_dir: Path = DEFAULT_TIMEZONE_DIR,
    compact: bool = False,
) -> dict[str, Any]:
    vectors_payload = read_json(vectors_path, fallback={})
    if not isinstance(vectors_payload, dict):
        vectors_payload = {}

    payload = {
        "vectors": vectors_payload,
        "settings": read_json(map_dir / "data" / "map-settings.json", fallback={}),
    }

    merged = merge_timezones(payload, {"timezone_dir": str(timezone_dir)})
    timezones = merged["timezones"]
    timezone_layers = merged["timezone_layers"]
    updated_vectors = merged.get("vectors", vectors_payload)

    for directory in (map_dir, live_map_dir):
        data_dir = directory / "data"

        write_json(data_dir / "map-timezones.json", timezones, compact=compact)
        write_json(data_dir / "map-timezone-layers.json", timezone_layers, compact=compact)
        write_json(data_dir / "map-vectors.json", updated_vectors, compact=compact)

        settings_path = data_dir / "map-settings.json"
        settings = read_json(settings_path, fallback={})
        if not isinstance(settings, dict):
            settings = {}

        settings["timezones"] = merged["settings"]["timezones"]
        write_json(settings_path, settings, compact=compact)

    return {
        "schema": "zzx-bitnodes-maptimezones-build-report-v1",
        "generated_at": utc_now(),
        "vectors": str(vectors_path),
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "timezone_dir": str(timezone_dir),
        "timezone_count": timezones.get("timezone_count", 0),
        "total_points": timezones.get("total_points", 0),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Bitnodes map timezone summaries and filters.")
    parser.add_argument("--vectors", required=True)
    parser.add_argument("--map-dir", default=str(DEFAULT_MAP_DIR))
    parser.add_argument("--live-map-dir", default=str(DEFAULT_LIVE_MAP_DIR))
    parser.add_argument("--timezone-dir", default=str(DEFAULT_TIMEZONE_DIR))
    parser.add_argument("--report", default="")
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    report = build_standalone(
        vectors_path=Path(args.vectors).resolve(),
        map_dir=Path(args.map_dir).resolve(),
        live_map_dir=Path(args.live_map_dir).resolve(),
        timezone_dir=Path(args.timezone_dir).resolve(),
        compact=args.compact,
    )

    if args.report:
        write_json(Path(args.report), report, compact=args.compact)

    print(
        "map timezones complete: "
        f"{report['timezone_count']} timezones, "
        f"points={report['total_points']}, "
        f"map_dir={report['map_dir']}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
