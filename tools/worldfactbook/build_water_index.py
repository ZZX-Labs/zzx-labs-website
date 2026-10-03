#!/usr/bin/env python3
"""Compile source-backed ocean/sea/lake/river GeoJSON into a clickable lookup.

Natural Earth marine polygons, lakes, and river centerlines are suitable input.
Geometry is a present-day reference unless a dated edition source is supplied.
No water body is invented from a name or a point in the country registry.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw

WIDTH, HEIGHT = 4096, 2048
MAX_INDEX_BYTES = 480_000


def canonical(name: str, kind: str) -> str:
    name = re.sub(r"\s+", " ", name).strip()
    if kind == "marine":
        if re.search(r"\b(?:north|south)\s+atlantic\s+ocean\b", name, re.I):
            return "Atlantic Ocean"
        if re.search(r"\b(?:north|south)\s+pacific\s+ocean\b", name, re.I):
            return "Pacific Ocean"
        if re.fullmatch(r"(?:Antarctic|Southern) Ocean", name, re.I):
            return "Southern Ocean"
    return name


def water_kind(name: str, source_kind: str) -> str:
    return "ocean" if source_kind == "marine" and name.lower().endswith("ocean") else (
        "sea" if source_kind == "marine" else "lake" if source_kind == "lakes" else "river")


def projected(ring: list, shift: int = 0) -> list[tuple[float, float]]:
    points = []
    prev = None
    for vertex in ring:
        lon, lat = float(vertex[0]), float(vertex[1])
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            raise ValueError("Invalid water coordinate")
        x = (lon + 180) * WIDTH / 360
        if prev is not None: x += round((prev - x) / WIDTH) * WIDTH
        points.append((x + shift * WIDTH, (90 - lat) * HEIGHT / 180))
        prev = x
    return points


def draw_shape(draw: ImageDraw.ImageDraw, geometry: dict, color: tuple[int, int, int]) -> None:
    kind, coords = geometry.get("type"), geometry.get("coordinates", [])
    if kind in {"Polygon", "MultiPolygon"}:
        polygons = [coords] if kind == "Polygon" else coords
        for poly in polygons:
            for offset in (-1, 0, 1):
                outer = projected(poly[0], offset)
                if len(outer) >= 3: draw.polygon(outer, fill=color)
                for hole in poly[1:]:
                    inner = projected(hole, offset)
                    if len(inner) >= 3: draw.polygon(inner, fill=(0, 0, 0))
    elif kind in {"LineString", "MultiLineString"}:
        lines = [coords] if kind == "LineString" else coords
        for line in lines:
            for offset in (-1, 0, 1):
                points = projected(line, offset)
                if len(points) > 1: draw.line(points, fill=color, width=3, joint="curve")
    else:
        raise ValueError(f"Unsupported water geometry: {kind}")


def vertices(geometry: dict):
    kind = geometry["type"]
    if kind == "Polygon": groups = geometry["coordinates"]
    elif kind == "MultiPolygon": groups = [ring for poly in geometry["coordinates"] for ring in poly]
    elif kind == "LineString": groups = [geometry["coordinates"]]
    elif kind == "MultiLineString": groups = geometry["coordinates"]
    else: return
    for group in groups:
        for lon, lat, *_ in group:
            yield float(lon), float(lat)


def compile_index(sources: dict[str, Path], output: Path, source_urls: dict[str, str]):
    geometries = defaultdict(list)
    hashes = {}
    for kind, path in sources.items():
        raw = path.read_bytes()
        hashes[kind] = hashlib.sha256(raw).hexdigest()
        data = json.loads(raw)
        if data.get("type") != "FeatureCollection": raise ValueError(f"Expected FeatureCollection: {path}")
        for feature in data.get("features", []):
            props = feature.get("properties") or {}
            name = str(props.get("name_en") or props.get("NAME_EN") or props.get("name") or props.get("NAME") or "").strip()
            if not name or not feature.get("geometry"): continue
            grouped = canonical(name, kind)
            geometries[(kind, grouped)].append(feature["geometry"])
    output.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGB", (WIDTH, HEIGHT), (0, 0, 0))
    painter = ImageDraw.Draw(image)
    features = []
    # Painter's order: regional waters cover oceans; lakes cover regions;
    # narrow river centerlines cover lakes. Names and geometry stay sourced.
    ordered = sorted(geometries, key=lambda item: (0 if item[1].lower().endswith("ocean") else
                     1 if item[0]=="marine" else 2 if item[0]=="lakes" else 3, item[1]))
    for kind, name in ordered:
        current = geometries[(kind, name)]
        points = [p for shape in current for p in vertices(shape)]
        if not points: continue
        id_number = len(features) + 1
        if id_number >= 0xffffff: raise ValueError("Too many water features for RGB lookup")
        color = (id_number & 255, (id_number >> 8) & 255, (id_number >> 16) & 255)
        for shape in current: draw_shape(painter, shape, color)
        feature_kind = water_kind(name, kind)
        is_great = name.lower() in {"lake superior","lake michigan","lake huron","lake erie","lake ontario"}
        minimum = 1 if feature_kind=="ocean" else 1.6 if feature_kind=="sea" or is_great else 3 if feature_kind=="lake" else 4
        lon_values=[p[0] for p in points];lat_values=[p[1] for p in points]
        bounds=[min(lon_values),min(lat_values),max(lon_values),max(lat_values)]
        code=("X-" if feature_kind=="ocean" else "WTR-")+re.sub(r"[^A-Z0-9]+","-",name.upper()).strip("-")[:60]
        features.append({"id":id_number,"code":code,"name":name,"kind":feature_kind,
                         "min_zoom":minimum,"bounds":bounds,
                         "lon":round((bounds[0]+bounds[2])/2,5),
                         "lat":round((bounds[1]+bounds[3])/2,5),
                         "source_url":source_urls[kind],"source_sha256":hashes[kind]})
    image.save(output/"lookup.png", optimize=True)
    index={"schema":"zzx-water-click-index-v1","kind":"present-day-reference",
           "lookup":"lookup.png","dimensions":[WIDTH,HEIGHT],"features":[],
           "feature_parts":[],"source_urls":source_urls,"source_sha256":hashes}
    packed=lambda obj:(json.dumps(obj,ensure_ascii=False,separators=(",",":"))+"\n").encode()
    if len(packed({**index,"features":features}))<=MAX_INDEX_BYTES:
        index["features"]=features
    else:
        part=[]
        for feature in features:
            if part and len(packed({"features":[*part,feature]}))>MAX_INDEX_BYTES:
                filename=f"part-{len(index['feature_parts'])+1:04d}.json"
                (output/filename).write_bytes(packed({"features":part}))
                index["feature_parts"].append(filename)
                part=[]
            part.append(feature)
        if part:
            filename=f"part-{len(index['feature_parts'])+1:04d}.json"
            (output/filename).write_bytes(packed({"features":part}))
            index["feature_parts"].append(filename)
    encoded=packed(index)
    if len(encoded)>MAX_INDEX_BYTES: raise ValueError("Water index exceeds per-file limit even after sharding")
    (output/"index.json").write_bytes(encoded)
    return {"features":len(features),"lookup_bytes":(output/"lookup.png").stat().st_size,
            "index_bytes":len(encoded),"feature_parts":len(index["feature_parts"]),
            "kinds":{k:sum(f["kind"]==k for f in features)
                                           for k in ("ocean","sea","lake","river")}}


def main() -> None:
    ap=argparse.ArgumentParser(description=__doc__)
    for kind in ("marine","lakes","rivers"):
        ap.add_argument("--"+kind, required=True, type=Path)
        ap.add_argument("--"+kind+"-url", required=True)
    ap.add_argument("--output",required=True,type=Path)
    args=ap.parse_args()
    sources={k:getattr(args,k) for k in ("marine","lakes","rivers")}
    urls={k:getattr(args,k+"_url") for k in sources}
    print(json.dumps(compile_index(sources,args.output,urls),indent=2))


if __name__=="__main__":main()
