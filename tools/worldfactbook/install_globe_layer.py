#!/usr/bin/env python3
"""Install a reviewed local equirectangular raster as an optional globe layer.

This does not fetch, scrape, or cache third-party tile services. Supply a source
file you are permitted to redistribute, its credit, licence, and source URL.
"""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path
from PIL import Image

LICENCES = {"Public domain", "CC0-1.0", "CC BY 4.0", "ODbL-1.0"}
MAX_FILE = 45_000_000


def digest(path: Path) -> str:
    hasher = sha256()
    with path.open("rb") as handle:
        while block := handle.read(1024 * 1024):
            hasher.update(block)
    return hasher.hexdigest()


def install(repo: Path, layer_id: str, source: Path, credit: str, licence: str,
            source_url: str) -> dict:
    root = repo / "worldfactbook" / "boundaries"
    manifest_path = root / "layers.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    layer = next((item for item in manifest["layers"] if item["id"] == layer_id), None)
    if not layer or not layer["file"].startswith("boundaries/custom/"):
        raise ValueError("Choose one of the optional layer IDs listed in boundaries/layers.json")
    if licence not in LICENCES or not credit.strip() or not source_url.startswith("https://"):
        raise ValueError("A redistributable licence, source credit, and HTTPS source URL are required")
    source = source.resolve(strict=True)
    with Image.open(source) as original:
        original.load()
        width, height = original.size
        if width < 2048 or height < 1024 or abs(width / height - 2) > .02:
            raise ValueError("Source must be equirectangular, at least 2048 × 1024, with a 2:1 ratio")
        image = original.convert("RGB")
    image.thumbnail((8192, 4096), Image.Resampling.LANCZOS)
    if image.width != 2 * image.height:
        image = image.resize((image.height * 2, image.height), Image.Resampling.LANCZOS)
    destination = repo / "worldfactbook" / layer["file"]
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(destination.name + ".tmp")
    try:
        for quality in (88, 78, 68, 58):
            image.save(temporary, format="WEBP", quality=quality, method=6)
            if temporary.stat().st_size <= MAX_FILE:
                break
        else:
            raise ValueError("Layer exceeds the 45 MB public file budget after compression")
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    layer.update(installed=True, credit=credit.strip(), licence=licence,
                 url=source_url, source_sha256=digest(source),
                 bytes=destination.stat().st_size, dimensions=[image.width, image.height],
                 sha256=digest(destination))
    updated = manifest_path.with_suffix(".json.tmp")
    updated.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    updated.replace(manifest_path)
    return {"layer": layer_id, "file": layer["file"], "dimensions": layer["dimensions"],
            "bytes": layer["bytes"], "credit": layer["credit"], "licence": licence}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path("."))
    parser.add_argument("--layer", required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--credit", required=True)
    parser.add_argument("--licence", required=True, choices=sorted(LICENCES))
    parser.add_argument("--source-url", required=True)
    args = parser.parse_args()
    print(json.dumps(install(args.repo, args.layer, args.source, args.credit,
                             args.licence, args.source_url), indent=2))


if __name__ == "__main__":
    main()
