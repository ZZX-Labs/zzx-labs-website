#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping


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

    if not path.exists():
        return fallback

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json(path: Path, payload: Any, pretty: bool = True) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    if pretty:
        text = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True)
    else:
        text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)

    path.write_text(text + "\n", encoding="utf-8")


def run(
    cmd: list[str],
    *,
    cwd: Path,
    check: bool = True,
    dry_run: bool = False,
) -> subprocess.CompletedProcess[str] | None:
    printable = " ".join(cmd)
    print(f"[push_ipdb.py] {cwd} $ {printable}", flush=True)

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


def require_git_repo(path: Path) -> None:
    if not path.exists():
        raise SystemExit(f"archive repo directory does not exist: {path}")

    if not (path / ".git").exists():
        raise SystemExit(f"archive repo directory is not a git repository: {path}")


def file_sha256(path: Path) -> str:
    import hashlib

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
    }


def index_segment_paths(index: Mapping[str, Any], archive_dir: Path) -> list[Path]:
    paths: list[Path] = []

    segments = index.get("segments", [])

    if not isinstance(segments, list):
        return paths

    for item in segments:
        if not isinstance(item, Mapping):
            continue

        filename = str(item.get("filename") or "").strip()

        if not filename:
            continue

        path = archive_dir / filename

        if path.exists():
            paths.append(path)

    return paths


def existing_archive_manifest(path: Path) -> dict[str, Any]:
    manifest = read_json(path, fallback={})

    if isinstance(manifest, Mapping):
        out = dict(manifest)
    else:
        out = {}

    out.setdefault("schema", "zzx-bitnodes-ipdb-private-archive-manifest-v1")
    out.setdefault("created_at", utc_now())
    out.setdefault("updated_at", utc_now())
    out.setdefault("segments", {})
    out.setdefault("copies", [])

    if not isinstance(out["segments"], dict):
        out["segments"] = {}

    if not isinstance(out["copies"], list):
        out["copies"] = []

    return out


def copy_ipdb_archive(
    *,
    source_index_path: Path,
    source_stats_path: Path,
    source_latest_path: Path,
    source_archive_dir: Path,
    private_repo_dir: Path,
    destination_subdir: str,
    include_latest: bool,
    include_stats: bool,
    include_index: bool,
    only_new: bool,
) -> dict[str, Any]:
    index = read_json(source_index_path, fallback={})

    if not isinstance(index, Mapping):
        raise SystemExit(f"invalid IP DB index: {source_index_path}")

    destination_root = private_repo_dir / destination_subdir
    destination_archive_dir = destination_root / "archive"
    destination_current_dir = destination_root / "current"
    manifest_path = destination_root / "ip_db.archive-manifest.json"

    manifest = existing_archive_manifest(manifest_path)

    copied: list[dict[str, Any]] = []
    skipped: list[str] = []

    segment_paths = index_segment_paths(index, source_archive_dir)

    for src in segment_paths:
        dst = destination_archive_dir / src.name

        src_sha = file_sha256(src)
        manifest_item = manifest["segments"].get(src.name)

        if only_new and dst.exists() and isinstance(manifest_item, Mapping):
            if manifest_item.get("sha256") == src_sha:
                skipped.append(src.name)
                continue

        info = copy_file(src, dst)
        copied.append(info)

        manifest["segments"][src.name] = {
            "filename": src.name,
            "path": str(dst.relative_to(private_repo_dir)),
            "size_bytes": info["size_bytes"],
            "sha256": info["sha256"],
            "copied_at": utc_now(),
        }

    current_copies: list[dict[str, Any]] = []

    if include_index and source_index_path.exists():
        current_copies.append(copy_file(source_index_path, destination_current_dir / source_index_path.name))

    if include_stats and source_stats_path.exists():
        current_copies.append(copy_file(source_stats_path, destination_current_dir / source_stats_path.name))

    if include_latest and source_latest_path.exists():
        current_copies.append(copy_file(source_latest_path, destination_current_dir / source_latest_path.name))

    manifest["updated_at"] = utc_now()
    manifest["source_index"] = str(source_index_path)
    manifest["source_archive_dir"] = str(source_archive_dir)
    manifest["destination_subdir"] = destination_subdir
    manifest["segment_count"] = len(manifest["segments"])
    manifest["last_run"] = {
        "updated_at": utc_now(),
        "copied_segments": len(copied),
        "skipped_segments": len(skipped),
        "current_files_copied": len(current_copies),
    }
    manifest["copies"].append(manifest["last_run"])

    write_json(manifest_path, manifest, pretty=True)

    return {
        "schema": "zzx-bitnodes-ipdb-push-report-v1",
        "updated_at": utc_now(),
        "source_index_path": str(source_index_path),
        "source_archive_dir": str(source_archive_dir),
        "private_repo_dir": str(private_repo_dir),
        "destination_root": str(destination_root),
        "copied_segments": copied,
        "skipped_segments": skipped,
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
    run(["git", "config", "user.name", "zzx-labs-ipdb-archive-bot"], cwd=repo_dir, dry_run=dry_run)
    run(["git", "config", "user.email", "actions@github.com"], cwd=repo_dir, dry_run=dry_run)

    if not no_pull:
        run(["git", "fetch", remote, branch], cwd=repo_dir, check=False, dry_run=dry_run)
        run(["git", "pull", "--rebase", remote, branch], cwd=repo_dir, check=False, dry_run=dry_run)

    run(["git", "add", "-A"], cwd=repo_dir, dry_run=dry_run)

    if dry_run:
        print("[push_ipdb.py] dry-run: skipping git status/commit/push final mutations", flush=True)
        return

    if not git_has_changes(repo_dir):
        print("[push_ipdb.py] no archive repo changes to commit", flush=True)
        return

    run(["git", "commit", "-m", commit_message], cwd=repo_dir)

    if not no_push:
        run(["git", "push", remote, f"HEAD:{branch}"], cwd=repo_dir)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Copy segmented Bitnodes IP DB archive files into a private archive repository and optionally git-push them."
    )

    parser.add_argument("--ipdb-dir", default=str(DEFAULT_IPDB_DIR))
    parser.add_argument("--index", default=str(DEFAULT_INDEX_PATH))
    parser.add_argument("--stats", default=str(DEFAULT_STATS_PATH))
    parser.add_argument("--latest", default=str(DEFAULT_LATEST_PATH))
    parser.add_argument("--archive-dir", default=str(DEFAULT_ARCHIVE_DIR))

    parser.add_argument("--private-repo-dir", default=str(DEFAULT_PRIVATE_REPO_DIR))
    parser.add_argument("--destination-subdir", default="bitcoin/bitnodes/ip_db")
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

    args = parser.parse_args()

    private_repo_dir = Path(args.private_repo_dir).expanduser().resolve()

    if not str(private_repo_dir):
        raise SystemExit("missing --private-repo-dir or BITNODES_IPDB_ARCHIVE_REPO")

    require_git_repo(private_repo_dir)

    source_index_path = Path(args.index).resolve()
    source_stats_path = Path(args.stats).resolve()
    source_latest_path = Path(args.latest).resolve()
    source_archive_dir = Path(args.archive_dir).resolve()

    if not source_index_path.exists():
        raise SystemExit(f"missing source IP DB index: {source_index_path}")

    if not source_archive_dir.exists():
        raise SystemExit(f"missing source IP DB archive dir: {source_archive_dir}")

    report = copy_ipdb_archive(
        source_index_path=source_index_path,
        source_stats_path=source_stats_path,
        source_latest_path=source_latest_path,
        source_archive_dir=source_archive_dir,
        private_repo_dir=private_repo_dir,
        destination_subdir=args.destination_subdir.strip("/"),
        include_latest=args.include_latest,
        include_stats=not args.no_stats,
        include_index=not args.no_index,
        only_new=not args.copy_all,
    )

    if args.report:
        write_json(Path(args.report), report, pretty=True)

    if not args.copy_only:
        git_sync_and_push(
            repo_dir=private_repo_dir,
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
        f"repo={private_repo_dir}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
