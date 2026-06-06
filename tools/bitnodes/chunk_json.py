#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import os
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_MAX_BYTES = 24_000_000
DEFAULT_MAX_VOLUMES = 10_000


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: Any, *, compact: bool = True) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)

    text = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=False,
        indent=None if compact else 2,
        separators=(",", ":") if compact else None,
    ) + "\n"

    path.write_text(text, encoding="utf-8")
    return path.stat().st_size


def write_json_gz(path: Path, payload: Any, *, compact: bool = True) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)

    text = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=False,
        indent=None if compact else 2,
        separators=(",", ":") if compact else None,
    ) + "\n"

    with gzip.open(path, "wt", encoding="utf-8") as handle:
        handle.write(text)

    return path.stat().st_size


def json_size(payload: Any, *, compact: bool = True) -> int:
    return len(
        (
            json.dumps(
                payload,
                ensure_ascii=False,
                sort_keys=False,
                indent=None if compact else 2,
                separators=(",", ":") if compact else None,
            ) + "\n"
        ).encode("utf-8")
    )


def extract_items(payload: Any, key: str) -> tuple[str, list[tuple[str | None, Any]], dict[str, Any]]:
    if isinstance(payload, dict) and isinstance(payload.get(key), dict):
        meta = {k: v for k, v in payload.items() if k != key}
        return "dict", list(payload[key].items()), meta

    if isinstance(payload, dict) and isinstance(payload.get(key), list):
        meta = {k: v for k, v in payload.items() if k != key}
        return "list", [(None, item) for item in payload[key]], meta

    if isinstance(payload, list):
        return "list", [(None, item) for item in payload], {}

    if isinstance(payload, dict):
        return "dict", list(payload.items()), {}

    raise SystemExit("input JSON must be object, object-with-nodes, or array")


def build_volume_payload(
    *,
    schema: str,
    source: str,
    kind: str,
    item_key: str,
    container_type: str,
    meta: dict[str, Any],
    volume_index: int,
    items: list[tuple[str | None, Any]],
) -> dict[str, Any]:
    if container_type == "dict":
        data = {str(k): v for k, v in items if k is not None}
    else:
        data = [v for _k, v in items]

    payload = {
        "schema": f"{schema}-volume-v1",
        "source": source,
        "kind": kind,
        "generated_at": utc_now(),
        "volume_index": volume_index,
        "item_key": item_key,
        "item_count": len(items),
        item_key: data,
    }

    if meta:
        payload["metadata"] = meta

    return payload


def split_items(
    *,
    schema: str,
    source: str,
    kind: str,
    item_key: str,
    container_type: str,
    meta: dict[str, Any],
    items: list[tuple[str | None, Any]],
    max_bytes: int,
    compact: bool,
) -> list[dict[str, Any]]:
    volumes: list[dict[str, Any]] = []
    current: list[tuple[str | None, Any]] = []

    for item in items:
        candidate = current + [item]

        candidate_payload = build_volume_payload(
            schema=schema,
            source=source,
            kind=kind,
            item_key=item_key,
            container_type=container_type,
            meta=meta,
            volume_index=len(volumes),
            items=candidate,
        )

        if current and json_size(candidate_payload, compact=compact) > max_bytes:
            volumes.append(
                build_volume_payload(
                    schema=schema,
                    source=source,
                    kind=kind,
                    item_key=item_key,
                    container_type=container_type,
                    meta=meta,
                    volume_index=len(volumes),
                    items=current,
                )
            )
            current = [item]
            continue

        current = candidate

    if current:
        volumes.append(
            build_volume_payload(
                schema=schema,
                source=source,
                kind=kind,
                item_key=item_key,
                container_type=container_type,
                meta=meta,
                volume_index=len(volumes),
                items=current,
            )
        )

    return volumes


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Chunk Bitnodes runtime JSON into <=24MB volume files and replace latest.json with a thin wrapper."
    )

    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", default="")
    parser.add_argument("--latest", default="")
    parser.add_argument("--volumes-dir", default="")
    parser.add_argument("--item-key", default="nodes")
    parser.add_argument("--source", default="zzxbitnodes")
    parser.add_argument("--kind", default="runtime")
    parser.add_argument("--schema", default="zzx-bitnodes-runtime")
    parser.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES)
    parser.add_argument("--max-volumes", type=int, default=DEFAULT_MAX_VOLUMES)
    parser.add_argument("--gzip", action="store_true")
    parser.add_argument("--compact", action="store_true")
    parser.add_argument("--force-wrapper", action="store_true")
    parser.add_argument("--report", default="")

    args = parser.parse_args()

    input_path = Path(args.input)
    output_dir = Path(args.output_dir) if args.output_dir else input_path.parent
    latest_path = Path(args.latest) if args.latest else output_dir / "latest.json"
    volumes_dir = Path(args.volumes_dir) if args.volumes_dir else output_dir / "volumes"

    payload = read_json(input_path)
    container_type, items, meta = extract_items(payload, args.item_key)

    output_dir.mkdir(parents=True, exist_ok=True)

    full_size = json_size(payload, compact=args.compact)
    needs_chunking = args.force_wrapper or full_size > args.max_bytes

    if not needs_chunking:
        if input_path.resolve() != latest_path.resolve():
            shutil.copyfile(input_path, latest_path)

        wrapper = {
            "schema": f"{args.schema}-single-v1",
            "source": args.source,
            "kind": args.kind,
            "generated_at": utc_now(),
            "item_key": args.item_key,
            "item_count": len(items),
            "chunked": False,
            "size_bytes": latest_path.stat().st_size,
            "latest": latest_path.name,
        }

        if args.report:
            write_json(Path(args.report), wrapper, compact=args.compact)

        print(f"chunk_json: no chunking needed size={full_size} items={len(items)} latest={latest_path}")
        return 0

    with tempfile.TemporaryDirectory(prefix="zzx_chunk_json_") as tmp_name:
        tmp = Path(tmp_name)
        tmp_volumes = tmp / "volumes"
        tmp_volumes.mkdir(parents=True, exist_ok=True)

        volumes = split_items(
            schema=args.schema,
            source=args.source,
            kind=args.kind,
            item_key=args.item_key,
            container_type=container_type,
            meta=meta,
            items=items,
            max_bytes=args.max_bytes,
            compact=args.compact,
        )

        if len(volumes) > args.max_volumes:
            raise SystemExit(f"volume count exceeds max: {len(volumes)} > {args.max_volumes}")

        volume_entries = []

        for index, volume_payload in enumerate(volumes):
            suffix = ".json.gz" if args.gzip else ".json"
            name = f"{index:04d}{suffix}"
            path = tmp_volumes / name

            if args.gzip:
                size = write_json_gz(path, volume_payload, compact=args.compact)
            else:
                size = write_json(path, volume_payload, compact=args.compact)

            if not args.gzip and size > args.max_bytes:
                raise SystemExit(f"volume {name} exceeds max bytes: {size} > {args.max_bytes}")

            volume_entries.append({
                "index": index,
                "path": f"volumes/{name}",
                "size_bytes": size,
                "item_count": int(volume_payload.get("item_count") or 0),
                "compressed": bool(args.gzip),
            })

        wrapper = {
            "schema": f"{args.schema}-volume-wrapper-v1",
            "source": args.source,
            "kind": args.kind,
            "generated_at": utc_now(),
            "item_key": args.item_key,
            "item_count": len(items),
            "chunked": True,
            "max_volume_bytes": args.max_bytes,
            "volume_count": len(volume_entries),
            "volumes": volume_entries,
            "metadata": meta,
        }

        tmp_latest = tmp / "latest.json"
        wrapper_size = write_json(tmp_latest, wrapper, compact=args.compact)

        if wrapper_size > args.max_bytes:
            raise SystemExit(f"wrapper exceeds max bytes: {wrapper_size} > {args.max_bytes}")

        if volumes_dir.exists():
            shutil.rmtree(volumes_dir)

        volumes_dir.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(tmp_volumes), str(volumes_dir))

        latest_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(tmp_latest), str(latest_path))

        report = {
            **wrapper,
            "latest": str(latest_path),
            "volumes_dir": str(volumes_dir),
        }

        if args.report:
            write_json(Path(args.report), report, compact=args.compact)

        print(
            f"chunk_json: chunked items={len(items)} volumes={len(volume_entries)} "
            f"latest={latest_path} volumes_dir={volumes_dir}"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
