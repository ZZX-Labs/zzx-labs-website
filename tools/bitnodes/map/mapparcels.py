#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import hashlib
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
DEFAULT_PARCEL_DIR = BITNODES_ROOT / "data" / "geo" / "parcels"

SCHEMA = "zzx-bitnodes-map-parcels-v4"
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
    for source in (vectors(payload), payload):
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


def point_lat_lon(point: Mapping[str, Any]) -> tuple[float | None, float | None]:
    lat = number(first(point, (
        "latitude", "lat", "geoloc.latitude", "parcel_data.latitude",
        "geo.latitude", "geo.lat", "geoip.latitude", "geoip.lat",
        "geoip_data.latitude", "location.latitude", "metadata.latitude",
    )))
    lon = number(first(point, (
        "longitude", "lon", "lng", "geoloc.longitude", "geoloc.lon",
        "parcel_data.longitude", "geo.longitude", "geo.lon", "geo.lng",
        "geoip.longitude", "geoip.lon", "geoip_data.longitude",
        "location.longitude", "metadata.longitude",
    )))

    if lat is None or lon is None:
        return None, None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None, None
    return lat, lon


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
        "map_country", "country_code", "country", "country_data.country_code",
        "geoip.country_code", "geoip_data.country_code", "location.country_code",
        "metadata.country_code", "metadata.country",
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
        "map_territory_code", "territory_code", "territory", "state_code",
        "state", "province_code", "province", "subdivision_code", "subdivision",
        "admin1_code", "admin1", "territory_data.territory_code",
        "territory_data.admin1_code", "geoip.territory_code", "geoip.admin1_code",
        "geoip_data.territory_code", "geoip_data.admin1_code",
        "metadata.territory_code", "metadata.admin1_code",
    ))).upper()

    country = point_country(point)
    if country in {"TOR", "I2P"}:
        return country

    return territory or "UNKNOWN"


def point_county(point: Mapping[str, Any]) -> str:
    county = clean(first(point, (
        "map_county_code", "county_code", "county", "district_code", "district",
        "municipality_code", "municipality", "parish_code", "parish",
        "admin2_code", "admin2", "county_data.county_code", "county_data.county",
        "geoip.county_code", "geoip.county", "geoip.admin2_code",
        "geoip_data.county_code", "geoip_data.admin2_code",
        "metadata.county_code", "metadata.county", "metadata.admin2_code",
    )))

    country = point_country(point)
    if country in {"TOR", "I2P"}:
        return country

    return county or "Unknown"


def point_city(point: Mapping[str, Any]) -> str:
    city = clean(first(point, (
        "map_city_name", "map_city", "city", "city_name", "town", "town_name",
        "village", "village_name", "locality", "place", "place_name",
        "city_data.city", "city_data.city_name", "city_data.name",
        "geoip.city", "geoip.city_name", "geoip_data.city",
        "metadata.city", "metadata.city_name",
    )))

    country = point_country(point)
    if country == "TOR":
        return "Tor Overlay Channel"
    if country == "I2P":
        return "I2P Overlay Channel"

    return city or "Unknown"


def point_zip(point: Mapping[str, Any]) -> str:
    postal = clean(first(point, (
        "map_zip_code", "map_zip", "zip", "zip_code", "zipcode", "postal",
        "postal_code", "postcode", "post_code", "postal_data.postal_code",
        "postal_data.zip", "geoip.zip", "geoip.postal_code",
        "geoip_data.zip", "geoip_data.postal_code",
        "metadata.zip", "metadata.zip_code", "metadata.postal_code",
    ))).upper()

    country = point_country(point)
    if country in {"TOR", "I2P"}:
        return country

    return postal or "Unknown"


def point_status(point: Mapping[str, Any]) -> str:
    return clean(first(point, ("status", "metadata.status"))).lower().replace("_", "-") or "unknown"


def point_address(point: Mapping[str, Any]) -> str:
    return clean(first(point, ("address", "host", "node", "addr", "hostname", "id")))


def explicit_parcel(point: Mapping[str, Any]) -> str:
    return clean(first(point, (
        "map_parcel",
        "parcel",
        "parcel_id",
        "parcel_code",
        "parcel_data.parcel_id",
        "parcel_data.parcel_code",
        "metadata.parcel_id",
        "metadata.parcel_code",
    )))


def synthetic_parcel_id(point: Mapping[str, Any], precision: int = 5) -> str:
    lat, lon = point_lat_lon(point)

    context = {
        "country": point_country(point),
        "territory": point_territory(point),
        "county": point_county(point),
        "city": point_city(point),
        "zip": point_zip(point),
    }

    if lat is not None and lon is not None:
        basis = (
            f"{context['country']}|{context['territory']}|{context['county']}|"
            f"{context['city']}|{context['zip']}|{lat:.{precision}f}|{lon:.{precision}f}"
        )
    else:
        basis = json.dumps(context, ensure_ascii=False, sort_keys=True)

    digest = hashlib.sha3_256(basis.encode("utf-8")).hexdigest()[:20]
    return f"parcel:{digest}"


def point_parcel(point: Mapping[str, Any], precision: int = 5) -> str:
    return explicit_parcel(point) or synthetic_parcel_id(point, precision=precision)


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


def load_parcel_reference(parcel_dir: Path) -> dict[str, dict[str, Any]]:
    refs: dict[str, dict[str, Any]] = {}

    for candidate in (
        parcel_dir / "parcels.json",
        parcel_dir / "parcels.json.gz",
        parcel_dir / "mapparcels.json",
        parcel_dir / "mapparcels.json.gz",
        parcel_dir / "parcel-index.json",
        parcel_dir / "parcel-index.json.gz",
        parcel_dir / "parcel_index.json",
        parcel_dir / "parcel_index.json.gz",
    ):
        data = read_json(candidate, fallback={})
        if not isinstance(data, dict):
            continue

        rows = data.get("parcels", data.get("parcel_index", data.get("parcel-index", data)))

        if isinstance(rows, dict):
            for parcel_id, row in rows.items():
                if isinstance(row, dict):
                    refs[str(parcel_id)] = dict(row)

        elif isinstance(rows, list):
            for row in rows:
                if not isinstance(row, dict):
                    continue
                parcel_id = clean(row.get("parcel_id") or row.get("parcel_code") or row.get("id"))
                if parcel_id:
                    refs[parcel_id] = dict(row)

    return refs


def sorted_counts(counter: dict[str, int]) -> dict[str, int]:
    return dict(sorted(counter.items(), key=lambda item: (-item[1], item[0])))


def inc(counter: dict[str, int], key: Any) -> None:
    value = clean(key) or "Unknown"
    counter[value] = counter.get(value, 0) + 1


def apply_reference_fields(item: dict[str, Any], ref: Mapping[str, Any], row: Mapping[str, Any]) -> None:
    for attr in (
        "parcel_owner",
        "parcel_use",
        "parcel_class",
        "parcel_zone",
        "parcel_area",
        "parcel_area_unit",
        "assessor_url",
        "source",
        "confidence",
    ):
        value = ref.get(attr) if isinstance(ref, Mapping) else None
        if value is None:
            value = first(row, (f"parcel_data.{attr}", f"metadata.{attr}"))
        if value not in ("", None):
            item[attr] = value


def build_parcel_summary(
    rows: list[dict[str, Any]],
    refs: Mapping[str, Mapping[str, Any]],
    precision: int,
) -> dict[str, Any]:
    grouped: dict[str, dict[str, Any]] = {}

    for row in rows:
        parcel_id = point_parcel(row, precision=precision)
        reference = refs.get(parcel_id, {})
        lat, lon = point_lat_lon(row)

        item = grouped.setdefault(parcel_id, {
            "id": parcel_id,
            "parcel_id": parcel_id,
            "parcel_name": clean(reference.get("parcel_name") or reference.get("name")) or parcel_id,
            "synthetic": parcel_id.startswith("parcel:"),
            "precision": precision,
            "country": point_country(row),
            "territory": point_territory(row),
            "county": point_county(row),
            "city": point_city(row),
            "zip": point_zip(row),
            "color": clean(reference.get("color")) or "#8c927e",
            "point_count": 0,
            "country_counts": {},
            "city_counts": {},
            "zip_counts": {},
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
            "nodes": [],
            "_coordinates": [],
        })

        apply_reference_fields(item, reference, row)

        item["point_count"] += 1
        inc(item["country_counts"], point_country(row))
        inc(item["city_counts"], point_city(row))
        inc(item["zip_counts"], point_zip(row))
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

        node = point_address(row)
        if node:
            item["nodes"].append(node)

        if lat is not None and lon is not None:
            item["_coordinates"].append((lat, lon))

    parcels: dict[str, Any] = {}

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

        item["country_counts"] = sorted_counts(item["country_counts"])
        item["city_counts"] = sorted_counts(item["city_counts"])
        item["zip_counts"] = sorted_counts(item["zip_counts"])
        item["network_counts"] = sorted_counts(item["network_counts"])
        item["status_counts"] = sorted_counts(item["status_counts"])
        item["nodes"] = sorted(set(item["nodes"]))
        parcels[key] = item

    return {
        "schema": SCHEMA,
        "generated_at": utc_now(),
        "precision": precision,
        "total_points": len(rows),
        "parcel_count": len(parcels),
        "parcels": dict(sorted(parcels.items(), key=lambda pair: (-int(pair[1]["point_count"]), pair[0]))),
        "red_ring_semantics": {
            "sanctioned_parcel_count": "parcel bucket contains nodes with red marker ring",
            "policy_restricted_parcel_count": "parcel bucket contains nodes with red-orange marker ring",
            "threat_parcel_count": "parcel bucket contains defensive threat-infrastructure matches",
        },
        "false_positive_control": {
            "synthetic_parcels": "deterministic coordinate buckets unless official parcel reference data is supplied",
            "threat_infrastructure": "defensive infrastructure correlation only",
            "threat_actor_labels": "explicit trusted metadata/feed labels only",
            "no_country_to_apt_inference": True,
        },
    }


def build_parcel_layers(payload: Mapping[str, Any]) -> dict[str, Any]:
    parcels = payload.get("parcels", {})
    if not isinstance(parcels, Mapping):
        parcels = {}

    layers = []

    for parcel_id, parcel in parcels.items():
        if not isinstance(parcel, Mapping):
            continue

        security = parcel.get("security_counts", {})
        if not isinstance(security, Mapping):
            security = {}

        color = clean(parcel.get("color")) or "#8c927e"
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
            "id": f"parcel:{parcel_id}",
            "label": parcel.get("parcel_name", str(parcel_id)),
            "kind": "parcel-filter",
            "enabled": True,
            "visible": False,
            "color": color,
            "point_count": parcel.get("point_count", 0),
            "marker_ring": marker_ring,
            "table_badge": table_badge,
            "filter": {
                "type": "equals",
                "key": "map_parcel",
                "value": parcel_id,
            },
        })

    return {
        "schema": "zzx-bitnodes-map-parcel-layers-v4",
        "generated_at": utc_now(),
        "layers": sorted(layers, key=lambda item: (-int(item.get("point_count", 0) or 0), item["id"])),
    }


def annotate_points(
    rows: list[dict[str, Any]],
    parcel_payload: Mapping[str, Any],
    precision: int,
) -> list[dict[str, Any]]:
    parcels = parcel_payload.get("parcels", {})
    if not isinstance(parcels, Mapping):
        parcels = {}

    output = []

    for row in rows:
        item = dict(row)
        parcel_id = point_parcel(item, precision=precision)
        ref = parcels.get(parcel_id, {})

        item["map_parcel"] = parcel_id
        item["map_parcel_label"] = clean(ref.get("parcel_name")) or parcel_id
        item["map_parcel_color"] = clean(ref.get("color")) or "#8c927e"
        item["map_parcel_precision"] = precision
        item["map_parcel_synthetic"] = parcel_id.startswith("parcel:")

        output.append(item)

    return output


def merge_parcels(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    context = context or {}
    parcel_dir = Path(context.get("parcel_dir") or context.get("map_parcel_dir") or DEFAULT_PARCEL_DIR)
    precision = int(context.get("parcel_precision") or context.get("precision") or 5)

    output = dict(payload)
    vectors_payload = dict(output.get("vectors", {}))
    rows = points(output)
    refs = load_parcel_reference(parcel_dir)

    raw_payload = build_parcel_summary(rows, refs, precision)
    annotated = annotate_points(rows, raw_payload, precision)
    parcel_payload = build_parcel_summary(annotated, refs, precision)
    parcel_layers = build_parcel_layers(parcel_payload)

    if vectors_payload:
        vectors_payload["points"] = annotated
        vectors_payload.setdefault("vectors", {})
        if isinstance(vectors_payload["vectors"], dict):
            vectors_payload["vectors"]["points"] = annotated
        output["vectors"] = vectors_payload

    output["parcels"] = parcel_payload
    output["parcel_layers"] = parcel_layers

    settings = dict(output.get("settings", {}))
    settings["parcels"] = {
        "url": "./data/map-parcels.json",
        "layers_url": "./data/map-parcel-layers.json",
        "parcel_dir": str(parcel_dir),
        "precision": precision,
        "enabled": True,
        "user_selectable": True,
        "note": "Parcel IDs are deterministic synthetic coordinate/context buckets unless official parcel reference data is supplied.",
    }
    output["settings"] = settings

    return output


def build(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    return merge_parcels(payload, context)


def process(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    return merge_parcels(payload, context)


def build_standalone(
    *,
    vectors_path: Path,
    map_dir: Path,
    live_map_dir: Path,
    parcel_dir: Path = DEFAULT_PARCEL_DIR,
    precision: int = 5,
    compact: bool = False,
) -> dict[str, Any]:
    vectors_payload = read_json(vectors_path, fallback={})
    if not isinstance(vectors_payload, dict):
        vectors_payload = {}

    payload = {
        "vectors": vectors_payload,
        "settings": read_json(map_dir / "data" / "map-settings.json", fallback={}),
    }

    merged = merge_parcels(payload, {"parcel_dir": str(parcel_dir), "parcel_precision": precision})
    parcels = merged["parcels"]
    parcel_layers = merged["parcel_layers"]
    updated_vectors = merged.get("vectors", vectors_payload)

    for directory in (map_dir, live_map_dir):
        data_dir = directory / "data"
        write_json(data_dir / "map-parcels.json", parcels, compact=compact)
        write_json(data_dir / "map-parcel-layers.json", parcel_layers, compact=compact)
        write_json(data_dir / "map-vectors.json", updated_vectors, compact=compact)

        settings_path = data_dir / "map-settings.json"
        settings = read_json(settings_path, fallback={})
        if not isinstance(settings, dict):
            settings = {}

        settings["parcels"] = merged["settings"]["parcels"]
        write_json(settings_path, settings, compact=compact)

    return {
        "schema": "zzx-bitnodes-mapparcels-build-report-v4",
        "generated_at": utc_now(),
        "vectors": str(vectors_path),
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "parcel_dir": str(parcel_dir),
        "precision": precision,
        "parcel_count": parcels.get("parcel_count", 0),
        "total_points": parcels.get("total_points", 0),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build Bitnodes map parcel/synthetic parcel summaries, security counters, filters, and parcel-annotated vectors.",
        allow_abbrev=False,
    )

    parser.add_argument("--vectors", required=True)
    parser.add_argument("--map-dir", default=str(DEFAULT_MAP_DIR))
    parser.add_argument("--live-map-dir", default=str(DEFAULT_LIVE_MAP_DIR))
    parser.add_argument("--parcel-dir", default=str(DEFAULT_PARCEL_DIR))
    parser.add_argument("--precision", type=int, default=5)
    parser.add_argument("--report", default="")
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    report = build_standalone(
        vectors_path=Path(args.vectors).resolve(),
        map_dir=Path(args.map_dir).resolve(),
        live_map_dir=Path(args.live_map_dir).resolve(),
        parcel_dir=Path(args.parcel_dir).resolve(),
        precision=args.precision,
        compact=args.compact,
    )

    if args.report:
        write_json(Path(args.report), report, compact=args.compact)

    print(
        "map parcels complete: "
        f"{report['parcel_count']} parcels, "
        f"points={report['total_points']}, "
        f"map_dir={report['map_dir']}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
