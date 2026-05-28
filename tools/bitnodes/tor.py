#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ONION_V2_RE = re.compile(r"^[a-z2-7]{16}\.onion$", re.IGNORECASE)
ONION_V3_RE = re.compile(r"^[a-z2-7]{56}\.onion$", re.IGNORECASE)


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

    if ".onion" in value:
        return value.split(":")[0].strip("[]")

    return value


def onion_fingerprint(host: str) -> str:
    if not host:
        return ""

    return hashlib.sha256(host.encode("utf-8")).hexdigest()


def tor_metadata(address: str) -> dict[str, Any]:
    host = normalize_host(address)
    is_onion = host.endswith(".onion")

    version = None

    if ONION_V2_RE.match(host):
        version = "v2"
    elif ONION_V3_RE.match(host):
        version = "v3"

    return {
        "host": host,
        "is_tor": is_onion,
        "is_onion": is_onion,
        "onion_version": version,
        "onion_fingerprint_sha256": onion_fingerprint(host) if is_onion else "",
        "is_deprecated_v2": version == "v2",
        "is_supported_v3": version == "v3",
    }


def enrich_nodes(
    nodes: list[dict[str, Any]],
    context: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    for node in nodes:
        address = node.get("address") or node.get("node") or node.get("addr") or ""
        meta = tor_metadata(str(address))

        node["tor"] = meta
        node["is_tor"] = meta["is_tor"]
        node["is_onion"] = meta["is_onion"]

        if meta["is_tor"]:
            node["address_family"] = "tor"
            node["network"] = "tor"
            node["country"] = node.get("country") or "Tor"
            node["region"] = node.get("region") or "Onion Routing"
            node["city"] = node.get("city") or "Everywhere / Nowhere"

        node.setdefault("enrichment", {})
        node["enrichment"]["tor"] = {
            "status": "ok",
            "updated_at": utc_now(),
        }

    return nodes


def summarize(nodes: list[dict[str, Any]]) -> dict[str, Any]:
    tor_nodes = [
        node for node in nodes
        if node.get("is_tor") or node.get("tor", {}).get("is_tor")
    ]

    v2 = [
        node for node in tor_nodes
        if node.get("tor", {}).get("onion_version") == "v2"
    ]

    v3 = [
        node for node in tor_nodes
        if node.get("tor", {}).get("onion_version") == "v3"
    ]

    return {
        "schema": "zzx-bitnodes-tor-summary-v1",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "tor_nodes": len(tor_nodes),
        "onion_v2_nodes": len(v2),
        "onion_v3_nodes": len(v3),
        "clearnet_nodes": max(0, len(nodes) - len(tor_nodes)),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with Tor/onion classification metadata."
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
        payload["metadata"]["tor_enriched_at"] = utc_now()
        output = payload
    else:
        output = enriched

    write_json(Path(args.output), output)

    if args.summary:
        write_json(Path(args.summary), summarize(enriched))

    print(f"tor enrichment complete: {len(enriched)} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
