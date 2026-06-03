#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


ONION_V2_RE = re.compile(r"^[a-z2-7]{16}\.onion$", re.IGNORECASE)
ONION_V3_RE = re.compile(r"^[a-z2-7]{56}\.onion$", re.IGNORECASE)


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

    if ".onion:" in value:
        return value.rsplit(":", 1)[0].strip("[]")

    if value.endswith(".onion"):
        return value.strip("[]")

    return value.strip("[]")


def onion_fingerprint(host: str) -> str:
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


def tor_metadata(address: Any) -> dict[str, Any]:
    host = normalize_host(address)
    is_onion = host.endswith(".onion")

    version = None

    if ONION_V2_RE.match(host):
        version = "v2"
    elif ONION_V3_RE.match(host):
        version = "v3"

    suspected = is_onion

    return {
        "schema": "zzx-bitnodes-tor-v2",
        "host": host,
        "is_tor": suspected,
        "suspected_tor": suspected,
        "is_onion": is_onion,
        "overlay_network": "tor" if suspected else "",
        "onion_version": version,
        "onion_fingerprint_sha256": onion_fingerprint(host) if suspected else "",
        "is_deprecated_v2": version == "v2",
        "is_supported_v3": version == "v3",
        "updated_at": utc_now(),
    }


def enrich_node(node: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    address = node_address(node)
    meta = tor_metadata(address)

    node["tor"] = meta
    node["is_tor"] = meta["is_tor"]
    node["suspected_tor"] = meta["suspected_tor"]
    node["is_onion"] = meta["is_onion"]

    if meta["is_tor"]:
        node["address_family"] = "tor"
        node["network"] = "tor"
        node["overlay_network"] = "tor"
        node["country"] = node.get("country") or "Tor"
        node["country_code"] = node.get("country_code") or "TOR"
        node["region"] = node.get("region") or "Onion Routing"
        node["city"] = node.get("city") or "Everywhere / Nowhere"

    node.setdefault("enrichment", {})
    node["enrichment"]["tor"] = {
        "schema": "zzx-bitnodes-tor-v2",
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
            enrich_node(dict(node)) if isinstance(node, Mapping) else node
            for node in nodes
        ]

    if isinstance(nodes, dict):
        return {
            key: enrich_node(dict(value)) if isinstance(value, Mapping) else value
            for key, value in nodes.items()
        }

    return nodes


def enrich_payload(payload: Any, context: dict[str, Any] | None = None) -> Any:
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
    payload["metadata"]["tor_enriched_at"] = utc_now()

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
    tor_nodes = [
        node for node in nodes
        if node.get("is_tor") or node.get("suspected_tor") or node.get("tor", {}).get("is_tor")
    ]

    v2 = [
        node for node in tor_nodes
        if node.get("tor", {}).get("onion_version") == "v2"
    ]

    v3 = [
        node for node in tor_nodes
        if node.get("tor", {}).get("onion_version") == "v3"
    ]

    unknown_version = max(0, len(tor_nodes) - len(v2) - len(v3))

    return {
        "schema": "zzx-bitnodes-tor-summary-v2",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "tor_nodes": len(tor_nodes),
        "suspected_tor_nodes": len(tor_nodes),
        "onion_v2_nodes": len(v2),
        "onion_v3_nodes": len(v3),
        "onion_unknown_version_nodes": unknown_version,
        "clearnet_nodes": max(0, len(nodes) - len(tor_nodes)),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with Tor/onion classification metadata."
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

    print(f"tor enrichment complete: {len(iter_nodes(enriched))} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
