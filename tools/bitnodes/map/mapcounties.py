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
DEFAULT_COUNTY_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "geo" / "counties"

SCHEMA = "zzx-bitnodes-map-counties-v1"


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
        "map_county",
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


def point_county_name(point: Mapping[str, Any]) -> str:
    return clean(first(point, (
        "county_name",
        "district_name",
        "municipality_name",
        "parish_name",
        "admin2_name",
        "county_data.county_name",
        "county_data.name",
        "geoip.county_name",
        "geoip.admin2_name",
        "metadata.county_name",
        "metadata.admin2_name",
    )))


def point_lat_lon(point: Mapping[str, Any]) -> tuple[float | None, float | None]:
    lat = number(first(point, (
        "latitude",
        "lat",
        "geoloc.latitude",
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


def load_county_reference(county_dir: Path) -> dict[str, dict[str, Any]]:
    refs: dict[str, dict[str, Any]] = {}

    for candidate in (
        county_dir / "counties.json",
        county_dir / "mapcounties.json",
        county_dir / "admin2.json",
    ):
        data = read_json(candidate, fallback={})

        if not isinstance(data, dict):
            continue

        rows = data.get("counties", data.get("admin2", data))

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
                county = clean(row.get("county_code") or row.get("admin2_code") or row.get("county") or row.get("name"))

                if country and county:
                    refs[f"{country}:{territory or 'UNKNOWN'}:{county}"] = row

    refs.setdefault("TOR:TOR:TOR", {
        "country_code": "TOR",
        "territory_code": "TOR",
        "county_code": "TOR",
        "county_name": "Tor Overlay Network",
        "color": "#9d67ad",
    })

    refs.setdefault("I2P:I2P:I2P", {
        "country_code": "I2P",
        "territory_code": "I2P",
        "county_code": "I2P",
        "county_name": "I2P Overlay Network",
        "color": "#b889ff",
    })

    return refs


def ref_for(country: str, territory: str, county: str, refs: Mapping[str, Mapping[str, Any]]) -> Mapping[str, Any]:
    return (
        refs.get(f"{country}:{territory}:{county}")
        or refs.get(f"{country}:UNKNOWN:{county}")
        or refs.get(county)
        or {}
    )


def build_county_summary(rows: list[dict[str, Any]], refs: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    grouped: dict[str, dict[str, Any]] = {}

    for row in rows:
        country = point_country(row)
        territory = point_territory(row)
        county = point_county(row)
        key = f"{country}:{territory}:{county}"
        reference = ref_for(country, territory, county, refs)

        item = grouped.setdefault(key, {
            "id": key,
            "country_code": country,
            "territory_code": territory,
            "county_code": county,
            "county_name": clean(reference.get("county_name") or reference.get("name")) or point_county_name(row) or county,
            "color": clean(reference.get("color")) or "#8c927e",
            "point_count": 0,
            "network_counts": {},
            "status_counts": {},
            "coordinates": [],
        })

        item["point_count"] += 1

        network = point_network(row)
        status = point_status(row)

        item["network_counts"][network] = item["network_counts"].get(network, 0) + 1
        item["status_counts"][status] = item["status_counts"].get(status, 0) + 1

        lat, lon = point_lat_lon(row)

        if lat is not None and lon is not None:
            item["coordinates"].append((lat, lon))

    counties = {}

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
        counties[key] = item

    return {
        "schema": SCHEMA,
        "generated_at": utc_now(),
        "total_points": len(rows),
        "county_count": len(counties),
        "counties": dict(sorted(counties.items(), key=lambda pair: (-pair[1]["point_count"], pair[0]))),
    }


def build_county_layers(payload: Mapping[str, Any]) -> dict[str, Any]:
    counties = payload.get("counties", {})

    if not isinstance(counties, Mapping):
        counties = {}

    layers = []

    for county_id, county in counties.items():
        if not isinstance(county, Mapping):
            continue

        layers.append({
            "id": f"county:{county_id}",
            "label": county.get("county_name", str(county_id)),
            "kind": "county-filter",
            "enabled": True,
            "visible": False,
            "color": county.get("color", "#8c927e"),
            "point_count": county.get("point_count", 0),
            "filter": {
                "type": "county",
                "key": "map_county",
                "value": county_id,
            },
        })

    return {
        "schema": "zzx-bitnodes-map-county-layers-v1",
        "generated_at": utc_now(),
        "layers": sorted(layers, key=lambda item: (-int(item.get("point_count", 0) or 0), item["id"])),
    }


def annotate_points(rows: list[dict[str, Any]], county_payload: Mapping[str, Any]) -> list[dict[str, Any]]:
    counties = county_payload.get("counties", {})

    if not isinstance(counties, Mapping):
        counties = {}

    output = []

    for row in rows:
        item = dict(row)
        key = f"{point_country(item)}:{point_territory(item)}:{point_county(item)}"
        ref = counties.get(key, {})

        item["map_county"] = key
        item["map_county_code"] = point_county(item)
        item["map_county_label"] = clean(ref.get("county_name")) or point_county(item)
        item["map_county_color"] = clean(ref.get("color")) or "#8c927e"

        output.append(item)

    return output


def merge_counties(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    context = context or {}
    county_dir = Path(context.get("county_dir") or context.get("map_county_dir") or DEFAULT_COUNTY_DIR)

    output = dict(payload)
    vectors_payload = dict(output.get("vectors", {}))
    rows = points(output)
    refs = load_county_reference(county_dir)

    county_payload = build_county_summary(rows, refs)
    county_layers = build_county_layers(county_payload)
    annotated = annotate_points(rows, county_payload)

    if vectors_payload:
        vectors_payload["points"] = annotated
        output["vectors"] = vectors_payload

    output["counties"] = county_payload
    output["county_layers"] = county_layers

    settings = dict(output.get("settings", {}))
    settings["counties"] = {
        "url": "./data/map-counties.json",
        "layers_url": "./data/map-county-layers.json",
        "county_dir": str(county_dir),
        "enabled": True,
        "user_selectable": True,
    }
    output["settings"] = settings

    return output


def build(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    return merge_counties(payload, context)


def build_standalone(
    *,
    vectors_path: Path,
    map_dir: Path,
    live_map_dir: Path,
    county_dir: Path = DEFAULT_COUNTY_DIR,
    compact: bool = False,
) -> dict[str, Any]:
    vectors_payload = read_json(vectors_path, fallback={})

    if not isinstance(vectors_payload, dict):
        vectors_payload = {}

    payload = {
        "vectors": vectors_payload,
        "settings": read_json(map_dir / "data" / "map-settings.json", fallback={}),
    }

    merged = merge_counties(payload, {"county_dir": str(county_dir)})
    counties = merged["counties"]
    county_layers = merged["county_layers"]
    updated_vectors = merged.get("vectors", vectors_payload)

    for directory in (map_dir, live_map_dir):
        data_dir = directory / "data"

        write_json(data_dir / "map-counties.json", counties, compact=compact)
        write_json(data_dir / "map-county-layers.json", county_layers, compact=compact)
        write_json(data_dir / "map-vectors.json", updated_vectors, compact=compact)

        settings_path = data_dir / "map-settings.json"
        settings = read_json(settings_path, fallback={})

        if not isinstance(settings, dict):
            settings = {}

        settings["counties"] = merged["settings"]["counties"]
        write_json(settings_path, settings, compact=compact)

    return {
        "schema": "zzx-bitnodes-mapcounties-build-report-v1",
        "generated_at": utc_now(),
        "vectors": str(vectors_path),
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "county_dir": str(county_dir),
        "county_count": counties.get("county_count", 0),
        "total_points": counties.get("total_points", 0),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Bitnodes map county/admin2 summaries and filters.")
    parser.add_argument("--vectors", required=True)
    parser.add_argument("--map-dir", default=str(DEFAULT_MAP_DIR))
    parser.add_argument("--live-map-dir", default=str(DEFAULT_LIVE_MAP_DIR))
    parser.add_argument("--county-dir", default=str(DEFAULT_COUNTY_DIR))
    parser.add_argument("--report", default="")
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    report = build_standalone(
        vectors_path=Path(args.vectors).resolve(),
        map_dir=Path(args.map_dir).resolve(),
        live_map_dir=Path(args.live_map_dir).resolve(),
        county_dir=Path(args.county_dir).resolve(),
        compact=args.compact,
    )

    if args.report:
        write_json(Path(args.report), report, compact=args.compact)

    print(
        "map counties complete: "
        f"{report['county_count']} counties, "
        f"points={report['total_points']}, "
        f"map_dir={report['map_dir']}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
