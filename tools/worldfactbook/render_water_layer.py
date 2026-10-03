#!/usr/bin/env python3
"""Draw the water reference lines as an optional local globe imagery layer.

Requires Pillow. The existing tactical raster and all land hit maps stay intact.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw

WIDTH, HEIGHT = 2048, 1024


def projected(line):
    points = []
    previous = None
    for lon, lat in line:
        x = (lon + 180) * WIDTH / 360
        if previous is not None:
            x += round((previous - x) / WIDTH) * WIDTH
        points.append((x, (90 - lat) * HEIGHT / 180))
        previous = x
    for shift in (-WIDTH, 0, WIDTH):
        moved = [(x + shift, y) for x, y in points]
        if moved and max(x for x, _ in moved) >= 0 and min(x for x, _ in moved) < WIDTH:
            yield moved


def render(water_root, base, layer_file):
    water_root = Path(water_root)
    index = json.loads((water_root / "reference/index.json").read_text())
    reference = water_root / "reference"
    sources = {row["id"]: row["kind"] for row in index["sources"]}
    features = {}
    for name in index["indexes"]:
        for feature in json.loads((reference / name).read_text())["features"]:
            features[feature["id"]] = feature
    rings = defaultdict(list)
    for number in range(1, index["geometry_shards"] + 1):
        shard = json.loads((reference / f"geometry/part-{number:04d}.json").read_text())
        for identifier, group, path, start, coords in shard["records"]:
            rings[(identifier, group, path)].append((start, coords))
    image = Image.open(base).convert("RGB")
    if image.size != (WIDTH, HEIGHT):
        raise ValueError(f"Base globe raster must be {WIDTH}×{HEIGHT}")
    draw = ImageDraw.Draw(image)
    for (identifier, _, _), parts in sorted(rings.items()):
        feature = features[identifier]
        group = sources[feature["source"]]
        color = (83, 148, 156) if group == "marine" else \
                (134, 185, 160) if group == "lakes" else (75, 126, 142)
        line = [point for _, coords in sorted(parts) for point in coords]
        for coordinates in projected(line):
            if len(coordinates) >= 2:
                draw.line(coordinates, fill=color, width=1)
    destination = reference / "hydrographic.png"
    image.save(destination, optimize=True)
    if destination.stat().st_size > 2_000_000:
        raise ValueError("Hydrographic raster exceeds the local globe asset budget")
    catalog = Path(layer_file)
    layers = json.loads(catalog.read_text())
    entry = {"id": "water_reference", "name": "Hydrographic · water boundaries",
             "file": "boundaries/water/reference/hydrographic.png",
             "credit": "Natural Earth 1:10m marine areas, lakes and rivers · public domain",
             "url": "https://www.naturalearthdata.com/downloads/10m-physical-vectors/",
             "installed": True, "grid": False, "relief": 0,
             "sha256": hashlib.sha256(destination.read_bytes()).hexdigest()}
    layers["layers"] = [row for row in layers["layers"] if row["id"] != entry["id"]] + [entry]
    catalog.write_text(json.dumps(layers, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"layer": str(destination), "bytes": destination.stat().st_size,
                      "features": len(features)}, sort_keys=True))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--water", required=True, help="Generated boundaries/water directory")
    parser.add_argument("--base", required=True, help="Existing tactical PNG to copy")
    parser.add_argument("--layers", required=True, help="Globe imagery layer catalog")
    args = parser.parse_args()
    render(args.water, args.base, args.layers)
