#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
from pathlib import Path
from typing import Any
from xml.etree.ElementTree import Element, ElementTree, SubElement

from export_json import load_snapshot, node_rows, mkdir, utc_iso


XML_FIELDS = [
    "rank",
    "address",
    "host",
    "port",
    "network",
    "reachable",
    "reachable_now",
    "reachable_24h",
    "reachable_week",
    "reachable_month",
    "protocol",
    "agent",
    "height",
    "services",
    "country",
    "continent",
    "region",
    "territory",
    "county",
    "city",
    "zip",
    "timezone",
    "latitude",
    "longitude",
    "asn",
    "organization",
    "provider",
    "provider_kind",
    "organization_type",
    "network_classification",
    "latency_ms",
    "uptime_seconds",
    "peer_index",
    "is_ipv4",
    "is_ipv6",
    "is_cjdns",
    "is_tor",
    "is_i2p",
    "is_vpn",
    "is_proxy",
    "is_sanctioned_node",
    "is_policy_restricted_node",
    "suspected_government",
    "suspected_military",
    "suspected_datacenter",
    "suspected_apt_related",
    "suspected_threat_actor_group_related",
    "suspected_known_malicious_actor",
    "apt_attribution_score",
    "apt_attribution_confidence",
    "tag_attribution_score",
    "tag_attribution_confidence",
    "known_malactor_score",
    "known_malactor_confidence",
    "geohash",
    "geohashid",
    "w3w",
    "zzxgcs",
    "zzxgms",
    "first_seen",
    "last_seen",
    "last_failure",
]


def xml_text(value: Any) -> str:
    if value is None:
        return ""

    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))

    return str(value)


def safe_tag(value: str) -> str:
    out = "".join(
        char if char.isalnum() or char in {"_", "-"} else "_"
        for char in str(value)
    )
    out = out.strip("_") or "field"

    if out[0].isdigit():
        out = f"field_{out}"

    return out


def add_text(parent: Element, tag: str, value: Any) -> Element:
    child = SubElement(parent, safe_tag(tag))
    child.text = xml_text(value)
    return child


def write_xml(path: Path, root: Element, gzip_copy: bool = True) -> dict[str, Any]:
    mkdir(path.parent)

    tree = ElementTree(root)

    try:
        from xml.etree.ElementTree import indent

        indent(tree, space="  ")
    except Exception:
        pass

    tree.write(path, encoding="utf-8", xml_declaration=True)

    entry = {
        "path": path.name,
        "bytes": path.stat().st_size,
    }

    if gzip_copy:
        gz_path = path.with_suffix(path.suffix + ".gz")

        with path.open("rb") as src, gzip.open(gz_path, "wb", compresslevel=9) as dst:
            dst.write(src.read())

        entry["gzip_path"] = gz_path.name
        entry["gzip_bytes"] = gz_path.stat().st_size

    return entry


def write_manifest(output_dir: Path, manifest: dict[str, Any], compact: bool) -> None:
    mkdir(output_dir)
    (output_dir / "manifest.json").write_text(
        json.dumps(
            manifest,
            ensure_ascii=False,
            indent=None if compact else 2,
            separators=(",", ":") if compact else None,
            sort_keys=not compact,
            default=str,
        )
        + "\n",
        encoding="utf-8",
    )


def nodes_root(rows: list[dict[str, Any]], root_name: str = "nodes") -> Element:
    root = Element(root_name)
    root.set("schema", "zzx-bitnodes-xml-nodes-v2")
    root.set("generated_at", utc_iso())
    root.set("count", str(len(rows)))

    for row in rows:
        node = SubElement(root, "node")

        for field in XML_FIELDS:
            add_text(node, field, row.get(field))

    return root


def group_count(rows: list[dict[str, Any]], key: str, unknown: str = "Unknown") -> list[dict[str, Any]]:
    counts: dict[str, int] = {}

    for row in rows:
        value = str(row.get(key) or unknown)
        counts[value] = counts.get(value, 0) + 1

    out = [{key: value, "count": count} for value, count in counts.items()]
    out.sort(key=lambda item: item["count"], reverse=True)
    return out


def group_root(rows: list[dict[str, Any]], key: str, root_name: str, unknown: str = "Unknown") -> Element:
    grouped = group_count(rows, key, unknown=unknown)

    root = Element(root_name)
    root.set("schema", "zzx-bitnodes-xml-group-v2")
    root.set("generated_at", utc_iso())
    root.set("count", str(len(grouped)))

    for item in grouped:
        entry = SubElement(root, "entry")
        add_text(entry, key, item.get(key))
        add_text(entry, "count", item.get("count"))

    return root


def status_root(rows: list[dict[str, Any]]) -> Element:
    root = Element("status")
    root.set("schema", "zzx-bitnodes-xml-status-v2")
    root.set("generated_at", utc_iso())

    metrics = {
        "total_nodes": len(rows),
        "reachable_nodes": sum(1 for row in rows if row.get("reachable") is True),
        "reachable_now": sum(1 for row in rows if row.get("reachable_now") is True),
        "reachable_24h": sum(1 for row in rows if row.get("reachable_24h") is True),
        "unreachable_nodes": sum(1 for row in rows if row.get("reachable") is False),
        "ipv4_nodes": sum(1 for row in rows if row.get("network") == "ipv4"),
        "ipv6_nodes": sum(1 for row in rows if row.get("network") == "ipv6"),
        "cjdns_nodes": sum(1 for row in rows if row.get("network") == "cjdns"),
        "tor_nodes": sum(1 for row in rows if row.get("is_tor") or row.get("tor")),
        "i2p_nodes": sum(1 for row in rows if row.get("is_i2p") or row.get("i2p")),
        "vpn_nodes": sum(1 for row in rows if row.get("is_vpn")),
        "proxy_nodes": sum(1 for row in rows if row.get("is_proxy")),
        "sanctioned_nodes": sum(1 for row in rows if row.get("is_sanctioned_node")),
        "policy_restricted_nodes": sum(1 for row in rows if row.get("is_policy_restricted_node")),
        "government_nodes": sum(1 for row in rows if row.get("suspected_government")),
        "military_nodes": sum(1 for row in rows if row.get("suspected_military")),
        "datacenter_nodes": sum(1 for row in rows if row.get("suspected_datacenter")),
        "apt_related_nodes": sum(1 for row in rows if row.get("suspected_apt_related")),
        "threat_actor_group_related_nodes": sum(1 for row in rows if row.get("suspected_threat_actor_group_related")),
        "known_malactor_nodes": sum(1 for row in rows if row.get("suspected_known_malicious_actor")),
    }

    for key, value in metrics.items():
        add_text(root, key, value)

    return root


def export_xml(
    input_path: Path,
    output_dir: Path,
    source: str | None = None,
    *,
    compact: bool = False,
    gzip_copy: bool = True,
) -> dict[str, Any]:
    payload = load_snapshot(input_path)

    if source:
        payload["source"] = source

    rows = node_rows(payload.get("nodes", {}))
    mkdir(output_dir)

    manifest: dict[str, Any] = {
        "schema": "zzx-bitnodes-xml-export-v2",
        "source": payload.get("source"),
        "input": str(input_path),
        "output": str(output_dir),
        "node_count": len(rows),
        "files": {},
        "policy": {
            "canonical_store": "bitcoin/bitnodes/api/data",
            "xml_role": "portable dashboard/API cache export",
            "repo_rule": "XML exports are aggregate files only. No per-node fan-out.",
        },
    }

    files: dict[str, dict[str, Any]] = {}

    subsets = {
        "nodes.xml": nodes_root(rows, "nodes"),
        "reachable.xml": nodes_root([row for row in rows if row.get("reachable") is True], "reachable_nodes"),
        "unreachable.xml": nodes_root([row for row in rows if row.get("reachable") is False], "unreachable_nodes"),
        "reachable-now.xml": nodes_root([row for row in rows if row.get("reachable_now") is True], "reachable_now_nodes"),
        "reachable-24h.xml": nodes_root([row for row in rows if row.get("reachable_24h") is True], "reachable_24h_nodes"),
        "ipv4.xml": nodes_root([row for row in rows if row.get("network") == "ipv4"], "ipv4_nodes"),
        "ipv6.xml": nodes_root([row for row in rows if row.get("network") == "ipv6"], "ipv6_nodes"),
        "cjdns.xml": nodes_root([row for row in rows if row.get("network") == "cjdns"], "cjdns_nodes"),
        "tor.xml": nodes_root([row for row in rows if row.get("is_tor") or row.get("tor")], "tor_nodes"),
        "i2p.xml": nodes_root([row for row in rows if row.get("is_i2p") or row.get("i2p")], "i2p_nodes"),
        "vpn.xml": nodes_root([row for row in rows if row.get("is_vpn")], "vpn_nodes"),
        "proxy.xml": nodes_root([row for row in rows if row.get("is_proxy")], "proxy_nodes"),
        "government.xml": nodes_root([row for row in rows if row.get("suspected_government")], "government_nodes"),
        "military.xml": nodes_root([row for row in rows if row.get("suspected_military")], "military_nodes"),
        "datacenter.xml": nodes_root([row for row in rows if row.get("suspected_datacenter")], "datacenter_nodes"),
        "apt-attribution.xml": nodes_root([row for row in rows if row.get("suspected_apt_related")], "apt_related_nodes"),
        "tag-attribution.xml": nodes_root([row for row in rows if row.get("suspected_threat_actor_group_related")], "tag_attribution_nodes"),
        "known-malactor.xml": nodes_root([row for row in rows if row.get("suspected_known_malicious_actor")], "known_malactor_nodes"),
        "leaderboard.xml": nodes_root(sorted(rows, key=lambda row: row.get("peer_index") or 0, reverse=True), "leaderboard"),
    }

    for filename, root in subsets.items():
        files[filename] = write_xml(output_dir / filename, root, gzip_copy=gzip_copy)

    for key, filename, unknown in [
        ("country", "countries.xml", "??"),
        ("continent", "continents.xml", "Unknown"),
        ("region", "regions.xml", "Unknown"),
        ("territory", "territories.xml", "Unknown"),
        ("county", "counties.xml", "Unknown"),
        ("city", "cities.xml", "Unknown"),
        ("zip", "zipcodes.xml", "Unknown"),
        ("timezone", "timezones.xml", "Unknown"),
        ("asn", "asns.xml", "UNKNOWN"),
        ("agent", "agents.xml", "UNKNOWN"),
        ("protocol", "versions.xml", "UNKNOWN"),
        ("port", "ports.xml", "UNKNOWN"),
        ("services", "services.xml", "UNKNOWN"),
        ("organization", "organizations.xml", "UNKNOWN"),
        ("provider", "providers.xml", "UNKNOWN"),
        ("provider_kind", "provider-kinds.xml", "unknown"),
        ("organization_type", "organization-types.xml", "unknown"),
        ("network_classification", "network-classifications.xml", "unknown"),
        ("network", "networks.xml", "unknown"),
        ("geohash", "geohashes.xml", "unknown"),
        ("w3w", "what3words.xml", "unknown"),
        ("zzxgcs", "zzxgcs.xml", "unknown"),
        ("zzxgms", "zzxgms.xml", "unknown"),
    ]:
        files[filename] = write_xml(
            output_dir / filename,
            group_root(rows, key, safe_tag(filename.replace(".xml", "")), unknown=unknown),
            gzip_copy=gzip_copy,
        )

    files["status.xml"] = write_xml(output_dir / "status.xml", status_root(rows), gzip_copy=gzip_copy)
    files["index.xml"] = write_xml(output_dir / "index.xml", status_root(rows), gzip_copy=gzip_copy)

    manifest["files"] = files
    write_manifest(output_dir, manifest, compact=compact)

    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description="Export ZZX-Labs Bitnodes XML cache files.")

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", default="bitcoin/bitnodes/api/xml")
    parser.add_argument("--source", default=None)
    parser.add_argument("--compact", action="store_true")
    parser.add_argument("--no-gzip", action="store_true")

    args = parser.parse_args()

    manifest = export_xml(
        input_path=Path(args.input),
        output_dir=Path(args.output),
        source=args.source,
        compact=args.compact,
        gzip_copy=not args.no_gzip,
    )

    print(f"xml export complete: {manifest['node_count']} nodes -> {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
