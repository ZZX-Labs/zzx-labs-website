#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


I2P_HOST_RE = re.compile(r"^[a-z0-9\-_.]+\.i2p$", re.IGNORECASE)
B32_I2P_RE = re.compile(r"^[a-z2-7]{52}\.b32\.i2p$", re.IGNORECASE)


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
    value = str(address or "").strip().lower()

    if not value:
        return ""

    value = value.strip("[]")

    if ".i2p" in value:
        return value.split(":")[0].strip("[]")

    return value


def i2p_fingerprint(host: str) -> str:
    if not host:
        return ""

    return hashlib.sha256(host.encode("utf-8")).hexdigest()


def i2p_metadata(address: str) -> dict[str, Any]:
    host = normalize_host(address)
    is_i2p = host.endswith(".i2p")
    is_b32 = bool(B32_I2P_RE.match(host))

    return {
        "host": host,
        "is_i2p": is_i2p,
        "is_b32_i2p": is_b32,
        "is_named_i2p": is_i2p and not is_b32,
        "i2p_fingerprint_sha256": i2p_fingerprint(host) if is_i2p else "",
        "address_type": "b32" if is_b32 else "named" if is_i2p else None,
    }


def enrich_nodes(
    nodes: list[dict[str, Any]],
    context: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    for node in nodes:
        address = node.get("address") or node.get("node") or node.get("addr") or ""
        meta = i2p_metadata(str(address))

        node["i2p"] = meta
        node["is_i2p"] = meta["is_i2p"]

        if meta["is_i2p"]:
            node["address_family"] = "i2p"
            node["network"] = "i2p"
            node["country"] = node.get("country") or "I2P"
            node["region"] = node.get("region") or "Garlic Routing"
            node["city"] = node.get("city") or "Distributed Overlay"

        node.setdefault("enrichment", {})
        node["enrichment"]["i2p"] = {
            "status": "ok",
            "updated_at": utc_now(),
        }

    return nodes


def summarize(nodes: list[dict[str, Any]]) -> dict[str, Any]:
    i2p_nodes = [
        node for node in nodes
        if node.get("is_i2p") or node.get("i2p", {}).get("is_i2p")
    ]

    b32_nodes = [
        node for node in i2p_nodes
        if node.get("i2p", {}).get("is_b32_i2p")
    ]

    named_nodes = [
        node for node in i2p_nodes
        if node.get("i2p", {}).get("is_named_i2p")
    ]

    return {
        "schema": "zzx-bitnodes-i2p-summary-v1",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "i2p_nodes": len(i2p_nodes),
        "b32_i2p_nodes": len(b32_nodes),
        "named_i2p_nodes": len(named_nodes),
        "non_i2p_nodes": max(0, len(nodes) - len(i2p_nodes)),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with I2P address classification metadata."
    )

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary", default="")

    args = parser.parse_args()

    payload = read_json(Path(args.input), fallback={})
    nodes = payload.get("nodes", payload if isinstance(payload, list) else [])

    if not isinstance(nodes, list):
        nodes = []

    enriched = enrich_nodes(nodes)

    if isinstance(payload, dict):
        payload["nodes"] = enriched
        payload.setdefault("metadata", {})
        payload["metadata"]["i2p_enriched_at"] = utc_now()
        output = payload
    else:
        output = enriched

    write_json(Path(args.output), output)

    if args.summary:
        write_json(Path(args.summary), summarize(enriched))

    print(f"i2p enrichment complete: {len(enriched)} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
