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

    if "%" in value:
        value = value.split("%", 1)[0]

    return value.strip("[]")


def ipv6_metadata(address: str) -> dict[str, Any]:
    host = normalize_host(address)

    result = {
        "host": host,
        "is_ipv6": False,
        "ipv6": None,
        "is_public_ipv6": False,
        "is_private_ipv6": False,
        "is_loopback_ipv6": False,
        "is_link_local_ipv6": False,
        "is_reserved_ipv6": False,
        "is_multicast_ipv6": False,
        "is_site_local_ipv6": False,
        "exploded": None,
        "compressed": None,
    }

    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return result

    if ip.version != 6:
        return result

    result.update({
        "is_ipv6": True,
        "ipv6": ip.compressed,
        "is_public_ipv6": ip.is_global,
        "is_private_ipv6": ip.is_private,
        "is_loopback_ipv6": ip.is_loopback,
        "is_link_local_ipv6": ip.is_link_local,
        "is_reserved_ipv6": ip.is_reserved,
        "is_multicast_ipv6": ip.is_multicast,
        "is_site_local_ipv6": ip.is_site_local,
        "exploded": ip.exploded,
        "compressed": ip.compressed,
    })

    return result


def enrich_nodes(
    nodes: list[dict[str, Any]],
    context: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    for node in nodes:
        address = node.get("address") or node.get("node") or node.get("addr") or ""
        meta = ipv6_metadata(str(address))

        node["ipv6"] = meta
        node["is_ipv6"] = meta["is_ipv6"]
        node["is_public_ipv6"] = meta["is_public_ipv6"]

        if meta["is_ipv6"]:
            node["address_family"] = "ipv6"

        node.setdefault("enrichment", {})
        node["enrichment"]["ipv6"] = {
            "status": "ok",
            "updated_at": utc_now(),
        }

    return nodes


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with IPv6 classification metadata."
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
        payload["metadata"]["ipv6_enriched_at"] = utc_now()
        output = payload
    else:
        output = enriched

    write_json(Path(args.output), output)

    print(f"ipv6 enrichment complete: {len(enriched)} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
