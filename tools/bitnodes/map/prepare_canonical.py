#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Mapping

THIS = Path(__file__).resolve()
REPO_ROOT = THIS.parents[3]
TOOLS = REPO_ROOT / "tools" / "bitnodes"
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import merge_sources  # noqa: E402


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def node_count(payload: Any) -> int:
    if not isinstance(payload, Mapping):
        return 0
    rows = payload.get("nodes")
    if isinstance(rows, Mapping):
        return len(rows)
    if isinstance(rows, list):
        return sum(1 for row in rows if isinstance(row, (Mapping, list)))
    return 0


def usable(path: Path) -> tuple[bool, str, int]:
    if not path.is_file() or path.stat().st_size <= 0:
        return False, "", 0
    try:
        payload = read_json(path)
    except Exception:
        return False, "", 0
    count = node_count(payload)
    schema = str(payload.get("schema") or "") if isinstance(payload, Mapping) else ""
    return count > 0, schema, count


def first_usable(paths: list[Path]) -> Path | None:
    for path in paths:
        ok, _, _ = usable(path)
        if ok:
            return path
    return None


def discover(repo_root: Path, include_original: bool = False) -> list[tuple[str, Path]]:
    api = repo_root / "bitcoin" / "bitnodes" / "api"
    snapshot = api / "snapshots" / "latest.json"

    # A crawler-produced canonical snapshot is already the authoritative merge.
    ok, schema, _ = usable(snapshot)
    if ok and schema.startswith("zzx-bitnodes-canonical-v"):
        return [("published-canonical", snapshot)]

    inputs: list[tuple[str, Path]] = []

    zzx = first_usable([
        api / "enriched" / "zzxbitnodes" / "latest.geo.json",
        api / "enriched" / "zzxbitnodes" / "latest.json",
        api / "zzxbitnodes" / "latest.json",
    ])
    if zzx:
        inputs.append(("zzxbitnodes", zzx))

    btcnodes = first_usable([
        api / "enriched" / "btcnodes" / "latest.geo.json",
        api / "enriched" / "btcnodes" / "latest.json",
        api / "btcnodes" / "normalized" / "latest.json",
        api / "btcnodes" / "latest.json",
    ])
    if btcnodes:
        inputs.append(("btcnodes.io", btcnodes))

    # This is the important migration fallback: an older fast mirror may still
    # own snapshots/latest.json with schema zzx-bitnodes-normalized-v4.
    if not inputs:
        ok, _, _ = usable(snapshot)
        if ok:
            inputs.append(("published-normalized-fallback", snapshot))

    if not inputs:
        data_latest = first_usable([
            api / "data" / "latest.json",
            api / "latest.json",
        ])
        if data_latest:
            inputs.append(("published-data-fallback", data_latest))

    if include_original:
        original = first_usable([
            api / "enriched" / "originalbitnodes" / "latest.geo.json",
            api / "enriched" / "originalbitnodes" / "latest.json",
            api / "originalbitnodes" / "latest.json",
        ])
        if original:
            inputs.append(("originalbitnodes-compat", original))

    return inputs


def prepare(repo_root: Path, output: Path, report_path: Path | None, include_original: bool, compact: bool) -> dict[str, Any]:
    inputs = discover(repo_root, include_original=include_original)
    if not inputs:
        raise RuntimeError("Map Host found no usable full-node source to canonicalize")

    source_details = []
    for source, path in inputs:
        ok, schema, count = usable(path)
        if not ok:
            continue
        source_details.append({
            "source": source,
            "path": str(path.relative_to(repo_root)),
            "schema": schema,
            "node_rows": count,
        })

    if len(inputs) == 1 and inputs[0][0] == "published-canonical":
        payload = read_json(inputs[0][1])
        mode = "existing-canonical"
    else:
        payload = merge_sources.build(inputs)
        mode = "rebuilt-canonical"

    schema = str(payload.get("schema") or "")
    rows = payload.get("nodes")
    if not schema.startswith("zzx-bitnodes-canonical-v"):
        raise RuntimeError(f"canonical preparation produced wrong schema: {schema!r}")
    if not isinstance(rows, list) or not rows:
        raise RuntimeError("canonical preparation produced zero node rows")

    output.parent.mkdir(parents=True, exist_ok=True)
    kwargs = {"ensure_ascii": False, "separators": (",", ":")} if compact else {"ensure_ascii": False, "indent": 2}
    output.write_text(json.dumps(payload, **kwargs) + "\n", encoding="utf-8")

    geo = payload.get("geolocation") if isinstance(payload.get("geolocation"), Mapping) else {}
    report = {
        "schema": "zzx-bitnodes-maphost-canonical-prep-v1",
        "mode": mode,
        "output_schema": schema,
        "node_rows": len(rows),
        "sources": source_details,
        "geolocation": {
            "country": int(geo.get("country") or 0),
            "city": int(geo.get("city") or 0),
            "county": int(geo.get("county") or 0),
            "coordinates": int(geo.get("coordinates") or 0),
        },
    }
    if report_path:
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, **kwargs) + "\n", encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Prepare a canonical v2 Bitnodes snapshot for Map Host from the richest currently published full-node sources."
    )
    parser.add_argument("--repo-root", default=str(REPO_ROOT))
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", default="")
    parser.add_argument("--include-original", action="store_true")
    parser.add_argument("--minimum-nodes", type=int, default=1)
    parser.add_argument("--compact", action="store_true")
    args = parser.parse_args()

    report = prepare(
        Path(args.repo_root).resolve(),
        Path(args.output),
        Path(args.report) if args.report else None,
        include_original=bool(args.include_original),
        compact=bool(args.compact),
    )
    if int(report["node_rows"]) < max(1, int(args.minimum_nodes)):
        raise SystemExit(f"prepared canonical snapshot has too few nodes: {report['node_rows']}")
    print(json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
