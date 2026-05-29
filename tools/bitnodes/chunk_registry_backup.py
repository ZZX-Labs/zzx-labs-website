#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return fallback


def write_json(path: Path, payload: Any, *, pretty: bool = False) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)

    data = json.dumps(
        payload,
        ensure_ascii=False,
        indent=2 if pretty else None,
        separators=None if pretty else (",", ":"),
        sort_keys=True,
    ).encode("utf-8")

    path.write_bytes(data + b"\n")

    return len(data) + 1


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)

    return digest.hexdigest()


def collect_json_files(paths: list[Path]) -> list[Path]:
    output: list[Path] = []

    for path in paths:
        if path.is_file() and path.suffix == ".json":
            output.append(path)

        elif path.is_dir():
            output.extend(sorted(path.rglob("*.json")))

    return sorted(set(output))


def normalize_address(address: Any) -> str:
    return str(address or "").strip()


def normalize_nodes(payload: Any) -> dict[str, Any]:
    if isinstance(payload, dict) and isinstance(payload.get("nodes"), dict):
        return {
            normalize_address(key): value
            for key, value in payload["nodes"].items()
            if normalize_address(key)
        }

    if isinstance(payload, dict) and isinstance(payload.get("results"), list):
        output = {}

        for row in payload["results"]:
            if not isinstance(row, dict):
                continue

            address = normalize_address(row.get("address") or row.get("node") or row.get("addr"))

            if address:
                output[address] = row

        return output

    if isinstance(payload, dict):
        return {
            normalize_address(key): value
            for key, value in payload.items()
            if normalize_address(key) and isinstance(value, (list, dict))
        }

    if isinstance(payload, list):
        output = {}

        for row in payload:
            if not isinstance(row, dict):
                continue

            address = normalize_address(row.get("address") or row.get("node") or row.get("addr"))

            if address:
                output[address] = row

        return output

    return {}


def row_quality(row: Any) -> int:
    if isinstance(row, dict):
        score = len([value for value in row.values() if value not in ("", None)])
        score += 20 if row.get("reachable") is True else 0
        score += 10 if row.get("height") else 0
        score += 10 if row.get("agent") or row.get("user_agent") else 0
        score += 10 if row.get("latitude") and row.get("longitude") else 0
        return score

    if isinstance(row, list):
        score = len([value for value in row if value not in ("", None)])
        score += 10 if len(row) > 4 and row[4] else 0
        score += 10 if len(row) > 8 and row[8] and len(row) > 9 and row[9] else 0
        return score

    return 0


def merge_nodes(files: list[Path]) -> dict[str, Any]:
    nodes: dict[str, Any] = {}

    for path in files:
        payload = read_json(path, fallback=None)

        if payload is None:
            continue

        source_nodes = normalize_nodes(payload)

        for address, row in source_nodes.items():
            previous = nodes.get(address)

            if previous is None or row_quality(row) >= row_quality(previous):
                nodes[address] = row

    return nodes


def estimated_payload_size(payload: Any) -> int:
    return len(
        json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    )


def chunk_nodes(nodes: dict[str, Any], max_bytes: int) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    current: dict[str, Any] = {}

    for address in sorted(nodes):
        test = dict(current)
        test[address] = nodes[address]

        estimated = estimated_payload_size({"nodes": test})

        if current and estimated >= max_bytes:
            chunks.append(current)
            current = {}

        current[address] = nodes[address]

    if current:
        chunks.append(current)

    return chunks


def clean_output_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)

    for item in path.glob("nodes-*.json"):
        try:
            item.unlink()
        except Exception:
            pass


def build_manifest(
    *,
    generated_at: str,
    node_count: int,
    chunk_count: int,
    max_bytes: int,
    source_files: list[Path],
) -> dict[str, Any]:
    return {
        "schema": "zzx-bitnodes-global-registry-v2",
        "generated_at": generated_at,
        "node_count": node_count,
        "chunk_count": chunk_count,
        "max_bytes": max_bytes,
        "source_file_count": len(source_files),
        "source_files": [str(path) for path in source_files],
        "chunks": [],
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create chunked <25MB ZZX Bitnodes master registry backups."
    )

    parser.add_argument("--input", required=True)
    parser.add_argument("--api", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--latest-output", required=True)
    parser.add_argument("--max-mb", type=float, default=24.0)
    parser.add_argument("--pretty", action="store_true")
    parser.add_argument("--no-clean", action="store_true")

    args = parser.parse_args()

    input_dir = Path(args.input).resolve()
    api_dir = Path(args.api).resolve()
    output_dir = Path(args.output).resolve()
    latest_dir = Path(args.latest_output).resolve()

    max_bytes = int(args.max_mb * 1024 * 1024)

    if not args.no_clean:
        clean_output_dir(output_dir)
        clean_output_dir(latest_dir)

    files = collect_json_files([input_dir, api_dir])
    nodes = merge_nodes(files)

    generated_at = utc_now_iso()
    chunks = chunk_nodes(nodes, max_bytes=max_bytes)

    manifest = build_manifest(
        generated_at=generated_at,
        node_count=len(nodes),
        chunk_count=len(chunks),
        max_bytes=max_bytes,
        source_files=files,
    )

    for index, chunk in enumerate(chunks, start=1):
        name = f"nodes-{index:05d}.json"

        payload = {
            "schema": "zzx-bitnodes-global-registry-chunk-v2",
            "generated_at": generated_at,
            "chunk_index": index,
            "chunk_count": len(chunks),
            "node_count": len(chunk),
            "nodes": chunk,
        }

        dated_path = output_dir / name
        latest_path = latest_dir / name

        size = write_json(dated_path, payload, pretty=args.pretty)
        write_json(latest_path, payload, pretty=args.pretty)

        manifest["chunks"].append({
            "file": name,
            "node_count": len(chunk),
            "bytes": size,
            "sha256": sha256_file(dated_path),
        })

    write_json(output_dir / "manifest.json", manifest, pretty=True)
    write_json(latest_dir / "manifest.json", manifest, pretty=True)

    print(
        f"backup complete: {len(nodes)} nodes, "
        f"{len(chunks)} chunks, output={output_dir}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
