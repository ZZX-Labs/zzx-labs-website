#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import secrets
import shutil
import subprocess
import sys
from pathlib import Path

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
AV_EXTS = {".mp4", ".m4v", ".mov", ".webm", ".mp3", ".m4a", ".aac", ".ogg", ".opus", ".wav", ".flac"}
PDF_EXTS = {".pdf"}
TEXT_EXTS = {".txt", ".md"}
ALLOWED = IMAGE_EXTS | AV_EXTS | PDF_EXTS | TEXT_EXTS
MAX_BYTES_DEFAULT = 2 * 1024 * 1024 * 1024

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()

def random_name(path: Path) -> str:
    return secrets.token_hex(20) + path.suffix.lower()

def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True)

def clamscan(path: Path, require: bool = True) -> dict:
    exe = shutil.which("clamscan")
    if not exe:
        if require:
            raise RuntimeError("clamscan not found; refusing publication without antivirus scan")
        return {"available": False, "clean": None}
    p = subprocess.run([exe, "--no-summary", str(path)], text=True, capture_output=True)
    if p.returncode == 1:
        raise RuntimeError("malware scanner reported infected content")
    if p.returncode != 0:
        raise RuntimeError("malware scanner failed: " + (p.stderr.strip() or p.stdout.strip()))
    return {"available": True, "clean": True}

def sanitize_image(src: Path, dst: Path) -> None:
    from PIL import Image, ImageOps
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im)
        if im.mode not in ("RGB", "RGBA", "L"):
            im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
        fmt = "JPEG" if dst.suffix in {".jpg", ".jpeg"} else "PNG" if dst.suffix == ".png" else "WEBP"
        kwargs = {}
        if fmt == "JPEG":
            if im.mode != "RGB":
                im = im.convert("RGB")
            kwargs.update(quality=95, optimize=True)
        elif fmt == "PNG":
            kwargs.update(optimize=True)
        im.save(dst, format=fmt, **kwargs)

def sanitize_av(src: Path, dst: Path) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg not found")
    # Stream-copy when possible while stripping metadata and chapters.
    run([
        ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(src),
        "-map", "0",
        "-map_metadata", "-1",
        "-map_chapters", "-1",
        "-c", "copy",
        str(dst),
    ])

def sanitize_pdf(src: Path, dst: Path) -> None:
    import pikepdf
    with pikepdf.open(src) as pdf:
        try:
            del pdf.Root.Metadata
        except Exception:
            pass
        for key in list(pdf.docinfo.keys()):
            try:
                del pdf.docinfo[key]
            except Exception:
                pass
        pdf.save(dst)

def sanitize_text(src: Path, dst: Path) -> None:
    data = src.read_bytes()
    if b"\x00" in data:
        raise RuntimeError("NUL byte found in text attachment")
    dst.write_bytes(data)

def sanitize_one(src: Path, outdir: Path, require_av: bool, max_bytes: int) -> dict:
    if not src.is_file():
        raise RuntimeError("input is not a regular file")
    if src.stat().st_size > max_bytes:
        raise RuntimeError("file exceeds configured maximum")
    ext = src.suffix.lower()
    if ext not in ALLOWED:
        raise RuntimeError(f"extension not allowlisted: {ext or '(none)'}")

    pre = sha256(src)
    scan = clamscan(src, require=require_av)
    name = random_name(src)
    dst = outdir / name

    if ext in IMAGE_EXTS:
        sanitize_image(src, dst)
    elif ext in AV_EXTS:
        sanitize_av(src, dst)
    elif ext in PDF_EXTS:
        sanitize_pdf(src, dst)
    elif ext in TEXT_EXTS:
        sanitize_text(src, dst)
    else:
        raise RuntimeError("unsupported type")

    return {
        "public_filename": name,
        "source_sha256": pre,
        "sanitized_sha256": sha256(dst),
        "bytes": dst.stat().st_size,
        "mime": mimetypes.guess_type(dst.name)[0] or "application/octet-stream",
        "antivirus": scan,
        "source_name_retained_publicly": False,
    }

def main() -> int:
    ap = argparse.ArgumentParser(description="BlackPearl privacy-conscious media sanitizer")
    ap.add_argument("inputs", nargs="+", type=Path)
    ap.add_argument("-o", "--outdir", type=Path, required=True)
    ap.add_argument("--allow-no-antivirus", action="store_true", help="development only; production should require AV")
    ap.add_argument("--max-bytes", type=int, default=MAX_BYTES_DEFAULT)
    args = ap.parse_args()

    args.outdir.mkdir(parents=True, exist_ok=True)
    private_log = []
    failed = []
    for src in args.inputs:
        try:
            record = sanitize_one(src, args.outdir, require_av=not args.allow_no_antivirus, max_bytes=args.max_bytes)
            # Original filename is private operator metadata only.
            private_log.append({"private_original_name": src.name, **record})
            print(json.dumps({"ok": True, "public_filename": record["public_filename"], "sanitized_sha256": record["sanitized_sha256"]}))
        except Exception as exc:
            failed.append({"file": src.name, "error": str(exc)})
            print(json.dumps({"ok": False, "file": src.name, "error": str(exc)}), file=sys.stderr)

    (args.outdir / ".private-ingest-log.json").write_text(
        json.dumps({"records": private_log, "failed": failed}, indent=2),
        encoding="utf-8",
    )
    return 1 if failed else 0

if __name__ == "__main__":
    raise SystemExit(main())
