#!/usr/bin/env python3
"""Check local WebGPU globe textures and edition-scoped boundary shards.

Uses only Python's standard library, so the GitHub Pages workflow needs no
Node-based action, image library, or remote map provider.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path

MAX_JSON = 480_000
MAX_PNG = 2_000_000


def load_json(path):
    raw = path.read_bytes()
    if len(raw) > MAX_JSON:
        raise ValueError(f"Oversize boundary JSON: {path}")
    return json.loads(raw)


def safe(root, relative):
    candidate = (root / relative).resolve()
    if not candidate.is_relative_to(root.resolve()):
        raise ValueError(f"Boundary path escapes directory: {relative}")
    return candidate


def png(path):
    raw = path.read_bytes()
    if len(raw) > MAX_PNG or raw[:8] != b"\x89PNG\r\n\x1a\n" or raw[12:16] != b"IHDR":
        raise ValueError(f"Missing, oversize, or invalid PNG: {path}")
    if struct.unpack(">II", raw[16:24]) != (2048, 1024):
        raise ValueError(f"Unexpected globe raster size: {path}")


def verify(repo):
    world = Path(repo) / "worldfactbook"
    root = world / "boundaries"
    manifest = load_json(root / "manifest.json")
    archive = json.loads((world / "api/country-archive/index.json").read_text(encoding="utf-8"))
    known = {row["code"] for row in archive["countries"]}
    if manifest.get("schema") != 1 or manifest.get("reference") != "reference/index.json":
        raise ValueError("Invalid reference boundary manifest")
    if not isinstance(manifest.get("editions"), dict):
        raise ValueError("Missing edition geometry lookup")
    checked = {}
    for year, relative in [(None, manifest["reference"]), *manifest["editions"].items()]:
        if year is not None and not 1962 <= int(year) <= 2027:
            raise ValueError(f"Invalid historical year: {year}")
        path = safe(root, relative)
        data = load_json(path)
        if data.get("schema") != 1 or not data.get("features"):
            raise ValueError(f"Empty boundary index: {path}")
        if year is None:
            if data.get("kind") != "reference" or data.get("year") is not None:
                raise ValueError("A modern reference must never claim a historical edition")
        elif (data.get("kind") != "historical" or data.get("year") != int(year)
              or data.get("status") != "unreviewed" or not data.get("source_url")):
            raise ValueError(f"Edition {year} geometry lacks provenance and review status")
        png(safe(path.parent, data["lookup"]))
        png(safe(path.parent, data["map"]))
        png(path.parent / "topo.png")
        ids, codes = set(), set()
        for location in data["features"]:
            identifier, code = location["id"], location["code"]
            if identifier in ids or code in codes or identifier <= 0:
                raise ValueError(f"Duplicate boundary identifier: {path} {code}")
            ids.add(identifier)
            codes.add(code)
            if location["has_profile"] != (code in known):
                raise ValueError(f"Incorrect profile mapping: {code}")
            if not location["parts"]:
                raise ValueError(f"No shape shards for {code}")
            for name in location["parts"]:
                shard = load_json(safe(path.parent, name))
                if shard["code"] != code or not shard["rings"]:
                    raise ValueError(f"Unusable geometry for {code} in {name}")
        checked["reference" if year is None else year] = {"locations": len(codes),
            "with_profiles": len(codes & known)}
    reference = root / "reference"
    for name in ("satellite.png", "relief-base.png"):
        png(reference / name)
    provenance = load_json(root / "provenance.json")
    for name, expected in provenance["generated_assets"].items():
        path = safe(reference, name)
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError(f"Local texture differs from the cited source: {name}")
    globe = (world / "js/globe.js").read_text(encoding="utf-8")
    if any(host in globe for host in ("tile.openstreetmap.org", "opentopomap.org",
                                   "gibs.earthdata.nasa.gov")):
        raise ValueError("Globe still fetches blocked public tile services")
    return checked


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path("."))
    args = parser.parse_args()
    print(json.dumps(verify(args.repo), indent=2, sort_keys=True))
