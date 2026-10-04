#!/usr/bin/env python3
"""Build source-backed, clickable marine and inland-water geometry for the Factbook globe.

The input is a JSON manifest of local GeoJSON files with source URLs and SHA-256
digests. ``--download`` retrieves missing inputs; digests are always checked.
Every output JSON file stays below the boundary shard limit. Reference geometry
is explicitly undated. An edition requires separately supplied dated sources.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import urllib.request
from collections import Counter
from pathlib import Path

LIMIT = 480_000
RECORD_POINTS = 600
USER_AGENT = "ZZX WorldFactbook water geometry builder/1"


def encode(value):
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")


def write(path, value):
    raw = encode(value)
    if len(raw) > LIMIT:
        raise ValueError(f"Oversize water shard: {path} ({len(raw)} bytes)")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)


def local_source(row, manifest_dir, download):
    path = (manifest_dir / row["path"]).resolve()
    if not path.is_relative_to(manifest_dir.resolve()):
        raise ValueError(f"Source path escapes manifest directory: {row['path']}")
    if not path.exists():
        if not download:
            raise FileNotFoundError(f"Missing {path}; use --download to fetch the pinned source")
        path.parent.mkdir(parents=True, exist_ok=True)
        request = urllib.request.Request(row["url"], headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=90) as response:
            raw = response.read(120_000_001)
        if len(raw) > 120_000_000:
            raise ValueError(f"Source is too large: {row['url']}")
        if hashlib.sha256(raw).hexdigest() != row["sha256"]:
            raise ValueError(f"Source digest changed: {row['url']}")
        path.write_bytes(raw)
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != row["sha256"]:
        raise ValueError(f"Source digest mismatch: {path}")
    data = json.loads(raw)
    if data.get("type") != "FeatureCollection" or not isinstance(data.get("features"), list):
        raise ValueError(f"Expected GeoJSON FeatureCollection: {path}")
    return data["features"]


def position(vertex):
    if not isinstance(vertex, (list, tuple)) or len(vertex) < 2:
        raise ValueError("Invalid water vertex")
    lon, lat = vertex[:2]
    if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in (lon, lat)):
        raise ValueError("Non-finite water vertex")
    if not -180 <= lon <= 180 or not -90 <= lat <= 90:
        raise ValueError(f"Out-of-range water vertex: {vertex}")
    return [round(lon, 5), round(lat, 5)]


def paths(geometry):
    kind, coords = geometry["type"], geometry["coordinates"]
    if kind == "Polygon":
        groups = [coords]
    elif kind == "MultiPolygon":
        groups = coords
    elif kind == "LineString":
        groups = [[coords]]
    elif kind == "MultiLineString":
        groups = [coords]
    else:
        raise ValueError(f"Unsupported water geometry: {kind}")
    polygon = kind.endswith("Polygon")
    for group_no, group in enumerate(groups):
        for path_no, coordinates in enumerate(group):
            vertices = [position(v) for v in coordinates]
            if len(vertices) < (4 if polygon else 2):
                raise ValueError("Water geometry has too few vertices")
            if polygon and vertices[0] != vertices[-1]:
                raise ValueError("Water polygon is not closed")
            yield group_no, path_no, vertices


def water_kind(source_kind, props):
    value = str(props.get("featurecla") or props.get("water") or
                props.get("waterway") or props.get("place") or source_kind).strip().lower()
    if source_kind == "marine":
        return value if value in {"ocean", "sea", "gulf", "bay", "strait", "sound",
                                  "channel", "lagoon", "fjord", "generic", "bight",
                                  "passage", "inlet"} else "marine area"
    if source_kind == "lakes":
        return "reservoir" if "reservoir" in value else "alkaline lake" if "alkaline" in value else "lake"
    if source_kind == "rivers":
        return "lake centerline" if "lake" in value else "canal" if "canal" in value else "river"
    raise ValueError(f"Unknown source class: {source_kind}")


def build(args):
    source_file = Path(args.sources).resolve()
    source_data = json.loads(source_file.read_text(encoding="utf-8"))
    if source_data.get("schema") != 1 or not source_data.get("sources"):
        raise ValueError("Source manifest must contain schema 1 and sources")
    year = args.year
    if year is not None and not 1962 <= year <= 2027:
        raise ValueError("Edition year outside 1962–2027")
    if year is None and any(row.get("year") is not None for row in source_data["sources"]):
        raise ValueError("Dated geometry cannot be called a current reference")
    if year is not None and any(row.get("year") != year for row in source_data["sources"]):
        raise ValueError("All historical water sources must cite the selected year")
    output = Path(args.output)
    destination = output / ("reference" if year is None else f"editions/{year}")
    records, features, seen = [], [], set()
    skipped = Counter()
    for source_no, row in enumerate(source_data["sources"]):
        if row["kind"] not in {"marine", "lakes", "rivers"}:
            raise ValueError(f"Unknown water source kind: {row['kind']}")
        if not row["url"].startswith("https://") or not row.get("license"):
            raise ValueError("Every water source needs an HTTPS URL and a license")
        for feature_no, original in enumerate(local_source(row, source_file.parent, args.download)):
            geometry = original.get("geometry")
            if not geometry:
                skipped[row["id"]] += 1
                continue
            props = original.get("properties") or {}
            native_id = props.get("ne_id")
            if native_id is not None and row["kind"] in {"marine", "lakes"}:
                key = f"{row['kind']}:{native_id}"
            else:
                key = f"{row['id']}:{feature_no+1}"
            if key in seen:
                skipped["duplicate"] += 1
                continue
            seen.add(key)
            identifier = len(features) + 1
            kind = water_kind(row["kind"], props)
            name = props.get("name") or props.get("name_en")
            if not name:
                name = f"Unnamed {kind} · {key}"
            if len(str(name)) > 240:
                raise ValueError(f"Suspiciously long water name: {key}")
            first = None
            lons, lats = [], []
            geometry_paths = list(paths(geometry))
            for group_no, path_no, vertices in geometry_paths:
                if first is None:
                    first = vertices[len(vertices)//2]
                lons.extend(p[0] for p in vertices)
                lats.extend(p[1] for p in vertices)
                for start in range(0, len(vertices), RECORD_POINTS):
                    records.append([identifier, group_no, path_no, start,
                                    vertices[start:start + RECORD_POINTS]])
            if not geometry_paths:
                skipped[row["id"]] += 1
                continue
            features.append({"id": identifier, "name": str(name), "kind": kind,
                             "geometry": "polygon" if geometry["type"].endswith("Polygon") else "line",
                             "source": row["id"], "source_id": key,
                             "bbox": [min(lons), min(lats), max(lons), max(lats)],
                             "lat": first[1], "lon": first[0], "parts": []})

    if not features:
        raise ValueError("No water geometry in input sources")
    chunk, chunk_no, chunk_bytes = [], 0, len(encode({"schema": 1, "records": []}))
    def flush():
        nonlocal chunk, chunk_no, chunk_bytes
        if not chunk:
            return
        chunk_no += 1
        name = f"geometry/part-{chunk_no:04d}.json"
        write(destination / name, {"schema": 1, "records": chunk})
        for identifier in dict.fromkeys(record[0] for record in chunk):
            features[identifier-1]["parts"].append(name)
        chunk = []
        chunk_bytes = len(encode({"schema": 1, "records": []}))

    for record in records:
        record_bytes = len(encode(record))
        if chunk_bytes + record_bytes + bool(chunk) > LIMIT:
            flush()
            if chunk_bytes + record_bytes > LIMIT:
                raise ValueError("Single coordinate record exceeds shard budget")
        chunk_bytes += record_bytes + bool(chunk)
        chunk.append(record)
    flush()
    index_parts, entries = [], []
    entries_bytes = len(encode({"schema": 1, "features": []}))
    def flush_index():
        nonlocal entries, entries_bytes
        if not entries:
            return
        name = f"indexes/part-{len(index_parts)+1:04d}.json"
        write(destination / name, {"schema": 1, "features": entries})
        index_parts.append(name)
        entries = []
        entries_bytes = len(encode({"schema": 1, "features": []}))

    for entry in features:
        entry_bytes = len(encode(entry))
        if entries_bytes + entry_bytes + bool(entries) > LIMIT:
            flush_index()
        entries_bytes += entry_bytes + bool(entries)
        entries.append(entry)
    flush_index()
    sources = [{key: row[key] for key in ("id", "kind", "url", "license", "sha256")}
               for row in source_data["sources"]]
    counts = Counter(feature["kind"] for feature in features)
    write(destination / "index.json", {"schema": 1, "kind": "reference" if year is None else "historical",
                                      "year": year, "status": "reference" if year is None else "unreviewed",
                                      "sources": sources, "counts": counts,
                                      "features": len(features), "indexes": index_parts,
                                      "geometry_shards": chunk_no, "skipped": skipped})
    manifest_path = output / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {
        "schema": "zzx-water-boundaries-v1", "editions": {}}
    if manifest.get("schema") != "zzx-water-boundaries-v1":
        raise ValueError("Incompatible water boundary manifest")
    if year is None:
        manifest["reference"] = "reference/index.json"
    else:
        manifest.setdefault("editions", {})[str(year)] = f"editions/{year}/index.json"
    write(manifest_path, manifest)
    print(json.dumps({"features": len(features), "counts": counts, "skipped": skipped,
                      "indexes": len(index_parts), "geometry_shards": chunk_no,
                      "output": str(destination)}, sort_keys=True))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sources", required=True, help="JSON list of source GeoJSON paths, URLs, digests and licenses")
    parser.add_argument("--output", required=True, help="Output water/ boundary directory")
    parser.add_argument("--year", type=int, help="Historical edition year; inputs must cite exactly that year")
    parser.add_argument("--download", action="store_true", help="Download missing verified public inputs")
    build(parser.parse_args())


if __name__ == "__main__":
    main()
