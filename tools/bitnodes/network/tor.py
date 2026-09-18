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


SCHEMA = "zzx-bitnodes-tor-v3"

ONION_V2_RE = re.compile(r"^[a-z2-7]{16}\.onion$", re.IGNORECASE)
ONION_V3_RE = re.compile(r"^[a-z2-7]{56}\.onion$", re.IGNORECASE)


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

    if ".onion:" in value:
        return value.rsplit(":", 1)[0].strip("[]")

    if value.endswith(".onion"):
        return value.strip("[]")

    if value.count(":") == 1:
        host, port = value.rsplit(":", 1)
        if port.isdigit():
            return host.strip("[]")

    return value.strip("[]")


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


def onion_fingerprint(host: str) -> str:
    if not host:
        return ""

    return hashlib.sha256(host.encode("utf-8")).hexdigest()


def tor_metadata(address: Any, row: Mapping[str, Any] | None = None) -> dict[str, Any]:
    row = row or {}
    host = normalize_host(address)
    is_onion = host.endswith(".onion")

    version = ""
    if ONION_V2_RE.match(host):
        version = "v2"
    elif ONION_V3_RE.match(host):
        version = "v3"

    explicit = boolish(
        first_value(
            row,
            "is_tor",
            "suspected_tor",
            "tor.is_tor",
            "tor.suspected_tor",
            "metadata.is_tor",
            "metadata.suspected_tor",
            "metadata.tor.is_tor",
        )
    )

    suspected = is_onion or explicit

    return {
        "schema": SCHEMA,
        "host": host,
        "is_tor": suspected,
        "suspected_tor": suspected,
        "is_onion": is_onion,
        "overlay_network": "tor" if suspected else "",
        "network": "tor" if suspected else "",
        "onion_version": version,
        "onion_fingerprint_sha256": onion_fingerprint(host) if suspected else "",
        "is_deprecated_v2": version == "v2",
        "is_supported_v3": version == "v3",
        "is_valid_onion": bool(version),
        "is_unknown_onion_version": is_onion and not version,
        "map_ready": False,
        "country": "TOR" if suspected else "",
        "country_code": "TOR" if suspected else "",
        "region": "Onion Routing" if suspected else "",
        "city": "Everywhere / Nowhere" if suspected else "",
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
    meta = tor_metadata(address, node)

    metadata = ensure_block(node, "metadata")
    enrichment = ensure_block(node, "enrichment")

    node["tor"] = meta
    metadata["tor"] = meta

    node["is_tor"] = meta["is_tor"]
    node["suspected_tor"] = meta["suspected_tor"]
    node["is_onion"] = meta["is_onion"]

    metadata["is_tor"] = meta["is_tor"]
    metadata["suspected_tor"] = meta["suspected_tor"]
    metadata["is_onion"] = meta["is_onion"]

    if meta["is_tor"]:
        node["address_family"] = "tor"
        node["network"] = "tor"
        node["overlay_network"] = "tor"
        node["map_ready"] = False

        metadata["address_family"] = "tor"
        metadata["network"] = "tor"
        metadata["overlay_network"] = "tor"
        metadata["map_ready"] = False

        for key in ("country", "country_code", "region", "city"):
            if meta.get(key):
                node.setdefault(key, meta[key])
                metadata.setdefault(key, meta[key])

    elif node.get("network") == "tor":
        node["network"] = metadata.get("network") if metadata.get("network") != "tor" else ""

    enrichment["tor"] = {
        "schema": SCHEMA,
        "status": "ok",
        "updated_at": utc_now(),
        "is_tor": meta["is_tor"],
        "onion_version": meta["onion_version"],
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
        output["metadata"]["tor_enriched_at"] = utc_now()
        output["metadata"]["tor_schema"] = SCHEMA

    return output


def enrich_payload(payload: Any, context: dict[str, Any] | None = None) -> Any:
    nodes = extract_nodes(payload)

    if not nodes:
        return payload

    return put_nodes(payload, enrich_nodes(nodes, context))


def iter_nodes(payload: Any) -> list[Mapping[str, Any]]:
    return extract_nodes(payload)


def summarize(nodes: list[Mapping[str, Any]]) -> dict[str, Any]:
    tor_nodes = [
        node for node in nodes
        if boolish(node.get("is_tor"))
        or boolish(node.get("suspected_tor"))
        or boolish(deep_get(node, "tor.is_tor"))
        or boolish(deep_get(node, "metadata.tor.is_tor"))
    ]

    v2 = [node for node in tor_nodes if deep_get(node, "tor.onion_version") == "v2"]
    v3 = [node for node in tor_nodes if deep_get(node, "tor.onion_version") == "v3"]

    unknown_version = max(0, len(tor_nodes) - len(v2) - len(v3))

    return {
        "schema": "zzx-bitnodes-tor-summary-v3",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "tor_nodes": len(tor_nodes),
        "suspected_tor_nodes": len(tor_nodes),
        "onion_v2_nodes": len(v2),
        "onion_v3_nodes": len(v3),
        "onion_unknown_version_nodes": unknown_version,
        "clearnet_nodes": max(0, len(nodes) - len(tor_nodes)),
    }


def enrich(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def process(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def main() -> int:
    parser = argparse.ArgumentParser(description="Enrich Bitnodes records with Tor/onion classification metadata.", allow_abbrev=False)

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
