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
DEFAULT_OVERLAY_DIR = APP_ROOT / "cyberchef"
DEFAULT_OUTPUT_DIR = APP_ROOT / "build" / "cyberchef"

OVERLAY_FILES = (
    "styles.css",
    "upgrades.css",
    "modifications.css",
    "hook.js",
    "script.js",
    "container.js",
    "upgrades.js",
    "modifications.js",
)

NOTICE_FILES = (
    "ATTRIBUTION.md",
    "LICENSE-NOTICE.md",
)


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

    assets = payload.get("assets") or []
    preferred = (
        f"CyberChef_{tag}.zip",
        f"CyberChef_v{version}.zip",
        f"CyberChef_{version}.zip",
    )

    asset = next(
        (
            item
            for expected in preferred
            for item in assets
            if str(item.get("name", "")) == expected
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
                "CyberChef release has multiple ZIP assets and no canonical match: " + names
            )

    if asset is None:
        names = ", ".join(str(item.get("name", "")) for item in assets if item.get("name"))
        raise RuntimeError("No CyberChef ZIP release asset found. Assets: " + (names or "<none>"))

    asset_name = str(asset.get("name", "")).strip()
    asset_url = str(asset.get("browser_download_url", "")).strip()
    parsed = urllib.parse.urlparse(asset_url)

    if not re.fullmatch(r"[0-9A-Za-z._+-]+\.zip", asset_name):
        raise RuntimeError(f"Unsafe CyberChef asset name: {asset_name!r}")
    if parsed.scheme != "https" or parsed.hostname != "github.com":
        raise RuntimeError(f"Unexpected CyberChef asset URL: {asset_url!r}")

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
    version = (version or "").strip()
    if not version or version.lower() in {"latest", "stable"}:
        raise ValueError("--archive requires an explicit --version for deterministic local builds.")
    version = version[1:] if version.startswith("v") else version
    if not re.fullmatch(r"[0-9A-Za-z][0-9A-Za-z._+-]*", version):
        raise ValueError(f"Unsafe CyberChef version: {version!r}")
    return Release(
        requested=version,
        version=version,
        tag=f"v{version}",
        name=f"CyberChef v{version}",
        page_url="",
        asset_name=archive.name,
        asset_url=archive.resolve().as_uri(),
    )


def download_file(url: str, dest: Path) -> None:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "zzx-cyberchef-release-downloader"},
    )
    print(f"Downloading {url}")
    with urllib.request.urlopen(request, timeout=180) as response:
        status = getattr(response, "status", 200)
        if status != 200:
            raise RuntimeError(f"Download failed with HTTP {status}")
        with dest.open("wb") as fh:
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
        f"CyberChef_{release.tag}.html",
        f"CyberChef_v{release.version}.html",
        f"CyberChef_{release.version}.html",
    )

    html_candidates = [p for p in extract_dir.rglob("CyberChef*.html") if p.is_file()]
    if not html_candidates:
        html_candidates = [p for p in extract_dir.rglob("Cyberchef*.html") if p.is_file()]
    if not html_candidates:
        source_markers = (
            extract_dir / "CyberChef-master" / "package.json",
            extract_dir / f"CyberChef-{release.version}" / "package.json",
        )
        if any(marker.is_file() for marker in source_markers) or any(extract_dir.rglob("src/web/html/index.html")):
            raise FileNotFoundError(
                "The supplied archive is a CyberChef source-code archive, not the "
                "production release bundle. Source tag archives from "
                "github.com/gchq/CyberChef/archive/ require the upstream Node/Grunt/Webpack "
                "build. Use the official ZIP asset attached to the GitHub Release instead."
            )
        raise FileNotFoundError("No CyberChef HTML entrypoint found in release ZIP.")

    entry = next((p for name in exact_names for p in html_candidates if p.name == name), None)
    if entry is None:
        html_candidates.sort(key=lambda p: (len(p.parts), p.as_posix()))
        entry = html_candidates[0]

    dist_root = entry.parent
    assets = dist_root / "assets"
    if not assets.is_dir():
        raise FileNotFoundError(
            f"CyberChef assets directory not found beside entrypoint: {entry}"
        )
    if not any(p.is_file() for p in assets.rglob("*")):
        raise RuntimeError("CyberChef assets directory is empty.")

    return dist_root, entry


def copy_distribution(source: Path, destination: Path) -> None:
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(source, destination, copy_function=shutil.copy2)


def copy_overlay(overlay_dir: Path, destination: Path) -> dict[str, str]:
    destination.mkdir(parents=True, exist_ok=True)
    hashes: dict[str, str] = {}

    for name in OVERLAY_FILES:
        source = overlay_dir / name
        if not source.is_file() or source.stat().st_size == 0:
            raise FileNotFoundError(f"Missing ZZX CyberChef overlay file: {source}")
        target = destination / name
        shutil.copy2(source, target)
        hashes[name] = sha256_file(target)

    return hashes


def inject_overlay(index_html: Path, release: Release) -> None:
    html = index_html.read_text(encoding="utf-8", errors="strict")
    marker = 'name="zzx-cyberchef-overlay"'
    if marker in html:
        raise RuntimeError("CyberChef HTML already contains the ZZX overlay marker.")

    head_payload = f"""
    <!-- ZZX-CyberChef overlay: upstream runtime remains intact; these styles load after upstream CSS. -->
    <meta name="zzx-cyberchef-overlay" content="1">
    <meta name="zzx-cyberchef-version" content="{release.version}">
    <link rel="stylesheet" href="zzx/styles.css">
    <link rel="stylesheet" href="zzx/upgrades.css">
    <link rel="stylesheet" href="zzx/modifications.css">
""".rstrip()

    body_payload = """
    <!-- ZZX-CyberChef overlay scripts: loaded after the upstream application markup/scripts. -->
    <script src="zzx/hook.js"></script>
    <script src="zzx/script.js"></script>
    <script src="zzx/container.js"></script>
    <script src="zzx/upgrades.js"></script>
    <script src="zzx/modifications.js"></script>
""".rstrip()

    if "</head>" not in html.lower() or "</body>" not in html.lower():
        raise RuntimeError("Unexpected CyberChef HTML: missing </head> or </body>.")

    html = re.sub(r"</head>", head_payload + "\n</head>", html, count=1, flags=re.I)
    html = re.sub(r"</body>", body_payload + "\n</body>", html, count=1, flags=re.I)

    # Mark only the customized root. /app/ remains untouched upstream HTML.
    def add_html_class(match: re.Match[str]) -> str:
        attrs = match.group(1)
        class_match = re.search(r'\bclass\s*=\s*(["\'])(.*?)\1', attrs, flags=re.I | re.S)
        if class_match:
            current = class_match.group(2).strip()
            classes = current.split()
            if "zzx-cyberchef-root" not in classes:
                classes.append("zzx-cyberchef-root")
            replacement = f'class={class_match.group(1)}{" ".join(classes)}{class_match.group(1)}'
            attrs = attrs[: class_match.start()] + replacement + attrs[class_match.end() :]
        else:
            attrs += ' class="zzx-cyberchef-root"'
        return f"<html{attrs}>"

    html = re.sub(r"<html\b([^>]*)>", add_html_class, html, count=1, flags=re.I)

    title_match = re.search(r"<title>(.*?)</title>", html, flags=re.I | re.S)
    if title_match:
        original = re.sub(r"\s+", " ", title_match.group(1)).strip()
        title = f"CyberChefZZX | {original}" if "CyberChefZZX" not in original else original
        html = html[: title_match.start(1)] + title + html[title_match.end(1) :]

    index_html.write_text(html, encoding="utf-8")


def write_redirect(path: Path) -> None:
    path.write_text(
        "<!doctype html>\n"
        "<html lang=\"en\"><head><meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        "<meta http-equiv=\"refresh\" content=\"0;url=./\">"
        "<title>CyberChefZZX</title>"
        "<script>location.replace('./'+location.search+location.hash);</script>"
        "</head><body><a href=\"./\">Open CyberChefZZX</a></body></html>\n",
        encoding="utf-8",
    )


def copy_notices(overlay_dir: Path, output_dir: Path) -> None:
    for name in NOTICE_FILES:
        source = overlay_dir / name
        if source.is_file():
            shutil.copy2(source, output_dir / name)


def validate_built_tree(output_dir: Path) -> None:
    root_index = output_dir / "index.html"
    app_index = output_dir / "app" / "index.html"

    for path in (root_index, app_index, output_dir / "runtime-manifest.json"):
        if not path.is_file() or path.stat().st_size == 0:
            raise RuntimeError(f"Built CyberChef file missing/empty: {path}")

    root_html = root_index.read_text(encoding="utf-8", errors="strict")
    app_html = app_index.read_text(encoding="utf-8", errors="strict")

    if 'name="zzx-cyberchef-overlay"' not in root_html:
        raise RuntimeError("Customized /cyberchef/ index is missing the ZZX overlay marker.")
    if 'name="zzx-cyberchef-overlay"' in app_html:
        raise RuntimeError("Native /cyberchef/app/ index was modified with the ZZX overlay.")

    for rel in ("assets", "app/assets", "zzx"):
        path = output_dir / rel
        if not path.is_dir() or not any(p.is_file() for p in path.rglob("*")):
            raise RuntimeError(f"Built CyberChef directory missing/empty: {path}")

    for name in OVERLAY_FILES:
        if f"zzx/{name}" not in root_html and name in {"styles.css", "upgrades.css", "modifications.css", "hook.js", "script.js", "container.js", "upgrades.js", "modifications.js"}:
            raise RuntimeError(f"Customized root does not reference overlay file: {name}")


def build(
    requested_version: str,
    output_dir: Path,
    overlay_dir: Path,
    archive: Path | None = None,
) -> dict[str, object]:
    output_dir = output_dir.resolve()
    overlay_dir = overlay_dir.resolve()

    for name in OVERLAY_FILES:
        source = overlay_dir / name
        if not source.is_file():
            raise FileNotFoundError(f"Required overlay file not found: {source}")

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

        # Build /cyberchef/ from the real upstream distribution.
        copy_distribution(dist_root, output_dir)

        # Build /cyberchef/app/ from a second untouched copy of the same distribution.
        app_dir = output_dir / "app"
        copy_distribution(dist_root, app_dir)

        root_entry = output_dir / source_entry.relative_to(dist_root)
        app_entry = app_dir / source_entry.relative_to(dist_root)
        if not root_entry.is_file() or not app_entry.is_file():
            raise RuntimeError("CyberChef release entrypoint was not copied correctly.")

        shutil.copy2(root_entry, output_dir / "index.html")
        shutil.copy2(app_entry, app_dir / "index.html")
        shutil.copy2(app_entry, app_dir / "native.html")

        native_index_sha256 = sha256_file(app_dir / "index.html")

        overlay_hashes = copy_overlay(overlay_dir, output_dir / "zzx")
        inject_overlay(output_dir / "index.html", release)
        copy_notices(overlay_dir, output_dir)
        write_redirect(output_dir / "cyberchef.html")

        manifest = {
            "schema": "zzx-cyberchef-runtime-v2",
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
                "index_sha256": sha256_file(output_dir / "index.html"),
                "overlay_files": overlay_hashes,
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

    validate_built_tree(output_dir)

    print(f"CyberChef {manifest['release']['tag']} built successfully.")
    print(f"Customized runtime: {output_dir / 'index.html'}")
    print(f"Native runtime:     {output_dir / 'app' / 'index.html'}")
    print(f"Release SHA256:     {manifest['release']['sha256']}")
    return manifest


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="cyberchef.py",
        description=(
            "Build both ZZX-customized and native CyberChef frontends from the same "
            "official GCHQ release."
        ),
    )
    parser.add_argument(
        "--version",
        default="latest",
        help="CyberChef release version/tag, or 'latest' (default).",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Build destination (default: {DEFAULT_OUTPUT_DIR}).",
    )
    parser.add_argument(
        "--overlay-dir",
        type=Path,
        default=DEFAULT_OVERLAY_DIR,
        help=f"Directory containing ZZX overlay assets (default: {DEFAULT_OVERLAY_DIR}).",
    )
    parser.add_argument(
        "--archive",
        type=Path,
        default=None,
        help="Use a local CyberChef release ZIP instead of downloading one (testing/offline builds).",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        build(
            requested_version=args.version,
            output_dir=args.output_dir,
            overlay_dir=args.overlay_dir,
            archive=args.archive,
        )
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
