#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping


APP_ROOT = Path(__file__).resolve().parents[3]
BITNODES_ROOT = Path(os.environ.get("BITNODES_ROOT", str(APP_ROOT / "bitcoin" / "bitnodes")))

DEFAULT_MAP_DIR = BITNODES_ROOT / "maps"
DEFAULT_LIVE_MAP_DIR = BITNODES_ROOT / "live-map"
DEFAULT_COUNTY_DIR = BITNODES_ROOT / "data" / "geo" / "counties"

SCHEMA = "zzx-bitnodes-map-counties-v4"
UNKNOWN_VALUES = {"", "unknown", "none", "null", "undefined", "—", "-", "n/a", "na"}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def clean(value: Any) -> str:
    text = str(value or "").strip()
    return "" if text.lower() in UNKNOWN_VALUES else " ".join(text.split())


def number(value: Any, fallback: float | None = None) -> float | None:
    try:
        if value in ("", None):
            return fallback
        out = float(value)
    except (TypeError, ValueError):
        return fallback
    return out if math.isfinite(out) else fallback


def boolish(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value in (1, "1"):
        return True
    if value in (0, "0"):
        return False
    return str(value or "").strip().lower() in {
        "true", "yes", "y", "ok", "1", "reachable", "online",
        "success", "flagged", "matched", "listed", "hit", "confirmed",
    }


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    try:
        if not path.exists():
            return fallback
        if path.name.endswith(".gz"):
            with gzip.open(path, "rt", encoding="utf-8") as handle:
                return json.load(handle)
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json(path: Path, payload: Any, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
            indent=None if compact else 2,
            separators=(",", ":") if compact else None,
            sort_keys=not compact,
            default=str,
        ) + "\n",
        encoding="utf-8",
    )


def deep_get(row: Mapping[str, Any], key: str) -> Any:
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


def flag(row: Mapping[str, Any], keys: tuple[str, ...]) -> bool:
    return any(boolish(first(row, (key,))) for key in keys)


def vectors(payload: Mapping[str, Any]) -> dict[str, Any]:
    value = payload.get("vectors", {})
    return value if isinstance(value, dict) else {}


def points(payload: Mapping[str, Any]) -> list[dict[str, Any]]:
    candidates = [vectors(payload), payload]

    for source in candidates:
        for key in ("points", "results", "data", "rows", "nodes"):
            value = source.get(key)

            if isinstance(value, list):
                return [dict(row) for row in value if isinstance(row, Mapping)]

            if isinstance(value, Mapping):
                return [
                    {"address": str(address), **dict(row)}
                    for address, row in value.items()
                    if isinstance(row, Mapping)
                ]

    geojson = payload.get("geojson")
    if isinstance(geojson, Mapping) and isinstance(geojson.get("features"), list):
        rows: list[dict[str, Any]] = []

        for index, feature in enumerate(geojson["features"]):
            if not isinstance(feature, Mapping):
                continue

            props = feature.get("properties") if isinstance(feature.get("properties"), Mapping) else {}
            geom = feature.get("geometry") if isinstance(feature.get("geometry"), Mapping) else {}
            coords = geom.get("coordinates") if isinstance(geom.get("coordinates"), list) else []

            row = dict(props)
            row.setdefault("id", feature.get("id") or f"feature-{index:08d}")

            if len(coords) >= 2:
                row.setdefault("longitude", coords[0])
                row.setdefault("latitude", coords[1])

            rows.append(row)

        return rows

    return []


def point_network(point: Mapping[str, Any]) -> str:
    network = clean(first(point, ("network", "metadata.network", "address_family"))).lower()
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


def point_country(point: Mapping[str, Any]) -> str:
    country = clean(first(point, (
        "map_country",
        "country_code",
        "country",
        "country_data.country_code",
        "geoip.country_code",
        "geoip_data.country_code",
        "location.country_code",
        "metadata.country_code",
        "metadata.country",
    ))).upper()

    if country in {"TOR", "I2P"}:
        return country

    network = point_network(point)
    if network == "tor":
        return "TOR"
    if network == "i2p":
        return "I2P"

    return country or "UNKNOWN"


def point_territory(point: Mapping[str, Any]) -> str:
    territory = clean(first(point, (
        "map_territory_code",
        "territory_code",
        "territory",
        "state_code",
        "state",
        "province_code",
        "province",
        "subdivision_code",
        "subdivision",
        "admin1_code",
        "admin1",
        "territory_data.territory_code",
        "territory_data.territory",
        "territory_data.admin1_code",
        "geoip.territory_code",
        "geoip.territory",
        "geoip.admin1_code",
        "geoip_data.territory_code",
        "geoip_data.admin1_code",
        "metadata.territory_code",
        "metadata.territory",
        "metadata.admin1_code",
    ))).upper()

    country = point_country(point)
    if country in {"TOR", "I2P"}:
        return country

    return territory or "UNKNOWN"


def point_county(point: Mapping[str, Any]) -> str:
    county = clean(first(point, (
        "map_county_code",
        "county_code",
        "county",
        "district_code",
        "district",
        "municipality_code",
        "municipality",
        "parish_code",
        "parish",
        "admin2_code",
        "admin2",
        "county_data.county_code",
        "county_data.county",
        "county_data.admin2_code",
        "geoip.county_code",
        "geoip.county",
        "geoip.admin2_code",
        "geoip_data.county_code",
        "geoip_data.admin2_code",
        "metadata.county_code",
        "metadata.county",
        "metadata.admin2_code",
    )))

    country = point_country(point)
    if country in {"TOR", "I2P"}:
        return country

    return county or "Unknown"


def point_county_name(point: Mapping[str, Any]) -> str:
    return clean(first(point, (
        "map_county_label",
        "county_name",
        "district_name",
        "municipality_name",
        "parish_name",
        "admin2_name",
        "county_data.county_name",
        "county_data.name",
        "geoip.county_name",
        "geoip.admin2_name",
        "geoip_data.county_name",
        "geoip_data.admin2_name",
        "metadata.county_name",
        "metadata.admin2_name",
    )))


def point_lat_lon(point: Mapping[str, Any]) -> tuple[float | None, float | None]:
    lat = number(first(point, (
        "latitude", "lat", "geoloc.latitude", "geo.latitude", "geo.lat",
        "geoip.latitude", "geoip.lat", "geoip_data.latitude",
        "location.latitude", "metadata.latitude",
    )))
    lon = number(first(point, (
        "longitude", "lon", "lng", "geoloc.longitude", "geoloc.lon",
        "geo.longitude", "geo.lon", "geo.lng", "geoip.longitude",
        "geoip.lon", "geoip_data.longitude", "location.longitude",
        "metadata.longitude",
    )))

    if lat is None or lon is None:
        return None, None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None, None
    return lat, lon


def point_status(point: Mapping[str, Any]) -> str:
    return clean(first(point, ("status", "metadata.status"))).lower().replace("_", "-") or "unknown"


def is_sanctioned(point: Mapping[str, Any]) -> bool:
    return flag(point, ("is_sanctioned", "is_sanctioned_node", "sanctions_data.is_sanctioned", "metadata.is_sanctioned_node"))


def is_policy_restricted(point: Mapping[str, Any]) -> bool:
    return flag(point, ("policy_restricted", "is_policy_restricted_node", "sanctions_data.is_policy_restricted", "metadata.is_policy_restricted_node"))


def is_threat(point: Mapping[str, Any]) -> bool:
    level = clean(first(point, (
        "threat_level", "tag_threat_level", "threat_infrastructure.threat_level",
        "tag_attribution.threat_level", "metadata.threat_level",
    ))).lower()

    return flag(point, (
        "is_threat_infrastructure", "suspected_threat_infrastructure",
        "threat_infrastructure.is_threat_infrastructure", "confirmed_intelligence_match",
    )) or level in {"confirmed", "high", "medium", "low"}


def load_county_reference(county_dir: Path) -> dict[str, dict[str, Any]]:
    refs: dict[str, dict[str, Any]] = {}

    for candidate in (
        county_dir / "counties.json",
        county_dir / "counties.json.gz",
        county_dir / "mapcounties.json",
        county_dir / "mapcounties.json.gz",
        county_dir / "admin2.json",
        county_dir / "admin2.json.gz",
    ):
        data = read_json(candidate, fallback={})
        if not isinstance(data, dict):
            continue

        rows = data.get("counties", data.get("admin2", data.get("county_groups", data)))

        if isinstance(rows, dict):
            for code, row in rows.items():
                if not isinstance(row, dict):
                    continue

                country = clean(row.get("country_code") or row.get("country")).upper()
                territory = clean(row.get("territory_code") or row.get("admin1_code") or row.get("state_code")).upper()
                county = clean(
                    row.get("county_code")
                    or row.get("admin2_code")
                    or row.get("district_code")
                    or row.get("county")
                    or row.get("name")
                    or code
                )

                refs[str(code)] = dict(row)

                if country and county:
                    refs[f"{country}:{territory or 'UNKNOWN'}:{county}"] = dict(row)

        elif isinstance(rows, list):
            for row in rows:
                if not isinstance(row, dict):
                    continue

                country = clean(row.get("country_code") or row.get("country")).upper()
                territory = clean(row.get("territory_code") or row.get("admin1_code") or row.get("state_code")).upper()
                county = clean(row.get("county_code") or row.get("admin2_code") or row.get("county") or row.get("name"))

                if country and county:
                    refs[f"{country}:{territory or 'UNKNOWN'}:{county}"] = dict(row)

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
    refs.setdefault("UNKNOWN:UNKNOWN:Unknown", {
        "country_code": "UNKNOWN",
        "territory_code": "UNKNOWN",
        "county_code": "Unknown",
        "county_name": "Unknown / Unclassified",
        "color": "#8c927e",
    })

    return refs


def ref_for(country: str, territory: str, county: str, refs: Mapping[str, Mapping[str, Any]]) -> Mapping[str, Any]:
    return (
        refs.get(f"{country}:{territory}:{county}")
        or refs.get(f"{country}:UNKNOWN:{county}")
        or refs.get(county)
        or {}
    )


def sorted_counts(counter: dict[str, int]) -> dict[str, int]:
    return dict(sorted(counter.items(), key=lambda item: (-item[1], item[0])))


def inc(counter: dict[str, int], key: Any) -> None:
    value = clean(key) or "Unknown"
    counter[value] = counter.get(value, 0) + 1


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
            "security_counts": {
                "sanctioned_nodes": 0,
                "policy_restricted_nodes": 0,
                "threat_infrastructure_nodes": 0,
            },
            "intelligence_counts": {
                "vpn_nodes": 0,
                "proxy_nodes": 0,
                "datacenter_nodes": 0,
                "government_nodes": 0,
                "military_nodes": 0,
                "apt_label_nodes": 0,
                "threat_actor_label_nodes": 0,
                "known_malactor_nodes": 0,
            },
            "_coordinates": [],
        })

        item["point_count"] += 1
        inc(item["network_counts"], point_network(row))
        inc(item["status_counts"], point_status(row))

        if is_sanctioned(row):
            item["security_counts"]["sanctioned_nodes"] += 1
        if is_policy_restricted(row):
            item["security_counts"]["policy_restricted_nodes"] += 1
        if is_threat(row):
            item["security_counts"]["threat_infrastructure_nodes"] += 1

        if flag(row, ("is_vpn", "suspected_vpn", "vpn_data.is_vpn", "vpn.is_vpn", "metadata.is_vpn")):
            item["intelligence_counts"]["vpn_nodes"] += 1
        if flag(row, ("is_proxy", "suspected_proxy", "proxy_data.is_proxy", "proxy.is_proxy", "metadata.is_proxy")):
            item["intelligence_counts"]["proxy_nodes"] += 1
        if flag(row, ("is_datacenter", "datacenter_data.is_datacenter", "datacenter.is_datacenter", "metadata.is_datacenter")):
            item["intelligence_counts"]["datacenter_nodes"] += 1
        if flag(row, ("is_government", "government_data.is_government", "government.is_government", "metadata.is_government")):
            item["intelligence_counts"]["government_nodes"] += 1
        if flag(row, ("is_military", "military_data.is_military", "military.is_military", "metadata.is_military")):
            item["intelligence_counts"]["military_nodes"] += 1
        if flag(row, ("suspected_apt_related", "is_apt", "apt_data.is_apt", "metadata.is_apt")):
            item["intelligence_counts"]["apt_label_nodes"] += 1
        if flag(row, ("suspected_threat_actor_group_related", "is_threat_actor", "threat_actor_data.is_threat_actor", "metadata.is_threat_actor")):
            item["intelligence_counts"]["threat_actor_label_nodes"] += 1
        if flag(row, ("is_known_malactor", "knownmalactor.is_known_malactor", "known_malactor_data.is_known_malactor", "metadata.is_known_malactor")):
            item["intelligence_counts"]["known_malactor_nodes"] += 1

        lat, lon = point_lat_lon(row)
        if lat is not None and lon is not None:
            item["_coordinates"].append((lat, lon))

    counties: dict[str, Any] = {}

    for key, item in grouped.items():
        coords = item.pop("_coordinates", [])
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

        item["network_counts"] = sorted_counts(item["network_counts"])
        item["status_counts"] = sorted_counts(item["status_counts"])
        counties[key] = item

    return {
        "schema": SCHEMA,
        "generated_at": utc_now(),
        "total_points": len(rows),
        "county_count": len(counties),
        "counties": dict(sorted(counties.items(), key=lambda pair: (-int(pair[1]["point_count"]), pair[0]))),
        "red_ring_semantics": {
            "sanctioned_county_count": "county contains nodes with red marker ring",
            "policy_restricted_county_count": "county contains nodes with red-orange marker ring",
            "threat_county_count": "county contains defensive threat-infrastructure matches",
        },
        "false_positive_control": {
            "threat_infrastructure": "defensive infrastructure correlation only",
            "threat_actor_labels": "explicit trusted metadata/feed labels only",
            "no_country_to_apt_inference": True,
        },
    }


def build_county_layers(payload: Mapping[str, Any]) -> dict[str, Any]:
    counties = payload.get("counties", {})
    if not isinstance(counties, Mapping):
        counties = {}

    layers = []

    for county_id, county in counties.items():
        if not isinstance(county, Mapping):
            continue

        security = county.get("security_counts", {})
        if not isinstance(security, Mapping):
            security = {}

        color = clean(county.get("color")) or "#8c927e"
        marker_ring = False
        table_badge = ""

        if int(security.get("sanctioned_nodes", 0) or 0) > 0:
            color = "#ff0000"
            marker_ring = True
            table_badge = "SANCTIONED"
        elif int(security.get("policy_restricted_nodes", 0) or 0) > 0:
            color = "#ff3b30"
            marker_ring = True
            table_badge = "RESTRICTED"
        elif int(security.get("threat_infrastructure_nodes", 0) or 0) > 0:
            color = "#ff9500"
            marker_ring = True
            table_badge = "THREAT"

        layers.append({
            "id": f"county:{county_id}",
            "label": county.get("county_name", str(county_id)),
            "kind": "county-filter",
            "enabled": True,
            "visible": False,
            "color": color,
            "point_count": county.get("point_count", 0),
            "marker_ring": marker_ring,
            "table_badge": table_badge,
            "filter": {
                "type": "equals",
                "key": "map_county",
                "value": county_id,
            },
        })

    return {
        "schema": "zzx-bitnodes-map-county-layers-v4",
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
        country = point_country(item)
        territory = point_territory(item)
        county = point_county(item)
        key = f"{country}:{territory}:{county}"
        ref = counties.get(key, {})

        item["map_county"] = key
        item["map_county_code"] = county
        item["map_county_label"] = clean(ref.get("county_name")) or county
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
        vectors_payload.setdefault("vectors", {})
        if isinstance(vectors_payload["vectors"], dict):
            vectors_payload["vectors"]["points"] = annotated
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


def process(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
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
        "schema": "zzx-bitnodes-mapcounties-build-report-v4",
        "generated_at": utc_now(),
        "vectors": str(vectors_path),
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "county_dir": str(county_dir),
        "county_count": counties.get("county_count", 0),
        "total_points": counties.get("total_points", 0),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build Bitnodes map county/admin2 summaries, security counters, filters, and county-annotated vectors.",
        allow_abbrev=False,
    )

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
