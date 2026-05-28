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


def ipv4_metadata(address: str) -> dict[str, Any]:
    host = normalize_host(address)

    result = {
        "host": host,
        "is_ipv4": False,
        "ipv4": None,
        "is_public_ipv4": False,
        "is_private_ipv4": False,
        "is_loopback_ipv4": False,
        "is_link_local_ipv4": False,
        "is_reserved_ipv4": False,
        "is_multicast_ipv4": False,
    }

    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return result

    if ip.version != 4:
        return result

    result.update({
        "is_ipv4": True,
        "ipv4": ip.compressed,
        "is_public_ipv4": ip.is_global,
        "is_private_ipv4": ip.is_private,
        "is_loopback_ipv4": ip.is_loopback,
        "is_link_local_ipv4": ip.is_link_local,
        "is_reserved_ipv4": ip.is_reserved,
        "is_multicast_ipv4": ip.is_multicast,
    })

    return result


def enrich_nodes(
    nodes: list[dict[str, Any]],
    context: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    for node in nodes:
        address = node.get("address") or node.get("node") or node.get("addr") or ""
        meta = ipv4_metadata(str(address))

        node["ipv4"] = meta
        node["is_ipv4"] = meta["is_ipv4"]
        node["is_public_ipv4"] = meta["is_public_ipv4"]

        if meta["is_ipv4"]:
            node["address_family"] = "ipv4"

        node.setdefault("enrichment", {})
        node["enrichment"]["ipv4"] = {
            "status": "ok",
            "updated_at": utc_now(),
        }

    return nodes


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with IPv4 classification metadata."
    )

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
        payload["metadata"]["ipv4_enriched_at"] = utc_now()
        output = payload
    else:
        output = enriched

    write_json(Path(args.output), output)

    print(f"ipv4 enrichment complete: {len(enriched)} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
