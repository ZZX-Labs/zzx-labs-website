#!/usr/bin/env python3
from __future__ import annotations

import argparse
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


def add_text(parent: Element, tag: str, value: Any) -> Element:
    child = SubElement(parent, safe_tag(tag))
    child.text = xml_text(value)
    return child


def safe_tag(value: str) -> str:
    out = "".join(char if char.isalnum() or char in {"_", "-"} else "_" for char in str(value))
    out = out.strip("_") or "field"

    if out[0].isdigit():
        out = f"field_{out}"

    return out


def write_xml(path: Path, root: Element) -> None:
    mkdir(path.parent)

    tree = ElementTree(root)
    try:
        from xml.etree.ElementTree import indent

        indent(tree, space="  ")
    except Exception:
        pass

    tree.write(path, encoding="utf-8", xml_declaration=True)


def nodes_root(rows: list[dict[str, Any]], root_name: str = "nodes") -> Element:
    root = Element(root_name)
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

    out = [
        {
            key: value,
            "count": count,
        }
        for value, count in counts.items()
    ]

    out.sort(key=lambda item: item["count"], reverse=True)
    return out


def group_root(rows: list[dict[str, Any]], key: str, root_name: str, unknown: str = "Unknown") -> Element:
    grouped = group_count(rows, key, unknown=unknown)

    root = Element(root_name)
    root.set("generated_at", utc_iso())
    root.set("count", str(len(grouped)))

    for item in grouped:
        entry = SubElement(root, "entry")
        add_text(entry, key, item.get(key))
        add_text(entry, "count", item.get("count"))

    return root


def status_root(rows: list[dict[str, Any]]) -> Element:
    root = Element("status")
    root.set("generated_at", utc_iso())

    metrics = {
        "total_nodes": len(rows),
        "reachable_nodes": sum(1 for row in rows if row.get("reachable") is True),
        "unreachable_nodes": sum(1 for row in rows if row.get("reachable") is False),
        "ipv4_nodes": sum(1 for row in rows if row.get("network") == "ipv4"),
        "ipv6_nodes": sum(1 for row in rows if row.get("network") == "ipv6"),
        "cjdns_nodes": sum(1 for row in rows if row.get("network") == "cjdns"),
        "tor_nodes": sum(1 for row in rows if row.get("is_tor") or row.get("tor")),
        "i2p_nodes": sum(1 for row in rows if row.get("is_i2p") or row.get("i2p")),
        "vpn_nodes": sum(1 for row in rows if row.get("is_vpn")),
        "proxy_nodes": sum(1 for row in rows if row.get("is_proxy")),
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


def export_xml(input_path: Path, output_dir: Path, source: str | None = None) -> None:
    payload = load_snapshot(input_path)

    if source:
        payload["source"] = source

    rows = node_rows(payload.get("nodes", {}))

    mkdir(output_dir)

    write_xml(output_dir / "nodes.xml", nodes_root(rows, "nodes"))
    write_xml(output_dir / "reachable.xml", nodes_root([row for row in rows if row.get("reachable") is True], "reachable_nodes"))
    write_xml(output_dir / "unreachable.xml", nodes_root([row for row in rows if row.get("reachable") is False], "unreachable_nodes"))
    write_xml(output_dir / "ipv4.xml", nodes_root([row for row in rows if row.get("network") == "ipv4"], "ipv4_nodes"))
    write_xml(output_dir / "ipv6.xml", nodes_root([row for row in rows if row.get("network") == "ipv6"], "ipv6_nodes"))
    write_xml(output_dir / "cjdns.xml", nodes_root([row for row in rows if row.get("network") == "cjdns"], "cjdns_nodes"))
    write_xml(output_dir / "tor.xml", nodes_root([row for row in rows if row.get("is_tor") or row.get("tor")], "tor_nodes"))
    write_xml(output_dir / "i2p.xml", nodes_root([row for row in rows if row.get("is_i2p") or row.get("i2p")], "i2p_nodes"))
    write_xml(output_dir / "vpn.xml", nodes_root([row for row in rows if row.get("is_vpn")], "vpn_nodes"))
    write_xml(output_dir / "proxy.xml", nodes_root([row for row in rows if row.get("is_proxy")], "proxy_nodes"))

    write_xml(output_dir / "government.xml", nodes_root([row for row in rows if row.get("suspected_government")], "government_nodes"))
    write_xml(output_dir / "military.xml", nodes_root([row for row in rows if row.get("suspected_military")], "military_nodes"))
    write_xml(output_dir / "datacenter.xml", nodes_root([row for row in rows if row.get("suspected_datacenter")], "datacenter_nodes"))
    write_xml(output_dir / "apt-attribution.xml", nodes_root([row for row in rows if row.get("suspected_apt_related")], "apt_related_nodes"))
    write_xml(output_dir / "tag-attribution.xml", nodes_root([row for row in rows if row.get("suspected_threat_actor_group_related")], "tag_attribution_nodes"))
    write_xml(output_dir / "known-malactor.xml", nodes_root([row for row in rows if row.get("suspected_known_malicious_actor")], "known_malactor_nodes"))

    write_xml(
        output_dir / "leaderboard.xml",
        nodes_root(sorted(rows, key=lambda row: row.get("peer_index") or 0, reverse=True), "leaderboard"),
    )

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
    ]:
        write_xml(output_dir / filename, group_root(rows, key, safe_tag(filename.replace(".xml", "")), unknown=unknown))

    write_xml(output_dir / "status.xml", status_root(rows))
    write_xml(output_dir / "index.xml", status_root(rows))


def main() -> int:
    parser = argparse.ArgumentParser(description="Export ZZX-Labs Bitnodes XML files.")

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", default="bitcoin/bitnodes/api/xml")
    parser.add_argument("--source", default=None)
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    export_xml(
        input_path=Path(args.input),
        output_dir=Path(args.output),
        source=args.source,
    )

    print(f"xml export complete: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
