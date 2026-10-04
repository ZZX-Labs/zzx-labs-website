#!/usr/bin/env python3
"""Verify published water indexes, provenance, reconstruction, and shard budgets."""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

MAX_JSON = 480_000
SHA = re.compile(r"[0-9a-f]{64}")


def read(path):
    raw = path.read_bytes()
    if len(raw) > MAX_JSON:
        raise ValueError(f"Oversize water JSON: {path}: {len(raw)}")
    return json.loads(raw)


def within(root, relative):
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError(f"Water shard escapes directory: {relative}")
    return path


def verify(repo):
    root = Path(repo) / "worldfactbook/boundaries/water"
    manifest = read(root / "manifest.json")
    if manifest.get("schema") != "zzx-water-boundaries-v1" or \
       manifest.get("reference") != "reference/index.json":
        raise ValueError("Invalid water boundary manifest")
    results = {}
    for year, relative in [(None, manifest["reference"]), *manifest.get("editions", {}).items()]:
        if year is not None and not 1962 <= int(year) <= 2027:
            raise ValueError(f"Invalid dated water boundary year: {year}")
        index_path = within(root, relative)
        index = read(index_path)
        if index.get("schema") != 1 or index.get("kind") != ("reference" if year is None else "historical") or \
           index.get("year") != (None if year is None else int(year)):
            raise ValueError(f"Water dataset has incorrect year provenance: {index_path}")
        if year is None and index.get("status") != "reference":
            raise ValueError("Present-day water geometry must be marked reference")
        if year is not None and index.get("status") != "unreviewed":
            raise ValueError("Dated water geometry must begin unreviewed")
        sources = index.get("sources", [])
        if not sources or len({row["id"] for row in sources}) != len(sources):
            raise ValueError("Missing or duplicated water sources")
        for row in sources:
            if not row.get("url", "").startswith("https://") or not row.get("license") or \
               not SHA.fullmatch(row.get("sha256", "")):
                raise ValueError(f"Incomplete water source attribution: {row.get('id')}")
        source_ids = {row["id"] for row in sources}
        base = index_path.parent
        features = []
        for name in index["indexes"]:
            if not re.fullmatch(r"indexes/part-\d{4}\.json", name):
                raise ValueError(f"Unsafe water index part: {name}")
            features.extend(read(within(base, name))["features"])
        if len(features) != index["features"] or not features:
            raise ValueError("Water feature index is incomplete")
        ids = set()
        by_id = {}
        references = defaultdict(set)
        for feature in features:
            identifier = feature["id"]
            if identifier in ids or not isinstance(identifier, int) or identifier <= 0:
                raise ValueError(f"Duplicate water feature ID: {identifier}")
            ids.add(identifier)
            by_id[identifier] = feature
            if feature["source"] not in source_ids or not feature["name"] or \
               feature["geometry"] not in ("polygon", "line") or not feature["parts"]:
                raise ValueError(f"Incomplete water feature: {identifier}")
            west, south, east, north = feature["bbox"]
            if not (-180 <= west <= east <= 180 and -90 <= south <= north <= 90):
                raise ValueError(f"Invalid water feature bbox: {identifier}")
            references[identifier].update(feature["parts"])
        if Counter(item["kind"] for item in features) != index["counts"]:
            raise ValueError("Water category counts differ from the index")
        segments = defaultdict(list)
        actual = defaultdict(set)
        geometry_names = sorted(set().union(*references.values()))
        if len(geometry_names) != index["geometry_shards"]:
            raise ValueError("Water geometry shard inventory differs from the index")
        for name in geometry_names:
            if not re.fullmatch(r"geometry/part-\d{4}\.json", name):
                raise ValueError(f"Unsafe water geometry part: {name}")
            for identifier, group, path, start, coords in read(within(base, name))["records"]:
                if identifier not in ids or not coords or start < 0:
                    raise ValueError(f"Orphaned water geometry: {name}")
                actual[identifier].add(name)
                segments[(identifier, group, path)].append((start, coords))
        if actual != references:
            raise ValueError("Water feature-to-geometry links are incomplete")
        for (identifier, group, path), pieces in segments.items():
            end = 0
            coords = []
            for start, chunk in sorted(pieces):
                if start != end:
                    raise ValueError(f"Gap or overlap in water geometry {identifier}/{group}/{path}")
                end += len(chunk)
                coords.extend(chunk)
            feature = by_id[identifier]
            if feature["geometry"] == "polygon" and (len(coords) < 4 or coords[0] != coords[-1]):
                raise ValueError(f"Unclosed water polygon {identifier}/{group}/{path}")
            if feature["geometry"] == "line" and len(coords) < 2:
                raise ValueError(f"Short water line {identifier}/{group}/{path}")
        results["reference" if year is None else str(year)] = {
            "features": len(features), "sources": len(sources),
            "geometry_shards": len(geometry_names), "missing_source_geometries": index.get("skipped", {})}
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path("."))
    args = parser.parse_args()
    print(json.dumps(verify(args.repo), sort_keys=True, indent=2))
