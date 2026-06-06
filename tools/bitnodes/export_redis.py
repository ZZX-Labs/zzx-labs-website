#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = APP_ROOT / "tools" / "bitnodes"

DEFAULT_DATA_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "api" / "data"
DEFAULT_INPUT = DEFAULT_DATA_DIR / "json" / "latest.json.gz"
DEFAULT_OUTPUT_DIR = DEFAULT_DATA_DIR / "redis"

SCHEMA = "zzx-bitnodes-export-redis-v1"

PUBLIC_FIELDS = [
    "node_id",
    "source",
    "source_type",
    "source_url",
    "crawler_version",
    "crawl_id",
    "address",
    "host",
    "port",
    "network",
    "agent",
    "protocol",
    "services",
    "height",
    "continent",
    "region",
    "city",
    "country",
    "territory",
    "county",
    "zip_code",
    "timezone",
    "latitude",
    "longitude",
    "asn",
    "organization",
    "provider",
    "w3w",
    "zzxgcs",
    "zzxgms",
    "geohash",
    "reachable",
    "reachable_now",
    "reachable_24h",
    "reachable_week",
    "reachable_month",
    "latency_ms",
    "last_seen",
    "raw_hash",
]


def read_json(path: Path) -> Any:
    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            return json.load(handle)

    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any, *, compact: bool = False) -> int:
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
    return path.stat().st_size


def write_gzip_json(path: Path, payload: Any, *, compact: bool = True) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)

    with gzip.open(path, "wt", encoding="utf-8", compresslevel=9) as handle:
        json.dump(
            payload,
            handle,
            ensure_ascii=False,
            indent=None if compact else 2,
            separators=(",", ":") if compact else None,
            sort_keys=not compact,
            default=str,
        )
        handle.write("\n")

    return path.stat().st_size


def resp(parts: list[str]) -> bytes:
    out = [f"*{len(parts)}\r\n".encode("utf-8")]

    for part in parts:
        data = str(part).encode("utf-8")
        out.append(f"${len(data)}\r\n".encode("utf-8"))
        out.append(data + b"\r\n")

    return b"".join(out)


def extract_nodes(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, dict):
        nodes = payload.get("nodes")

        if isinstance(nodes, list):
            return [node for node in nodes if isinstance(node, dict)]

        if isinstance(nodes, dict):
            out = []

            for address, node in nodes.items():
                if isinstance(node, dict):
                    row = dict(node)
                    row.setdefault("address", address)
                    out.append(row)

            return out

    if isinstance(payload, list):
        return [node for node in payload if isinstance(node, dict)]

    return []


def public_row(row: dict[str, Any]) -> dict[str, Any]:
    return {field: row.get(field) for field in PUBLIC_FIELDS}


def row_address(row: dict[str, Any]) -> str:
    return str(
        row.get("address")
        or row.get("node")
        or row.get("addr")
        or row.get("host")
        or row.get("node_id")
        or ""
    ).strip()


def source_counts(rows: list[dict[str, Any]]) -> dict[str, int]:
    return dict(sorted(Counter(str(row.get("source") or "unknown") for row in rows).items()))


def counter_for(rows: list[dict[str, Any]], key: str) -> dict[str, int]:
    return dict(sorted(Counter(str(row.get(key) or "unknown") for row in rows).items()))


def export_redis_files(
    rows: list[dict[str, Any]],
    output_dir: Path,
    *,
    key_prefix: str,
    compact: bool,
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)

    json_path = output_dir / "bitnodes.redis.json.gz"
    commands_path = output_dir / "bitnodes.redis.commands.gz"

    public_rows = [public_row(row) for row in rows]

    json_payload = {
        "schema": SCHEMA,
        "key_prefix": key_prefix,
        "node_count": len(public_rows),
        "source_counts": source_counts(public_rows),
        "country_counts": counter_for(public_rows, "country"),
        "network_counts": counter_for(public_rows, "network"),
        "asn_counts": counter_for(public_rows, "asn"),
        "nodes": public_rows,
    }

    json_size = write_gzip_json(json_path, json_payload, compact=True)

    sources = counter_for(public_rows, "source")
    countries = counter_for(public_rows, "country")
    networks = counter_for(public_rows, "network")
    asns = counter_for(public_rows, "asn")
    cities = counter_for(public_rows, "city")

    with gzip.open(commands_path, "wb", compresslevel=9) as handle:
        handle.write(
            resp(
                [
                    "DEL",
                    f"{key_prefix}:nodes",
                    f"{key_prefix}:sources",
                    f"{key_prefix}:countries",
                    f"{key_prefix}:networks",
                    f"{key_prefix}:asns",
                    f"{key_prefix}:cities",
                ]
            )
        )

        for row in public_rows:
            address = row_address(row)

            if not address:
                continue

            node_key = f"{key_prefix}:node:{address}"
            parts = ["HSET", node_key]

            for field in PUBLIC_FIELDS:
                value = row.get(field)
                parts.extend([field, "" if value is None else str(value)])

            handle.write(resp(parts))
            handle.write(resp(["SADD", f"{key_prefix}:nodes", address]))

            source = str(row.get("source") or "unknown")
            country = str(row.get("country") or "unknown")
            network = str(row.get("network") or "unknown")
            asn = str(row.get("asn") or "unknown")
            city = str(row.get("city") or "unknown")

            handle.write(resp(["SADD", f"{key_prefix}:source:{source}", address]))
            handle.write(resp(["SADD", f"{key_prefix}:country:{country}", address]))
            handle.write(resp(["SADD", f"{key_prefix}:network:{network}", address]))
            handle.write(resp(["SADD", f"{key_prefix}:asn:{asn}", address]))
            handle.write(resp(["SADD", f"{key_prefix}:city:{city}", address]))

        for name, count in sources.items():
            handle.write(resp(["HSET", f"{key_prefix}:sources", name, str(count)]))

        for name, count in countries.items():
            handle.write(resp(["HSET", f"{key_prefix}:countries", name, str(count)]))

        for name, count in networks.items():
            handle.write(resp(["HSET", f"{key_prefix}:networks", name, str(count)]))

        for name, count in asns.items():
            handle.write(resp(["HSET", f"{key_prefix}:asns", name, str(count)]))

        for name, count in cities.items():
            handle.write(resp(["HSET", f"{key_prefix}:cities", name, str(count)]))

    manifest = {
        "schema": SCHEMA,
        "key_prefix": key_prefix,
        "node_count": len(public_rows),
        "source_counts": sources,
        "artifacts": {
            "redis_json_gz": {
                "path": json_path.name,
                "bytes": json_size,
            },
            "redis_commands_gz": {
                "path": commands_path.name,
                "bytes": commands_path.stat().st_size,
            },
        },
        "redis_import_examples": {
            "linux": f"gzip -dc {commands_path.name} | redis-cli --pipe",
            "windows_git_bash": f"gzip -dc {commands_path.name} | redis-cli --pipe",
        },
    }

    write_json(output_dir / "manifest.json", manifest, compact=compact)
    return manifest


def import_commands(commands_gz: Path, redis_cli: str) -> int:
    if not commands_gz.exists():
        print(f"missing Redis command file: {commands_gz}", file=sys.stderr)
        return 1

    if sys.platform.startswith("win"):
        print(
            "Redis import is safest from Git Bash or WSL with: "
            f"gzip -dc {commands_gz} | redis-cli --pipe",
            file=sys.stderr,
        )
        return 0

    gzip_proc = subprocess.Popen(
        ["gzip", "-dc", str(commands_gz)],
        stdout=subprocess.PIPE,
    )

    redis_proc = subprocess.Popen(
        [redis_cli, "--pipe"],
        stdin=gzip_proc.stdout,
    )

    if gzip_proc.stdout:
        gzip_proc.stdout.close()

    redis_code = redis_proc.wait()
    gzip_code = gzip_proc.wait()

    return redis_code or gzip_code


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Export ZZX Bitnodes dataplane JSON into Redis rebuild artifacts."
    )

    parser.add_argument("--input", default=str(DEFAULT_INPUT))
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--key-prefix", default="zzx:bitnodes")
    parser.add_argument("--compact", action="store_true")
    parser.add_argument("--import-redis", action="store_true")
    parser.add_argument("--redis-cli", default="redis-cli")

    args = parser.parse_args()

    input_path = Path(args.input)

    if not input_path.exists():
        print(f"missing input: {input_path}", file=sys.stderr)
        return 1

    payload = read_json(input_path)
    rows = extract_nodes(payload)

    if not rows:
        print(f"no nodes found in input: {input_path}", file=sys.stderr)
        return 1

    output_dir = Path(args.output_dir)
    manifest = export_redis_files(
        rows,
        output_dir,
        key_prefix=str(args.key_prefix),
        compact=bool(args.compact),
    )

    print(
        "export_redis complete: "
        f"{manifest['node_count']} nodes, "
        f"output={output_dir}"
    )

    if args.import_redis:
        return import_commands(output_dir / "bitnodes.redis.commands.gz", str(args.redis_cli))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
