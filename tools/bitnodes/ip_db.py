#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ipaddress
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


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


def normalize_host(address: str) -> str:
    value = str(address or "").strip()

    if not value:
        return ""

    if value.startswith("[") and "]" in value:
        return value[1:value.index("]")]

    if ".onion" in value.lower() or ".i2p" in value.lower():
        return value.split(":")[0].strip("[]")

    if value.count(":") == 1 and "." in value:
        return value.rsplit(":", 1)[0]

    return value.strip("[]")


def classify_ip(address: str) -> dict[str, Any]:
    host = normalize_host(address)
    result = {
        "host": host,
        "is_ip": False,
        "ip_version": None,
        "is_private": False,
        "is_loopback": False,
        "is_reserved": False,
        "is_multicast": False,
        "is_global": False,
        "is_link_local": False,
    }

    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return result

    result.update({
        "is_ip": True,
        "ip_version": ip.version,
        "is_private": ip.is_private,
        "is_loopback": ip.is_loopback,
        "is_reserved": ip.is_reserved,
        "is_multicast": ip.is_multicast,
        "is_global": ip.is_global,
        "is_link_local": ip.is_link_local,
        "compressed": ip.compressed,
        "exploded": ip.exploded,
    })

    return result


def enrich_nodes(nodes: list[dict[str, Any]], context: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    for node in nodes:
        address = node.get("address") or node.get("node") or node.get("addr") or ""
        ip_data = classify_ip(str(address))

        node["ip"] = ip_data
        node["host"] = ip_data.get("host") or normalize_host(str(address))
        node["is_ip"] = ip_data["is_ip"]
        node["ip_version"] = ip_data["ip_version"]

        node.setdefault("enrichment", {})
        node["enrichment"]["ip_db"] = {
            "status": "ok",
            "updated_at": utc_now(),
        }

    return nodes


def main() -> int:
    parser = argparse.ArgumentParser(description="Enrich Bitnodes records with normalized IP metadata.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)

    args = parser.parse_args()

    payload = read_json(Path(args.input), fallback={})
    nodes = payload.get("nodes", payload if isinstance(payload, list) else [])

    if not isinstance(nodes, list):
        nodes = []

    enriched = enrich_nodes(nodes)

    if isinstance(payload, dict):
        payload["nodes"] = enriched
        payload.setdefault("metadata", {})
        payload["metadata"]["ip_db_enriched_at"] = utc_now()
        output = payload
    else:
        output = enriched

    write_json(Path(args.output), output)

    print(f"ip_db enrichment complete: {len(enriched)} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
