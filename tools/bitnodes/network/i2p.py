#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


SCHEMA = "zzx-bitnodes-i2p-v3"

I2P_HOST_RE = re.compile(r"^[a-z0-9\-_.]+\.i2p$", re.IGNORECASE)
B32_I2P_RE = re.compile(r"^[a-z2-7]{52}\.b32\.i2p$", re.IGNORECASE)


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
    current: Any = row

    for part in key.split("."):
        if not isinstance(current, Mapping):
            return None
        current = current.get(part)

    return current


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
    value = str(address or "").strip().lower()

    if not value:
        return ""

    if value.startswith("[") and "]" in value:
        value = value[1:value.index("]")]

    if ".i2p:" in value:
        return value.rsplit(":", 1)[0].strip("[]")

    if value.endswith(".i2p"):
        return value.strip("[]")

    if value.count(":") == 1:
        host, port = value.rsplit(":", 1)
        if port.isdigit():
            return host.strip("[]")

    return value.strip("[]")


def i2p_fingerprint(host: str) -> str:
    if not host:
        return ""

    return hashlib.sha256(host.encode("utf-8")).hexdigest()


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
            "id",
            "metadata.address",
            "metadata.canonical_address",
            "metadata.host",
        )
        or ""
    )


def i2p_metadata(address: Any, row: Mapping[str, Any] | None = None) -> dict[str, Any]:
    row = row or {}
    host = normalize_host(address)

    is_i2p_host = host.endswith(".i2p")
    is_valid_i2p = bool(I2P_HOST_RE.match(host))
    is_b32 = bool(B32_I2P_RE.match(host))

    explicit = boolish(
        first_value(
            row,
            "is_i2p",
            "suspected_i2p",
            "i2p.is_i2p",
            "i2p.suspected_i2p",
            "metadata.is_i2p",
            "metadata.suspected_i2p",
            "metadata.i2p.is_i2p",
        )
    )

    suspected = is_i2p_host or explicit

    return {
        "schema": SCHEMA,
        "host": host,
        "is_i2p": suspected,
        "suspected_i2p": suspected,
        "is_valid_i2p": is_valid_i2p,
        "overlay_network": "i2p" if suspected else "",
        "network": "i2p" if suspected else "",
        "is_b32_i2p": is_b32,
        "is_named_i2p": is_i2p_host and not is_b32,
        "address_type": "b32" if is_b32 else "named" if is_i2p_host else "",
        "i2p_fingerprint_sha256": i2p_fingerprint(host) if suspected else "",
        "map_ready": False,
        "country": "I2P" if suspected else "",
        "country_code": "I2P" if suspected else "",
        "region": "Garlic Routing" if suspected else "",
        "city": "Distributed Overlay" if suspected else "",
        "updated_at": utc_now(),
    }


def ensure_block(node: MutableMapping[str, Any], key: str) -> MutableMapping[str, Any]:
    block = node.get(key)

    if not isinstance(block, MutableMapping):
        block = {}
        node[key] = block

    return block


def enrich_node(node: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    address = node_address(node)
    meta = i2p_metadata(address, node)

    metadata = ensure_block(node, "metadata")
    enrichment = ensure_block(node, "enrichment")

    node["i2p"] = meta
    metadata["i2p"] = meta

    node["is_i2p"] = meta["is_i2p"]
    node["suspected_i2p"] = meta["suspected_i2p"]

    metadata["is_i2p"] = meta["is_i2p"]
    metadata["suspected_i2p"] = meta["suspected_i2p"]

    if meta["is_i2p"]:
        node["address_family"] = "i2p"
        node["network"] = "i2p"
        node["overlay_network"] = "i2p"
        node["map_ready"] = False

        metadata["address_family"] = "i2p"
        metadata["network"] = "i2p"
        metadata["overlay_network"] = "i2p"
        metadata["map_ready"] = False

        for key in ("country", "country_code", "region", "city"):
            if meta.get(key):
                node.setdefault(key, meta[key])
                metadata.setdefault(key, meta[key])

    elif node.get("network") == "i2p":
        node["network"] = metadata.get("network") if metadata.get("network") != "i2p" else ""

    enrichment["i2p"] = {
        "schema": SCHEMA,
        "status": "ok",
        "updated_at": utc_now(),
        "is_i2p": meta["is_i2p"],
        "address_type": meta["address_type"],
    }

    return node


def enrich_nodes(nodes: Any, context: dict[str, Any] | None = None) -> Any:
    if isinstance(nodes, list):
        return [enrich_node(dict(node)) if isinstance(node, Mapping) else node for node in nodes]

    if isinstance(nodes, Mapping):
        return {key: enrich_node(dict(value)) if isinstance(value, Mapping) else value for key, value in nodes.items()}

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
        output["metadata"]["i2p_enriched_at"] = utc_now()
        output["metadata"]["i2p_schema"] = SCHEMA

    return output


def enrich_payload(payload: Any, context: dict[str, Any] | None = None) -> Any:
    nodes = extract_nodes(payload)

    if not nodes:
        return payload

    return put_nodes(payload, enrich_nodes(nodes, context))


def iter_nodes(payload: Any) -> list[Mapping[str, Any]]:
    return extract_nodes(payload)


def summarize(nodes: list[Mapping[str, Any]]) -> dict[str, Any]:
    i2p_nodes = [
        node
        for node in nodes
        if boolish(node.get("is_i2p"))
        or boolish(node.get("suspected_i2p"))
        or boolish(deep_get(node, "i2p.is_i2p"))
        or boolish(deep_get(node, "metadata.i2p.is_i2p"))
    ]

    b32_nodes = [node for node in i2p_nodes if boolish(deep_get(node, "i2p.is_b32_i2p"))]
    named_nodes = [node for node in i2p_nodes if boolish(deep_get(node, "i2p.is_named_i2p"))]

    return {
        "schema": "zzx-bitnodes-i2p-summary-v3",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "i2p_nodes": len(i2p_nodes),
        "suspected_i2p_nodes": len(i2p_nodes),
        "b32_i2p_nodes": len(b32_nodes),
        "named_i2p_nodes": len(named_nodes),
        "non_i2p_nodes": max(0, len(nodes) - len(i2p_nodes)),
    }


def enrich(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def process(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def main() -> int:
    parser = argparse.ArgumentParser(description="Enrich Bitnodes records with I2P classification metadata.", allow_abbrev=False)

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

    print(f"i2p enrichment complete: {len(iter_nodes(enriched))} nodes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
