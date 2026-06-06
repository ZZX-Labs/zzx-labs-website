#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping


SCHEMA = "zzx-bitnodes-ipdb-push-v3"

APP_ROOT = Path(__file__).resolve().parents[2]
BITNODES_ROOT = Path(os.environ.get("BITNODES_ROOT", str(APP_ROOT / "bitcoin" / "bitnodes")))
BITNODES_DATA = Path(os.environ.get("BITNODES_DATA", str(BITNODES_ROOT / "data")))

DEFAULT_IPDB_DIR = BITNODES_DATA / "geoip"
DEFAULT_CURRENT_DIR = DEFAULT_IPDB_DIR / "current"
DEFAULT_ARCHIVE_DIR = DEFAULT_IPDB_DIR / "archive"

DEFAULT_INDEX_PATH = DEFAULT_CURRENT_DIR / "ip_db.index.json"
DEFAULT_STATS_PATH = DEFAULT_CURRENT_DIR / "ip_db.stats.json"
DEFAULT_LATEST_PATH = DEFAULT_CURRENT_DIR / "ip_db.latest.json"

DEFAULT_PRIVATE_REPO_DIR = Path(os.environ.get("BITNODES_IPDB_ARCHIVE_REPO", "")).expanduser()
DEFAULT_REMOTE = os.environ.get("BITNODES_IPDB_REMOTE", "origin")
DEFAULT_BRANCH = os.environ.get("BITNODES_IPDB_BRANCH", "main")


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    try:
        if not path.exists():
            return fallback

        if path.suffix == ".gz":
            with gzip.open(path, "rt", encoding="utf-8") as handle:
                return json.load(handle)

        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json(path: Path, payload: Any, pretty: bool = True) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(
        payload,
        ensure_ascii=False,
        indent=2 if pretty else None,
        separators=None if pretty else (",", ":"),
        sort_keys=pretty,
        default=str,
    )
    path.write_text(text + "\n", encoding="utf-8")


def run(cmd: list[str], *, cwd: Path, check: bool = True, dry_run: bool = False) -> subprocess.CompletedProcess[str] | None:
    print(f"[push_ipdb.py] {cwd} $ {' '.join(cmd)}", flush=True)

    if dry_run:
        return None

    return subprocess.run(
        cmd,
        cwd=str(cwd),
        check=check,
        text=True,
        stdout=sys.stdout,
        stderr=sys.stderr,
    )


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)

    return digest.hexdigest()


def copy_file(src: Path, dst: Path) -> dict[str, Any]:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)

    return {
        "source": str(src),
        "destination": str(dst),
        "filename": dst.name,
        "size_bytes": dst.stat().st_size,
        "sha256": file_sha256(dst),
        "copied_at": utc_now(),
    }


def resolve_segment_path(item: Mapping[str, Any], archive_dir: Path) -> Path | None:
    for key in ("gzip_filename", "filename"):
        filename = str(item.get(key) or "").strip()

        if not filename:
            continue

        path = archive_dir / filename

        if path.exists():
            return path

    for key in ("gzip_path", "path"):
        raw = str(item.get(key) or "").strip()

        if not raw:
            continue

        path = Path(raw)

        if not path.is_absolute():
            path = archive_dir / path.name

        if path.exists():
            return path

    return None


def index_segment_paths(index: Mapping[str, Any], archive_dir: Path) -> list[Path]:
    paths: list[Path] = []
    segments = index.get("segments", [])

    if not isinstance(segments, list):
        return paths

    seen: set[str] = set()

    for item in segments:
        if not isinstance(item, Mapping):
            continue

        path = resolve_segment_path(item, archive_dir)

        if path is None:
            continue

        key = str(path.resolve())

        if key in seen:
            continue

        seen.add(key)
        paths.append(path)

    return paths


def existing_archive_manifest(path: Path) -> dict[str, Any]:
    manifest = read_json(path, fallback={})
    out = dict(manifest) if isinstance(manifest, Mapping) else {}

    out.setdefault("schema", "zzx-bitnodes-ipdb-archive-manifest-v3")
    out.setdefault("created_at", utc_now())
    out.setdefault("updated_at", utc_now())
    out.setdefault("segments", {})
    out.setdefault("copies", [])
    out.setdefault("current", {})

    if not isinstance(out["segments"], dict):
        out["segments"] = {}

    if not isinstance(out["copies"], list):
        out["copies"] = []

    if not isinstance(out["current"], dict):
        out["current"] = {}

    return out


def copy_current_file(src: Path, destination_current_dir: Path, manifest: dict[str, Any]) -> dict[str, Any] | None:
    if not src.exists():
        return None

    info = copy_file(src, destination_current_dir / src.name)
    manifest["current"][src.name] = {
        "filename": src.name,
        "path": str((destination_current_dir / src.name).relative_to(destination_current_dir.parent)),
        "size_bytes": info["size_bytes"],
        "sha256": info["sha256"],
        "copied_at": info["copied_at"],
    }

    return info


def copy_ipdb_archive(
    *,
    source_index_path: Path,
    source_stats_path: Path,
    source_latest_path: Path,
    source_archive_dir: Path,
    destination_root: Path,
    include_latest: bool,
    include_stats: bool,
    include_index: bool,
    only_new: bool,
) -> dict[str, Any]:
    index = read_json(source_index_path, fallback={})

    if not isinstance(index, Mapping):
        raise SystemExit(f"invalid IP DB index: {source_index_path}")

    destination_archive_dir = destination_root / "archive"
    destination_current_dir = destination_root / "current"
    manifest_path = destination_root / "ip_db.archive-manifest.json"

    manifest = existing_archive_manifest(manifest_path)
    copied: list[dict[str, Any]] = []
    skipped: list[str] = []
    missing: list[str] = []

    indexed_segments = index.get("segments", [])

    if isinstance(indexed_segments, list):
        for item in indexed_segments:
            if not isinstance(item, Mapping):
                continue

            src = resolve_segment_path(item, source_archive_dir)

            if src is None:
                missing.append(str(item.get("filename") or item.get("gzip_filename") or item.get("path") or "unknown"))
                continue

            dst = destination_archive_dir / src.name
            src_sha = file_sha256(src)
            old = manifest["segments"].get(src.name)

            if only_new and dst.exists() and isinstance(old, Mapping) and old.get("sha256") == src_sha:
                skipped.append(src.name)
                continue

            info = copy_file(src, dst)
            copied.append(info)

            manifest["segments"][src.name] = {
                "filename": src.name,
                "path": str(dst.relative_to(destination_root)),
                "size_bytes": info["size_bytes"],
                "sha256": info["sha256"],
                "copied_at": utc_now(),
            }

    current_copies: list[dict[str, Any]] = []

    if include_index:
        info = copy_current_file(source_index_path, destination_current_dir, manifest)
        if info:
            current_copies.append(info)

    if include_stats:
        info = copy_current_file(source_stats_path, destination_current_dir, manifest)
        if info:
            current_copies.append(info)

    if include_latest:
        info = copy_current_file(source_latest_path, destination_current_dir, manifest)
        if info:
            current_copies.append(info)

    manifest["schema"] = "zzx-bitnodes-ipdb-archive-manifest-v3"
    manifest["updated_at"] = utc_now()
    manifest["source_index"] = str(source_index_path)
    manifest["source_stats"] = str(source_stats_path)
    manifest["source_latest"] = str(source_latest_path)
    manifest["source_archive_dir"] = str(source_archive_dir)
    manifest["destination_root"] = str(destination_root)
    manifest["segment_count"] = len(manifest["segments"])
    manifest["last_run"] = {
        "schema": SCHEMA,
        "updated_at": utc_now(),
        "copied_segments": len(copied),
        "skipped_segments": len(skipped),
        "missing_segments": len(missing),
        "current_files_copied": len(current_copies),
    }
    manifest["copies"].append(manifest["last_run"])

    write_json(manifest_path, manifest, pretty=True)

    return {
        "schema": "zzx-bitnodes-ipdb-push-report-v3",
        "updated_at": utc_now(),
        "source_index_path": str(source_index_path),
        "source_stats_path": str(source_stats_path),
        "source_latest_path": str(source_latest_path),
        "source_archive_dir": str(source_archive_dir),
        "destination_root": str(destination_root),
        "copied_segments": copied,
        "skipped_segments": skipped,
        "missing_segments": missing,
        "current_copies": current_copies,
        "manifest_path": str(manifest_path),
    }


def git_has_changes(repo_dir: Path) -> bool:
    result = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=str(repo_dir),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    return bool(result.stdout.strip())


def require_git_repo(path: Path) -> None:
    if not path.exists():
        raise SystemExit(f"archive repo directory does not exist: {path}")

    if not (path / ".git").exists():
        raise SystemExit(f"archive repo directory is not a git repository: {path}")


def git_sync_and_push(
    *,
    repo_dir: Path,
    remote: str,
    branch: str,
    commit_message: str,
    dry_run: bool,
    no_pull: bool,
    no_push: bool,
) -> None:
    require_git_repo(repo_dir)

    run(["git", "config", "user.name", "zzx-labs-ipdb-archive-bot"], cwd=repo_dir, dry_run=dry_run)
    run(["git", "config", "user.email", "actions@github.com"], cwd=repo_dir, dry_run=dry_run)

    if not no_pull:
        run(["git", "fetch", remote, branch], cwd=repo_dir, check=False, dry_run=dry_run)
        run(["git", "pull", "--rebase", remote, branch], cwd=repo_dir, check=False, dry_run=dry_run)

    run(["git", "add", "-A"], cwd=repo_dir, dry_run=dry_run)

    if dry_run:
        return

    if not git_has_changes(repo_dir):
        print("[push_ipdb.py] no archive repo changes to commit", flush=True)
        return

    run(["git", "commit", "-m", commit_message], cwd=repo_dir)

    if not no_push:
        run(["git", "push", remote, f"HEAD:{branch}"], cwd=repo_dir)


def skipped_report(reason: str, **extra: Any) -> dict[str, Any]:
    return {
        "schema": "zzx-bitnodes-ipdb-push-report-v3",
        "updated_at": utc_now(),
        "status": "skipped",
        "reason": reason,
        **extra,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Copy segmented Bitnodes IP DB archive files into a local/public dir or private archive repo.",
        allow_abbrev=False,
    )

    parser.add_argument("--ipdb-dir", "--source-dir", dest="ipdb_dir", default=str(DEFAULT_IPDB_DIR))
    parser.add_argument("--index", default=str(DEFAULT_INDEX_PATH))
    parser.add_argument("--stats", default=str(DEFAULT_STATS_PATH))
    parser.add_argument("--latest", default=str(DEFAULT_LATEST_PATH))
    parser.add_argument("--archive-dir", default=str(DEFAULT_ARCHIVE_DIR))

    parser.add_argument("--private-repo-dir", default=str(DEFAULT_PRIVATE_REPO_DIR))
    parser.add_argument("--destination-subdir", default="bitcoin/bitnodes/ip_db")
    parser.add_argument("--output-dir", default="")
    parser.add_argument("--report", default="")

    parser.add_argument("--include-latest", action="store_true")
    parser.add_argument("--no-index", action="store_true")
    parser.add_argument("--no-stats", action="store_true")
    parser.add_argument("--copy-all", action="store_true")

    parser.add_argument("--remote", default=DEFAULT_REMOTE)
    parser.add_argument("--branch", default=DEFAULT_BRANCH)
    parser.add_argument("--commit-message", default="Archive Bitnodes IP DB segments")

    parser.add_argument("--no-pull", action="store_true")
    parser.add_argument("--no-push", action="store_true")
    parser.add_argument("--copy-only", action="store_true")
    parser.add_argument("--dry-run", action="store_true")

    parser.add_argument("--manifest", default="", help="Legacy compatibility argument; ignored.")
    parser.add_argument("--compact", action="store_true", help="Legacy compatibility argument; affects report formatting only.")

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    source_index_path = Path(args.index).resolve()
    source_stats_path = Path(args.stats).resolve()
    source_latest_path = Path(args.latest).resolve()
    source_archive_dir = Path(args.archive_dir).resolve()

    if not source_index_path.exists():
        print(f"[push_ipdb.py] missing source IP DB index: {source_index_path}", flush=True)
        report = skipped_report("missing source IP DB index", source_index_path=str(source_index_path))

        if args.report:
            write_json(Path(args.report), report, pretty=not args.compact)

        if args.copy_only or args.no_push:
            return 0

        raise SystemExit(1)

    if not source_archive_dir.exists():
        print(f"[push_ipdb.py] missing source IP DB archive dir: {source_archive_dir}", flush=True)
        report = skipped_report("missing source IP DB archive dir", source_archive_dir=str(source_archive_dir))

        if args.report:
            write_json(Path(args.report), report, pretty=not args.compact)

        if args.copy_only or args.no_push:
            return 0

        raise SystemExit(1)

    if args.output_dir:
        destination_root = Path(args.output_dir).resolve()
        repo_dir = None
    else:
        private_repo_dir = Path(args.private_repo_dir).expanduser()

        if str(private_repo_dir) and str(private_repo_dir) != ".":
            repo_dir = private_repo_dir.resolve()
            destination_root = repo_dir / args.destination_subdir.strip("/")
        else:
            repo_dir = None
            destination_root = Path(args.ipdb_dir).resolve() / "published"

    report = copy_ipdb_archive(
        source_index_path=source_index_path,
        source_stats_path=source_stats_path,
        source_latest_path=source_latest_path,
        source_archive_dir=source_archive_dir,
        destination_root=destination_root,
        include_latest=args.include_latest,
        include_stats=not args.no_stats,
        include_index=not args.no_index,
        only_new=not args.copy_all,
    )

    if args.report:
        write_json(Path(args.report), report, pretty=not args.compact)

    if not args.copy_only:
        if repo_dir is None:
            raise SystemExit("missing --private-repo-dir or BITNODES_IPDB_ARCHIVE_REPO for git push mode")

        git_sync_and_push(
            repo_dir=repo_dir,
            remote=args.remote,
            branch=args.branch,
            commit_message=args.commit_message,
            dry_run=args.dry_run,
            no_pull=args.no_pull,
            no_push=args.no_push,
        )

    print(
        "push_ipdb complete: "
        f"copied={len(report['copied_segments'])}, "
        f"skipped={len(report['skipped_segments'])}, "
        f"missing={len(report['missing_segments'])}, "
        f"destination={destination_root}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
