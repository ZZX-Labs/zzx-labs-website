#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ipaddress
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    if not path.exists():
        return fallback

    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    if compact:
        text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    else:
        text = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True)

    path.write_text(text + "\n", encoding="utf-8")


def normalize_host(address: Any) -> str:
    value = str(address or "").strip()

    if not value:
        return ""

    if value.startswith("[") and "]" in value:
        return value[1:value.index("]")]

    lower = value.lower()

    if ".onion:" in lower or ".i2p:" in lower:
        return value.rsplit(":", 1)[0].strip("[]")

    if lower.endswith(".onion") or lower.endswith(".i2p"):
        return value.strip("[]")

    if value.count(":") == 1 and "." in value:
        host, port_text = value.rsplit(":", 1)

        if port_text.isdigit():
            return host.strip("[]")

    return value.strip("[]")


def node_address(node: Mapping[str, Any]) -> str:
    return str(
        node.get("address")
        or node.get("node")
        or node.get("addr")
        or node.get("host")
        or node.get("hostname")
        or node.get("ip")
        or node.get("id")
        or ""
    )


def ipv4_metadata(address: Any) -> dict[str, Any]:
    host = normalize_host(address)

    result = {
        "schema": "zzx-bitnodes-ipv4-v2",
        "host": host,
        "is_ipv4": False,
        "ipv4": None,
        "is_public_ipv4": False,
        "is_private_ipv4": False,
        "is_loopback_ipv4": False,
        "is_link_local_ipv4": False,
        "is_reserved_ipv4": False,
        "is_multicast_ipv4": False,
        "is_unspecified_ipv4": False,
        "is_global_ipv4": False,
        "updated_at": utc_now(),
    }

    if host.endswith(".onion") or host.endswith(".i2p"):
        return result

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
        "is_unspecified_ipv4": ip.is_unspecified,
        "is_global_ipv4": ip.is_global,
    })

    return result


def enrich_node(node: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    address = node_address(node)
    meta = ipv4_metadata(address)

    node["ipv4"] = meta
    node["is_ipv4"] = meta["is_ipv4"]
    node["is_public_ipv4"] = meta["is_public_ipv4"]

    if meta["is_ipv4"]:
        node["address_family"] = "ipv4"
        node["network"] = "ipv4"

    elif node.get("network") == "ipv4":
        node["network"] = ""

    node.setdefault("enrichment", {})
    node["enrichment"]["ipv4"] = {
        "schema": "zzx-bitnodes-ipv4-v2",
        "status": "ok",
        "updated_at": utc_now(),
    }

    return node


def enrich_nodes(
    nodes: Any,
    context: dict[str, Any] | None = None,
) -> Any:
    if isinstance(nodes, list):
        return [
            enrich_node(dict(node))
            if isinstance(node, Mapping)
            else node
            for node in nodes
        ]

    if isinstance(nodes, dict):
        return {
            key: enrich_node(dict(value))
            if isinstance(value, Mapping)
            else value
            for key, value in nodes.items()
        }

    return nodes


def enrich_payload(
    payload: Any,
    context: dict[str, Any] | None = None,
) -> Any:
    if isinstance(payload, list):
        return enrich_nodes(payload, context)

    if not isinstance(payload, MutableMapping):
        return payload

    if isinstance(payload.get("nodes"), (list, dict)):
        payload["nodes"] = enrich_nodes(payload["nodes"], context)

    if isinstance(payload.get("results"), list):
        payload["results"] = enrich_nodes(payload["results"], context)

    if isinstance(payload.get("data"), list):
        payload["data"] = enrich_nodes(payload["data"], context)

    payload.setdefault("metadata", {})
    payload["metadata"]["ipv4_enriched_at"] = utc_now()

    return payload


def iter_nodes(payload: Any) -> list[Mapping[str, Any]]:
    if isinstance(payload, list):
        return [node for node in payload if isinstance(node, Mapping)]

    if not isinstance(payload, Mapping):
        return []

    nodes = payload.get("nodes")

    if isinstance(nodes, list):
        return [node for node in nodes if isinstance(node, Mapping)]

    if isinstance(nodes, dict):
        return [node for node in nodes.values() if isinstance(node, Mapping)]

    for key in ("results", "data"):
        value = payload.get(key)

        if isinstance(value, list):
            return [node for node in value if isinstance(node, Mapping)]

    return []


def summarize(nodes: list[Mapping[str, Any]]) -> dict[str, Any]:
    ipv4_nodes = [
        node for node in nodes
        if node.get("is_ipv4") or node.get("ipv4", {}).get("is_ipv4")
    ]

    public_nodes = [
        node for node in ipv4_nodes
        if node.get("ipv4", {}).get("is_public_ipv4")
    ]

    private_nodes = [
        node for node in ipv4_nodes
        if node.get("ipv4", {}).get("is_private_ipv4")
    ]

    return {
        "schema": "zzx-bitnodes-ipv4-summary-v2",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "ipv4_nodes": len(ipv4_nodes),
        "public_ipv4_nodes": len(public_nodes),
        "private_ipv4_nodes": len(private_nodes),
        "non_ipv4_nodes": max(0, len(nodes) - len(ipv4_nodes)),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with IPv4 classification metadata."
    )

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary", default="")
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    payload = read_json(Path(args.input), fallback={})
    enriched = enrich_payload(payload)

    write_json(Path(args.output), enriched, compact=args.compact)

    if args.summary:
        write_json(Path(args.summary), summarize(iter_nodes(enriched)), compact=args.compact)

    print(f"ipv4 enrichment complete: {len(iter_nodes(enriched))} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
