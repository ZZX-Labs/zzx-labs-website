#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


I2P_HOST_RE = re.compile(r"^[a-z0-9\-_.]+\.i2p$", re.IGNORECASE)
B32_I2P_RE = re.compile(r"^[a-z2-7]{52}\.b32\.i2p$", re.IGNORECASE)


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
    value = str(address or "").strip().lower()

    if not value:
        return ""

    if value.startswith("[") and "]" in value:
        value = value[1:value.index("]")]

    if ".i2p:" in value:
        return value.rsplit(":", 1)[0].strip("[]")

    if value.endswith(".i2p"):
        return value.strip("[]")

    return value.strip("[]")


def i2p_fingerprint(host: str) -> str:
    if not host:
        return ""

    return hashlib.sha256(host.encode("utf-8")).hexdigest()


def node_address(node: Mapping[str, Any]) -> str:
    return str(
        node.get("address")
        or node.get("node")
        or node.get("addr")
        or node.get("host")
        or node.get("hostname")
        or node.get("id")
        or ""
    )


def i2p_metadata(address: Any) -> dict[str, Any]:
    host = normalize_host(address)

    is_i2p = host.endswith(".i2p")
    is_b32 = bool(B32_I2P_RE.match(host))

    return {
        "schema": "zzx-bitnodes-i2p-v2",
        "host": host,
        "is_i2p": is_i2p,
        "suspected_i2p": is_i2p,
        "overlay_network": "i2p" if is_i2p else "",
        "is_b32_i2p": is_b32,
        "is_named_i2p": is_i2p and not is_b32,
        "address_type": (
            "b32"
            if is_b32
            else "named"
            if is_i2p
            else None
        ),
        "i2p_fingerprint_sha256": (
            i2p_fingerprint(host)
            if is_i2p
            else ""
        ),
        "updated_at": utc_now(),
    }


def enrich_node(node: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    address = node_address(node)
    meta = i2p_metadata(address)

    node["i2p"] = meta
    node["is_i2p"] = meta["is_i2p"]
    node["suspected_i2p"] = meta["suspected_i2p"]

    if meta["is_i2p"]:
        node["address_family"] = "i2p"
        node["network"] = "i2p"
        node["overlay_network"] = "i2p"

        node["country"] = node.get("country") or "I2P"
        node["country_code"] = node.get("country_code") or "I2P"
        node["region"] = node.get("region") or "Garlic Routing"
        node["city"] = node.get("city") or "Distributed Overlay"

    node.setdefault("enrichment", {})

    node["enrichment"]["i2p"] = {
        "schema": "zzx-bitnodes-i2p-v2",
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
    payload["metadata"]["i2p_enriched_at"] = utc_now()

    return payload


def iter_nodes(payload: Any) -> list[Mapping[str, Any]]:
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, Mapping)]

    if not isinstance(payload, Mapping):
        return []

    nodes = payload.get("nodes")

    if isinstance(nodes, list):
        return [x for x in nodes if isinstance(x, Mapping)]

    if isinstance(nodes, dict):
        return [x for x in nodes.values() if isinstance(x, Mapping)]

    for key in ("results", "data"):
        value = payload.get(key)

        if isinstance(value, list):
            return [x for x in value if isinstance(x, Mapping)]

    return []


def summarize(nodes: list[Mapping[str, Any]]) -> dict[str, Any]:
    i2p_nodes = [
        node
        for node in nodes
        if (
            node.get("is_i2p")
            or node.get("suspected_i2p")
            or node.get("i2p", {}).get("is_i2p")
        )
    ]

    b32_nodes = [
        node
        for node in i2p_nodes
        if node.get("i2p", {}).get("is_b32_i2p")
    ]

    named_nodes = [
        node
        for node in i2p_nodes
        if node.get("i2p", {}).get("is_named_i2p")
    ]

    return {
        "schema": "zzx-bitnodes-i2p-summary-v2",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "i2p_nodes": len(i2p_nodes),
        "suspected_i2p_nodes": len(i2p_nodes),
        "b32_i2p_nodes": len(b32_nodes),
        "named_i2p_nodes": len(named_nodes),
        "non_i2p_nodes": max(
            0,
            len(nodes) - len(i2p_nodes),
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with I2P classification metadata."
    )

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary", default="")
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    payload = read_json(Path(args.input), fallback={})

    enriched = enrich_payload(payload)

    write_json(
        Path(args.output),
        enriched,
        compact=args.compact,
    )

    if args.summary:
        write_json(
            Path(args.summary),
            summarize(iter_nodes(enriched)),
            compact=args.compact,
        )

    print(
        f"i2p enrichment complete: "
        f"{len(iter_nodes(enriched))} nodes"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
