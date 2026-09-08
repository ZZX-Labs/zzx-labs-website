#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import re
import time
from pathlib import Path
from typing import Any, Mapping

ROOT = Path(__file__).resolve().parents[2]
API = ROOT / "bitcoin" / "bitnodes" / "api"

NODE_FIELDS = (
    "network",
    "protocol_version",
    "user_agent",
    "height",
    "ip",
    "country",
    "country_code",
    "country_name",
    "country_flag",
    "region",
    "admin1_code",
    "county",
    "admin2_code",
    "city",
    "latitude",
    "longitude",
    "asn",
    "organization",
    "geo_source",
    "geo_confidence",
    "geo_available",
)


def text(value: Any) -> str:
    return str(value or "").strip()


def finite(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return math.nan
    return number if math.isfinite(number) else math.nan


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def deep_get(row: Mapping[str, Any], dotted: str) -> Any:
    cur: Any = row
    for part in dotted.split("."):
        if not isinstance(cur, Mapping):
            return None
        cur = cur.get(part)
    return cur


def first(row: Mapping[str, Any], *keys: str) -> Any:
    for key in keys:
        value = deep_get(row, key) if "." in key else row.get(key)
        if value not in (None, ""):
            return value
    return None


def list_value(value: Any, index: int) -> Any:
    return value[index] if isinstance(value, list) and len(value) > index else None


def flag(code: Any) -> str:
    iso = text(code).upper()
    if not re.fullmatch(r"[A-Z]{2}", iso):
        return ""
    return "".join(chr(127397 + ord(ch)) for ch in iso)


def network_from_address(address: str) -> str:
    value = text(address).lower()
    if ".onion" in value:
        return "tor"
    if ".i2p" in value or ".b32.i2p" in value:
        return "i2p"
    if value.startswith("[") and "]" in value:
        return "ipv6"
    host = value.rsplit(":", 1)[0] if value.count(":") == 1 else value
    if len(host.split(".")) == 4 and all(part.isdigit() for part in host.split(".")):
        return "ipv4"
    if ":" in host:
        return "ipv6"
    return "other"


def synthetic(row: Mapping[str, Any]) -> bool:
    values = [
        row.get("geoip_confidence"), row.get("geoip_source"),
        row.get("geo_confidence"), row.get("geo_source"),
        first(row, "geo_contract.source", "geo_contract.confidence"),
    ]
    joined = " ".join(str(value or "").lower() for value in values)
    return any(token in joined for token in ("synthetic", "deterministic-fallback", "workflow-map-ready-fallback"))


def valid_latlon(lat: Any, lon: Any) -> tuple[float | None, float | None]:
    lat_f = finite(lat)
    lon_f = finite(lon)
    if not math.isfinite(lat_f) or not math.isfinite(lon_f):
        return None, None
    if not (-90 <= lat_f <= 90 and -180 <= lon_f <= 180):
        return None, None
    return lat_f, lon_f


def node_from(address: str, value: Any) -> dict[str, Any]:
    obj = value if isinstance(value, Mapping) else {}

    user_agent = first(obj, "user_agent", "userAgent", "subversion", "agent") if obj else list_value(value, 1)
    protocol = finite(first(obj, "protocol_version", "protocolVersion", "version") if obj else list_value(value, 0))
    height = finite(first(obj, "height", "block_height", "latest_height") if obj else list_value(value, 4))

    country = text(first(
        obj,
        "country_code", "country", "geo_contract.country_code",
        "geo.country_code", "geo.country", "geoip.country_code", "location.country_code",
    ) if obj else list_value(value, 7)).upper()
    if not re.fullmatch(r"[A-Z]{2}", country):
        country = ""

    city = text(first(obj, "city", "geo_contract.city", "geo.city", "geoip.city", "location.city") if obj else list_value(value, 6))
    county = text(first(obj, "county", "county_name", "admin2", "geo_contract.county", "geo.county", "geoip.county", "location.county")) if obj else ""
    region = text(first(obj, "region", "region_name", "state", "geo_contract.region", "geo.region", "geoip.region", "location.region")) if obj else ""
    admin1 = text(first(obj, "admin1_code", "region_code", "state_code", "geo_contract.admin1_code", "geo.admin1_code", "geoip.admin1_code")) if obj else ""
    admin2 = text(first(obj, "admin2_code", "county_code", "district_code", "geo_contract.admin2_code", "geo.admin2_code", "geoip.admin2_code")) if obj else ""

    lat_raw = first(obj, "latitude", "lat", "geo_contract.latitude", "geo.latitude", "geoip.latitude", "geoloc.latitude", "location.latitude") if obj else list_value(value, 8)
    lon_raw = first(obj, "longitude", "lon", "lng", "geo_contract.longitude", "geo.longitude", "geoip.longitude", "geoloc.longitude", "location.longitude") if obj else list_value(value, 9)
    lat, lon = valid_latlon(lat_raw, lon_raw)
    if obj and synthetic(obj):
        lat, lon = None, None

    geo_available = bool(country)
    if isinstance(obj.get("geo_contract"), Mapping):
        geo_available = bool(obj["geo_contract"].get("country_available"))

    asn = text(first(obj, "asn", "geo_contract.asn", "geo.asn", "geoip.asn")) if obj else text(list_value(value, 11))
    organization = text(first(obj, "organization", "org", "isp", "geo.organization", "geoip.organization")) if obj else text(list_value(value, 12))

    return {
        "address": text(address),
        "network": text(obj.get("network")) if obj else network_from_address(address),
        "protocol_version": int(protocol) if math.isfinite(protocol) else None,
        "user_agent": text(user_agent) or None,
        "height": int(height) if math.isfinite(height) else None,
        "ip": text(first(obj, "ip", "geo_contract.ip")) or None if obj else None,
        "country": country or None,
        "country_code": country or None,
        "country_name": text(first(obj, "country_name", "geo_contract.country_name", "geo.country_name", "geoip.country_name")) or None if obj else None,
        "country_flag": text(first(obj, "country_flag", "geo_contract.country_flag")) or flag(country) if obj else flag(country),
        "region": region or None,
        "admin1_code": admin1 or None,
        "county": county or None,
        "admin2_code": admin2 or None,
        "city": city or None,
        "latitude": lat,
        "longitude": lon,
        "asn": asn or None,
        "organization": organization or None,
        "geo_source": text(first(obj, "geo_source", "geo_contract.source", "geoip_source")) or None if obj else None,
        "geo_confidence": text(first(obj, "geo_confidence", "geoip_confidence")) or None if obj else None,
        "geo_available": geo_available,
    }


def node_rows(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, Mapping):
        return []
    raw = payload.get("nodes")
    out: list[dict[str, Any]] = []
    if isinstance(raw, Mapping):
        for address, value in raw.items():
            row = node_from(str(address), value)
            if row["address"]:
                out.append(row)
    elif isinstance(raw, list):
        for value in raw:
            if isinstance(value, Mapping):
                address = text(value.get("address") or value.get("addr") or value.get("endpoint") or value.get("host") or value.get("node"))
                if address:
                    out.append(node_from(address, value))
            elif isinstance(value, list) and value:
                address = text(value[0])
                if address:
                    out.append(node_from(address, value[1:]))
    return out


def richness(row: Mapping[str, Any]) -> int:
    score = sum(1 for key in NODE_FIELDS if row.get(key) not in (None, ""))
    score += 6 if row.get("country") else 0
    score += 4 if row.get("city") else 0
    score += 5 if row.get("county") and row.get("admin2_code") else 0
    score += 5 if row.get("latitude") is not None and row.get("longitude") is not None else 0
    return score


def merge_node(current: dict[str, Any] | None, incoming: dict[str, Any], source: str) -> dict[str, Any]:
    if current is None:
        out = dict(incoming)
        out["sources"] = [source]
        return out
    out = dict(current)
    incoming_richer = richness(incoming) > richness(out)
    for key in NODE_FIELDS:
        old = out.get(key)
        new = incoming.get(key)
        if new in (None, ""):
            continue
        if old in (None, "") or incoming_richer:
            out[key] = new
    out["sources"] = list(dict.fromkeys([*(out.get("sources") or []), source]))
    return out


def declared(payload: Mapping[str, Any], *names: str) -> int | None:
    for name in names:
        number = finite(payload.get(name))
        if math.isfinite(number) and number >= 0:
            return int(number)
    return None


def build(inputs: list[tuple[str, Path]]) -> dict[str, Any]:
    merged: dict[str, dict[str, Any]] = {}
    source_counts: dict[str, int] = {}
    source_meta: list[dict[str, Any]] = []
    declared_reachable: list[int] = []
    declared_total: list[int] = []
    declared_heights: list[int] = []
    updated_values: list[int] = []

    for source, path in inputs:
        payload = read_json(path)
        if not isinstance(payload, Mapping):
            raise RuntimeError(f"{source}: {path} is not a JSON object")
        rows = node_rows(payload)
        if not rows:
            raise RuntimeError(f"{source}: {path} contains no usable nodes")
        source_counts[source] = len(rows)
        source_meta.append({"source": source, "path": str(path), "node_rows": len(rows)})

        for value, target in (
            (declared(payload, "reachable_nodes", "reachable", "node_count"), declared_reachable),
            (declared(payload, "total_nodes", "total", "reachable_nodes", "node_count"), declared_total),
            (declared(payload, "latest_height", "height", "block_height"), declared_heights),
        ):
            if value is not None:
                target.append(value)

        stamp = finite(payload.get("updated_ms") or payload.get("timestamp") or payload.get("generated_at"))
        if math.isfinite(stamp):
            if 0 < stamp < 1e11:
                stamp *= 1000
            updated_values.append(int(stamp))

        for row in rows:
            merged[row["address"]] = merge_node(merged.get(row["address"]), row, source)

    nodes = sorted(merged.values(), key=lambda row: row["address"])
    by_network: dict[str, int] = {}
    by_version: dict[str, int] = {}
    by_nation: dict[str, int] = {}
    by_city: dict[str, int] = {}
    by_county: dict[str, int] = {}
    heights: list[int] = []

    def inc(mapping: dict[str, int], key: str) -> None:
        mapping[key] = mapping.get(key, 0) + 1

    geo_counts = {"country": 0, "city": 0, "county": 0, "coordinates": 0}

    for node in nodes:
        inc(by_network, text(node.get("network")) or "unknown")
        inc(by_version, text(node.get("user_agent")) or "Unknown")
        country = text(node.get("country")).upper()
        city = text(node.get("city"))
        county = text(node.get("county"))
        region = text(node.get("region"))
        admin2 = text(node.get("admin2_code"))

        if re.fullmatch(r"[A-Z]{2}", country):
            inc(by_nation, country)
            geo_counts["country"] += 1
            if city:
                inc(by_city, f"{city}, {country}")
                geo_counts["city"] += 1
            if county and admin2:
                inc(by_county, ", ".join(value for value in (county, region, country) if value))
                geo_counts["county"] += 1
        if node.get("latitude") is not None and node.get("longitude") is not None:
            geo_counts["coordinates"] += 1
        if isinstance(node.get("height"), int):
            heights.append(node["height"])

    observed = len(nodes)
    reachable = max([observed, *declared_reachable]) if observed else (max(declared_reachable) if declared_reachable else 0)
    total = max([reachable, *declared_total]) if reachable else (max(declared_total) if declared_total else observed)
    latest_height = max([*declared_heights, *heights]) if declared_heights or heights else None
    updated_ms = max(updated_values) if updated_values else int(time.time() * 1000)

    return {
        "schema": "zzx-bitnodes-canonical-v2",
        "source": "zzx-canonical",
        "sources": [source for source, _ in inputs],
        "source_counts": source_counts,
        "source_meta": source_meta,
        "reachable_nodes": reachable,
        "total_nodes": total,
        "node_count": observed,
        "latest_height": latest_height,
        "updated_ms": updated_ms,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(updated_ms / 1000)),
        "nodes": nodes,
        "by_network": by_network,
        "by_version": by_version,
        "by_nation": by_nation,
        "by_city": by_city,
        "by_county": by_county,
        "geolocation": geo_counts,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Merge normalized Bitnodes sources into one canonical widget/map snapshot.")
    parser.add_argument("--input", action="append", default=[], help="SOURCE=PATH; may be repeated")
    parser.add_argument("--output", default=str(API / "snapshots" / "latest.json"))
    parser.add_argument("--aggregate-output", default=str(API / "aggregate" / "canonical" / "latest.json"))
    parser.add_argument("--compact", action="store_true")
    args = parser.parse_args()

    inputs: list[tuple[str, Path]] = []
    for spec in args.input:
        if "=" not in spec:
            raise SystemExit(f"invalid --input {spec!r}; expected SOURCE=PATH")
        source, raw_path = spec.split("=", 1)
        path = Path(raw_path).resolve()
        if not source.strip() or not path.is_file():
            raise SystemExit(f"invalid source input: {spec}")
        inputs.append((source.strip(), path))
    if not inputs:
        raise SystemExit("at least one --input SOURCE=PATH is required")

    payload = build(inputs)
    output = Path(args.output)
    aggregate_output = Path(args.aggregate_output)
    output.parent.mkdir(parents=True, exist_ok=True)
    aggregate_output.parent.mkdir(parents=True, exist_ok=True)
    kwargs = {"ensure_ascii": False, "separators": (",", ":")} if args.compact else {"ensure_ascii": False, "indent": 2}
    output.write_text(json.dumps(payload, **kwargs) + "\n", encoding="utf-8")
    aggregate = {key: value for key, value in payload.items() if key != "nodes"}
    aggregate_output.write_text(json.dumps(aggregate, **kwargs) + "\n", encoding="utf-8")
    print(json.dumps({
        "output": str(output),
        "sources": payload["sources"],
        "node_count": payload["node_count"],
        "reachable_nodes": payload["reachable_nodes"],
        "latest_height": payload["latest_height"],
        "geolocation": payload["geolocation"],
    }))


if __name__ == "__main__":
    main()
