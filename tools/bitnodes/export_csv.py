#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import gzip
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


def scalar(value: Any) -> Any:
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))

    if value is None:
        return ""

    return value


def gzip_file(path: Path) -> Path:
    gz_path = path.with_suffix(path.suffix + ".gz")

    with path.open("rb") as src, gzip.open(gz_path, "wb", compresslevel=9) as dst:
        dst.write(src.read())

    return gz_path


def write_csv(path: Path, rows: list[dict[str, Any]], fields: list[str] = CSV_FIELDS, gzip_copy: bool = True) -> dict[str, Any]:
    mkdir(path.parent)

    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()

        for row in rows:
            writer.writerow({field: scalar(row.get(field)) for field in fields})

    entry = {
        "path": path.name,
        "bytes": path.stat().st_size,
        "rows": len(rows),
    }

    if gzip_copy:
        gz = gzip_file(path)
        entry["gzip_path"] = gz.name
        entry["gzip_bytes"] = gz.stat().st_size

    return entry


def group_count(rows: list[dict[str, Any]], key: str, unknown: str = "Unknown") -> list[dict[str, Any]]:
    counts: dict[str, int] = {}

    for row in rows:
        value = str(row.get(key) or unknown)
        counts[value] = counts.get(value, 0) + 1

    output = [{key: value, "count": count} for value, count in counts.items()]
    output.sort(key=lambda item: item["count"], reverse=True)
    return output


def write_group_csv(path: Path, rows: list[dict[str, Any]], key: str, unknown: str = "Unknown", gzip_copy: bool = True) -> dict[str, Any]:
    data = group_count(rows, key, unknown=unknown)
    mkdir(path.parent)

    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=[key, "count"])
        writer.writeheader()
        writer.writerows(data)

    entry = {
        "path": path.name,
        "bytes": path.stat().st_size,
        "rows": len(data),
    }

    if gzip_copy:
        gz = gzip_file(path)
        entry["gzip_path"] = gz.name
        entry["gzip_bytes"] = gz.stat().st_size

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
        )
        + "\n",
        encoding="utf-8",
    )


def export_csv(
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
        "schema": "zzx-bitnodes-csv-export-v2",
        "source": payload.get("source"),
        "input": str(input_path),
        "output": str(output_dir),
        "node_count": len(rows),
        "files": {},
        "policy": {
            "canonical_store": "bitcoin/bitnodes/api/data",
            "csv_role": "portable dashboard/API cache export",
            "repo_rule": "CSV exports are aggregate files only. No per-node fan-out.",
        },
    }

    files: dict[str, dict[str, Any]] = {}

    subsets = {
        "nodes.csv": rows,
        "reachable.csv": [row for row in rows if row.get("reachable") is True],
        "unreachable.csv": [row for row in rows if row.get("reachable") is False],
        "reachable-now.csv": [row for row in rows if row.get("reachable_now") is True],
        "reachable-24h.csv": [row for row in rows if row.get("reachable_24h") is True],
        "ipv4.csv": [row for row in rows if row.get("network") == "ipv4"],
        "ipv6.csv": [row for row in rows if row.get("network") == "ipv6"],
        "cjdns.csv": [row for row in rows if row.get("network") == "cjdns"],
        "tor.csv": [row for row in rows if row.get("is_tor") or row.get("tor")],
        "i2p.csv": [row for row in rows if row.get("is_i2p") or row.get("i2p")],
        "vpn.csv": [row for row in rows if row.get("is_vpn")],
        "proxy.csv": [row for row in rows if row.get("is_proxy")],
        "government.csv": [row for row in rows if row.get("suspected_government")],
        "military.csv": [row for row in rows if row.get("suspected_military")],
        "datacenter.csv": [row for row in rows if row.get("suspected_datacenter")],
        "apt-attribution.csv": [row for row in rows if row.get("suspected_apt_related")],
        "tag-attribution.csv": [row for row in rows if row.get("suspected_threat_actor_group_related")],
        "known-malactor.csv": [row for row in rows if row.get("suspected_known_malicious_actor")],
        "leaderboard.csv": sorted(rows, key=lambda row: row.get("peer_index") or 0, reverse=True),
    }

    for filename, subset_rows in subsets.items():
        files[filename] = write_csv(output_dir / filename, subset_rows, gzip_copy=gzip_copy)

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
        ("geohash", "geohashes.csv", "unknown"),
        ("w3w", "what3words.csv", "unknown"),
        ("zzxgcs", "zzxgcs.csv", "unknown"),
        ("zzxgms", "zzxgms.csv", "unknown"),
    ]:
        files[filename] = write_group_csv(output_dir / filename, rows, key, unknown=unknown, gzip_copy=gzip_copy)

    status_rows = [
        {"metric": "total_nodes", "value": len(rows)},
        {"metric": "reachable_nodes", "value": sum(1 for row in rows if row.get("reachable") is True)},
        {"metric": "reachable_now", "value": sum(1 for row in rows if row.get("reachable_now") is True)},
        {"metric": "reachable_24h", "value": sum(1 for row in rows if row.get("reachable_24h") is True)},
        {"metric": "ipv4_nodes", "value": sum(1 for row in rows if row.get("network") == "ipv4")},
        {"metric": "ipv6_nodes", "value": sum(1 for row in rows if row.get("network") == "ipv6")},
        {"metric": "tor_nodes", "value": sum(1 for row in rows if row.get("is_tor") or row.get("tor"))},
        {"metric": "i2p_nodes", "value": sum(1 for row in rows if row.get("is_i2p") or row.get("i2p"))},
        {"metric": "vpn_nodes", "value": sum(1 for row in rows if row.get("is_vpn"))},
        {"metric": "proxy_nodes", "value": sum(1 for row in rows if row.get("is_proxy"))},
    ]

    status_path = output_dir / "status.csv"

    with status_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["metric", "value"])
        writer.writeheader()
        writer.writerows(status_rows)

    files["status.csv"] = {
        "path": "status.csv",
        "bytes": status_path.stat().st_size,
        "rows": len(status_rows),
    }

    if gzip_copy:
        gz = gzip_file(status_path)
        files["status.csv"]["gzip_path"] = gz.name
        files["status.csv"]["gzip_bytes"] = gz.stat().st_size

    manifest["files"] = files
    write_manifest(output_dir, manifest, compact=compact)

    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description="Export ZZX-Labs Bitnodes CSV cache files.")

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", default="bitcoin/bitnodes/api/csv")
    parser.add_argument("--source", default=None)
    parser.add_argument("--compact", action="store_true")
    parser.add_argument("--no-gzip", action="store_true")

    args = parser.parse_args()

    manifest = export_csv(
        input_path=Path(args.input),
        output_dir=Path(args.output),
        source=args.source,
        compact=args.compact,
        gzip_copy=not args.no_gzip,
    )

    print(f"csv export complete: {manifest['node_count']} nodes -> {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
