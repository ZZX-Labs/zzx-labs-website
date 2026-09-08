#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
API = ROOT / "bitcoin" / "bitnodes" / "api"

NODE_FIELDS = (
    "network",
    "protocol_version",
    "user_agent",
    "height",
    "city",
    "county",
    "region",
    "country",
    "latitude",
    "longitude",
    "asn",
    "organization",
)


def text(value: Any) -> str:
    return str(value or "").strip()


def finite(value: Any) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return math.nan
    return n if math.isfinite(n) else math.nan


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def list_value(value: Any, index: int) -> Any:
    return value[index] if isinstance(value, list) and len(value) > index else None


def network_from_address(address: str) -> str:
    s = text(address).lower()
    if ".onion" in s:
        return "tor"
    if ".i2p" in s or ".b32.i2p" in s:
        return "i2p"
    if ".cjdns" in s:
        return "cjdns"
    if s.startswith("[") and "]" in s:
        return "ipv6"
    host = s.rsplit(":", 1)[0] if s.count(":") == 1 else s
    parts = host.split(".")
    if len(parts) == 4 and all(part.isdigit() for part in parts):
        return "ipv4"
    if ":" in host:
        return "ipv6"
    return "other"


def node_from(address: str, value: Any) -> dict[str, Any]:
    obj = value if isinstance(value, dict) else {}
    geo = obj.get("geo") if isinstance(obj.get("geo"), dict) else {}
    geoip = obj.get("geoip") if isinstance(obj.get("geoip"), dict) else {}
    geoloc = obj.get("geoloc") if isinstance(obj.get("geoloc"), dict) else {}
    location = obj.get("location") if isinstance(obj.get("location"), dict) else {}

    def first(*values: Any) -> Any:
        for item in values:
            if item not in (None, ""):
                return item
        return None

    ua = first(
        obj.get("user_agent"),
        obj.get("userAgent"),
        obj.get("subversion"),
        obj.get("agent"),
        list_value(value, 1),
    )
    protocol = finite(first(
        obj.get("protocol_version"),
        obj.get("protocolVersion"),
        obj.get("version"),
        list_value(value, 0),
    ))
    height = finite(first(
        obj.get("height"),
        obj.get("block_height"),
        obj.get("latest_height"),
        list_value(value, 4),
    ))
    city = text(first(obj.get("city"), geo.get("city"), geoip.get("city"), geoloc.get("city"), location.get("city"), list_value(value, 6)))
    country = text(first(
        obj.get("country"), obj.get("country_code"), obj.get("countryCode"),
        geo.get("country"), geo.get("country_code"),
        geoip.get("country"), geoip.get("country_code"),
        geoloc.get("country"), geoloc.get("country_code"),
        location.get("country"), location.get("country_code"),
        list_value(value, 7),
    )).upper()
    county = text(first(
        obj.get("county"), obj.get("admin2"),
        geo.get("county"), geo.get("admin2"),
        geoip.get("county"), geoip.get("admin2"),
        geoloc.get("county"), geoloc.get("admin2"),
        location.get("county"), location.get("admin2"),
    ))
    region = text(first(
        obj.get("region"), obj.get("state"), obj.get("admin1"),
        geo.get("region"), geo.get("state"), geo.get("admin1"),
        geoip.get("region"), geoip.get("state"), geoip.get("admin1"),
        geoloc.get("region"), geoloc.get("state"), geoloc.get("admin1"),
        location.get("region"), location.get("state"), location.get("admin1"),
    ))
    lat = finite(first(
        obj.get("latitude"), obj.get("lat"),
        geo.get("latitude"), geo.get("lat"),
        geoip.get("latitude"), geoip.get("lat"),
        geoloc.get("latitude"), geoloc.get("lat"),
        location.get("latitude"), location.get("lat"),
        list_value(value, 8),
    ))
    lon = finite(first(
        obj.get("longitude"), obj.get("lon"), obj.get("lng"),
        geo.get("longitude"), geo.get("lon"), geo.get("lng"),
        geoip.get("longitude"), geoip.get("lon"), geoip.get("lng"),
        geoloc.get("longitude"), geoloc.get("lon"), geoloc.get("lng"),
        location.get("longitude"), location.get("lon"), location.get("lng"),
        list_value(value, 9),
    ))
    asn = text(first(obj.get("asn"), obj.get("as_number"), geo.get("asn"), geoip.get("asn"), list_value(value, 11)))
    org = text(first(
        obj.get("organization"), obj.get("org"), obj.get("isp"),
        geo.get("organization"), geoip.get("organization"),
        geoloc.get("organization"), location.get("organization"),
        list_value(value, 12),
    ))

    return {
        "address": text(address),
        "network": text(obj.get("network")) or network_from_address(address),
        "protocol_version": int(protocol) if math.isfinite(protocol) else None,
        "user_agent": text(ua) or None,
        "height": int(height) if math.isfinite(height) else None,
        "city": city or None,
        "county": county or None,
        "region": region or None,
        "country": country or None,
        "latitude": lat if math.isfinite(lat) else None,
        "longitude": lon if math.isfinite(lon) else None,
        "asn": asn or None,
        "organization": org or None,
    }


def node_rows(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    raw = payload.get("nodes")
    out: list[dict[str, Any]] = []
    if isinstance(raw, dict):
        for address, value in raw.items():
            row = node_from(address, value)
            if row["address"]:
                out.append(row)
    elif isinstance(raw, list):
        for value in raw:
            if isinstance(value, dict):
                address = text(value.get("address") or value.get("addr") or value.get("endpoint") or value.get("host") or value.get("node"))
                if address:
                    out.append(node_from(address, value))
            elif isinstance(value, list) and value:
                address = text(value[0])
                if address:
                    out.append(node_from(address, value[1:]))
    return out


def richness(row: dict[str, Any]) -> int:
    score = 0
    for key in NODE_FIELDS:
        value = row.get(key)
        if value not in (None, ""):
            score += 1
    if row.get("country"):
        score += 3
    if row.get("city"):
        score += 2
    if row.get("county"):
        score += 2
    if row.get("latitude") is not None and row.get("longitude") is not None:
        score += 3
    return score


def merge_node(current: dict[str, Any] | None, incoming: dict[str, Any], source: str) -> dict[str, Any]:
    if current is None:
        out = dict(incoming)
        out["sources"] = [source]
        return out

    out = dict(current)
    sources = list(dict.fromkeys([*(out.get("sources") or []), source]))
    incoming_is_richer = richness(incoming) > richness(out)

    for key in NODE_FIELDS:
        old = out.get(key)
        new = incoming.get(key)
        if new in (None, ""):
            continue
        if old in (None, "") or incoming_is_richer:
            out[key] = new

    out["sources"] = sources
    return out


def declared(payload: dict[str, Any], *names: str) -> int | None:
    for name in names:
        n = finite(payload.get(name))
        if math.isfinite(n) and n >= 0:
            return int(n)
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
        if not isinstance(payload, dict):
            raise RuntimeError(f"{source}: {path} is not a JSON object")
        rows = node_rows(payload)
        if not rows:
            raise RuntimeError(f"{source}: {path} contains no usable nodes")

        source_counts[source] = len(rows)
        source_meta.append({"source": source, "path": str(path), "node_rows": len(rows)})

        r = declared(payload, "reachable_nodes", "reachable", "node_count")
        t = declared(payload, "total_nodes", "total", "reachable_nodes", "node_count")
        h = declared(payload, "latest_height", "height", "block_height")
        if r is not None:
            declared_reachable.append(r)
        if t is not None:
            declared_total.append(t)
        if h is not None:
            declared_heights.append(h)

        stamp = finite(payload.get("updated_ms") or payload.get("timestamp") or payload.get("generated_at"))
        if math.isfinite(stamp):
            if 0 < stamp < 1e11:
                stamp *= 1000
            updated_values.append(int(stamp))

        for row in rows:
            address = row["address"]
            merged[address] = merge_node(merged.get(address), row, source)

    nodes = sorted(merged.values(), key=lambda row: row["address"])

    by_network: dict[str, int] = {}
    by_version: dict[str, int] = {}
    by_nation: dict[str, int] = {}
    by_city: dict[str, int] = {}
    by_county: dict[str, int] = {}
    heights: list[int] = []

    def inc(mapping: dict[str, int], key: str | None) -> None:
        label = text(key) or "Unknown"
        mapping[label] = mapping.get(label, 0) + 1

    for node in nodes:
        inc(by_network, node.get("network"))
        inc(by_version, node.get("user_agent") or "Unknown")
        country = text(node.get("country")).upper()
        city = text(node.get("city"))
        county = text(node.get("county"))
        region = text(node.get("region"))
        if country:
            inc(by_nation, country)
        if city:
            inc(by_city, f"{city}, {country}" if country else city)
        if county:
            inc(by_county, ", ".join(x for x in (county, region, country) if x))
        if isinstance(node.get("height"), int):
            heights.append(node["height"])

    observed = len(nodes)
    reachable = max([observed, *declared_reachable]) if observed else (max(declared_reachable) if declared_reachable else 0)
    total = max([reachable, *declared_total]) if reachable else (max(declared_total) if declared_total else observed)
    latest_height = max([*declared_heights, *heights]) if declared_heights or heights else None
    updated_ms = max(updated_values) if updated_values else int(time.time() * 1000)

    return {
        "schema": "zzx-bitnodes-canonical-v1",
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
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Merge enriched ZZX and btcnodes.io node sources into one canonical widget snapshot")
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
        source = source.strip()
        path = Path(raw_path).resolve()
        if not source or not path.is_file():
            raise SystemExit(f"invalid source input: {spec}")
        inputs.append((source, path))

    if not inputs:
        raise SystemExit("at least one --input SOURCE=PATH is required")

    payload = build(inputs)
    output = Path(args.output)
    aggregate_output = Path(args.aggregate_output)
    output.parent.mkdir(parents=True, exist_ok=True)
    aggregate_output.parent.mkdir(parents=True, exist_ok=True)

    kwargs = {"ensure_ascii": False, "separators": (",", ":")} if args.compact else {"ensure_ascii": False, "indent": 2}
    output.write_text(json.dumps(payload, **kwargs) + "\n", encoding="utf-8")

    aggregate = {k: v for k, v in payload.items() if k != "nodes"}
    aggregate_output.write_text(json.dumps(aggregate, **kwargs) + "\n", encoding="utf-8")

    print(json.dumps({
        "output": str(output),
        "sources": payload["sources"],
        "node_count": payload["node_count"],
        "reachable_nodes": payload["reachable_nodes"],
        "latest_height": payload["latest_height"],
    }))


if __name__ == "__main__":
    main()
