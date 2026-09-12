#!/usr/bin/env python3
"""Multi-format text extraction for the ZZX World Factbook archive.

The module deliberately prefers deterministic local tools. It never invents text:
unsupported/failed inputs return no documents and remain visible in the crawl report.
"""
from __future__ import annotations

import bz2
import gzip
import html
import io
import json
import lzma
import re
import shutil
import subprocess
import tarfile
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

TEXT_EXTS = {".txt", ".text", ".csv", ".tsv", ".md"}
HTML_EXTS = {".html", ".htm", ".xhtml"}
XML_EXTS = {".xml"}
JSON_EXTS = {".json", ".jsonl", ".ndjson"}
EBOOK_EXTS = {".epub"}
CALIBRE_EXTS = {".mobi", ".azw", ".azw3", ".prc"}
OFFICE_ZIP_EXTS = {".docx", ".odt"}
ARCHIVE_EXTS = {".zip", ".7z", ".tar", ".tgz", ".tbz", ".tbz2", ".txz"}
COMPRESSED_EXTS = {".gz", ".bz2", ".xz"}
SUPPORTED_EXTENSIONS = tuple(sorted(
    TEXT_EXTS | HTML_EXTS | XML_EXTS | JSON_EXTS | EBOOK_EXTS | CALIBRE_EXTS |
    OFFICE_ZIP_EXTS | ARCHIVE_EXTS | COMPRESSED_EXTS |
    {".pdf", ".doc", ".rtf", ".chm", ".djvu", ".djv"}
))

@dataclass(frozen=True)
class ExtractedDocument:
    source_name: str
    text: str
    extractor: str


def _run(cmd: list[str], timeout: int = 180) -> str:
    proc = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"command failed ({proc.returncode}): {' '.join(cmd)}: {proc.stderr[-500:]}")
    return proc.stdout


def _clean_markup(text: str) -> str:
    text = re.sub(r"(?is)<script\b.*?</script>", " ", text)
    text = re.sub(r"(?is)<style\b.*?</style>", " ", text)
    text = re.sub(r"(?s)<[^>]+>", "\n", text)
    text = html.unescape(text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[\t\f\v]+", " ", text)
    text = re.sub(r"[ ]{2,}", " ", text)
    text = re.sub(r"\n{4,}", "\n\n", text)
    return text.strip()


def _read_text(path: Path) -> str:
    raw = path.read_bytes()
    for enc in ("utf-8", "utf-8-sig", "cp1252", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _epub(path: Path) -> list[ExtractedDocument]:
    docs: list[ExtractedDocument] = []
    with zipfile.ZipFile(path) as zf:
        names = [n for n in zf.namelist() if Path(n).suffix.lower() in HTML_EXTS]
        for name in names:
            raw = zf.read(name)
            text = _clean_markup(raw.decode("utf-8", errors="replace"))
            if text:
                docs.append(ExtractedDocument(name, text, "epub-html"))
    return docs


def _office_zip(path: Path) -> list[ExtractedDocument]:
    with zipfile.ZipFile(path) as zf:
        candidates = []
        if path.suffix.lower() == ".docx":
            candidates = ["word/document.xml"]
        else:
            candidates = ["content.xml"]
        out = []
        for name in candidates:
            if name in zf.namelist():
                text = _clean_markup(zf.read(name).decode("utf-8", errors="replace"))
                if text:
                    out.append(ExtractedDocument(name, text, "office-xml"))
        return out


def _archive_members(path: Path, work: Path) -> list[Path]:
    dest = work / (path.stem + "-unpacked")
    dest.mkdir(parents=True, exist_ok=True)
    suffix = path.suffix.lower()
    if suffix == ".zip":
        with zipfile.ZipFile(path) as zf:
            zf.extractall(dest)
    elif suffix in {".tar", ".tgz", ".tbz", ".tbz2", ".txz"} or tarfile.is_tarfile(path):
        with tarfile.open(path) as tf:
            tf.extractall(dest, filter="data")
    else:
        if not shutil.which("7z"):
            raise RuntimeError("7z is required for this archive format")
        subprocess.run(["7z", "x", "-y", f"-o{dest}", str(path)], check=True, stdout=subprocess.DEVNULL)
    return [p for p in dest.rglob("*") if p.is_file()]


def extract(path: Path, *, max_depth: int = 2, _depth: int = 0) -> list[ExtractedDocument]:
    path = Path(path)
    ext = path.suffix.lower()
    if not path.is_file() or path.stat().st_size == 0:
        return []

    if ext in TEXT_EXTS:
        return [ExtractedDocument(path.name, _read_text(path), "plain-text")]
    if ext in HTML_EXTS:
        return [ExtractedDocument(path.name, _clean_markup(_read_text(path)), "html")]
    if ext in XML_EXTS:
        return [ExtractedDocument(path.name, _clean_markup(_read_text(path)), "xml")]
    if ext in JSON_EXTS:
        return [ExtractedDocument(path.name, _read_text(path), "json")]
    if ext == ".epub":
        return _epub(path)
    if ext in OFFICE_ZIP_EXTS:
        return _office_zip(path)

    if ext == ".pdf":
        if shutil.which("pdftotext"):
            text = _run(["pdftotext", "-layout", str(path), "-"])
            return [ExtractedDocument(path.name, text.strip(), "pdftotext")] if text.strip() else []
        try:
            from pypdf import PdfReader  # type: ignore
            pages = [(p.extract_text() or "") for p in PdfReader(str(path)).pages]
            text = "\n\n".join(pages).strip()
            return [ExtractedDocument(path.name, text, "pypdf")] if text else []
        except Exception as exc:
            raise RuntimeError(f"no PDF extractor available: {exc}") from exc

    if ext in CALIBRE_EXTS:
        if not shutil.which("ebook-convert"):
            raise RuntimeError("ebook-convert (Calibre) is required for MOBI/AZW/AZW3/PRC")
        with tempfile.TemporaryDirectory(prefix="wfb-ebook-") as td:
            out = Path(td) / "book.txt"
            _run(["ebook-convert", str(path), str(out)])
            text = _read_text(out).strip()
            return [ExtractedDocument(path.name, text, "calibre")] if text else []

    if ext == ".doc":
        if not shutil.which("antiword"):
            raise RuntimeError("antiword is required for .doc")
        text = _run(["antiword", str(path)]).strip()
        return [ExtractedDocument(path.name, text, "antiword")] if text else []

    if ext == ".rtf":
        if shutil.which("unrtf"):
            text = _run(["unrtf", "--text", str(path)])
            text = re.sub(r"(?m)^###.*$", "", text).strip()
            return [ExtractedDocument(path.name, text, "unrtf")] if text else []
        text = re.sub(r"\\[a-zA-Z]+-?\d* ?|[{}]", "", _read_text(path)).strip()
        return [ExtractedDocument(path.name, text, "rtf-fallback")] if text else []

    if ext == ".chm":
        with tempfile.TemporaryDirectory(prefix="wfb-chm-") as td:
            work = Path(td)
            members = _archive_members(path, work)
            docs = []
            for member in members[:5000]:
                if member.suffix.lower() in HTML_EXTS:
                    text = _clean_markup(_read_text(member))
                    if text:
                        docs.append(ExtractedDocument(member.name, text, "chm-html"))
            return docs

    if ext in {".djvu", ".djv"}:
        if not shutil.which("djvutxt"):
            raise RuntimeError("djvutxt is required for DjVu")
        text = _run(["djvutxt", str(path)]).strip()
        return [ExtractedDocument(path.name, text, "djvutxt")] if text else []

    if ext in COMPRESSED_EXTS and ext not in {".tgz", ".tbz", ".tbz2", ".txz"}:
        raw = path.read_bytes()
        if ext == ".gz":
            data = gzip.decompress(raw)
        elif ext == ".bz2":
            data = bz2.decompress(raw)
        else:
            data = lzma.decompress(raw)
        with tempfile.TemporaryDirectory(prefix="wfb-compressed-") as td:
            inner = Path(td) / path.stem
            inner.write_bytes(data)
            return extract(inner, max_depth=max_depth, _depth=_depth + 1)

    if ext in ARCHIVE_EXTS or tarfile.is_tarfile(path):
        if _depth >= max_depth:
            return []
        with tempfile.TemporaryDirectory(prefix="wfb-archive-") as td:
            members = _archive_members(path, Path(td))
            # Internet Archive bundles often contain PDF, DjVu, EPUB and text
            # derivatives of the same scanned edition.  Recursing through all of
            # them multiplies extraction time without adding independent corpus
            # content.  If rich document representations are present, parse a
            # small ranked set; otherwise keep the legacy website/archive behavior
            # and walk text/HTML members broadly.
            rich_rank = {
                ".txt": 120, ".pdf": 115, ".epub": 110, ".djvu": 105,
                ".djv": 105, ".mobi": 100, ".azw3": 99, ".azw": 98,
                ".prc": 97, ".html": 90, ".htm": 90, ".xhtml": 90,
                ".docx": 80, ".odt": 78, ".doc": 76, ".rtf": 74,
            }
            rich = [m for m in members if m.suffix.lower() in rich_rank]
            if any(m.suffix.lower() in {".pdf", ".epub", ".djvu", ".djv", ".mobi", ".azw3", ".azw", ".prc"} for m in rich):
                rich.sort(key=lambda m: (rich_rank.get(m.suffix.lower(), 0), -len(m.name)), reverse=True)
                members = rich[:3]
            docs: list[ExtractedDocument] = []
            for member in members[:10000]:
                if member.stat().st_size > 512 * 1024 * 1024:
                    continue
                try:
                    for doc in extract(member, max_depth=max_depth, _depth=_depth + 1):
                        docs.append(ExtractedDocument(f"{path.name}!{doc.source_name}", doc.text, doc.extractor))
                except Exception:
                    continue
            return docs

    return []
