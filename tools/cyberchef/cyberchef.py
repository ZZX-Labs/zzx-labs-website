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
from pathlib import Path, PurePosixPath

RELEASES_API = "https://api.github.com/repos/gchq/CyberChef/releases"
APP_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_DIR = APP_ROOT / "build" / "cyberchef"


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
    token = (os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN") or "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def choose_release_zip(assets: list[dict[str, object]]) -> dict[str, object]:
    # Current CyberChef releases use CyberChef_<40-hex-commit>.zip.
    commit_named = [
        item
        for item in assets
        if re.fullmatch(r"CyberChef_[0-9a-fA-F]{40}\.zip", str(item.get("name", "")))
    ]
    if len(commit_named) == 1:
        return commit_named[0]
    if len(commit_named) > 1:
        names = ", ".join(str(item.get("name", "")) for item in commit_named)
        raise RuntimeError(f"Multiple commit-named CyberChef ZIP assets found: {names}")

    candidates = [
        item
        for item in assets
        if str(item.get("name", "")).lower().startswith("cyberchef")
        and str(item.get("name", "")).lower().endswith(".zip")
    ]
    if len(candidates) == 1:
        return candidates[0]
    if not candidates:
        raise RuntimeError("No CyberChef ZIP release asset found.")
    names = ", ".join(str(item.get("name", "")) for item in candidates)
    raise RuntimeError(f"Multiple CyberChef ZIP assets found and none is canonical: {names}")


def resolve_release(requested: str) -> Release:
    requested = (requested or "latest").strip() or "latest"
    if requested.lower() in {"latest", "stable"}:
        api_url = f"{RELEASES_API}/latest"
    else:
        tag = requested if requested.startswith("v") else f"v{requested}"
        api_url = f"{RELEASES_API}/tags/{urllib.parse.quote(tag, safe='')}"

    request = urllib.request.Request(api_url, headers=github_headers())
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.load(response)

    tag = str(payload.get("tag_name", "")).strip()
    if not tag:
        raise RuntimeError("CyberChef release API returned no tag_name.")
    version = tag[1:] if tag.startswith("v") else tag
    if not re.fullmatch(r"[0-9A-Za-z][0-9A-Za-z._+-]*", version):
        raise RuntimeError(f"Unsafe CyberChef release version: {version!r}")

    asset = choose_release_zip(payload.get("assets") or [])
    asset_name = str(asset.get("name", "")).strip()
    asset_url = str(asset.get("browser_download_url", "")).strip()
    parsed = urllib.parse.urlparse(asset_url)
    expected_prefix = f"/gchq/CyberChef/releases/download/{tag}/"

    if not re.fullmatch(r"[0-9A-Za-z._+-]+\.zip", asset_name):
        raise RuntimeError(f"Unsafe CyberChef asset name: {asset_name!r}")
    if parsed.scheme != "https" or parsed.hostname != "github.com" or not parsed.path.startswith(expected_prefix):
        raise RuntimeError(f"Unexpected CyberChef release asset URL: {asset_url!r}")

    return Release(
        requested=requested,
        version=version,
        tag=tag,
        name=str(payload.get("name", "") or tag).strip(),
        page_url=str(payload.get("html_url", "")).strip(),
        asset_name=asset_name,
        asset_url=asset_url,
    )


def local_release(version: str, archive: Path) -> Release:
    value = (version or "").strip()
    if not value or value.lower() in {"latest", "stable"}:
        raise ValueError("--archive requires an explicit --version.")
    value = value[1:] if value.startswith("v") else value
    if not re.fullmatch(r"[0-9A-Za-z][0-9A-Za-z._+-]*", value):
        raise ValueError(f"Unsafe CyberChef version: {value!r}")
    return Release(
        requested=value,
        version=value,
        tag=f"v{value}",
        name=f"CyberChef v{value}",
        page_url="",
        asset_name=archive.name,
        asset_url=archive.resolve().as_uri(),
    )


def download_file(url: str, destination: Path) -> None:
    print(f"Downloading {url}")
    request = urllib.request.Request(url, headers={"User-Agent": "zzx-cyberchef-release-downloader"})
    with urllib.request.urlopen(request, timeout=180) as response:
        status = getattr(response, "status", 200)
        if status != 200:
            raise RuntimeError(f"Download failed with HTTP {status}")
        with destination.open("wb") as fh:
            shutil.copyfileobj(response, fh)


def safe_extract(archive: Path, destination: Path) -> None:
    destination = destination.resolve()
    with zipfile.ZipFile(archive, "r") as zf:
        for info in zf.infolist():
            name = info.filename.replace("\\", "/")
            posix = PurePosixPath(name)
            if posix.is_absolute() or ".." in posix.parts:
                raise RuntimeError(f"Unsafe path in CyberChef ZIP: {info.filename!r}")
            unix_mode = (info.external_attr >> 16) & 0o170000
            if unix_mode == 0o120000:
                raise RuntimeError(f"Symlink not permitted in CyberChef ZIP: {info.filename!r}")
            target = (destination / Path(*posix.parts)).resolve()
            if destination != target and destination not in target.parents:
                raise RuntimeError(f"ZIP member escapes destination: {info.filename!r}")
        zf.extractall(destination)


def find_distribution(extract_dir: Path, release: Release) -> tuple[Path, Path]:
    exact_names = (
        f"CyberChef_v{release.version}.html",
        f"CyberChef_{release.tag}.html",
        f"CyberChef_{release.version}.html",
    )
    candidates = [p for p in extract_dir.rglob("CyberChef*.html") if p.is_file()]
    if not candidates:
        candidates = [p for p in extract_dir.rglob("Cyberchef*.html") if p.is_file()]
    if not candidates:
        if any(extract_dir.rglob("src/web/html/index.html")) or any(extract_dir.rglob("package.json")):
            raise FileNotFoundError(
                "This is a CyberChef source archive, not the deployable production release bundle. "
                "Use the ZIP asset attached to the GitHub Release."
            )
        raise FileNotFoundError("No CyberChef HTML entrypoint found in release ZIP.")

    entry = next((p for name in exact_names for p in candidates if p.name == name), None)
    if entry is None:
        candidates.sort(key=lambda p: (len(p.parts), p.as_posix()))
        entry = candidates[0]

    dist_root = entry.parent
    assets = dist_root / "assets"
    if not assets.is_dir() or not any(p.is_file() for p in assets.rglob("*")):
        raise FileNotFoundError(f"CyberChef assets directory missing beside {entry}")
    return dist_root, entry


def install_native_runtime(dist_root: Path, source_entry: Path, output_dir: Path) -> Path:
    app_dir = output_dir / "app"
    if app_dir.exists():
        shutil.rmtree(app_dir)
    shutil.copytree(dist_root, app_dir, copy_function=shutil.copy2)

    relative_entry = source_entry.relative_to(dist_root)
    copied_entry = app_dir / relative_entry
    if not copied_entry.is_file():
        raise RuntimeError("CyberChef release entrypoint was not copied correctly.")

    shutil.copy2(copied_entry, app_dir / "index.html")
    shutil.copy2(copied_entry, app_dir / "native.html")
    return app_dir


def validate_root_page(output_dir: Path) -> None:
    index = output_dir / "index.html"
    if not index.is_file() or index.stat().st_size == 0:
        raise RuntimeError("Custom /cyberchef/index.html is missing from the staged website.")
    html = index.read_text(encoding="utf-8", errors="strict")
    required = (
        "CyberChefZZX",
        'id="cz-frame"',
        'id="cz-modifications"',
        './app/',
    )
    for marker in required:
        if marker not in html:
            raise RuntimeError(f"Custom /cyberchef/ page missing required marker: {marker}")


def build(requested_version: str, output_dir: Path, archive: Path | None = None) -> dict[str, object]:
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    validate_root_page(output_dir)

    with tempfile.TemporaryDirectory(prefix="zzx-cyberchef-") as temp_name:
        temp_dir = Path(temp_name)
        if archive is None:
            release = resolve_release(requested_version)
            archive_path = temp_dir / release.asset_name
            download_file(release.asset_url, archive_path)
        else:
            archive_path = archive.resolve()
            if not archive_path.is_file():
                raise FileNotFoundError(f"CyberChef archive not found: {archive_path}")
            release = local_release(requested_version, archive_path)

        if not zipfile.is_zipfile(archive_path):
            raise RuntimeError(f"CyberChef release is not a valid ZIP: {archive_path}")

        release_sha256 = sha256_file(archive_path)
        extract_dir = temp_dir / "extract"
        extract_dir.mkdir(parents=True, exist_ok=True)
        safe_extract(archive_path, extract_dir)
        dist_root, source_entry = find_distribution(extract_dir, release)
        app_dir = install_native_runtime(dist_root, source_entry, output_dir)

        native_index_sha256 = sha256_file(app_dir / "index.html")
        manifest = {
            "schema": "zzx-cyberchef-runtime-v3",
            "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "repository_commit": os.environ.get("GITHUB_SHA", ""),
            "release": {
                "requested": release.requested,
                "version": release.version,
                "tag": release.tag,
                "name": release.name,
                "page_url": release.page_url,
                "asset_name": release.asset_name,
                "asset_url": release.asset_url,
                "sha256": release_sha256,
                "entrypoint": source_entry.name,
            },
            "custom_frontend": {
                "path": "/cyberchef/",
                "strategy": "site-page-plus-same-origin-iframe-overlay",
                "runtime_path": "/cyberchef/app/",
                "index_sha256": sha256_file(output_dir / "index.html"),
            },
            "native_frontend": {
                "path": "/cyberchef/app/",
                "index_sha256": native_index_sha256,
                "overlay_applied": False,
            },
        }
        (output_dir / "runtime-manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    validate_root_page(output_dir)
    if not (output_dir / "app" / "index.html").is_file():
        raise RuntimeError("Native /cyberchef/app/index.html was not generated.")
    if not (output_dir / "app" / "assets").is_dir():
        raise RuntimeError("Native /cyberchef/app/assets/ was not generated.")

    print(f"CyberChef {manifest['release']['tag']} installed successfully.")
    print("Custom site page preserved: /cyberchef/")
    print("Native runtime installed:   /cyberchef/app/")
    print(f"Release asset:              {manifest['release']['asset_name']}")
    return manifest


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="cyberchef.py",
        description="Install native CyberChef under /cyberchef/app/ while preserving the ZZX /cyberchef/ site page.",
    )
    parser.add_argument("--version", default="latest", help="CyberChef version/tag or 'latest'.")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR, help="Staged cyberchef directory.")
    parser.add_argument("--archive", type=Path, default=None, help="Local official release ZIP for testing/offline use.")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        build(args.version, args.output_dir, args.archive)
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
