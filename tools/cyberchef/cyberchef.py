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
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath

RELEASES_API = "https://api.github.com/repos/gchq/CyberChef/releases"
APP_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_DIR = APP_ROOT / "cyberchef"


@dataclass(frozen=True)
class Release:
    requested: str
    version: str
    tag: str
    name: str
    page_url: str
    asset_name: str
    asset_url: str


class AssetParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.refs: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = dict(attrs)
        if tag == "script" and attr.get("src"):
            self.refs.append(str(attr["src"]))
        elif tag == "link" and attr.get("href"):
            self.refs.append(str(attr["href"]))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
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
    # Current releases use CyberChef_<40-hex-commit>.zip, e.g. v11.5.0.
    canonical = [
        item for item in assets
        if re.fullmatch(r"CyberChef_[0-9a-fA-F]{40}\.zip", str(item.get("name", "")))
    ]
    if len(canonical) == 1:
        return canonical[0]
    if len(canonical) > 1:
        raise RuntimeError("Multiple canonical CyberChef production ZIP assets found.")

    candidates = [
        item for item in assets
        if str(item.get("name", "")).lower().startswith("cyberchef")
        and str(item.get("name", "")).lower().endswith(".zip")
    ]
    if len(candidates) == 1:
        return candidates[0]
    if not candidates:
        raise RuntimeError("No deployable CyberChef ZIP release asset found.")
    names = ", ".join(str(item.get("name", "")) for item in candidates)
    raise RuntimeError(f"Ambiguous CyberChef ZIP assets: {names}")


def resolve_release(requested: str) -> Release:
    requested = (requested or "latest").strip() or "latest"
    if requested.lower() in {"latest", "stable"}:
        api_url = f"{RELEASES_API}/latest"
    else:
        tag = requested if requested.startswith("v") else f"v{requested}"
        api_url = f"{RELEASES_API}/tags/{urllib.parse.quote(tag, safe='')}"

    req = urllib.request.Request(api_url, headers=github_headers())
    with urllib.request.urlopen(req, timeout=30) as response:
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
    prefix = f"/gchq/CyberChef/releases/download/{tag}/"

    if not re.fullmatch(r"[0-9A-Za-z._+-]+\.zip", asset_name):
        raise RuntimeError(f"Unsafe CyberChef asset name: {asset_name!r}")
    if parsed.scheme != "https" or parsed.hostname != "github.com" or not parsed.path.startswith(prefix):
        raise RuntimeError(f"Unexpected CyberChef release URL: {asset_url!r}")

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
    return Release(value, value, f"v{value}", f"CyberChef v{value}", "", archive.name, archive.resolve().as_uri())


def download_file(url: str, destination: Path) -> None:
    headers = github_headers()
    headers["Accept"] = "application/octet-stream"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=180) as response, destination.open("wb") as handle:
        shutil.copyfileobj(response, handle)


def safe_extract(archive: Path, destination: Path) -> None:
    destination = destination.resolve()
    with zipfile.ZipFile(archive, "r") as zf:
        for info in zf.infolist():
            posix = PurePosixPath(info.filename.replace("\\", "/"))
            if posix.is_absolute() or ".." in posix.parts:
                raise RuntimeError(f"Unsafe path in release ZIP: {info.filename!r}")
            unix_mode = (info.external_attr >> 16) & 0o170000
            if unix_mode == 0o120000:
                raise RuntimeError(f"Symlink not permitted in release ZIP: {info.filename!r}")
            target = (destination / Path(*posix.parts)).resolve()
            if target != destination and destination not in target.parents:
                raise RuntimeError(f"ZIP member escapes destination: {info.filename!r}")
        zf.extractall(destination)


def find_distribution(extract_dir: Path, release: Release) -> tuple[Path, Path]:
    candidates = sorted(
        [p for p in extract_dir.rglob("CyberChef*.html") if p.is_file()],
        key=lambda p: (len(p.parts), p.as_posix()),
    )
    if not candidates:
        if any(extract_dir.rglob("package.json")) or any(extract_dir.rglob("src/web/html/index.html")):
            raise RuntimeError(
                "CyberChef source archive detected. Use the production ZIP attached to the GitHub release, "
                "not archive/refs/tags/*.zip."
            )
        raise RuntimeError("No CyberChef production HTML entrypoint found in release ZIP.")

    preferred = f"CyberChef_v{release.version}.html"
    entry = next((p for p in candidates if p.name == preferred), candidates[0])
    dist_root = entry.parent
    assets = dist_root / "assets"
    if not assets.is_dir() or not any(p.is_file() for p in assets.rglob("*")):
        raise RuntimeError(f"CyberChef assets directory missing beside {entry.name}.")
    return dist_root, entry


def validate_entrypoint(entry: Path, dist_root: Path) -> None:
    html = entry.read_text(encoding="utf-8", errors="strict")
    required_markers = ("<title>CyberChef", "workspace-wrapper", "id=\"operations\"", "id=\"recipe\"")
    for marker in required_markers:
        if marker not in html:
            raise RuntimeError(f"CyberChef entrypoint missing expected marker: {marker}")

    parser = AssetParser()
    parser.feed(html)
    local_refs = []
    for ref in parser.refs:
        parsed = urllib.parse.urlparse(ref)
        if parsed.scheme or parsed.netloc or ref.startswith(("data:", "#", "//")):
            continue
        path = urllib.parse.unquote(parsed.path)
        if not path:
            continue
        local_refs.append(path)
        candidate = (dist_root / path).resolve()
        if dist_root.resolve() not in candidate.parents and candidate != dist_root.resolve():
            raise RuntimeError(f"CyberChef entrypoint asset escapes distribution: {ref}")
        if not candidate.is_file():
            raise RuntimeError(f"CyberChef entrypoint references missing asset: {ref}")

    if not any(ref.lower().endswith(".js") for ref in local_refs):
        raise RuntimeError("CyberChef entrypoint contains no local JavaScript bundle reference.")
    if not any(ref.lower().endswith(".css") for ref in local_refs):
        raise RuntimeError("CyberChef entrypoint contains no local stylesheet reference.")


def install_native_runtime(dist_root: Path, source_entry: Path, output_dir: Path) -> Path:
    app_dir = output_dir / "app"
    if app_dir.exists():
        shutil.rmtree(app_dir)
    shutil.copytree(dist_root, app_dir, copy_function=shutil.copy2)

    copied_entry = app_dir / source_entry.relative_to(dist_root)
    if not copied_entry.is_file():
        raise RuntimeError("CyberChef release entrypoint was not copied.")

    # index.html is an exact byte copy of the official production entrypoint.
    shutil.copy2(copied_entry, app_dir / "index.html")
    return app_dir


def validate_custom_page(output_dir: Path) -> None:
    page = output_dir / "index.html"
    if not page.is_file():
        raise RuntimeError("Custom /cyberchef/index.html is missing.")
    html = page.read_text(encoding="utf-8", errors="strict")
    for marker in ("CyberChefZZX", 'id="cz-frame"', 'id="cz-modifications"', "./app/index.html"):
        if marker not in html:
            raise RuntimeError(f"Custom CyberChef page missing marker: {marker}")


def build(requested_version: str, output_dir: Path, archive: Path | None = None) -> dict[str, object]:
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    validate_custom_page(output_dir)

    with tempfile.TemporaryDirectory(prefix="zzx-cyberchef-") as temp_name:
        temp_dir = Path(temp_name)

        if archive is None:
            release = resolve_release(requested_version)
            archive_path = temp_dir / release.asset_name
            download_file(release.asset_url, archive_path)
        else:
            archive_path = archive.resolve()
            if not archive_path.is_file():
                raise FileNotFoundError(archive_path)
            release = local_release(requested_version, archive_path)

        if not zipfile.is_zipfile(archive_path):
            raise RuntimeError("CyberChef production asset is not a valid ZIP file.")

        release_sha = sha256_file(archive_path)
        extract_dir = temp_dir / "extract"
        extract_dir.mkdir()
        safe_extract(archive_path, extract_dir)
        dist_root, source_entry = find_distribution(extract_dir, release)
        validate_entrypoint(source_entry, dist_root)
        app_dir = install_native_runtime(dist_root, source_entry, output_dir)
        validate_entrypoint(app_dir / "index.html", app_dir)

        manifest = {
            "schema": "zzx-cyberchef-runtime-v4",
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
                "sha256": release_sha,
                "entrypoint": source_entry.name,
            },
            "custom_frontend": {
                "path": "/cyberchef/",
                "runtime_path": "/cyberchef/app/index.html",
                "layers": ["/cyberchef/theme.css", "/cyberchef/layout.css"],
            },
            "native_frontend": {
                "path": "/cyberchef/app/",
                "entrypoint": "/cyberchef/app/index.html",
                "index_sha256": sha256_file(app_dir / "index.html"),
                "upstream_html_unchanged": True,
            },
        }

        (output_dir / "runtime-manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    validate_custom_page(output_dir)
    print(f"Installed CyberChef {manifest['release']['tag']}")
    print(f"Release asset: {manifest['release']['asset_name']}")
    print("Native:   /cyberchef/app/index.html")
    print("Modified: /cyberchef/ + theme.css + layout.css")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", default="latest")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--archive", type=Path)
    args = parser.parse_args()
    try:
        build(args.version, args.output_dir, args.archive)
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
