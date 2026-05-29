#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import shutil
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path


CYBERCHEF_VERSION = "v11.0.0"
CYBERCHEF_ZIP_URL = (
    "https://github.com/gchq/CyberChef/releases/download/"
    f"{CYBERCHEF_VERSION}/CyberChef_{CYBERCHEF_VERSION}.zip"
)

APP_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_DIR = APP_ROOT / "cyberchef"
INDEX_HTML = OUTPUT_DIR / "index.html"
ATTRIBUTION_FILE = OUTPUT_DIR / "ATTRIBUTION.md"
LICENSE_NOTICE_FILE = OUTPUT_DIR / "LICENSE-NOTICE.md"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def download_file(url: str, dest: Path) -> None:
    print(f"Downloading {url}")
    with urllib.request.urlopen(url, timeout=120) as response:
        if response.status != 200:
            raise RuntimeError(f"Download failed with HTTP {response.status}")
        with dest.open("wb") as f:
            shutil.copyfileobj(response, f)


def find_cyberchef_html(extract_dir: Path) -> Path:
    matches = list(extract_dir.rglob(f"CyberChef_{CYBERCHEF_VERSION}.html"))

    if not matches:
        matches = list(extract_dir.rglob("CyberChef*.html"))

    if not matches:
        raise FileNotFoundError("No CyberChef HTML file found in release zip.")

    return matches[0]


def write_attribution() -> None:
    ATTRIBUTION_FILE.write_text(
        f"""# CyberChef Attribution

This directory contains a self-hosted copy of CyberChef {CYBERCHEF_VERSION}.

CyberChef is developed by GCHQ.

Project:
https://github.com/gchq/CyberChef

Official hosted version:
https://gchq.github.io/CyberChef/

Release used:
https://github.com/gchq/CyberChef/releases/download/{CYBERCHEF_VERSION}/CyberChef_{CYBERCHEF_VERSION}.zip

ZZX-Labs R&D hosts this copy as a public/private browser-based cybersecurity, encoding, decoding, compression, cryptography, and data-analysis toolkit.

CyberChef remains the intellectual property of its original authors and contributors. This local deployment is provided with attribution and without removing upstream license notices.
""",
        encoding="utf-8",
    )

    LICENSE_NOTICE_FILE.write_text(
        """# License Notice

CyberChef is distributed under the Apache License 2.0.

Apache License 2.0:
https://www.apache.org/licenses/LICENSE-2.0

CyberChef repository:
https://github.com/gchq/CyberChef

Crown Copyright and UK Government licensing information:
https://www.nationalarchives.gov.uk/information-management/re-using-public-sector-information/uk-government-licensing-framework/crown-copyright/

Contributor License Agreement reference:
https://cla-assistant.io/gchq/CyberChef

This file is a deployment-side notice for the ZZX-Labs R&D website mirror.
""",
        encoding="utf-8",
    )


def build_cyberchef(clean: bool = True) -> None:
    if clean and OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        zip_path = tmpdir / f"CyberChef_{CYBERCHEF_VERSION}.zip"
        extract_dir = tmpdir / "extract"

        download_file(CYBERCHEF_ZIP_URL, zip_path)

        digest = sha256_file(zip_path)
        print(f"SHA256: {digest}")

        extract_dir.mkdir(parents=True, exist_ok=True)

        with zipfile.ZipFile(zip_path, "r") as z:
            z.extractall(extract_dir)

        source_html = find_cyberchef_html(extract_dir)
        shutil.copy2(source_html, INDEX_HTML)

    write_attribution()

    print(f"CyberChef {CYBERCHEF_VERSION} deployed to: {INDEX_HTML}")
    print("Public URL target: https://zzx-labs.io/cyberchef/")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="cyberchef.py",
        description="Build CyberChef subpage for the ZZX-Labs static website.",
    )
    parser.add_argument(
        "--no-clean",
        action="store_true",
        help="Do not delete existing cyberchef/ output before building.",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    try:
        build_cyberchef(clean=not args.no_clean)
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
