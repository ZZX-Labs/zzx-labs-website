#!/usr/bin/env python3
"""Generate original, reusable World Factbook ornamental PNGs (Pillow only).

The artwork uses parametric line fields, sphere projections and survey marks.
It includes no CIA artwork, geographic data, copied screenshots or network assets.
"""
from __future__ import annotations

import argparse
from io import BytesIO
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, PngImagePlugin

PALETTES = {
    "tactical": ("#080e0d", "#c0d674", "#e6a42b", "#536b64"),
    "copper": ("#100e0b", "#e5a773", "#a9c4b5", "#67574b"),
    "estuary": ("#081513", "#78c5b1", "#d1af6e", "#46726d"),
    "polar": ("#0a111a", "#a6c9d9", "#e5c48c", "#496675"),
    "nocturne": ("#0c0d18", "#a2a9dc", "#d4b36b", "#5e627e"),
    "savanna": ("#17130d", "#c9c88b", "#dc9257", "#797051"),
    "basalt": ("#101313", "#b9c3b6", "#bd9b63", "#636d69"),
    "archive": ("#17130f", "#d2b98c", "#95b8aa", "#736757"),
}
FAMILIES = {"wave": (1920, 960), "globe": (1200, 1200),
            "atlas": (1920, 960), "strip": (1800, 420)}
SCALE = 2


def rgba(hex_color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    value = hex_color.lstrip("#")
    return (*(int(value[i:i + 2], 16) for i in (0, 2, 4)), alpha)


def path(draw: ImageDraw.ImageDraw, points, color, width=1):
    draw.line([(round(x * SCALE), round(y * SCALE)) for x, y in points],
              fill=color, width=max(1, width * SCALE), joint="curve")


def frame(draw, size, palette, variant):
    w, h = size
    _, primary, secondary, muted = palette
    margin = 28
    corner = 26
    for x, side in ((margin, 1), (w - margin, -1)):
        for y, vertical in ((margin, 1), (h - margin, -1)):
            path(draw, [(x + side * corner, y), (x, y), (x, y + vertical * corner)],
                 rgba(secondary, 105), 1)
    for i in range(17):
        x = margin + (w - 2 * margin) * (i / 16)
        length = 15 if i % 4 == 0 else 7
        path(draw, [(x, h - margin), (x, h - margin - length)],
             rgba(primary, 80 if i % 4 else 125), 1)
    mark = 0.13 + variant * .02
    draw.ellipse((int(w * mark * SCALE), int((h - margin - 4) * SCALE),
                  int((w * mark + 3) * SCALE), int((h - margin - 1) * SCALE)),
                 fill=rgba(secondary, 180))


def wave(draw, size, palette, variant, strip=False):
    w, h = size
    _, primary, secondary, muted = palette
    left = 80 if strip else 500
    layers = 56 if strip else 75
    for index in range(layers):
        fraction = index / max(1, layers - 1)
        base = h * (-.18 + 1.38 * fraction)
        points = []
        for x in range(left, w + 24, 13):
            field = math.sin(x / (145 + variant * 9) + index * .115) * (18 + h * .085)
            field += math.sin(x / (275 + variant * 7) + index * .27) * (8 + h * .042)
            swell = .24 + .8 * math.exp(-((x - w * .68) / (w * .39)) ** 2)
            y = base + field * swell + (x - w * .5) * (.11 - fraction * .09)
            points.append((x, y))
        alpha = int((31 + 53 * (1 - abs(.55 - fraction))) *
                    min(1, max(.15, (index + 1) / 11)))
        color = secondary if index % 11 == 0 else primary if index % 3 else muted
        path(draw, points, rgba(color, alpha), 1)
    for band in range(6):
        y = h * (.2 + band * .12)
        x = w * (.74 + .02 * math.sin(band + variant))
        draw.ellipse((round((x - 3) * SCALE), round((y - 3) * SCALE),
                      round((x + 3) * SCALE), round((y + 3) * SCALE)),
                     fill=rgba(secondary, 120))


def globe_projection(lat, lon, yaw, tilt):
    latitude, longitude = math.radians(lat), math.radians(lon)
    x = math.cos(latitude) * math.sin(longitude)
    y = math.sin(latitude)
    z = math.cos(latitude) * math.cos(longitude)
    ca, sa = math.cos(yaw), math.sin(yaw)
    x, z = x * ca + z * sa, z * ca - x * sa
    ca, sa = math.cos(tilt), math.sin(tilt)
    return x, y * ca - z * sa, y * sa + z * ca


def globe(draw, size, palette, variant, center=None, radius=None, ornaments=True):
    w, h = size
    _, primary, secondary, muted = palette
    cx, cy = center or (w * .50, h * .50)
    radius = radius or min(w, h) * .355
    yaw, tilt = .32 + variant * .13, -.32 + variant * .055
    for front in (False, True):
        for longitude in range(-180, 180, 15):
            segments = []
            for latitude in range(-90, 91, 2):
                x, y, z = globe_projection(latitude, longitude, yaw, tilt)
                if (z >= 0) == front:
                    segments.append((cx + x * radius, cy - y * radius))
                else:
                    if len(segments) > 1:
                        path(draw, segments, rgba(primary, 89 if front else 21), 1)
                    segments = []
            if len(segments) > 1:
                path(draw, segments, rgba(primary, 89 if front else 21), 1)
        for latitude in range(-75, 76, 15):
            segments = []
            for longitude in range(-180, 181, 2):
                x, y, z = globe_projection(latitude, longitude, yaw, tilt)
                if (z >= 0) == front:
                    segments.append((cx + x * radius, cy - y * radius))
                else:
                    if len(segments) > 1:
                        path(draw, segments, rgba(secondary if latitude == 0 else primary,
                                                  150 if front and latitude == 0 else 85 if front else 18), 1)
                    segments = []
            if len(segments) > 1:
                path(draw, segments, rgba(secondary if latitude == 0 else primary,
                                          150 if front and latitude == 0 else 85 if front else 18), 1)
    box = [(cx - radius) * SCALE, (cy - radius) * SCALE,
           (cx + radius) * SCALE, (cy + radius) * SCALE]
    draw.ellipse(box, outline=rgba(primary, 176), width=2 * SCALE)
    if not ornaments:
        return
    outer = radius * 1.18
    draw.arc([(cx - outer) * SCALE, (cy - outer) * SCALE,
              (cx + outer) * SCALE, (cy + outer) * SCALE],
             start=variant * 19 + 12, end=variant * 19 + 260,
             fill=rgba(secondary, 145), width=2 * SCALE)
    draw.arc([(cx - outer * 1.09) * SCALE, (cy - outer * 1.09) * SCALE,
              (cx + outer * 1.09) * SCALE, (cy + outer * 1.09) * SCALE],
             start=variant * 19 + 182, end=variant * 19 + 346,
             fill=rgba(muted, 96), width=SCALE)
    for angle in range(0, 360, 15):
        theta = math.radians(angle)
        length = 13 if angle % 45 == 0 else 6
        points = [(cx + (outer + offset) * math.cos(theta),
                   cy + (outer + offset) * math.sin(theta)) for offset in (5, 5 + length)]
        path(draw, points, rgba(secondary if angle % 45 == 0 else primary, 115), 1)
    for index in range(12):
        longitude = index * 31 - 156
        latitude = 26 * math.sin(index * 1.7 + variant)
        x, y, z = globe_projection(latitude, longitude, yaw, tilt)
        if z > 0:
            px, py = (cx + x * radius) * SCALE, (cy - y * radius) * SCALE
            draw.ellipse((px - 3 * SCALE, py - 3 * SCALE, px + 3 * SCALE,
                          py + 3 * SCALE), fill=rgba(secondary, 210))


def atlas(draw, size, palette, variant):
    w, h = size
    _, primary, secondary, muted = palette
    wave(draw, size, palette, variant + 2)
    for i in range(19):
        x = 110 + i * 65
        path(draw, [(x, 140), (x, h - 130)], rgba(muted, 15), 1)
    for i in range(8):
        y = 155 + i * 78
        path(draw, [(100, y), (w - 100, y)], rgba(primary, 13), 1)
    globe(draw, size, palette, variant, center=(w * .72, h * .48),
          radius=h * .36, ornaments=False)
    for i in range(3):
        x = 118 + i * 29
        path(draw, [(x, 180), (x, h - 150)], rgba(secondary, 45 if i == 0 else 20), 1)
    for i in range(10):
        y = 190 + i * 48
        path(draw, [(145, y), (156 if i % 5 else 173, y)], rgba(secondary, 130), 1)


def produce(palette_name: str, family: str, variant: int, out: Path):
    palette = PALETTES[palette_name]
    size = FAMILIES[family]
    hi_size = tuple(n * SCALE for n in size)
    image = Image.new("RGBA", hi_size, (0, 0, 0, 0) if family == "globe" else rgba(palette[0]))
    overlay = Image.new("RGBA", hi_size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")
    if family == "globe":
        globe(draw, size, palette, variant)
    elif family == "atlas":
        atlas(draw, size, palette, variant)
        frame(draw, size, palette, variant)
    else:
        wave(draw, size, palette, variant, strip=family == "strip")
        frame(draw, size, palette, variant)
    image.alpha_composite(overlay)
    image = image.resize(size, Image.Resampling.LANCZOS)
    meta = PngImagePlugin.PngInfo()
    for key, value in {
        "Title": f"World Factbook {palette_name.title()} {family.title()}",
        "Creator": "ZZX Labs",
        "Description": "Original parametric contour and/or projected sphere artwork; no source imagery",
        "Credit": "ZZX Labs / World Factbook graphics generator",
        "Rights": "Created for ZZX Labs World Factbook; consult project asset terms",
        "Source": "tools/worldfactbook/build_decorative_art.py",
        "Variant": str(variant),
    }.items():
        meta.add_text(key, value)
    out.parent.mkdir(parents=True, exist_ok=True)
    stream = BytesIO()
    image.save(stream, format="PNG", pnginfo=meta, compress_level=6)
    payload = stream.getvalue()
    with Image.open(BytesIO(payload)) as check:
        check.verify()
    out.write_bytes(payload)
    with Image.open(out) as check:
        check.verify()
    return image


def contact_sheet(files, target: Path):
    thumb = (460, 255)
    sheet = Image.new("RGB", (thumb[0] * 4, thumb[1] * 8), "#161b1a")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for index, (name, path) in enumerate(files):
        x, y = (index % 4) * thumb[0], (index // 4) * thumb[1]
        with Image.open(path) as source:
            source.thumbnail((430, 220), Image.Resampling.LANCZOS)
            ox = x + (thumb[0] - source.width) // 2
            oy = y + (220 - source.height) // 2
            if source.mode == "RGBA":
                sheet.paste(source, (ox, oy), source)
            else:
                sheet.paste(source, (ox, oy))
        draw.text((x + 14, y + 228), name, font=font, fill="#dbe6be")
    target.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(target, compress_level=6)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True, help="Output directory")
    parser.add_argument("--palette", choices=PALETTES, default="tactical")
    parser.add_argument("--family", choices=FAMILIES, default="wave")
    parser.add_argument("--variant", type=int, default=0,
                        help="Nonnegative line arrangement variant for single output")
    parser.add_argument("--all", action="store_true", help="Build 32 PNGs plus catalog and preview")
    args = parser.parse_args(argv)
    if args.variant < 0:
        parser.error("variant must be nonnegative")
    selections = [(p, f, i) for i, p in enumerate(PALETTES) for f in FAMILIES] if args.all else [
        (args.palette, args.family, args.variant)]
    records, files = [], []
    for palette, family, variant in selections:
        name = f"{palette}-{family}" + (f"-v{variant}" if not args.all and variant else "")
        relative = Path("assets") / (name + ".png")
        target = args.out / relative
        produce(palette, family, variant, target)
        files.append((name, target))
        records.append({"file": relative.as_posix(), "family": family, "palette": palette,
                        "colors": PALETTES[palette], "size": FAMILIES[family],
                        "variant": variant, "bytes": target.stat().st_size,
                        "creator": "ZZX Labs", "source": "original procedural generator"})
    (args.out / "catalog.json").write_text(json.dumps({"schema": 1, "artworks": records}, indent=2) + "\n",
                                            encoding="utf-8")
    if args.all:
        contact_sheet(files, args.out / "contact-sheet.png")
    print(f"Created {len(records)} PNGs in {args.out}")


if __name__ == "__main__":
    main()
