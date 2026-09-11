#!/usr/bin/env python3
"""Image/OCR extraction for the ZZX World Factbook corpus.

The extractor is deliberately provenance-first:
- images are normalized to PNG and deterministically named;
- OCR is retained verbatim enough for search, but never treated as authoritative credit;
- credits are only populated when an explicit credit/source marker is found in source text/OCR;
- every image record points back to the exact archived source URL and source SHA-256;
- citation_key is exactly the output filename stem, so filenames and attribution/citation
  records cannot silently drift apart.

Recognition is local/offline and conservative. OpenCV image features plus OCR/context are
used to classify broad visual types (map/chart/flag/seal/table/photo/diagram/document-page).
No person identification or fabricated semantic captioning is performed.
"""
from __future__ import annotations

import base64
import hashlib
import io
import json
import math
import mimetypes
import os
import posixpath
import re
import shutil
import subprocess
import tarfile
import tempfile
import urllib.parse
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageChops, ImageOps, ImageStat

try:
    import cv2  # type: ignore
    import numpy as np  # type: ignore
except Exception:  # pragma: no cover - workflow installs these
    cv2 = None
    np = None

try:
    import pytesseract  # type: ignore
except Exception:  # pragma: no cover
    pytesseract = None

try:
    from bs4 import BeautifulSoup  # type: ignore
except Exception:  # pragma: no cover
    BeautifulSoup = None

IMAGE_EXTS = {
    ".png", ".jpg", ".jpeg", ".jpe", ".webp", ".gif", ".bmp", ".tif", ".tiff",
    ".jp2", ".j2k", ".ppm", ".pgm", ".pbm",
}
ARCHIVE_EXTS = {".zip", ".7z", ".tar", ".tgz", ".tbz", ".tbz2", ".txz", ".chm"}
COMPRESSED_EXTS = {".gz", ".bz2", ".xz"}
EBOOK_EXTS = {".epub", ".mobi", ".azw", ".azw3", ".prc"}
OFFICE_EXTS = {".docx", ".odt"}
LEGACY_OFFICE_EXTS = {".doc", ".rtf"}
HTML_EXTS = {".html", ".htm", ".xhtml"}
PDF_EXTS = {".pdf"}
DJVU_EXTS = {".djvu", ".djv"}

CREDIT_RE = re.compile(
    r"(?im)(?:^|[\n\r])\s*(?:"
    r"(?:photo|image|map|illustration|graphic|satellite|source)\s+(?:credit|courtesy|source)"
    r"|credit|courtesy|copyright|©|\(c\)|source"
    r")\s*[:\-–—]?\s*([^\n\r]{2,260})"
)
CREDIT_INLINE_RE = re.compile(
    r"(?i)\b(?:photo|image|map|illustration|graphic)\s+(?:by|courtesy of|credit(?:ed)?(?:\s+to)?\s*[:\-–—]?)\s+([^\n\r;]{2,220})"
)

CATEGORY_TERMS = {
    "geography": ("map", "boundary", "terrain", "geographic", "geography", "latitude", "longitude"),
    "people-and-society": ("population", "people and society", "demographic", "ethnic", "religion"),
    "environment": ("environment", "climate", "natural hazard", "forest", "ecosystem"),
    "government": ("government", "flag", "coat of arms", "seal", "administrative division"),
    "economy": ("economy", "gdp", "trade", "industry", "agriculture", "economic"),
    "energy": ("energy", "electricity", "power", "petroleum", "natural gas", "coal", "nuclear"),
    "communications": ("communications", "telephone", "internet", "broadcast"),
    "transportation": ("transportation", "road", "rail", "airport", "port", "waterway"),
    "military-and-security": ("military", "security", "armed forces", "defense", "defence"),
    "space": ("space", "satellite", "launch", "orbital"),
}

UA = "ZZX-WorldFactbook-Crawler-Media/1.2 (+https://zzx-labs.io/)"


@dataclass(frozen=True)
class SourceContext:
    edition_year: int
    provider: str
    identifier: str
    source_url: str
    source_name: str
    source_format: str
    source_sha256: str
    timestamp: str = ""


def _slug(value: str, fallback: str = "global", limit: int = 64) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return (value[:limit] or fallback)


def _safe_member_path(name: str) -> str:
    name = name.replace("\\", "/").lstrip("/")
    name = posixpath.normpath(name)
    if name == "." or name.startswith("../") or "/../" in f"/{name}/":
        raise ValueError(f"unsafe archive member path: {name}")
    return name


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _open_image(data: bytes) -> Image.Image:
    with Image.open(io.BytesIO(data)) as src:
        # Animated images use first frame; Factbook archival material is static.
        try:
            src.seek(0)
        except Exception:
            pass
        return src.convert("RGBA")


def _trim_border(image: Image.Image) -> tuple[Image.Image, tuple[int, int, int, int]]:
    """Conservatively trim uniform/near-uniform outer margins."""
    if image.width < 4 or image.height < 4:
        return image, (0, 0, image.width, image.height)
    rgb = image.convert("RGB")
    corners = [
        rgb.getpixel((0, 0)),
        rgb.getpixel((rgb.width - 1, 0)),
        rgb.getpixel((0, rgb.height - 1)),
        rgb.getpixel((rgb.width - 1, rgb.height - 1)),
    ]
    bg = tuple(int(sum(px[i] for px in corners) / len(corners)) for i in range(3))
    bg_img = Image.new("RGB", rgb.size, bg)
    diff = ImageChops.difference(rgb, bg_img).convert("L")
    # Ignore tiny JPEG/background noise.
    diff = diff.point(lambda p: 255 if p > 16 else 0)
    bbox = diff.getbbox()
    if not bbox:
        return image, (0, 0, image.width, image.height)
    x0, y0, x1, y1 = bbox
    pad_x = max(2, int((x1 - x0) * 0.015))
    pad_y = max(2, int((y1 - y0) * 0.015))
    x0 = max(0, x0 - pad_x)
    y0 = max(0, y0 - pad_y)
    x1 = min(image.width, x1 + pad_x)
    y1 = min(image.height, y1 + pad_y)
    # Avoid aggressive crops that would remove >55% of either dimension.
    if (x1 - x0) < image.width * 0.45 or (y1 - y0) < image.height * 0.45:
        return image, (0, 0, image.width, image.height)
    return image.crop((x0, y0, x1, y1)), (x0, y0, x1, y1)


def _ocr(image: Image.Image, language: str = "eng") -> tuple[str, float]:
    if pytesseract is None or not shutil.which("tesseract"):
        return "", 0.0
    work = image.convert("RGB")
    max_dim = max(work.size)
    if max_dim > 2400:
        scale = 2400.0 / max_dim
        work = work.resize(
            (max(1, int(work.width * scale)), max(1, int(work.height * scale))),
            Image.Resampling.LANCZOS,
        )
    try:
        data = pytesseract.image_to_data(
            work,
            lang=language,
            config="--psm 6",
            output_type=pytesseract.Output.DICT,
        )
    except Exception:
        return "", 0.0
    words: list[str] = []
    confs: list[float] = []
    for text, conf in zip(data.get("text", []), data.get("conf", [])):
        text = str(text or "").strip()
        if not text:
            continue
        try:
            fconf = float(conf)
        except Exception:
            fconf = -1.0
        if fconf >= 0:
            confs.append(fconf)
        if fconf >= 20 or not confs:
            words.append(text)
    clean = re.sub(r"\s+", " ", " ".join(words)).strip()
    mean = sum(confs) / len(confs) if confs else 0.0
    return clean[:12000], round(mean, 2)


def _explicit_credit(*texts: str) -> tuple[str, str]:
    for source, text in (("source-text", texts[0] if texts else ""), ("ocr", texts[1] if len(texts) > 1 else "")):
        if not text:
            continue
        m = CREDIT_RE.search("\n" + text)
        if m:
            value = re.sub(r"\s+", " ", m.group(1)).strip(" .;:-")
            if value:
                return value[:320], source
        m = CREDIT_INLINE_RE.search(text)
        if m:
            value = re.sub(r"\s+", " ", m.group(1)).strip(" .;:-")
            if value:
                return value[:320], source
    return "", "none"


def _infer_entity(text: str, aliases: dict[str, tuple[str, str]]) -> tuple[str, str]:
    lower = " " + re.sub(r"\s+", " ", text.lower()) + " "
    matches: list[tuple[int, str, str]] = []
    for alias, pair in aliases.items():
        if len(alias) < 3:
            continue
        if f" {alias} " in lower:
            matches.append((len(alias), pair[0], pair[1]))
    if not matches:
        return "", ""
    matches.sort(reverse=True)
    _, code, name = matches[0]
    return code, name


def _infer_category(text: str) -> str:
    lower = text.lower()
    best = (0, "raw")
    for category, terms in CATEGORY_TERMS.items():
        score = sum(1 for term in terms if term in lower)
        if score > best[0]:
            best = (score, category)
    return best[1]


def _recognize(image: Image.Image, ocr_text: str, context_text: str) -> tuple[str, float, dict]:
    """Broad local visual recognition with auditable features, no guessed identities."""
    rgb = image.convert("RGB")
    stat = ImageStat.Stat(rgb)
    entropy = float(rgb.convert("L").entropy())
    aspect = rgb.width / max(1, rgb.height)
    mean_rgb = [round(x, 2) for x in stat.mean]
    saturation = 0.0
    edge_density = 0.0
    line_count = 0
    quantized_colors = 0

    if cv2 is not None and np is not None and rgb.width >= 8 and rgb.height >= 8:
        arr = np.array(rgb)
        hsv = cv2.cvtColor(arr, cv2.COLOR_RGB2HSV)
        saturation = float(hsv[:, :, 1].mean()) / 255.0
        gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
        edges = cv2.Canny(gray, 80, 180)
        edge_density = float((edges > 0).mean())
        lines = cv2.HoughLinesP(
            edges,
            1,
            math.pi / 180,
            threshold=max(35, min(rgb.width, rgb.height) // 8),
            minLineLength=max(25, min(rgb.width, rgb.height) // 7),
            maxLineGap=8,
        )
        line_count = 0 if lines is None else int(len(lines))
        small = cv2.resize(arr, (min(128, rgb.width), min(128, rgb.height)), interpolation=cv2.INTER_AREA)
        q = (small // 32).reshape(-1, 3)
        quantized_colors = int(len(np.unique(q, axis=0)))

    combined = f"{context_text}\n{ocr_text}".lower()
    number_tokens = len(re.findall(r"\b\d+(?:[.,]\d+)?%?\b", combined))
    map_terms = len(re.findall(r"\b(map|boundary|capital|province|ocean|sea|scale|km|miles|latitude|longitude|legend)\b", combined))
    chart_terms = len(re.findall(r"\b(chart|graph|percent|percentage|gdp|population|production|consumption|million|billion)\b", combined))
    flag_terms = len(re.findall(r"\b(flag|banner|ensign)\b", combined))
    seal_terms = len(re.findall(r"\b(seal|emblem|coat of arms|crest)\b", combined))
    text_chars = len(re.sub(r"\s+", "", ocr_text))

    label = "photograph"
    confidence = 0.52

    if text_chars > 450 and edge_density < 0.12:
        label, confidence = "document-page", 0.84
    elif map_terms >= 2 or (map_terms >= 1 and line_count >= 12):
        label, confidence = "map", min(0.94, 0.68 + 0.05 * map_terms)
    elif chart_terms >= 2 and (number_tokens >= 4 or line_count >= 10):
        label, confidence = "chart", min(0.92, 0.66 + 0.03 * min(8, number_tokens))
    elif flag_terms >= 1 or (1.25 <= aspect <= 2.2 and saturation > 0.30 and quantized_colors and quantized_colors < 40 and edge_density < 0.12):
        label, confidence = "flag", 0.76 if flag_terms else 0.62
    elif seal_terms >= 1 or (0.75 <= aspect <= 1.35 and quantized_colors and quantized_colors < 55 and edge_density > 0.05):
        label, confidence = "seal-or-emblem", 0.75 if seal_terms else 0.58
    elif line_count >= 25 and number_tokens >= 6:
        label, confidence = "table-or-chart", 0.67
    elif entropy < 4.1 and line_count >= 8:
        label, confidence = "diagram", 0.61
    elif entropy > 6.0:
        label, confidence = "photograph", 0.72
    else:
        label, confidence = "illustration", 0.55

    signals = {
        "width": rgb.width,
        "height": rgb.height,
        "aspect_ratio": round(aspect, 4),
        "entropy": round(entropy, 4),
        "mean_rgb": mean_rgb,
        "mean_saturation": round(saturation, 4),
        "edge_density": round(edge_density, 4),
        "line_count": line_count,
        "quantized_colors": quantized_colors,
        "ocr_characters": text_chars,
        "numeric_tokens": number_tokens,
        "map_terms": map_terms,
        "chart_terms": chart_terms,
    }
    return label, round(confidence, 3), signals


def _context_caption(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return ""
    # Credit/source lines belong in credit, not caption.
    parts = []
    for sentence in re.split(r"(?<=[.!?])\s+|[\n\r]+|\s{2,}", text):
        sentence = CREDIT_RE.sub("", "\n" + sentence).lstrip("\n").strip()
        sentence = CREDIT_INLINE_RE.sub("", sentence).strip(" .;:-")
        if not sentence:
            continue
        if 3 <= len(sentence) <= 420:
            parts.append(sentence.strip())
        if sum(len(x) for x in parts) >= 420:
            break
    return " ".join(parts)[:480]


def _citation(record: dict) -> tuple[str, str]:
    year = record["edition_year"]
    page = record.get("page")
    entity = record.get("entity_name") or "World Factbook"
    caption = record.get("caption") or record.get("visual_type") or "image"
    provider = record.get("source_provider") or "archive"
    url = record.get("source_url") or ""
    credit = record.get("credit") or ""
    loc = f", p. {page}" if page else ""
    citation = f"[{record['citation_key']}] The World Factbook, {year} edition, {entity}{loc}: {caption}. Archived via {provider}; {url}"
    if credit:
        citation += f" Image credit: {credit}."
    else:
        citation += " No separate image credit was printed or recognized in the source."
    attribution = credit if credit else f"The World Factbook ({year}); archived source: {url}"
    return citation, attribution


def _page_nearby_text(blocks: list[dict], bbox: tuple[float, float, float, float]) -> str:
    x0, y0, x1, y1 = bbox
    candidates: list[tuple[float, str]] = []
    for block in blocks:
        if int(block.get("type", -1)) != 0:
            continue
        bb = block.get("bbox") or (0, 0, 0, 0)
        bx0, by0, bx1, by1 = map(float, bb)
        horizontal_overlap = max(0.0, min(x1, bx1) - max(x0, bx0))
        if horizontal_overlap <= 0:
            continue
        text = " ".join(
            span.get("text", "")
            for line in block.get("lines", [])
            for span in line.get("spans", [])
        ).strip()
        if not text:
            continue
        if by0 >= y1:
            dist = by0 - y1
        elif by1 <= y0:
            dist = y0 - by1 + 20.0
        else:
            dist = 5.0
        if dist <= 140:
            candidates.append((dist, text))
    candidates.sort(key=lambda x: x[0])
    return "\n".join(text for _, text in candidates[:5])[:1800]


def _detect_render_regions(image: Image.Image) -> list[tuple[int, int, int, int]]:
    if cv2 is None or np is None:
        return []
    rgb = np.array(image.convert("RGB"))
    if rgb.shape[0] < 200 or rgb.shape[1] < 200:
        return []
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    # Visual blocks tend to contain connected non-white/edge regions larger than text lines.
    nonwhite = cv2.threshold(gray, 242, 255, cv2.THRESH_BINARY_INV)[1]
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (17, 17))
    closed = cv2.morphologyEx(nonwhite, cv2.MORPH_CLOSE, kernel, iterations=2)
    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    page_area = image.width * image.height
    out: list[tuple[int, int, int, int]] = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        area = w * h
        if w < max(120, image.width * 0.16) or h < max(100, image.height * 0.10):
            continue
        if area < page_area * 0.025 or area > page_area * 0.92:
            continue
        ratio = w / max(1, h)
        if ratio > 9 or ratio < 0.10:
            continue
        out.append((x, y, x + w, y + h))
    # Keep largest non-contained regions.
    out.sort(key=lambda b: (b[2] - b[0]) * (b[3] - b[1]), reverse=True)
    filtered: list[tuple[int, int, int, int]] = []
    for box in out[:20]:
        x0, y0, x1, y1 = box
        contained = False
        for a in filtered:
            ax0, ay0, ax1, ay1 = a
            if x0 >= ax0 and y0 >= ay0 and x1 <= ax1 and y1 <= ay1:
                contained = True
                break
        if not contained:
            filtered.append(box)
    return filtered[:12]


class MediaExtractor:
    def __init__(
        self,
        repo_root: Path,
        media_root: Path,
        portal_root: Path,
        entity_aliases: dict[str, tuple[str, str]],
        *,
        ocr_language: str = "eng",
        max_remote_image_bytes: int = 32 * 1024 * 1024,
        max_images_per_source: int = 2500,
    ) -> None:
        self.repo_root = repo_root.resolve()
        self.media_root = media_root.resolve()
        self.portal_root = portal_root.resolve()
        self.entity_aliases = entity_aliases
        self.ocr_language = ocr_language
        self.max_remote_image_bytes = max_remote_image_bytes
        self.max_images_per_source = max_images_per_source
        self._seen_occurrences: set[tuple[str, str]] = set()

    def _relative(self, path: Path) -> str:
        try:
            return path.resolve().relative_to(self.repo_root).as_posix()
        except Exception:
            return path.as_posix()

    def _download_image(self, url: str) -> bytes:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "image/*,*/*;q=0.1"})
        total = 0
        chunks: list[bytes] = []
        with urllib.request.urlopen(req, timeout=60) as response:
            ctype = (response.headers.get("Content-Type") or "").lower()
            if ctype and not (ctype.startswith("image/") or "octet-stream" in ctype):
                raise RuntimeError(f"remote image content-type is not image: {ctype}")
            while True:
                block = response.read(1024 * 1024)
                if not block:
                    break
                total += len(block)
                if total > self.max_remote_image_bytes:
                    raise RuntimeError("remote image exceeds configured limit")
                chunks.append(block)
        return b"".join(chunks)

    def _record(
        self,
        source: SourceContext,
        image: Image.Image,
        *,
        page: int = 0,
        image_index: int = 1,
        context_text: str = "",
        caption_hint: str = "",
        origin: str = "embedded",
        original_name: str = "",
        source_bbox: Iterable[float] | None = None,
        original_sha256: str = "",
    ) -> dict | None:
        if image.width < 12 or image.height < 12:
            return None
        cropped, crop_box = _trim_border(image)
        # Protect against decompression bombs / absurd dimensions.
        if cropped.width * cropped.height > 120_000_000:
            scale = math.sqrt(120_000_000 / (cropped.width * cropped.height))
            cropped = cropped.resize(
                (max(1, int(cropped.width * scale)), max(1, int(cropped.height * scale))),
                Image.Resampling.LANCZOS,
            )

        ocr_text, ocr_conf = _ocr(cropped, self.ocr_language)
        combined_context = "\n".join(x for x in (caption_hint, context_text) if x)
        credit, credit_source = _explicit_credit(combined_context, ocr_text)
        caption = _context_caption(caption_hint or context_text)
        if not caption and ocr_text and len(ocr_text) <= 480:
            caption = _context_caption(ocr_text)
        entity_code, entity_name = _infer_entity(combined_context + "\n" + ocr_text, self.entity_aliases)
        category = _infer_category(combined_context + "\n" + ocr_text)
        visual_type, recognition_confidence, signals = _recognize(cropped, ocr_text, combined_context)

        png = io.BytesIO()
        cropped.convert("RGBA").save(png, format="PNG", optimize=True)
        png_bytes = png.getvalue()
        # Keep every public media object below the repository's 24 MB artifact ceiling.
        # Downscaling is deterministic and only used when optimized PNG still exceeds it.
        while len(png_bytes) > 23_000_000 and min(cropped.size) > 320:
            cropped = cropped.resize(
                (max(1, int(cropped.width * 0.82)), max(1, int(cropped.height * 0.82))),
                Image.Resampling.LANCZOS,
            )
            png = io.BytesIO()
            cropped.convert("RGBA").save(png, format="PNG", optimize=True)
            png_bytes = png.getvalue()
        if len(png_bytes) > 23_000_000:
            raise RuntimeError("normalized image exceeds 23 MB public media ceiling")
        image_sha = _sha256_bytes(png_bytes)

        entity_slug = _slug(entity_code or entity_name or "global")
        category_slug = _slug(category, "raw")
        stem = (
            f"wfb-{source.edition_year}-{entity_slug}-{category_slug}-"
            f"p{int(page or 0):04d}-i{int(image_index):03d}-{image_sha[:12]}"
        )
        filename = stem + ".png"
        occurrence = (source.source_sha256, f"{page}:{image_index}:{origin}:{image_sha}")
        if occurrence in self._seen_occurrences:
            return None
        self._seen_occurrences.add(occurrence)

        image_dir = self.media_root / "images" / str(source.edition_year)
        meta_dir = self.media_root / "metadata" / str(source.edition_year)
        image_dir.mkdir(parents=True, exist_ok=True)
        meta_dir.mkdir(parents=True, exist_ok=True)
        image_path = image_dir / filename
        image_path.write_bytes(png_bytes)

        record = {
            "schema": "zzx-worldfactbook-image-v1",
            "citation_key": stem,
            "filename": filename,
            "path": self._relative(image_path),
            "edition_year": source.edition_year,
            "entity_code": entity_code,
            "entity_name": entity_name,
            "category": category,
            "page": int(page or 0),
            "image_index": int(image_index),
            "origin": origin,
            "original_name": original_name,
            "source_bbox": [round(float(v), 3) for v in source_bbox] if source_bbox else [],
            "crop_box": list(crop_box),
            "width": cropped.width,
            "height": cropped.height,
            "sha256": image_sha,
            "original_sha256": original_sha256,
            "caption": caption,
            "credit": credit,
            "credit_source": credit_source,
            "credit_status": "explicit" if credit else "not-found",
            "ocr_text": ocr_text,
            "ocr_confidence": ocr_conf,
            "visual_type": visual_type,
            "recognition_confidence": recognition_confidence,
            "recognition_method": "opencv-ocr-heuristic-v1",
            "recognition_signals": signals,
            "source_provider": source.provider,
            "source_identifier": source.identifier,
            "source_url": source.source_url,
            "source_document": source.source_name,
            "source_format": source.source_format,
            "source_sha256": source.source_sha256,
            "source_timestamp": source.timestamp,
        }
        citation, attribution = _citation(record)
        record["citation"] = citation
        record["attribution"] = attribution

        metadata_path = meta_dir / f"{stem}.json"
        record["metadata_path"] = self._relative(metadata_path)
        metadata_path.write_text(
            json.dumps(record, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        return record

    def _pdf(self, path: Path, source: SourceContext) -> list[dict]:
        try:
            import fitz  # PyMuPDF type: ignore
        except Exception as exc:
            raise RuntimeError(f"PyMuPDF is required for PDF image extraction: {exc}") from exc
        records: list[dict] = []
        doc = fitz.open(path)
        try:
            for pno in range(len(doc)):
                if len(records) >= self.max_images_per_source:
                    break
                page = doc[pno]
                page_dict = page.get_text("dict")
                blocks = page_dict.get("blocks") or []
                page_text = page.get_text("text") or ""
                image_blocks = [b for b in blocks if int(b.get("type", -1)) == 1 and b.get("image")]
                idx = 0
                for block in image_blocks:
                    idx += 1
                    try:
                        raw = bytes(block.get("image") or b"")
                        if not raw:
                            continue
                        image = _open_image(raw)
                        bbox = tuple(float(v) for v in block.get("bbox") or (0, 0, 0, 0))
                        nearby = _page_nearby_text(blocks, bbox)
                        rec = self._record(
                            source,
                            image,
                            page=pno + 1,
                            image_index=idx,
                            context_text=page_text[:6000],
                            caption_hint=nearby,
                            origin="pdf-image-block",
                            original_name=f"{path.name}#page-{pno+1}-image-{idx}",
                            source_bbox=bbox,
                            original_sha256=_sha256_bytes(raw),
                        )
                        if rec:
                            records.append(rec)
                    except Exception:
                        continue

                # Pages with no embedded raster image may still contain vector maps/charts,
                # or be a single scanned page. Render and detect bounded visual regions.
                if not image_blocks:
                    pix = page.get_pixmap(matrix=fitz.Matrix(1.75, 1.75), alpha=False)
                    rendered = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
                    regions = _detect_render_regions(rendered)
                    if regions:
                        for ridx, box in enumerate(regions, 1):
                            crop = rendered.crop(box)
                            rec = self._record(
                                source,
                                crop,
                                page=pno + 1,
                                image_index=ridx,
                                context_text=page_text[:6000],
                                caption_hint=page_text[:1800],
                                origin="pdf-rendered-region",
                                original_name=f"{path.name}#page-{pno+1}-region-{ridx}",
                                source_bbox=box,
                            )
                            if rec:
                                records.append(rec)
                    elif len(page_text.strip()) < 80:
                        rec = self._record(
                            source,
                            rendered,
                            page=pno + 1,
                            image_index=1,
                            context_text=page_text,
                            caption_hint="",
                            origin="pdf-scanned-page",
                            original_name=f"{path.name}#page-{pno+1}",
                            source_bbox=(0, 0, rendered.width, rendered.height),
                        )
                        if rec:
                            records.append(rec)
        finally:
            doc.close()
        return records

    def _epub(self, path: Path, source: SourceContext) -> list[dict]:
        records: list[dict] = []
        with zipfile.ZipFile(path) as zf:
            names = {_safe_member_path(n): n for n in zf.namelist() if not n.endswith("/")}
            context_by_member: dict[str, str] = {}
            if BeautifulSoup is not None:
                for safe, actual in names.items():
                    if Path(safe).suffix.lower() not in HTML_EXTS:
                        continue
                    try:
                        soup = BeautifulSoup(zf.read(actual), "html.parser")
                    except Exception:
                        continue
                    for img in soup.find_all("img"):
                        src = str(img.get("src") or "").strip()
                        if not src:
                            continue
                        member = _safe_member_path(posixpath.join(posixpath.dirname(safe), urllib.parse.unquote(src).split("#", 1)[0]))
                        fig = img.find_parent("figure")
                        figcaption = fig.find("figcaption") if fig else None
                        nearby = "\n".join(
                            x for x in (
                                str(img.get("alt") or "").strip(),
                                str(img.get("title") or "").strip(),
                                figcaption.get_text(" ", strip=True) if figcaption else "",
                                img.parent.get_text(" ", strip=True)[:800] if img.parent else "",
                            ) if x
                        )
                        if nearby:
                            context_by_member[member] = nearby[:1600]
            idx = 0
            for safe, actual in sorted(names.items()):
                if Path(safe).suffix.lower() not in IMAGE_EXTS:
                    continue
                idx += 1
                if idx > self.max_images_per_source:
                    break
                try:
                    raw = zf.read(actual)
                    image = _open_image(raw)
                    hint = context_by_member.get(safe, "")
                    rec = self._record(
                        source,
                        image,
                        image_index=idx,
                        context_text=hint,
                        caption_hint=hint,
                        origin="ebook-embedded-image",
                        original_name=safe,
                        original_sha256=_sha256_bytes(raw),
                    )
                    if rec:
                        records.append(rec)
                except Exception:
                    continue
        return records

    def _html(self, path: Path, source: SourceContext) -> list[dict]:
        if BeautifulSoup is None:
            return []
        text = path.read_text(encoding="utf-8", errors="replace")
        soup = BeautifulSoup(text, "html.parser")
        records: list[dict] = []
        idx = 0
        for img in soup.find_all("img"):
            idx += 1
            if idx > self.max_images_per_source:
                break
            src = str(img.get("src") or "").strip()
            if not src:
                continue
            fig = img.find_parent("figure")
            figcaption = fig.find("figcaption") if fig else None
            context = "\n".join(
                x for x in (
                    str(img.get("alt") or "").strip(),
                    str(img.get("title") or "").strip(),
                    figcaption.get_text(" ", strip=True) if figcaption else "",
                    img.parent.get_text(" ", strip=True)[:900] if img.parent else "",
                ) if x
            )[:1800]
            try:
                if src.startswith("data:image/"):
                    header, payload = src.split(",", 1)
                    raw = base64.b64decode(payload) if ";base64" in header else urllib.parse.unquote_to_bytes(payload)
                    original_name = f"data-image-{idx}"
                else:
                    url = urllib.parse.urljoin(source.source_url, src)
                    if not url.startswith(("https://", "http://")):
                        continue
                    raw = self._download_image(url)
                    original_name = url
                image = _open_image(raw)
                rec = self._record(
                    source,
                    image,
                    image_index=idx,
                    context_text=context,
                    caption_hint=context,
                    origin="html-image",
                    original_name=original_name,
                    original_sha256=_sha256_bytes(raw),
                )
                if rec:
                    records.append(rec)
            except Exception:
                continue
        return records

    def _office(self, path: Path, source: SourceContext) -> list[dict]:
        records: list[dict] = []
        with zipfile.ZipFile(path) as zf:
            idx = 0
            for name in sorted(zf.namelist()):
                safe = _safe_member_path(name)
                if Path(safe).suffix.lower() not in IMAGE_EXTS:
                    continue
                idx += 1
                if idx > self.max_images_per_source:
                    break
                try:
                    raw = zf.read(name)
                    rec = self._record(
                        source,
                        _open_image(raw),
                        image_index=idx,
                        origin="office-embedded-image",
                        original_name=safe,
                        original_sha256=_sha256_bytes(raw),
                    )
                    if rec:
                        records.append(rec)
                except Exception:
                    continue
        return records

    def _ebook_convert(self, path: Path, source: SourceContext) -> list[dict]:
        if not shutil.which("ebook-convert"):
            raise RuntimeError("ebook-convert is required for MOBI/AZW/AZW3/PRC image extraction")
        with tempfile.TemporaryDirectory(prefix="wfb-media-ebook-") as td:
            epub = Path(td) / "converted.epub"
            proc = subprocess.run(
                ["ebook-convert", str(path), str(epub)],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=300,
                check=False,
            )
            if proc.returncode != 0 or not epub.is_file():
                raise RuntimeError(f"ebook-convert failed: {proc.stderr[-700:]}")
            return self._epub(epub, source)

    def _legacy_office(self, path: Path, source: SourceContext) -> list[dict]:
        soffice = shutil.which("soffice") or shutil.which("libreoffice")
        if not soffice:
            raise RuntimeError("LibreOffice Writer is required for legacy DOC/RTF image extraction")
        with tempfile.TemporaryDirectory(prefix="wfb-media-office-") as td:
            outdir = Path(td)
            proc = subprocess.run(
                [soffice, "--headless", "--convert-to", "docx", "--outdir", str(outdir), str(path)],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=300,
                check=False,
            )
            converted = outdir / (path.stem + ".docx")
            if proc.returncode != 0 or not converted.is_file():
                raise RuntimeError(f"legacy office conversion failed: {proc.stderr[-700:]}")
            return self._office(converted, source)

    def _compressed(self, path: Path, source: SourceContext, depth: int) -> list[dict]:
        if depth >= 2:
            return []
        import bz2
        import gzip
        import lzma

        raw = path.read_bytes()
        ext = path.suffix.lower()
        if ext == ".gz":
            data = gzip.decompress(raw)
        elif ext == ".bz2":
            data = bz2.decompress(raw)
        else:
            data = lzma.decompress(raw)
        with tempfile.TemporaryDirectory(prefix="wfb-media-compressed-") as td:
            inner = Path(td) / path.stem
            inner.write_bytes(data)
            return self.extract(inner, source, depth=depth + 1)

    def _djvu(self, path: Path, source: SourceContext) -> list[dict]:
        if not shutil.which("djvused") or not shutil.which("ddjvu"):
            raise RuntimeError("djvused/ddjvu are required for DjVu image extraction")
        proc = subprocess.run(["djvused", str(path), "-e", "n"], capture_output=True, text=True, check=False)
        if proc.returncode != 0:
            raise RuntimeError("unable to read DjVu page count")
        pages = int(proc.stdout.strip() or "0")
        records: list[dict] = []
        with tempfile.TemporaryDirectory(prefix="wfb-media-djvu-") as td:
            for pno in range(1, pages + 1):
                if len(records) >= self.max_images_per_source:
                    break
                out = Path(td) / f"page-{pno:04d}.png"
                run = subprocess.run(
                    ["ddjvu", "-format=png", f"-page={pno}", "-scale=1800", str(path), str(out)],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.PIPE,
                    text=True,
                    check=False,
                )
                if run.returncode != 0 or not out.is_file():
                    continue
                image = Image.open(out).convert("RGBA")
                regions = _detect_render_regions(image)
                if regions:
                    for ridx, box in enumerate(regions, 1):
                        rec = self._record(
                            source,
                            image.crop(box),
                            page=pno,
                            image_index=ridx,
                            origin="djvu-rendered-region",
                            original_name=f"{path.name}#page-{pno}-region-{ridx}",
                            source_bbox=box,
                        )
                        if rec:
                            records.append(rec)
                else:
                    rec = self._record(
                        source,
                        image,
                        page=pno,
                        image_index=1,
                        origin="djvu-page",
                        original_name=f"{path.name}#page-{pno}",
                    )
                    if rec:
                        records.append(rec)
        return records

    def _archive(self, path: Path, source: SourceContext, depth: int) -> list[dict]:
        if depth >= 2:
            return []
        records: list[dict] = []
        with tempfile.TemporaryDirectory(prefix="wfb-media-archive-") as td:
            dest = Path(td) / "unpacked"
            dest.mkdir(parents=True, exist_ok=True)
            ext = path.suffix.lower()
            if ext == ".zip":
                with zipfile.ZipFile(path) as zf:
                    for member in zf.infolist():
                        if member.is_dir():
                            continue
                        safe = _safe_member_path(member.filename)
                        target = (dest / safe).resolve()
                        if dest.resolve() not in target.parents:
                            continue
                        target.parent.mkdir(parents=True, exist_ok=True)
                        with zf.open(member) as src, target.open("wb") as out:
                            shutil.copyfileobj(src, out)
            elif tarfile.is_tarfile(path):
                with tarfile.open(path) as tf:
                    tf.extractall(dest, filter="data")
            else:
                if not shutil.which("7z"):
                    raise RuntimeError("7z required for archive image extraction")
                subprocess.run(["7z", "x", "-y", f"-o{dest}", str(path)], check=True, stdout=subprocess.DEVNULL)
            for member in sorted(p for p in dest.rglob("*") if p.is_file()):
                if len(records) >= self.max_images_per_source:
                    break
                if member.stat().st_size > 768 * 1024 * 1024:
                    continue
                try:
                    records.extend(self.extract(member, source, depth=depth + 1))
                except Exception:
                    continue
        return records[: self.max_images_per_source]

    def extract(self, path: Path, source: SourceContext, *, depth: int = 0) -> list[dict]:
        path = Path(path)
        ext = path.suffix.lower()
        if not path.is_file() or path.stat().st_size <= 0:
            return []
        if ext in IMAGE_EXTS:
            raw = path.read_bytes()
            rec = self._record(
                source,
                _open_image(raw),
                image_index=1,
                origin="standalone-image",
                original_name=path.name,
                original_sha256=_sha256_bytes(raw),
            )
            return [rec] if rec else []
        if ext in PDF_EXTS:
            return self._pdf(path, source)
        if ext == ".epub":
            return self._epub(path, source)
        if ext in {".mobi", ".azw", ".azw3", ".prc"}:
            return self._ebook_convert(path, source)
        if ext in OFFICE_EXTS:
            return self._office(path, source)
        if ext in LEGACY_OFFICE_EXTS:
            return self._legacy_office(path, source)
        if ext in HTML_EXTS:
            return self._html(path, source)
        if ext in DJVU_EXTS:
            return self._djvu(path, source)
        if ext in COMPRESSED_EXTS:
            return self._compressed(path, source, depth)
        if ext in ARCHIVE_EXTS or tarfile.is_tarfile(path):
            return self._archive(path, source, depth)
        return []


def write_media_indexes(records: list[dict], portal_root: Path, media_root: Path, repo_root: Path, start: int, end: int) -> dict:
    portal_root.mkdir(parents=True, exist_ok=True)
    by_year: dict[int, list[dict]] = {}
    for row in records:
        by_year.setdefault(int(row.get("edition_year") or 0), []).append(row)

    years: list[dict] = []
    attribution_years: list[dict] = []
    for year in range(start, end + 1):
        rows = sorted(by_year.get(year, []), key=lambda r: (r.get("entity_name") or "", r.get("page") or 0, r.get("image_index") or 0, r.get("filename") or ""))
        ydir = portal_root / "media" / str(year)
        adir = portal_root / "attributions" / str(year)
        ydir.mkdir(parents=True, exist_ok=True)
        adir.mkdir(parents=True, exist_ok=True)
        image_payload = {
            "schema": "zzx-worldfactbook-media-year-v1",
            "edition_year": year,
            "count": len(rows),
            "images": rows,
        }
        (ydir / "index.json").write_text(json.dumps(image_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        attributions = [
            {
                "citation_key": r["citation_key"],
                "filename": r["filename"],
                "path": r["path"],
                "caption": r.get("caption") or "",
                "credit": r.get("credit") or "",
                "credit_status": r.get("credit_status") or "not-found",
                "citation": r.get("citation") or "",
                "attribution": r.get("attribution") or "",
                "source_url": r.get("source_url") or "",
                "source_sha256": r.get("source_sha256") or "",
                "page": r.get("page") or 0,
            }
            for r in rows
        ]
        (adir / "images.json").write_text(
            json.dumps({"schema": "zzx-worldfactbook-image-attributions-v1", "edition_year": year, "images": attributions}, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        years.append({"year": year, "images": len(rows), "path": f"media/{year}/index.json"})
        attribution_years.append({"year": year, "images": len(rows), "path": f"attributions/{year}/images.json"})

    media_index = {
        "schema": "zzx-worldfactbook-media-index-v1",
        "range": [start, end],
        "images": len(records),
        "years": years,
        "filename_convention": "wfb-{edition}-{entity}-{category}-p{page:04d}-i{index:03d}-{sha12}.png",
        "citation_key_rule": "citation_key equals the image filename stem",
        "media_root": media_root.resolve().relative_to(repo_root.resolve()).as_posix(),
        "recognition": "opencv-ocr-heuristic-v1",
        "credit_policy": "Only explicit credit/source text is stored as image credit; otherwise credit_status is not-found and provenance remains in citation.",
    }
    (portal_root / "media-index.json").write_text(json.dumps(media_index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (portal_root / "attribution-index.json").write_text(
        json.dumps({"schema": "zzx-worldfactbook-attribution-index-v1", "images": len(records), "years": attribution_years}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return media_index


def load_existing_media(portal_root: Path, start: int, end: int) -> list[dict]:
    rows: list[dict] = []
    for year in range(start, end + 1):
        path = portal_root / "media" / str(year) / "index.json"
        if not path.is_file():
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            if payload.get("schema") != "zzx-worldfactbook-media-year-v1":
                continue
            rows.extend(payload.get("images") or [])
        except Exception:
            continue
    return rows

MEDIA_SCHEMA_SQL = r'''SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS worldfactbook_images (
  citation_key VARCHAR(255) NOT NULL,
  edition_year SMALLINT UNSIGNED NOT NULL,
  entity_code VARCHAR(24) NOT NULL DEFAULT '',
  entity_name VARCHAR(160) NOT NULL DEFAULT '',
  category VARCHAR(96) NOT NULL DEFAULT 'raw',
  page INT UNSIGNED NOT NULL DEFAULT 0,
  image_index INT UNSIGNED NOT NULL DEFAULT 0,
  filename VARCHAR(255) NOT NULL,
  path TEXT NOT NULL,
  metadata_path TEXT NOT NULL,
  width INT UNSIGNED NOT NULL,
  height INT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  caption TEXT NOT NULL,
  credit TEXT NOT NULL,
  credit_status VARCHAR(24) NOT NULL,
  ocr_text MEDIUMTEXT NOT NULL,
  ocr_confidence DECIMAL(6,2) NOT NULL DEFAULT 0,
  visual_type VARCHAR(64) NOT NULL,
  recognition_confidence DECIMAL(6,3) NOT NULL DEFAULT 0,
  source_provider VARCHAR(64) NOT NULL,
  source_identifier VARCHAR(255) NOT NULL,
  source_url TEXT NOT NULL,
  source_document VARCHAR(255) NOT NULL,
  source_format VARCHAR(32) NOT NULL,
  source_sha256 CHAR(64) NOT NULL,
  citation TEXT NOT NULL,
  attribution TEXT NOT NULL,
  PRIMARY KEY (citation_key),
  KEY idx_wfb_image_year_category (edition_year, category),
  KEY idx_wfb_image_entity_year (entity_code, edition_year),
  KEY idx_wfb_image_source_sha (source_sha256),
  KEY idx_wfb_image_visual_type (visual_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
'''


def _sql_esc(value) -> str:
    if value is None:
        return "NULL"
    text = str(value).replace("\\", "\\\\").replace("'", "''").replace("\x00", "")
    return "'" + text + "'"


def _media_row_sql(row: dict) -> str:
    cols = [
        "citation_key", "edition_year", "entity_code", "entity_name", "category", "page",
        "image_index", "filename", "path", "metadata_path", "width", "height", "sha256",
        "caption", "credit", "credit_status", "ocr_text", "ocr_confidence", "visual_type",
        "recognition_confidence", "source_provider", "source_identifier", "source_url",
        "source_document", "source_format", "source_sha256", "citation", "attribution",
    ]
    vals = [
        _sql_esc(row.get("citation_key") or ""),
        str(int(row.get("edition_year") or 0)),
        _sql_esc(row.get("entity_code") or ""),
        _sql_esc(row.get("entity_name") or ""),
        _sql_esc(row.get("category") or "raw"),
        str(int(row.get("page") or 0)),
        str(int(row.get("image_index") or 0)),
        _sql_esc(row.get("filename") or ""),
        _sql_esc(row.get("path") or ""),
        _sql_esc(row.get("metadata_path") or ""),
        str(int(row.get("width") or 0)),
        str(int(row.get("height") or 0)),
        _sql_esc(row.get("sha256") or ""),
        _sql_esc(row.get("caption") or ""),
        _sql_esc(row.get("credit") or ""),
        _sql_esc(row.get("credit_status") or "not-found"),
        _sql_esc(row.get("ocr_text") or ""),
        f"{float(row.get('ocr_confidence') or 0):.2f}",
        _sql_esc(row.get("visual_type") or "illustration"),
        f"{float(row.get('recognition_confidence') or 0):.3f}",
        _sql_esc(row.get("source_provider") or ""),
        _sql_esc(row.get("source_identifier") or ""),
        _sql_esc(row.get("source_url") or ""),
        _sql_esc(row.get("source_document") or ""),
        _sql_esc(row.get("source_format") or ""),
        _sql_esc(row.get("source_sha256") or ""),
        _sql_esc(row.get("citation") or ""),
        _sql_esc(row.get("attribution") or ""),
    ]
    updates = ",".join(f"{c}=VALUES({c})" for c in cols[1:])
    return (
        "INSERT INTO worldfactbook_images (" + ",".join(cols) + ") VALUES (" + ",".join(vals) + ") "
        "ON DUPLICATE KEY UPDATE " + updates + ";\n"
    )


def write_media_shards(
    rows: list[dict],
    root: Path,
    *,
    max_compressed_bytes: int = 24_000_000,
    target_rows: int = 1200,
) -> dict:
    import gzip

    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    groups: dict[int, list[dict]] = {}
    for row in rows:
        groups.setdefault(int(row.get("edition_year") or 0), []).append(row)

    manifest = {
        "schema": "zzx-worldfactbook-media-mariadb-shards-v1",
        "files": [],
        "rows": len(rows),
    }
    for year, items in sorted(groups.items()):
        part = 0
        cursor = 0
        items = sorted(items, key=lambda r: str(r.get("citation_key") or ""))
        while cursor < len(items):
            batch = items[cursor: cursor + target_rows]
            while True:
                part += 1
                rel = Path("media") / str(year) / f"images-{part:04d}.sql.gz"
                path = root / rel
                path.parent.mkdir(parents=True, exist_ok=True)
                payload = MEDIA_SCHEMA_SQL + "".join(_media_row_sql(r) for r in batch)
                with gzip.open(path, "wt", encoding="utf-8", compresslevel=9) as fh:
                    fh.write(payload)
                size = path.stat().st_size
                if size <= max_compressed_bytes or len(batch) <= 1:
                    break
                path.unlink(missing_ok=True)
                part -= 1
                batch = batch[: max(1, len(batch) // 2)]
            manifest["files"].append(
                {
                    "path": rel.as_posix(),
                    "edition_year": year,
                    "rows": len(batch),
                    "bytes": size,
                    "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                }
            )
            cursor += len(batch)

    (root / "media-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest
