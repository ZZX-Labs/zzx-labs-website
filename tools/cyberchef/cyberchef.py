#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
import urllib.parse
import urllib.request
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


RELEASES_API = "https://api.github.com/repos/gchq/CyberChef/releases"
APP_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_DIR = APP_ROOT / "cyberchef"
APP_DIR = OUTPUT_DIR / "app"
ASSETS_ALIAS_DIR = OUTPUT_DIR / "assets"
RUNTIME_MANIFEST = OUTPUT_DIR / "runtime-manifest.json"


@dataclass(frozen=True)
class Release:
    requested: str
    version: str
    tag: str
    name: str
    page_url: str
    asset_name: str
    asset_url: str


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(block)

    return digest.hexdigest()


def github_headers() -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "zzx-cyberchef-release-resolver",
    }

    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")

    if token:
        headers["Authorization"] = f"Bearer {token.strip()}"

    return headers


def resolve_release(requested: str) -> Release:
    requested = (requested or "latest").strip()

    if not requested:
        requested = "latest"

    if requested.lower() in {"latest", "stable"}:
        api_url = f"{RELEASES_API}/latest"
    else:
        tag = requested if requested.startswith("v") else f"v{requested}"
        api_url = f"{RELEASES_API}/tags/{urllib.parse.quote(tag, safe='')}"

    request = urllib.request.Request(api_url, headers=github_headers())

    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.load(response)

    tag = str(payload.get("tag_name", "")).strip()
    name = str(payload.get("name", "") or tag).strip()
    page_url = str(payload.get("html_url", "")).strip()

    if not tag:
        raise RuntimeError("CyberChef release API returned no tag_name.")

    version = tag[1:] if tag.startswith("v") else tag

    if not re.fullmatch(r"[0-9A-Za-z][0-9A-Za-z._+-]*", version):
        raise RuntimeError(f"Unsafe CyberChef release version: {version!r}")

    assets = payload.get("assets") or []
    preferred_names = (
        f"CyberChef_{tag}.zip",
        f"CyberChef_v{version}.zip",
        f"CyberChef_{version}.zip",
    )

    asset = next(
        (
            item
            for preferred in preferred_names
            for item in assets
            if str(item.get("name", "")) == preferred
        ),
        None,
    )

    if asset is None:
        candidates = [
            item
            for item in assets
            if str(item.get("name", "")).lower().startswith("cyberchef")
            and str(item.get("name", "")).lower().endswith(".zip")
        ]

        if len(candidates) == 1:
            asset = candidates[0]
        elif len(candidates) > 1:
            names = ", ".join(str(item.get("name", "")) for item in candidates)
            raise RuntimeError(
                "CyberChef release has multiple ZIP assets and no canonical match: "
                + names
            )

    if asset is None:
        names = ", ".join(
            str(item.get("name", ""))
            for item in assets
            if item.get("name")
        )
        raise RuntimeError(
            "No CyberChef release ZIP asset found. Assets: "
            + (names or "<none>")
        )

    asset_name = str(asset.get("name", "")).strip()
    asset_url = str(asset.get("browser_download_url", "")).strip()

    if not re.fullmatch(r"[0-9A-Za-z._+-]+\.zip", asset_name):
        raise RuntimeError(f"Unsafe CyberChef asset name: {asset_name!r}")

    parsed = urllib.parse.urlparse(asset_url)

    if parsed.scheme != "https" or parsed.hostname != "github.com":
        raise RuntimeError(f"Unexpected CyberChef asset URL: {asset_url!r}")

    return Release(
        requested=requested,
        version=version,
        tag=tag,
        name=name,
        page_url=page_url,
        asset_name=asset_name,
        asset_url=asset_url,
    )


def download_file(url: str, destination: Path) -> None:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "zzx-cyberchef-downloader"},
    )

    print(f"Downloading {url}")

    with urllib.request.urlopen(request, timeout=120) as response:
        if response.status != 200:
            raise RuntimeError(f"Download failed with HTTP {response.status}")

        with destination.open("wb") as fh:
            shutil.copyfileobj(response, fh)


def safe_extract(archive: Path, destination: Path) -> None:
    destination = destination.resolve()

    with zipfile.ZipFile(archive, "r") as zf:
        bad_member = zf.testzip()

        if bad_member:
            raise RuntimeError(f"CyberChef ZIP CRC failure: {bad_member}")

        for member in zf.infolist():
            target = (destination / member.filename).resolve()

            if target != destination and destination not in target.parents:
                raise RuntimeError(
                    f"Unsafe path in CyberChef ZIP: {member.filename!r}"
                )

        zf.extractall(destination)


def find_cyberchef_html(extract_dir: Path, release: Release) -> Path:
    preferred = [
        extract_dir / f"CyberChef_{release.tag}.html",
        extract_dir / f"CyberChef_v{release.version}.html",
        extract_dir / f"CyberChef_{release.version}.html",
    ]

    for path in preferred:
        if path.is_file():
            return path

    candidates = sorted(extract_dir.rglob("CyberChef*.html"))

    if not candidates:
        candidates = sorted(extract_dir.rglob("Cyberchef*.html"))

    for path in candidates:
        if (path.parent / "assets").is_dir():
            return path

    index_candidates = sorted(extract_dir.rglob("index.html"))

    for path in index_candidates:
        if (path.parent / "assets").is_dir():
            return path

    raise FileNotFoundError(
        "No CyberChef HTML entrypoint with adjacent assets directory found."
    )


def install_release(
    release: Release,
    archive: Path,
    extract_dir: Path,
    clean: bool,
) -> None:
    safe_extract(archive, extract_dir)
    source_html = find_cyberchef_html(extract_dir, release)
    source_dir = source_html.parent
    source_assets = source_dir / "assets"

    if not source_assets.is_dir():
        raise RuntimeError(
            f"CyberChef assets directory missing beside {source_html}"
        )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    if clean:
        shutil.rmtree(APP_DIR, ignore_errors=True)
        shutil.rmtree(ASSETS_ALIAS_DIR, ignore_errors=True)

    APP_DIR.mkdir(parents=True, exist_ok=True)

    shutil.copytree(
        source_dir,
        APP_DIR,
        dirs_exist_ok=True,
    )

    shutil.copy2(source_html, APP_DIR / "index.html")
    shutil.copy2(source_html, APP_DIR / "native.html")

    shutil.copytree(
        APP_DIR / "assets",
        ASSETS_ALIAS_DIR,
        dirs_exist_ok=True,
    )

    js_files = list((APP_DIR / "assets").rglob("*.js"))
    css_files = list((APP_DIR / "assets").rglob("*.css"))

    if not js_files:
        raise RuntimeError("Installed CyberChef runtime contains no JavaScript assets.")

    if not css_files:
        raise RuntimeError("Installed CyberChef runtime contains no CSS assets.")


def write_runtime_manifest(release: Release, archive: Path) -> None:
    payload = {
        "schema": "zzx-cyberchef-runtime-v1",
        "generated_at": datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z"),
        "native_frontend": {
            "path": "/cyberchef/app/",
            "requested_version": release.requested,
            "version": release.version,
            "tag": release.tag,
            "release_name": release.name,
            "release_page": release.page_url,
            "release_asset": release.asset_name,
            "release_url": release.asset_url,
            "release_sha256": sha256_file(archive),
        },
        "assets_alias": "/cyberchef/assets/",
    }

    RUNTIME_MANIFEST.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def build_cyberchef(version: str = "latest", clean: bool = True) -> Release:
    release = resolve_release(version)

    print(
        f"Resolved CyberChef request {release.requested!r} "
        f"to {release.tag}."
    )

    with tempfile.TemporaryDirectory(prefix="zzx-cyberchef-") as tmp:
        tmpdir = Path(tmp)
        archive = tmpdir / release.asset_name
        extract_dir = tmpdir / "extract"

        download_file(release.asset_url, archive)
        extract_dir.mkdir(parents=True, exist_ok=True)
        install_release(release, archive, extract_dir, clean=clean)
        write_runtime_manifest(release, archive)

    print(f"CyberChef {release.tag} deployed to: {APP_DIR}")
    print("Public URL target: https://zzx-labs.io/cyberchef/")

    return release


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="cyberchef.py",
        description=(
            "Install the latest stable or an explicitly pinned GCHQ CyberChef "
            "release into the ZZX-Labs CyberChef subpage without deleting the "
            "custom ZZX frontend."
        ),
    )
    parser.add_argument(
        "--version",
        default="latest",
        help=(
            "CyberChef release to install: latest/stable (default), "
            "X.Y.Z, or vX.Y.Z."
        ),
    )
    parser.add_argument(
        "--no-clean",
        action="store_true",
        help="Merge into existing generated app/assets directories instead of replacing them.",
    )
    parser.add_argument(
        "--resolve-only",
        action="store_true",
        help="Resolve and print release metadata without downloading or installing it.",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()

    try:
        if args.resolve_only:
            release = resolve_release(args.version)
            print(
                json.dumps(
                    {
                        "requested": release.requested,
                        "version": release.version,
                        "tag": release.tag,
                        "name": release.name,
                        "page_url": release.page_url,
                        "asset_name": release.asset_name,
                        "asset_url": release.asset_url,
                    },
                    indent=2,
                )
            )
            return 0

        build_cyberchef(
            version=args.version,
            clean=not args.no_clean,
        )
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
