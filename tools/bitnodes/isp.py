#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


RESIDENTIAL_HINTS = (
    "telecom",
    "communications",
    "broadband",
    "cable",
    "fiber",
    "fibre",
    "dsl",
    "wireless",
    "residential",
    "mobile",
    "cellular",
)

HOSTING_HINTS = (
    "hosting",
    "cloud",
    "datacenter",
    "data center",
    "colo",
    "colocation",
    "server",
    "vps",
    "dedicated",
    "compute",
)

MAJOR_HOSTS = (
    "amazon",
    "aws",
    "google",
    "microsoft",
    "azure",
    "oracle",
    "digitalocean",
    "linode",
    "akamai",
    "ovh",
    "hetzner",
    "leaseweb",
    "vultr",
    "contabo",
    "scaleway",
    "cloudflare",
)

ASN_RE = re.compile(r"(?:^|\s)(AS\d+)(?:\s|$)", re.IGNORECASE)


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


def clean(value: Any) -> str:
    text = str(value or "").strip()

    if text.lower() in {
        "",
        "unknown",
        "none",
        "null",
        "undefined",
        "—",
    }:
        return ""

    return text


def first(row: dict[str, Any], keys: tuple[str, ...]) -> str:
    for key in keys:
        value = clean(row.get(key))

        if value:
            return value

    return ""


def text_blob(row: dict[str, Any]) -> str:
    return " ".join(
        clean(row.get(key))
        for key in (
            "provider",
            "organization",
            "org",
            "isp",
            "asn",
            "as_name",
            "hostname",
            "reverse_dns",
            "hosting_type",
            "network_type",
            "connection_type",
        )
    ).lower()


def extract_asn(value: str) -> str:
    if not value:
        return ""

    match = ASN_RE.search(value)

    if not match:
        return ""

    return match.group(1).upper()


def classify_network(text: str) -> str:
    if any(token in text for token in MAJOR_HOSTS):
        return "major-hosting"

    if any(token in text for token in HOSTING_HINTS):
        return "hosting"

    if any(token in text for token in RESIDENTIAL_HINTS):
        return "residential"

    return "unknown"


def isp_metadata(row: dict[str, Any]) -> dict[str, Any]:
    provider = first(
        row,
        (
            "provider",
            "organization",
            "org",
            "isp",
            "as_name",
        ),
    )

    asn_raw = first(
        row,
        (
            "asn",
            "as_number",
            "asnum",
            "as",
        ),
    )

    hostname = first(
        row,
        (
            "hostname",
            "reverse_dns",
            "host",
        ),
    )

    blob = text_blob(row)

    classification = classify_network(blob)

    asn = extract_asn(asn_raw)

    return {
        "provider": provider,
        "asn": asn,
        "asn_raw": asn_raw,
        "hostname": hostname,
        "network_classification": classification,
        "is_hosting": classification in {"hosting", "major-hosting"},
        "is_major_hosting": classification == "major-hosting",
        "is_residential": classification == "residential",
    }


def enrich_nodes(
    nodes: list[dict[str, Any]],
    context: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    for node in nodes:
        meta = isp_metadata(node)

        node["isp"] = meta

        if meta["provider"]:
            node["provider"] = meta["provider"]

        if meta["asn"]:
            node["asn"] = meta["asn"]

        if meta["hostname"]:
            node["hostname"] = meta["hostname"]

        node["network_classification"] = meta["network_classification"]

        node.setdefault("enrichment", {})
        node["enrichment"]["isp"] = {
            "status": "ok",
            "updated_at": utc_now(),
        }

    return nodes


def summarize(nodes: list[dict[str, Any]]) -> dict[str, Any]:
    provider_counts: dict[str, int] = {}
    asn_counts: dict[str, int] = {}
    classification_counts: dict[str, int] = {}

    for node in nodes:
        isp = node.get("isp", {})

        provider = clean(isp.get("provider")) or "Unknown"
        asn = clean(isp.get("asn")) or "Unknown"
        classification = clean(isp.get("network_classification")) or "unknown"

        provider_counts[provider] = provider_counts.get(provider, 0) + 1
        asn_counts[asn] = asn_counts.get(asn, 0) + 1
        classification_counts[classification] = (
            classification_counts.get(classification, 0) + 1
        )

    top_provider = max(
        provider_counts.items(),
        key=lambda item: item[1],
        default=("Unknown", 0),
    )

    top_asn = max(
        asn_counts.items(),
        key=lambda item: item[1],
        default=("Unknown", 0),
    )

    return {
        "schema": "zzx-bitnodes-isp-summary-v1",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "providers": len(provider_counts),
        "asns": len(asn_counts),
        "classification_counts": classification_counts,
        "top_provider": {
            "name": top_provider[0],
            "count": top_provider[1],
        },
        "top_asn": {
            "asn": top_asn[0],
            "count": top_asn[1],
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with ISP/provider/ASN metadata."
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
        payload["metadata"]["isp_enriched_at"] = utc_now()
        output = payload
    else:
        output = enriched

    write_json(Path(args.output), output)

    if args.summary:
        write_json(Path(args.summary), summarize(enriched))

    print(f"isp enrichment complete: {len(enriched)} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
