#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: Any) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)

    data = json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True
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
    out: list[Path] = []

    for path in paths:
        if path.is_file() and path.suffix == ".json":
            out.append(path)

        if path.is_dir():
            out.extend(sorted(path.rglob("*.json")))

    return sorted(set(out))


def merge_nodes(files: list[Path]) -> dict[str, Any]:
    nodes: dict[str, Any] = {}

    for path in files:
        try:
            payload = read_json(path)
        except Exception:
            continue

        source_nodes = {}

        if isinstance(payload, dict) and isinstance(payload.get("nodes"), dict):
            source_nodes = payload["nodes"]
        elif isinstance(payload, dict):
            source_nodes = {
                key: value
                for key, value in payload.items()
                if isinstance(value, list)
            }

        for address, row in source_nodes.items():
            if not isinstance(row, list):
                continue

            previous = nodes.get(address)

            if previous is None:
                nodes[address] = row
                continue

            if len(row) > len(previous):
                nodes[address] = row

    return nodes


def chunk_nodes(nodes: dict[str, Any], max_bytes: int) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    current: dict[str, Any] = {}

    for address in sorted(nodes):
        test = dict(current)
        test[address] = nodes[address]

        estimated = len(
            json.dumps(
                {"nodes": test},
                ensure_ascii=False,
                separators=(",", ":"),
                sort_keys=True
            ).encode("utf-8")
        )

        if current and estimated >= max_bytes:
            chunks.append(current)
            current = {}

        current[address] = nodes[address]

    if current:
        chunks.append(current)

    return chunks


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create chunked <25MB Bitnodes master registry backups."
    )

    parser.add_argument("--input", required=True)
    parser.add_argument("--api", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--latest-output", required=True)
    parser.add_argument("--max-mb", type=float, default=24.0)

    args = parser.parse_args()

    input_dir = Path(args.input)
    api_dir = Path(args.api)
    output_dir = Path(args.output)
    latest_dir = Path(args.latest_output)

    max_bytes = int(args.max_mb * 1024 * 1024)

    files = collect_json_files([input_dir, api_dir])
    nodes = merge_nodes(files)

    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    chunks = chunk_nodes(nodes, max_bytes=max_bytes)

    manifest = {
        "schema": "zzx-bitnodes-global-registry-v1",
        "generated_at": generated_at,
        "node_count": len(nodes),
        "chunk_count": len(chunks),
        "max_bytes": max_bytes,
        "chunks": []
    }

    for index, chunk in enumerate(chunks, start=1):
        name = f"nodes-{index:05d}.json"

        payload = {
            "schema": "zzx-bitnodes-global-registry-chunk-v1",
            "generated_at": generated_at,
            "chunk_index": index,
            "chunk_count": len(chunks),
            "node_count": len(chunk),
            "nodes": chunk
        }

        dated_path = output_dir / name
        latest_path = latest_dir / name

        size = write_json(dated_path, payload)
        write_json(latest_path, payload)

        digest = sha256_file(dated_path)

        manifest["chunks"].append({
            "file": name,
            "node_count": len(chunk),
            "bytes": size,
            "sha256": digest
        })

    write_json(output_dir / "manifest.json", manifest)
    write_json(latest_dir / "manifest.json", manifest)

    print(
        f"backup complete: {len(nodes)} nodes, "
        f"{len(chunks)} chunks, output={output_dir}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
