#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import math
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping


APP_ROOT = Path(__file__).resolve().parents[3]
BITNODES_ROOT = Path(os.environ.get("BITNODES_ROOT", str(APP_ROOT / "bitcoin" / "bitnodes")))

DEFAULT_MAP_DIR = BITNODES_ROOT / "maps"
DEFAULT_LIVE_MAP_DIR = BITNODES_ROOT / "live-map"
DEFAULT_ZZXGCS_DIR = BITNODES_ROOT / "data" / "geo" / "zzxgcs"

SCHEMA = "zzx-bitnodes-map-zzxgcs-addresses-v4"
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


def normalize_zzxgcs(value: Any) -> str:
    if isinstance(value, list):
        value = ".".join(clean(item) for item in value if clean(item))

    text = clean(value)

    if not text:
        return ""

    if text.startswith("[") and text.endswith("]"):
        try:
            decoded = json.loads(text)
            if isinstance(decoded, list):
                text = ".".join(clean(item) for item in decoded if clean(item))
        except Exception:
            pass

    text = text.removeprefix("zzx://").removeprefix("zzx:").strip("/")
    text = re.sub(r"\s+", ".", text)
    text = re.sub(r"\.{2,}", ".", text).strip(".")

    if not text:
        return ""

    return f"zzx://{text}"


def point_zzxgcs(point: Mapping[str, Any]) -> str:
    return normalize_zzxgcs(first(point, (
        "map_zzxgcs",
        "zzxgcs",
        "zzx_gcs",
        "zzxgcs_address",
        "zzxgcs_data.zzxgcs",
        "zzxgcs_data.address",
        "zzxgcs_data.words",
        "geo.zzxgcs",
        "geoloc.zzxgcs",
        "location.zzxgcs",
        "metadata.zzxgcs",
        "metadata.zzx_gcs",
    )))


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


def point_lat_lon(point: Mapping[str, Any]) -> tuple[float | None, float | None]:
    lat = number(first(point, (
        "latitude", "lat", "geoloc.latitude", "zzxgcs_data.latitude",
        "geo.latitude", "geo.lat", "geoip.latitude", "geoip.lat",
        "geoip_data.latitude", "location.latitude", "metadata.latitude",
    )))
    lon = number(first(point, (
        "longitude", "lon", "lng", "geoloc.longitude", "geoloc.lon",
        "zzxgcs_data.longitude", "geo.longitude", "geo.lon", "geo.lng",
        "geoip.longitude", "geoip.lon", "geoip_data.longitude",
        "location.longitude", "metadata.longitude",
    )))

    if lat is None or lon is None:
        return None, None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None, None
    return lat, lon


def point_status(point: Mapping[str, Any]) -> str:
    return clean(first(point, ("status", "metadata.status"))).lower().replace("_", "-") or "unknown"


def point_address(point: Mapping[str, Any]) -> str:
    return clean(first(point, ("address", "host", "node", "addr", "hostname", "id")))


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


def load_zzxgcs_reference(zzxgcs_dir: Path) -> dict[str, dict[str, Any]]:
    refs: dict[str, dict[str, Any]] = {}

    for candidate in (
        zzxgcs_dir / "zzxgcs-addresses.json",
        zzxgcs_dir / "zzxgcs-addresses.json.gz",
        zzxgcs_dir / "mapzzxgcsaddresses.json",
        zzxgcs_dir / "mapzzxgcsaddresses.json.gz",
        zzxgcs_dir / "zzxgcs-cache.json",
        zzxgcs_dir / "zzxgcs-cache.json.gz",
        zzxgcs_dir / "zzx-gcs.json",
        zzxgcs_dir / "zzx-gcs.json.gz",
    ):
        data = read_json(candidate, fallback={})
        if not isinstance(data, dict):
            continue

        rows = data.get("addresses", data.get("entries", data.get("zzxgcs", data)))

        if isinstance(rows, dict):
            for key, row in rows.items():
                if not isinstance(row, dict):
                    continue
                address = normalize_zzxgcs(row.get("zzxgcs") or row.get("address") or row.get("words") or key)
                if address:
                    refs[address] = dict(row)

        elif isinstance(rows, list):
            for row in rows:
                if not isinstance(row, dict):
                    continue
                address = normalize_zzxgcs(row.get("zzxgcs") or row.get("address") or row.get("words"))
                if address:
                    refs[address] = dict(row)

    return refs


def words_for_address(address: str, row: Mapping[str, Any], ref: Mapping[str, Any]) -> list[str]:
    raw = ref.get("words") or first(row, ("zzxgcs_data.words", "metadata.zzxgcs_words"))

    if isinstance(raw, list):
        return [clean(item) for item in raw if clean(item)]

    text = normalize_zzxgcs(raw or address).removeprefix("zzx://")
    return [part for part in text.split(".") if part]


def sorted_counts(counter: dict[str, int]) -> dict[str, int]:
    return dict(sorted(counter.items(), key=lambda item: (-item[1], item[0])))


def inc(counter: dict[str, int], key: Any) -> None:
    value = clean(key) or "Unknown"
    counter[value] = counter.get(value, 0) + 1


def build_zzxgcs_summary(rows: list[dict[str, Any]], refs: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    grouped: dict[str, dict[str, Any]] = {}

    for row in rows:
        address = point_zzxgcs(row)
        if not address:
            continue

        ref = refs.get(address, {})
        lat, lon = point_lat_lon(row)

        item = grouped.setdefault(address, {
            "id": address,
            "zzxgcs": address,
            "address": address,
            "words": words_for_address(address, row, ref),
            "country": point_country(row),
            "city": point_city(row),
            "language": clean(ref.get("language") or first(row, ("zzxgcs_data.language", "metadata.zzxgcs_language"))) or "en",
            "volume": clean(ref.get("volume") or first(row, ("zzxgcs_data.volume", "metadata.zzxgcs_volume"))) or "zzxgcs-v1",
            "version": clean(ref.get("version") or first(row, ("zzxgcs_data.version", "metadata.zzxgcs_version"))) or "1.0.0",
            "source": clean(ref.get("source") or first(row, ("zzxgcs_data.source", "metadata.zzxgcs_source"))) or "zzx-gcs-local-deterministic",
            "confidence": clean(ref.get("confidence") or first(row, ("zzxgcs_data.confidence", "metadata.zzxgcs_confidence"))) or "unknown",
            "color": clean(ref.get("color")) or "#e6a42b",
            "point_count": 0,
            "country_counts": {},
            "city_counts": {},
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

        item["point_count"] += 1
        inc(item["country_counts"], point_country(row))
        inc(item["city_counts"], point_city(row))
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

        node_address = point_address(row)
        if node_address:
            item["nodes"].append(node_address)

        if lat is not None and lon is not None:
            item["_coordinates"].append((lat, lon))

    addresses: dict[str, Any] = {}

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
        item["network_counts"] = sorted_counts(item["network_counts"])
        item["status_counts"] = sorted_counts(item["status_counts"])
        item["nodes"] = sorted(set(item["nodes"]))
        addresses[key] = item

    return {
        "schema": SCHEMA,
        "generated_at": utc_now(),
        "total_points": len(rows),
        "zzxgcs_address_count": len(addresses),
        "addresses": dict(sorted(addresses.items(), key=lambda pair: (-int(pair[1]["point_count"]), pair[0]))),
        "red_ring_semantics": {
            "sanctioned_zzxgcs_count": "ZZX-GCS cell contains nodes with red marker ring",
            "policy_restricted_zzxgcs_count": "ZZX-GCS cell contains nodes with red-orange marker ring",
            "threat_zzxgcs_count": "ZZX-GCS cell contains defensive threat-infrastructure matches",
        },
        "false_positive_control": {
            "threat_infrastructure": "defensive infrastructure correlation only",
            "threat_actor_labels": "explicit trusted metadata/feed labels only",
            "no_country_to_apt_inference": True,
        },
    }


def build_zzxgcs_layers(payload: Mapping[str, Any]) -> dict[str, Any]:
    addresses = payload.get("addresses", {})
    if not isinstance(addresses, Mapping):
        addresses = {}

    layers = []

    for address, item in addresses.items():
        if not isinstance(item, Mapping):
            continue

        security = item.get("security_counts", {})
        if not isinstance(security, Mapping):
            security = {}

        color = clean(item.get("color")) or "#e6a42b"
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
            "id": f"zzxgcs:{address}",
            "label": address,
            "kind": "zzxgcs-address-filter",
            "enabled": True,
            "visible": False,
            "color": color,
            "point_count": item.get("point_count", 0),
            "marker_ring": marker_ring,
            "table_badge": table_badge,
            "filter": {
                "type": "equals",
                "key": "map_zzxgcs",
                "value": address,
            },
        })

    return {
        "schema": "zzx-bitnodes-map-zzxgcs-address-layers-v4",
        "generated_at": utc_now(),
        "layers": sorted(layers, key=lambda item: (-int(item.get("point_count", 0) or 0), item["id"])),
    }


def annotate_points(rows: list[dict[str, Any]], zzxgcs_payload: Mapping[str, Any]) -> list[dict[str, Any]]:
    addresses = zzxgcs_payload.get("addresses", {})
    if not isinstance(addresses, Mapping):
        addresses = {}

    output = []

    for row in rows:
        item = dict(row)
        address = point_zzxgcs(item)
        ref = addresses.get(address, {})

        item["map_zzxgcs"] = address
        item["map_zzxgcs_label"] = address or "No ZZX-GCS address"
        item["map_zzxgcs_color"] = clean(ref.get("color")) or ("#e6a42b" if address else "#8c927e")
        item["map_zzxgcs_words"] = ref.get("words", [])
        item["map_zzxgcs_volume"] = clean(ref.get("volume")) or ""
        item["map_zzxgcs_version"] = clean(ref.get("version")) or ""
        item["map_zzxgcs_confidence"] = clean(ref.get("confidence")) or ""

        output.append(item)

    return output


def merge_zzxgcs_addresses(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    context = context or {}
    zzxgcs_dir = Path(context.get("zzxgcs_dir") or context.get("map_zzxgcs_dir") or DEFAULT_ZZXGCS_DIR)

    output = dict(payload)
    vectors_payload = dict(output.get("vectors", {}))
    rows = points(output)
    refs = load_zzxgcs_reference(zzxgcs_dir)

    raw_payload = build_zzxgcs_summary(rows, refs)
    annotated = annotate_points(rows, raw_payload)
    zzxgcs_payload = build_zzxgcs_summary(annotated, refs)
    zzxgcs_layers = build_zzxgcs_layers(zzxgcs_payload)

    if vectors_payload:
        vectors_payload["points"] = annotated
        vectors_payload.setdefault("vectors", {})
        if isinstance(vectors_payload["vectors"], dict):
            vectors_payload["vectors"]["points"] = annotated
        output["vectors"] = vectors_payload

    output["zzxgcs_addresses"] = zzxgcs_payload
    output["zzxgcs_address_layers"] = zzxgcs_layers

    settings = dict(output.get("settings", {}))
    settings["zzxgcs_addresses"] = {
        "url": "./data/map-zzxgcs-addresses.json",
        "layers_url": "./data/map-zzxgcs-address-layers.json",
        "zzxgcs_dir": str(zzxgcs_dir),
        "enabled": True,
        "user_selectable": True,
        "note": "ZZX-GCS values may be official ZZX-GCS list results, private-repo wordlist results, cached values, or deterministic local fallback values.",
    }
    output["settings"] = settings

    return output


def build(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    return merge_zzxgcs_addresses(payload, context)


def process(payload: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    return merge_zzxgcs_addresses(payload, context)


def build_standalone(
    *,
    vectors_path: Path,
    map_dir: Path,
    live_map_dir: Path,
    zzxgcs_dir: Path = DEFAULT_ZZXGCS_DIR,
    compact: bool = False,
) -> dict[str, Any]:
    vectors_payload = read_json(vectors_path, fallback={})
    if not isinstance(vectors_payload, dict):
        vectors_payload = {}

    payload = {
        "vectors": vectors_payload,
        "settings": read_json(map_dir / "data" / "map-settings.json", fallback={}),
    }

    merged = merge_zzxgcs_addresses(payload, {"zzxgcs_dir": str(zzxgcs_dir)})
    zzxgcs_payload = merged["zzxgcs_addresses"]
    zzxgcs_layers = merged["zzxgcs_address_layers"]
    updated_vectors = merged.get("vectors", vectors_payload)

    for directory in (map_dir, live_map_dir):
        data_dir = directory / "data"
        write_json(data_dir / "map-zzxgcs-addresses.json", zzxgcs_payload, compact=compact)
        write_json(data_dir / "map-zzxgcs-address-layers.json", zzxgcs_layers, compact=compact)
        write_json(data_dir / "map-vectors.json", updated_vectors, compact=compact)

        settings_path = data_dir / "map-settings.json"
        settings = read_json(settings_path, fallback={})
        if not isinstance(settings, dict):
            settings = {}

        settings["zzxgcs_addresses"] = merged["settings"]["zzxgcs_addresses"]
        write_json(settings_path, settings, compact=compact)

    return {
        "schema": "zzx-bitnodes-mapzzxgcsaddresses-build-report-v4",
        "generated_at": utc_now(),
        "vectors": str(vectors_path),
        "map_dir": str(map_dir),
        "live_map_dir": str(live_map_dir),
        "zzxgcs_dir": str(zzxgcs_dir),
        "zzxgcs_address_count": zzxgcs_payload.get("zzxgcs_address_count", 0),
        "total_points": zzxgcs_payload.get("total_points", 0),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build Bitnodes map ZZX-GCS summaries, security counters, filters, and ZZX-GCS-annotated vectors.",
        allow_abbrev=False,
    )

    parser.add_argument("--vectors", required=True)
    parser.add_argument("--map-dir", default=str(DEFAULT_MAP_DIR))
    parser.add_argument("--live-map-dir", default=str(DEFAULT_LIVE_MAP_DIR))
    parser.add_argument("--zzxgcs-dir", default=str(DEFAULT_ZZXGCS_DIR))
    parser.add_argument("--report", default="")
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    report = build_standalone(
        vectors_path=Path(args.vectors).resolve(),
        map_dir=Path(args.map_dir).resolve(),
        live_map_dir=Path(args.live_map_dir).resolve(),
        zzxgcs_dir=Path(args.zzxgcs_dir).resolve(),
        compact=args.compact,
    )

    if args.report:
        write_json(Path(args.report), report, compact=args.compact)

    print(
        "map zzxgcs addresses complete: "
        f"{report['zzxgcs_address_count']} addresses, "
        f"points={report['total_points']}, "
        f"map_dir={report['map_dir']}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
