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
DEFAULT_CITY_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "geo" / "cities"

SCHEMA = "zzx-bitnodes-map-cities-v1"


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


def boolish(value: Any) -> bool:
    if isinstance(value, bool):
        return value

    if value in (1, "1"):
        return True

    return str(value or "").strip().lower() in {"true", "yes", "y", "ok", "1", "matched", "flagged"}


def vectors(payload: Mapping[str, Any]) -> dict[str, Any]:
    value = payload.get("vectors", {})
    return value if isinstance(value, dict) else {}


def points(payload: Mapping[str, Any]) -> list[dict[str, Any]]:
    vectors_payload = vectors(payload)

    for key in ("points", "results", "data"):
        value = vectors_payload.get(key)

        if isinstance(value, list):
            return [row for row in value if isinstance(row, dict)]

    for key in ("points", "results", "data"):
        value = payload.get(key)

        if isinstance(value, list):
            return [row for row in value if isinstance(row, dict)]

    return []


def point_country(point: Mapping[str, Any]) -> str:
    country = clean(first(point, (
        "country",
        "country_code",
        "map_country",
        "country_data.country_code",
        "geoip.country_code",
        "metadata.country_code",
    ))).upper()

    network = clean(first(point, ("network", "metadata.network"))).lower()
    address = clean(first(point, ("address", "host", "node", "addr"))).lower()

    if network == "tor" or ".onion" in address:
        return "TOR"

    if network == "i2p" or ".i2p" in address:
        return "I2P"

    return country or "UNKNOWN"


def point_territory(point: Mapping[str, Any]) -> str:
    territory = clean(first(point, (
        "map_territory_code",
        "territory_code",
        "state_code",
        "province_code",
        "subdivision_code",
        "admin1_code",
        "territory",
        "state",
        "province",
        "subdivision",
        "admin1",
        "territory_data.territory_code",
        "territory_data.admin1_code",
        "geoip.territory_code",
        "geoip.admin1_code",
        "metadata.territory_code",
        "metadata.admin1_code",
    ))).upper()

    country = point_country(point)

    if country in {"TOR", "I2P"}:
        return country

    return territory or "UNKNOWN"


def point_county(point: Mapping[str, Any]) -> str:
    county = clean(first(point, (
        "map_county_code",
        "county",
        "county_code",
        "district",
        "district_code",
        "municipality",
        "municipality_code",
        "parish",
        "parish_code",
        "admin2",
        "admin2_code",
        "county_data.county",
        "county_data.county_code",
        "county_data.admin2_code",
        "geoip.county",
        "geoip.county_code",
        "geoip.admin2_code",
        "metadata.county",
        "metadata.county_code",
        "metadata.admin2_code",
    )))

    country = point_country(point)

    if country in {"TOR", "I2P"}:
        return country

    return county or "Unknown"


def point_city(point: Mapping[str, Any]) -> str:
    city = clean(first(point, (
        "city",
        "city_name",
        "town",
        "town_name",
        "village",
        "village_name",
        "locality",
        "place",
        "place_name",
        "map_city",
        "city_data.city",
        "city_data.city_name",
        "city_data.name",
        "city_data.place_name",
        "geoip.city",
        "geoip.city_name",
        "metadata.city",
        "metadata.city_name",
    )))

    country = point_country(point)

    if country == "TOR":
        return "Tor Overlay Channel"

    if country == "I2P":
        return "I2P Overlay Channel"

    return city or "Unknown"


def point_lat_lon(point: Mapping[str, Any]) -> tuple[float | None, float | None]:
    lat = number(first(point, (
        "latitude",
        "lat",
        "geoloc.latitude",
        "city_data.latitude",
        "geo.latitude",
        "geo.lat",
        "geoip.latitude",
        "geoip.lat",
        "location.latitude",
        "metadata.latitude",
    )))

    lon = number(first(point, (
        "longitude",
        "lon",
        "lng",
        "geoloc.longitude",
        "geoloc.lon",
        "city_data.longitude",
        "geo.longitude",
        "geo.lon",
        "geo.lng",
        "geoip.longitude",
        "geoip.lon",
        "location.longitude",
        "metadata.longitude",
    )))

    if lat is None or lon is None:
        return None, None

    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None, None

    return lat, lon


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


def load_city_reference(city_dir: Path) -> dict[str, dict[str, Any]]:
    refs: dict[str, dict[str, Any]] = {}

    for candidate in (
        city_dir / "cities.json",
        city_dir / "mapcities.json",
        city_dir / "places.json",
    ):
        data = read_json(candidate, fallback={})

        if not isinstance(data, dict):
            continue

        rows = data.get("cities", data.get("places", data))

        if isinstance(rows, dict):
            for code, row in rows.items():
                if isinstance(row, dict):
                    refs[str(code)] = row

        elif isinstance(rows, list):
            for row in rows:
                if not isinstance(row, dict):
                    continue

                country = clean(row.get("country_code") or row.get("country")).upper()
                territory = clean(row.get("territory_code") or row.get("admin1_code") or row.get("state_code")).upper()
                county = clean(row.get("county_code") or row.get("admin2_code") or row.get("county") or "Unknown")
                city = clean(row.get("city") or row.get("city_name") or row.get("place_name") or row.get("name"))

                if country and city:
                    refs[f"{country}:{territory or 'UNKNOWN'}:{county}:{city}"] = row

    refs.setdefault("TOR:TOR:TOR:Tor Overlay Channel", {
        "country_code": "TOR",
        "territory_code": "TOR",
        "county_code": "TOR",
        "city": "Tor Overlay Channel",
        "city_name": "Tor Overlay Channel",
        "color": "#9d67ad",
    })

    refs.setdefault("I2P:I2P:I2P:I2P Overlay Channel", {
        "country_code": "I2P",
        "territory_code": "I2P",
        "county_code": "I2P",
        "city": "I2P Overlay Channel",
        "city_name": "I2P Overlay Channel",
        "color": "#b889ff",
    })

    return refs


def city_key(point: Mapping[str, Any]) -> str:
    return f"{point_country(point)}:{point_territory(point)}:{point_county(point)}:{point_city(point)}"


def ref_for(key: str, city: str, refs: Mapping[str, Mapping[str, Any]]) -> Mapping[str, Any]:
    return refs.get(key) or refs.get(city) or {}


def build_city_summary(rows: list[dict[str, Any]], refs: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    grouped: dict[str, dict[str, Any]] = {}

    for row in rows:
        country = point_country(row)
        territory = point_territory(row)
        county = point_county(row)
        city = point_city(row)
        key = f"{country}:{territory}:{county}:{city}"
        reference = ref_for(key, city, refs)

        item = grouped.setdefault(key, {
            "id": key,
            "country_code": country,
            "territory_code": territory,
            "county_code": county,
            "city": city,
            "city_name": clean(reference.get("city_name") or reference.get("name")) or city,
            "color": clean(reference.get("color")) or "#8c927e",
            "point_count": 0,
            "network_counts": {},
            "status_counts": {},
            "owner_counts": {
                "government": 0,
                "military": 0,
                "university": 0,
                "datacenter": 0,
                "public": 0,
                "private": 0,
                "unknown": 0,
            },
            "coordinates": [],
        })

        item["point_count"] += 1

        network = point_network(row)
        status = point_status(row)

        item["network_counts"][network] = item["network_counts"].get(network, 0) + 1
        item["status_counts"][status] = item["status_counts"].get(status, 0) + 1

        if boolish(first(row, ("is_government", "government_data.is_government", "metadata.is_government"))):
            item["owner_counts"]["government"] += 1
        elif boolish(first(row, ("is_military", "military_data.is_military", "metadata.is_military"))):
            item["owner_counts"]["military"] += 1
        elif boolish(first(row, ("is_university", "is_academic", "is_institute", "metadata.is_university"))):
            item["owner_counts"]["university"] += 1
        elif boolish(first(row, ("is_datacenter", "datacenter_data.is_datacenter", "metadata.is_datacenter"))):
            item["owner_counts"]["datacenter"] += 1
        elif boolish(first(row, ("is_private", "is_commercial", "metadata.is_private"))):
            item["owner_counts"]["private"] += 1
        elif boolish(first(row, ("is_public", "is_residential", "metadata.is_public"))):
            item["owner_counts"]["public"] += 1
        else:
            item["owner_counts"]["unknown"] += 1

        lat, lon = point_lat_lon(row)

        if lat is not None and lon is not None:
            item["coordinates"].append((lat, lon))

    cities = {}

    for key, item in grouped.items():
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

        item["network_counts"] = dict(sorted(item["network_counts"].items()))
        item["status_counts"] = dict(sorted(item["status_counts"].items()))
        item["owner_counts"] = dict(sorted(item["owner_counts"].items()))
        cities[key] = item

    return {
        "schema": SCHEMA,
        "generated_at": utc_now(),
        "total_points": len(rows),
        "city_count": len(cities),
        "cities": dict(sorted(cities.items(), key=lambda pair: (-pair[1]["point_count"], pair[0]))),
    }


def build_city_layers(payload: Mapping[str, Any]) -> dict[str, Any]:
    cities = payload.get("cities", {})

    if not isinstance(cities, Mapping):
        cities = {}

    layers = []

    for city_id, city in cities.items():
        if not isinstance(city, Mapping):
            continue

        layers.append({
            "id": f"city:{city_id}",
            "label": city.get("city_name", str(city_id)),
            "kind": "city-filter",
            "enabled": True,
            "visible": False,
            "color": city.get("color", "#8c927e"),
            "point_count": city.get("point_count", 0),
            "filter": {
                "type": "city",
                "key": "map_city",
                "value": city_id,
            },
        })

    return {
        "schema": "zzx-bitnodes-map-city-layers-v1",
        "generated_at": utc_now(),
        "layers": sorted(layers, key=lambda item: (-int(item.get("point_count", 0) or 0), item["id"])),
    }


def annotate_points(rows: list[dict[str, Any]], city_payload: Mapping[str, Any]) -> list[dict[str, Any]]:
    cities = city_payload.get("cities", {})

    if not isinstance(cities, Mapping):
        cities = {}

    output = []

    for row in rows:
        item = dict(row)
        key = city_key(item)
        ref = cities.get(key, {})

        item["map_city"] = key
        item["map_city_name"] = point_city(item)
        item["map_city_label"] = clean(ref.get("city_name")) or point_city(item)
        item["map_city_color"] = clean(ref.get("color")) or "#8c927e"

        output.append(item)

    return output


def merge_cities(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    context = context or {}
    city_dir = Path(context.get("city_dir") or context.get("map_city_dir") or DEFAULT_CITY_DIR)

    output = dict(payload)
    vectors_payload = dict(output.get("vectors", {}))
    rows = points(output)
    refs = load_city_reference(city_dir)

    city_payload = build_city_summary(rows, refs)
    city_layers = build_city_layers(city_payload)
    annotated = annotate_points(rows, city_payload)

    if vectors_payload:
        vectors_payload["points"] = annotated
        output["vectors"] = vectors_payload

    output["cities"] = city_payload
    output["city_layers"] = city_layers

    settings = dict(output.get("settings", {}))
    settings["cities"] = {
        "url": "./data/map-cities.json",
        "layers_url": "./data/map-city-layers.json",
        "city_dir": str(city_dir),
        "enabled": True,
        "user_selectable": True,
    }
    output["settings"] = settings

    return output


def build(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    return merge_cities(payload, context)


def build_standalone(
    *,
    vectors_path: Path,
    map_dir: Path,
    live_map_dir: Path,
    city_dir: Path = DEFAULT_CITY_DIR,
    compact: bool = False,
) -> dict[str, Any]:
    vectors_payload = read_json(vectors_path, fallback={})

    if not isinstance(vectors_payload, dict):
        vectors_payload = {}

    payload = {
        "vectors": vectors_payload,
        "settings": read_json(map_dir / "data" / "map-settings.json", fallback={}),
    }

    merged = merge_cities(payload, {"city_dir": str(city_dir)})
    cities = merged["cities"]
    city_layers = merged["city_layers"]
    updated_vectors = merged.get("vectors", vectors_payload)

    for directory in (map_dir, live_map_dir):
        data_dir = directory / "data"

        write_json(data_dir / "map-cities.json", cities, compact=compact)
        write_json(data_dir / "map-city-layers.json", city_layers, compact=compact)
        write_json(data_dir / "map-vectors.json", updated_vectors, compact=compact)

        settings_path = data_dir / "map-settings.json"
        settings = read_json(settings_path, fallback={})

        if not isinstance(settings, dict):
            settings = {}

        settings["cities"] = merged["settings"]["cities"]
        write_json(settings_path, settings, compact=compact)

    return {
        "schema": "zzx-bitnodes-mapcities-build-report-v1",
        "generated_at": utc_now(),
        "vectors": str(vectors_path),
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "city_dir": str(city_dir),
        "city_count": cities.get("city_count", 0),
        "total_points": cities.get("total_points", 0),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Bitnodes map city/place summaries and filters.")
    parser.add_argument("--vectors", required=True)
    parser.add_argument("--map-dir", default=str(DEFAULT_MAP_DIR))
    parser.add_argument("--live-map-dir", default=str(DEFAULT_LIVE_MAP_DIR))
    parser.add_argument("--city-dir", default=str(DEFAULT_CITY_DIR))
    parser.add_argument("--report", default="")
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    report = build_standalone(
        vectors_path=Path(args.vectors).resolve(),
        map_dir=Path(args.map_dir).resolve(),
        live_map_dir=Path(args.live_map_dir).resolve(),
        city_dir=Path(args.city_dir).resolve(),
        compact=args.compact,
    )

    if args.report:
        write_json(Path(args.report), report, compact=args.compact)

    print(
        "map cities complete: "
        f"{report['city_count']} cities, "
        f"points={report['total_points']}, "
        f"map_dir={report['map_dir']}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
