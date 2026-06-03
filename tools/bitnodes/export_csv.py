#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any


from export_json import load_snapshot, node_rows, mkdir


CSV_FIELDS = [
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


def scalar(value: Any) -> Any:
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))

    if value is None:
        return ""

    return value


def write_csv(path: Path, rows: list[dict[str, Any]], fields: list[str] = CSV_FIELDS) -> None:
    mkdir(path.parent)

    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()

        for row in rows:
            writer.writerow({field: scalar(row.get(field)) for field in fields})


def group_count(rows: list[dict[str, Any]], key: str, unknown: str = "Unknown") -> list[dict[str, Any]]:
    counts: dict[str, int] = {}

    for row in rows:
        value = row.get(key) or unknown
        value = str(value)
        counts[value] = counts.get(value, 0) + 1

    output = [
        {
            key: value,
            "count": count,
        }
        for value, count in counts.items()
    ]

    output.sort(key=lambda item: item["count"], reverse=True)
    return output


def write_group_csv(path: Path, rows: list[dict[str, Any]], key: str, unknown: str = "Unknown") -> None:
    data = group_count(rows, key, unknown=unknown)
    mkdir(path.parent)

    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=[key, "count"])
        writer.writeheader()
        writer.writerows(data)


def export_csv(input_path: Path, output_dir: Path, source: str | None = None) -> None:
    payload = load_snapshot(input_path)

    if source:
        payload["source"] = source

    rows = node_rows(payload.get("nodes", {}))

    mkdir(output_dir)

    write_csv(output_dir / "nodes.csv", rows)
    write_csv(output_dir / "reachable.csv", [row for row in rows if row.get("reachable") is True])
    write_csv(output_dir / "unreachable.csv", [row for row in rows if row.get("reachable") is False])
    write_csv(output_dir / "reachable-now.csv", [row for row in rows if row.get("reachable_now") is True])
    write_csv(output_dir / "reachable-24h.csv", [row for row in rows if row.get("reachable_24h") is True])

    write_csv(output_dir / "ipv4.csv", [row for row in rows if row.get("network") == "ipv4"])
    write_csv(output_dir / "ipv6.csv", [row for row in rows if row.get("network") == "ipv6"])
    write_csv(output_dir / "cjdns.csv", [row for row in rows if row.get("network") == "cjdns"])
    write_csv(output_dir / "tor.csv", [row for row in rows if row.get("is_tor") or row.get("tor")])
    write_csv(output_dir / "i2p.csv", [row for row in rows if row.get("is_i2p") or row.get("i2p")])
    write_csv(output_dir / "vpn.csv", [row for row in rows if row.get("is_vpn")])
    write_csv(output_dir / "proxy.csv", [row for row in rows if row.get("is_proxy")])

    write_csv(output_dir / "government.csv", [row for row in rows if row.get("suspected_government")])
    write_csv(output_dir / "military.csv", [row for row in rows if row.get("suspected_military")])
    write_csv(output_dir / "datacenter.csv", [row for row in rows if row.get("suspected_datacenter")])
    write_csv(output_dir / "apt-attribution.csv", [row for row in rows if row.get("suspected_apt_related")])
    write_csv(output_dir / "tag-attribution.csv", [row for row in rows if row.get("suspected_threat_actor_group_related")])
    write_csv(output_dir / "known-malactor.csv", [row for row in rows if row.get("suspected_known_malicious_actor")])

    write_csv(
        output_dir / "leaderboard.csv",
        sorted(rows, key=lambda row: row.get("peer_index") or 0, reverse=True),
    )

    for key, filename, unknown in [
        ("country", "countries.csv", "??"),
        ("continent", "continents.csv", "Unknown"),
        ("region", "regions.csv", "Unknown"),
        ("territory", "territories.csv", "Unknown"),
        ("county", "counties.csv", "Unknown"),
        ("city", "cities.csv", "Unknown"),
        ("zip", "zipcodes.csv", "Unknown"),
        ("timezone", "timezones.csv", "Unknown"),
        ("asn", "asns.csv", "UNKNOWN"),
        ("agent", "agents.csv", "UNKNOWN"),
        ("protocol", "versions.csv", "UNKNOWN"),
        ("port", "ports.csv", "UNKNOWN"),
        ("services", "services.csv", "UNKNOWN"),
        ("organization", "organizations.csv", "UNKNOWN"),
        ("provider", "providers.csv", "UNKNOWN"),
        ("provider_kind", "provider-kinds.csv", "unknown"),
        ("organization_type", "organization-types.csv", "unknown"),
        ("network_classification", "network-classifications.csv", "unknown"),
        ("network", "networks.csv", "unknown"),
    ]:
        write_group_csv(output_dir / filename, rows, key, unknown=unknown)

    status_rows = [
        {
            "metric": "total_nodes",
            "value": len(rows),
        },
        {
            "metric": "reachable_nodes",
            "value": sum(1 for row in rows if row.get("reachable") is True),
        },
        {
            "metric": "ipv4_nodes",
            "value": sum(1 for row in rows if row.get("network") == "ipv4"),
        },
        {
            "metric": "ipv6_nodes",
            "value": sum(1 for row in rows if row.get("network") == "ipv6"),
        },
        {
            "metric": "tor_nodes",
            "value": sum(1 for row in rows if row.get("is_tor") or row.get("tor")),
        },
        {
            "metric": "i2p_nodes",
            "value": sum(1 for row in rows if row.get("is_i2p") or row.get("i2p")),
        },
    ]

    with (output_dir / "status.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["metric", "value"])
        writer.writeheader()
        writer.writerows(status_rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Export ZZX-Labs Bitnodes CSV files.")

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", default="bitcoin/bitnodes/api/csv")
    parser.add_argument("--source", default=None)
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    export_csv(
        input_path=Path(args.input),
        output_dir=Path(args.output),
        source=args.source,
    )

    print(f"csv export complete: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
