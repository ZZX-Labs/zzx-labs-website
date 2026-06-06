#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import ipaddress
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


SCHEMA = "zzx-bitnodes-ipv6-v3"
CJDNS_NET = ipaddress.ip_network("fc00::/8")


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    try:
        if not path.exists():
            return fallback

        if path.suffix == ".gz":
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
        )
        + "\n",
        encoding="utf-8",
    )


def deep_get(row: Mapping[str, Any], key: str) -> Any:
    cur: Any = row

    for part in key.split("."):
        if not isinstance(cur, Mapping):
            return None
        cur = cur.get(part)

    return cur


def first_value(row: Mapping[str, Any], *keys: str) -> Any:
    for key in keys:
        value = deep_get(row, key) if "." in key else row.get(key)
        if value not in ("", None):
            return value
    return None


def boolish(value: Any) -> bool:
    if isinstance(value, bool):
        return value

    if value in (1, "1"):
        return True

    if value in (0, "0"):
        return False

    return str(value or "").strip().lower() in {
        "true",
        "yes",
        "y",
        "ok",
        "up",
        "online",
        "reachable",
        "success",
        "connected",
        "on",
    }


def normalize_host(address: Any) -> str:
    value = str(address or "").strip()

    if not value:
        return ""

    if value.startswith("[") and "]" in value:
        value = value[1:value.index("]")]

    lower = value.lower()

    if ".onion:" in lower or ".i2p:" in lower:
        return value.rsplit(":", 1)[0].strip("[]").lower()

    if lower.endswith(".onion") or lower.endswith(".i2p"):
        return value.strip("[]").lower()

    if "%" in value:
        value = value.split("%", 1)[0]

    if value.count(":") > 1:
        possible_host, possible_port = value.rsplit(":", 1)

        if possible_port.isdigit():
            try:
                ipaddress.ip_address(possible_host.strip("[]"))
                return possible_host.strip("[]").lower()
            except ValueError:
                pass

    return value.strip("[]").lower()


def node_address(node: Mapping[str, Any]) -> str:
    return str(
        first_value(
            node,
            "address",
            "canonical_address",
            "node",
            "addr",
            "host",
            "hostname",
            "ip",
            "metadata.canonical_address",
            "metadata.address",
            "metadata.host",
        )
        or ""
    )


def parse_ipv6(host_or_address: Any) -> ipaddress.IPv6Address | None:
    host = normalize_host(host_or_address)

    if not host or host.endswith(".onion") or host.endswith(".i2p"):
        return None

    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return None

    if not isinstance(ip, ipaddress.IPv6Address):
        return None

    return ip


def ipv6_metadata(address: Any) -> dict[str, Any]:
    host = normalize_host(address)
    ip = parse_ipv6(host)

    result = {
        "schema": SCHEMA,
        "host": host,
        "is_ipv6": False,
        "ipv6": None,
        "reverse_pointer": None,
        "packed_hex": None,
        "integer": None,
        "is_public_ipv6": False,
        "is_private_ipv6": False,
        "is_loopback_ipv6": False,
        "is_link_local_ipv6": False,
        "is_reserved_ipv6": False,
        "is_multicast_ipv6": False,
        "is_site_local_ipv6": False,
        "is_global_ipv6": False,
        "is_cjdns_ipv6": False,
        "exploded": None,
        "compressed": None,
        "updated_at": utc_now(),
    }

    if ip is None:
        return result

    result.update(
        {
            "is_ipv6": True,
            "ipv6": ip.compressed,
            "reverse_pointer": ip.reverse_pointer,
            "packed_hex": ip.packed.hex(),
            "integer": int(ip),
            "is_public_ipv6": ip.is_global,
            "is_private_ipv6": ip.is_private,
            "is_loopback_ipv6": ip.is_loopback,
            "is_link_local_ipv6": ip.is_link_local,
            "is_reserved_ipv6": ip.is_reserved,
            "is_multicast_ipv6": ip.is_multicast,
            "is_site_local_ipv6": ip.is_site_local,
            "is_global_ipv6": ip.is_global,
            "is_cjdns_ipv6": ip in CJDNS_NET,
            "exploded": ip.exploded,
            "compressed": ip.compressed,
        }
    )

    return result


def ensure_blocks(node: MutableMapping[str, Any]) -> tuple[MutableMapping[str, Any], MutableMapping[str, Any]]:
    metadata = node.get("metadata")
    if not isinstance(metadata, MutableMapping):
        metadata = {}
        node["metadata"] = metadata

    enrichment = node.get("enrichment")
    if not isinstance(enrichment, MutableMapping):
        enrichment = {}
        node["enrichment"] = enrichment

    return metadata, enrichment


def enrich_node(node: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    address = node_address(node)
    host = normalize_host(first_value(node, "host", "hostname", "metadata.host") or address)
    meta = ipv6_metadata(host or address)

    metadata, enrichment = ensure_blocks(node)

    node["ipv6"] = meta
    node["host"] = host or meta["host"]
    node["is_ipv6"] = meta["is_ipv6"]
    node["is_public_ipv6"] = meta["is_public_ipv6"]
    node["is_private_ipv6"] = meta["is_private_ipv6"]
    node["is_cjdns"] = meta["is_cjdns_ipv6"]

    metadata["ipv6"] = meta
    metadata["is_ipv6"] = meta["is_ipv6"]
    metadata["is_public_ipv6"] = meta["is_public_ipv6"]
    metadata["is_private_ipv6"] = meta["is_private_ipv6"]
    metadata["is_cjdns"] = meta["is_cjdns_ipv6"]

    if meta["is_ipv6"]:
        network = "cjdns" if meta["is_cjdns_ipv6"] else "ipv6"
        node["address_family"] = "ipv6"
        node["network"] = network
        metadata["network"] = network
        metadata["address_family"] = "ipv6"
    elif node.get("network") in {"ipv6", "cjdns"}:
        node["network"] = metadata.get("network") if metadata.get("network") not in {"ipv6", "cjdns"} else ""

    enrichment["ipv6"] = {
        "schema": SCHEMA,
        "status": "ok",
        "updated_at": utc_now(),
        "is_ipv6": meta["is_ipv6"],
        "is_cjdns": meta["is_cjdns_ipv6"],
    }

    return node


def enrich_nodes(nodes: Any, context: dict[str, Any] | None = None) -> Any:
    if isinstance(nodes, list):
        return [
            enrich_node(dict(node)) if isinstance(node, Mapping) else node
            for node in nodes
        ]

    if isinstance(nodes, Mapping):
        return {
            key: enrich_node(dict(value)) if isinstance(value, Mapping) else value
            for key, value in nodes.items()
        }

    return nodes


def extract_nodes(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [dict(node) for node in payload if isinstance(node, Mapping)]

    if not isinstance(payload, Mapping):
        return []

    nodes = payload.get("nodes")

    if isinstance(nodes, list):
        return [dict(node) for node in nodes if isinstance(node, Mapping)]

    if isinstance(nodes, Mapping):
        output = []

        for address, value in nodes.items():
            if isinstance(value, Mapping):
                output.append({"address": str(address), **dict(value)})
            elif isinstance(value, list):
                padded = list(value) + [None] * max(0, 20 - len(value))
                metadata = padded[19] if isinstance(padded[19], Mapping) else {}
                output.append(
                    {
                        "address": str(address),
                        "protocol": padded[0],
                        "agent": padded[1],
                        "height": padded[4],
                        "hostname": padded[5],
                        "city": padded[6],
                        "country": padded[7],
                        "latitude": padded[8],
                        "longitude": padded[9],
                        "timezone": padded[10],
                        "asn": padded[11],
                        "organization": padded[12],
                        "provider": padded[13],
                        "metadata": dict(metadata),
                    }
                )

        return output

    for key in ("results", "data", "rows", "peers", "node_records", "reachable_nodes"):
        value = payload.get(key)

        if isinstance(value, list):
            return [dict(node) for node in value if isinstance(node, Mapping)]

        if isinstance(value, Mapping):
            return extract_nodes({"nodes": value})

    return []


def put_nodes(payload: Any, nodes: list[dict[str, Any]]) -> Any:
    if isinstance(payload, list):
        return nodes

    if not isinstance(payload, MutableMapping):
        return {"nodes": nodes}

    output = dict(payload)

    if isinstance(output.get("nodes"), Mapping):
        output["nodes"] = {
            str(node.get("canonical_address") or node.get("address") or index): node
            for index, node in enumerate(nodes)
        }
    else:
        output["nodes"] = nodes

    output.setdefault("metadata", {})
    if isinstance(output["metadata"], MutableMapping):
        output["metadata"]["ipv6_enriched_at"] = utc_now()
        output["metadata"]["ipv6_schema"] = SCHEMA

    return output


def enrich_payload(payload: Any, context: dict[str, Any] | None = None) -> Any:
    nodes = extract_nodes(payload)

    if not nodes:
        return payload

    enriched_nodes = enrich_nodes(nodes, context)
    return put_nodes(payload, enriched_nodes)


def summarize(nodes: list[Mapping[str, Any]]) -> dict[str, Any]:
    ipv6_nodes = [
        node for node in nodes
        if boolish(node.get("is_ipv6")) or boolish(deep_get(node, "ipv6.is_ipv6")) or boolish(deep_get(node, "metadata.is_ipv6"))
    ]

    public_nodes = [
        node for node in ipv6_nodes
        if boolish(deep_get(node, "ipv6.is_public_ipv6")) or boolish(deep_get(node, "metadata.ipv6.is_public_ipv6"))
    ]

    private_nodes = [
        node for node in ipv6_nodes
        if boolish(deep_get(node, "ipv6.is_private_ipv6")) or boolish(deep_get(node, "metadata.ipv6.is_private_ipv6"))
    ]

    cjdns_nodes = [
        node for node in ipv6_nodes
        if boolish(node.get("is_cjdns")) or boolish(deep_get(node, "ipv6.is_cjdns_ipv6")) or boolish(deep_get(node, "metadata.is_cjdns"))
    ]

    return {
        "schema": "zzx-bitnodes-ipv6-summary-v3",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "ipv6_nodes": len(ipv6_nodes),
        "public_ipv6_nodes": len(public_nodes),
        "private_ipv6_nodes": len(private_nodes),
        "cjdns_ipv6_nodes": len(cjdns_nodes),
        "non_ipv6_nodes": max(0, len(nodes) - len(ipv6_nodes)),
    }


def enrich(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def process(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def main() -> int:
    parser = argparse.ArgumentParser(description="Enrich Bitnodes records with IPv6/CJDNS classification metadata.", allow_abbrev=False)

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary", default="")
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    payload = read_json(Path(args.input), fallback={})
    enriched = enrich_payload(payload)

    write_json(Path(args.output), enriched, compact=args.compact)

    if args.summary:
        write_json(Path(args.summary), summarize(extract_nodes(enriched)), compact=args.compact)

    print(f"ipv6 enrichment complete: {len(extract_nodes(enriched))} nodes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
