#!/usr/bin/env python3
"""Build local globe imagery and year-specific, clickable Factbook boundaries.

Requires Pillow. No tile service or JavaScript build tools are required.

Examples:
  python build_globe_assets.py --reference --geojson ne_50m_admin_0_map_units.geojson \
    --output worldfactbook/boundaries --catalogue worldfactbook/api/country-archive/index.json \
    --points worldfactbook/country-points.json --satellite nasa-blue-marble.jpg \
    --relief natural-earth-relief.tif
  python build_globe_assets.py --year 1962 --geojson approved-1962.geojson \
    --source-url https://source.example/1962 --output worldfactbook/boundaries \
    --catalogue worldfactbook/api/country-archive/index.json

Historical boundaries are ingested ONLY from supplied, independently reviewed
GeoJSON. The reference geometry is never relabeled as a historical edition.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageOps

WIDTH, HEIGHT = 2048, 1024
MAX_JSON_BYTES = 480_000
SAFE_CODE = re.compile(r"^[A-Z0-9][A-Z0-9_-]{0,70}$")


def write_json(path: Path, value: object) -> None:
    raw = (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    if len(raw) > MAX_JSON_BYTES:
        raise ValueError(f"Oversize JSON shard: {path}: {len(raw)} bytes")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)


def rings(geometry: dict):
    kind = geometry.get("type")
    coords = geometry.get("coordinates", [])
    if kind == "Polygon":
        return [coords]
    if kind == "MultiPolygon":
        return coords
    raise ValueError(f"Expected Polygon or MultiPolygon, got {kind}")


def coordinates(ring):
    for vertex in ring:
        if len(vertex) < 2 or not all(math.isfinite(float(v)) for v in vertex[:2]):
            raise ValueError("Non-finite coordinate in boundary")
        lon, lat = float(vertex[0]), float(vertex[1])
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            raise ValueError(f"Out-of-range geographic coordinate: {lon}, {lat}")
        yield [round(lon, 4), round(lat, 4)]


def normalized(geometry):
    return [[list(coordinates(ring)) for ring in poly] for poly in rings(geometry)]


def source_code(feature, catalogue, aliases):
    prop = feature.get("properties", {})
    for explicit in (prop.get("factbook_code"), prop.get("code")):
        if explicit in catalogue or (isinstance(explicit, str) and explicit.startswith("GEO-")):
            return explicit
    for key in (prop.get("GU_A3"), prop.get("SU_A3"), prop.get("NAME"),
                prop.get("ISO_A2_EH"), prop.get("ISO_A2")):
        if key in aliases:
            value = aliases[key]
            if value not in catalogue:
                raise ValueError(f"Alias {key!r} maps to unknown archive code {value}")
            return value
    for value in (prop.get("ISO_A2_EH"), prop.get("ISO_A2")):
        if value in catalogue:
            return value
    unit = re.sub("[^A-Z0-9]+", "-", str(prop.get("SU_A3") or prop.get("GU_A3")
                                                 or prop.get("NAME") or "UNNAMED").upper()).strip("-")
    return f"GEO-{unit[:63]}"


def shape_records(path, code, features):
    """Split rings into bounded JSON shards without breaking geometry order."""
    records = []
    for polygon, poly in enumerate(features):
        for ring_index, ring in enumerate(poly):
            for start in range(0, len(ring), 750):
                records.append([polygon, ring_index, start, ring[start:start + 750]])
    parts = []
    chunk = []
    for record in records:
        trial = chunk + [record]
        if len(json.dumps(trial, separators=(",", ":"), ensure_ascii=False).encode()) > MAX_JSON_BYTES:
            if not chunk:
                raise ValueError(f"One geometry record too large: {code}")
            parts.append(chunk)
            chunk = [record]
        else:
            chunk = trial
    if chunk:
        parts.append(chunk)
    locations = []
    for number, chunk in enumerate(parts, 1):
        name = f"shapes/{code}/part-{number:04d}.json"
        write_json(path / name, {"schema": 1, "code": code, "rings": chunk})
        locations.append(name)
    return locations


def pixels(ring, width=WIDTH, height=HEIGHT):
    """Unwrap seams and draw shifted copies instead of crossing the whole map."""
    converted = []
    previous = None
    for lon, lat in ring:
        x = (lon + 180) * width / 360
        if previous is not None:
            x += round((previous - x) / width) * width
        converted.append((x, (90 - lat) * height / 180))
        previous = x
    for shift in (-width, 0, width):
        moved = [(x + shift, y) for x, y in converted]
        if moved and max(p[0] for p in moved) >= 0 and min(p[0] for p in moved) < width:
            yield moved


def paint(draw, polygons, fill, outline=None, hole=(0, 0, 0)):
    for poly in polygons:
        for outer in pixels(poly[0]):
            if len(outer) >= 3:
                draw.polygon(outer, fill=fill, outline=outline)
        for ring in poly[1:]:
            for void in pixels(ring):
                if len(void) >= 3:
                    draw.polygon(void, fill=hole)


def default_aliases():
    # The map-units layer splits these modern parent countries into units.
    return {"NJM": "SJ", "ATC": "AU"}


def build(args):
    output = Path(args.output)
    destination = output / ("reference" if args.reference else f"editions/{args.year}")
    catalogue = {row["code"]: row for row in json.loads(Path(args.catalogue).read_text())["countries"]}
    points_path = Path(args.points) if args.points else None
    points = {p["code"]: p for p in json.loads(points_path.read_text())["points"]} if points_path else {}
    aliases = default_aliases()
    if args.aliases:
        aliases.update(json.loads(Path(args.aliases).read_text()))
    source = Path(args.geojson)
    original = source.read_bytes()
    data = json.loads(original)
    if data.get("type") != "FeatureCollection" or not data.get("features"):
        raise ValueError("Expected a nonempty GeoJSON FeatureCollection")
    if not args.reference and not args.source_url:
        raise ValueError("Historical boundaries require --source-url for provenance")

    by_code = defaultdict(list)
    units = defaultdict(list)
    labels = {}
    for feature in data["features"]:
        geom = feature.get("geometry")
        if not geom:
            continue
        code = source_code(feature, catalogue, aliases)
        if not SAFE_CODE.fullmatch(code):
            raise ValueError(f"Unsafe location identifier: {code}")
        area = normalized(geom)
        if not area or any(not polygon or any(len(ring) < 4 or ring[0] != ring[-1]
                                               for ring in polygon)
                           for polygon in area):
            raise ValueError(f"Boundary must contain closed polygon rings: {code}")
        by_code[code].extend(area)
        props = feature.get("properties", {})
        name = str(props.get("NAME_EN") or props.get("NAME") or code)
        if name not in units[code]:
            units[code].append(name)
        if code not in labels:
            labels[code] = [props.get("LABEL_Y"), props.get("LABEL_X")]

    lookup = Image.new("RGB", (WIDTH, HEIGHT), (0, 0, 0))
    palette = Image.new("RGB", (WIDTH, HEIGHT), (9, 27, 39))
    click_draw, map_draw = ImageDraw.Draw(lookup), ImageDraw.Draw(palette)
    index = []
    for value, code in enumerate(sorted(by_code), 1):
        polygons = by_code[code]
        refs = shape_records(destination, code, polygons)
        lat, lon = labels[code]
        if code in points:
            lat, lon = points[code].get("lat"), points[code].get("lon")
        elif code in catalogue:
            lat, lon = catalogue[code].get("lat"), catalogue[code].get("lon")
        if lat is None or lon is None:
            first = polygons[0][0]
            lat = sum(point[1] for point in first) / len(first)
            lon = sum(point[0] for point in first) / len(first)
        if not all(math.isfinite(float(v)) for v in (lat, lon)):
            lat, lon = 0.0, 0.0
        name = catalogue.get(code, {}).get("name") or ", ".join(units[code])
        index.append({"id": value, "code": code, "name": name,
                      "label": ", ".join(units[code]), "lat": round(float(lat), 4),
                      "lon": round(float(lon), 4), "parts": refs,
                      "has_profile": code in catalogue})
        tone = int.from_bytes(hashlib.sha256(code.encode()).digest()[:1], "big") % 22
        paint(map_draw, polygons, (70 + tone, 106 + tone, 80 + tone), (37, 68, 61), (9, 27, 39))
        paint(click_draw, polygons, (value & 255, (value >> 8) & 255, 0))
    destination.mkdir(parents=True, exist_ok=True)
    lookup.save(destination / "regions.png", optimize=True)
    palette.save(destination / "map.png", optimize=True)

    image_base = "map.png"
    if args.reference:
        if args.satellite:
            satellite = Image.open(args.satellite).convert("RGB")
            if satellite.size != (WIDTH, HEIGHT):
                satellite = satellite.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
            satellite.save(destination / "satellite.png", optimize=True)
        if args.relief:
            relief = Image.open(args.relief).convert("L").resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
            # The Natural Earth raster supplies actual landform shading;
            # the geometry masks the shore and delineates territories.
            topo = ImageOps.colorize(relief, black="#193a36", white="#d6d49e")
            red, green, blue = lookup.split()
            mask = ImageChops.lighter(ImageChops.lighter(red, green), blue)
            mask = mask.point(lambda value: 255 if value else 0)
            topo.paste((9, 27, 39), (0, 0, WIDTH, HEIGHT), ImageOps.invert(mask))
            topo.save(destination / "relief-base.png", optimize=True)

    base = output / "reference" / "relief-base.png"
    topo = Image.open(base).convert("RGB") if base.exists() else palette.copy()
    border = ImageDraw.Draw(topo)
    for polygons in by_code.values():
        for poly in polygons:
            for ring in poly:
                for line in pixels(ring):
                    if len(line) > 1:
                        border.line(line, fill=(42, 75, 68), width=1)
    topo.save(destination / "topo.png", optimize=True)

    write_json(destination / "index.json", {"schema": 1, "kind": "reference" if args.reference else "historical",
               "year": args.year, "status": "reference" if args.reference else "unreviewed",
               "source_url": args.source_url, "source_sha256": hashlib.sha256(original).hexdigest(),
               "map": image_base, "lookup": "regions.png", "features": index})
    manifest_path = output / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"schema": 1, "editions": {}}
    path = "reference/index.json" if args.reference else f"editions/{args.year}/index.json"
    if args.reference:
        manifest["reference"] = path
    else:
        manifest["editions"][str(args.year)] = path
    write_json(manifest_path, manifest)
    print(json.dumps({"path": str(destination), "geometry_locations": len(index),
                      "sourced_profiles": sum(v["has_profile"] for v in index),
                      "unknown_profile_locations": [v["code"] for v in index if not v["has_profile"]],
                      "year": args.year, "kind": "reference" if args.reference else "historical"}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    scope = parser.add_mutually_exclusive_group(required=True)
    scope.add_argument("--reference", action="store_true")
    scope.add_argument("--year", type=int, choices=range(1962, 2028), metavar="1962..2027")
    parser.add_argument("--geojson", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--catalogue", required=True)
    parser.add_argument("--points")
    parser.add_argument("--aliases", help="JSON mapping source GU_A3 / SU_A3 / NAME / ISO code to archive code")
    parser.add_argument("--source-url", help="Required for dated historical geometry")
    parser.add_argument("--satellite", help="Local equirectangular Blue Marble image; reference only")
    parser.add_argument("--relief", help="Local equirectangular shaded relief raster; reference only")
    args = parser.parse_args()
    if not args.reference and (args.satellite or args.relief):
        parser.error("Terrain and satellite imagery are reference layers, not dated borders")
    build(args)


if __name__ == "__main__":
    main()
