#!/usr/bin/env python3
"""Conflict-resistant publisher for generated BPI artifacts.

The generated files are snapshotted first. Each push attempt then resets onto
fresh origin/<branch>, overlays only files actually changed by this run, creates
a new commit, and pushes it. This avoids rebasing stale generated commits and
therefore avoids content conflicts in mutable files such as exchange_rates.json.
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Iterable


def run(root: Path, argv: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(argv, cwd=str(root), text=True, capture_output=True)
    if check and proc.returncode != 0:
        raise RuntimeError(
            f"command failed ({proc.returncode}): {' '.join(argv)}\n"
            f"stdout:\n{proc.stdout}\nstderr:\n{proc.stderr}"
        )
    return proc


def git_z(root: Path, argv: list[str]) -> list[str]:
    proc = subprocess.run(argv, cwd=str(root), capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode('utf-8', 'replace'))
    return [
        item.decode('utf-8', 'surrogateescape')
        for item in proc.stdout.split(b'\0')
        if item
    ]


def normalize_rel(root: Path, value: str) -> str:
    candidate=(root/value).resolve()
    try:
        rel=candidate.relative_to(root.resolve())
    except ValueError as exc:
        raise ValueError(f"path escapes repository: {value}") from exc
    return rel.as_posix()


def changed_files(root: Path, scopes: list[str]) -> tuple[list[str], list[str]]:
    diff=git_z(root,['git','diff','--name-only','-z','HEAD','--',*scopes])
    untracked=git_z(root,['git','ls-files','--others','--exclude-standard','-z','--',*scopes])
    names=sorted(set(diff+untracked))
    present=[]
    deleted=[]
    for name in names:
        path=root/name
        if path.is_file() or path.is_symlink():
            present.append(name)
        elif not path.exists():
            deleted.append(name)
    return present,deleted


def snapshot_files(root: Path, files: Iterable[str], dest: Path) -> None:
    for rel in files:
        src=root/rel
        dst=dest/rel
        dst.parent.mkdir(parents=True,exist_ok=True)
        if src.is_symlink():
            target=os.readlink(src)
            if dst.exists() or dst.is_symlink(): dst.unlink()
            dst.symlink_to(target)
        else:
            shutil.copy2(src,dst)


def restore_files(root: Path, files: Iterable[str], source: Path) -> None:
    for rel in files:
        src=source/rel
        dst=root/rel
        dst.parent.mkdir(parents=True,exist_ok=True)
        if src.is_symlink():
            if dst.exists() or dst.is_symlink(): dst.unlink()
            dst.symlink_to(os.readlink(src))
        else:
            shutil.copy2(src,dst)


def publish(
    root: Path,
    *,
    scopes: list[str],
    message: str,
    remote: str,
    branch: str,
    attempts: int,
    sleep_seconds: float,
) -> int:
    root=root.resolve()
    scopes=[normalize_rel(root,p) for p in scopes]

    files,deleted=changed_files(root,scopes)
    if deleted:
        print(
            'warning: generated deletions are intentionally not replayed: '
            + ', '.join(deleted),
            file=sys.stderr,
        )

    if not files:
        print('No generated BPI files changed; nothing to publish.')
        return 0

    with tempfile.TemporaryDirectory(prefix='zzx-bpi-publish-') as td:
        snapshot=Path(td)/'snapshot'
        snapshot_files(root,files,snapshot)

        for attempt in range(1,max(1,attempts)+1):
            # Never rebase the generated commit. Rebase was the source of the
            # exchange_rates.json conflict. Start each attempt from fresh main.
            run(root,['git','rebase','--abort'],check=False)
            run(root,['git','merge','--abort'],check=False)
            run(root,['git','fetch',remote,branch])
            run(root,['git','reset','--hard',f'{remote}/{branch}'])

            restore_files(root,files,snapshot)
            run(root,['git','add','--',*files])

            staged=run(root,['git','diff','--cached','--quiet'],check=False)
            if staged.returncode==0:
                print('Newest branch already contains this generated BPI state.')
                return 0
            if staged.returncode not in (0,1):
                raise RuntimeError(staged.stderr)

            run(root,['git','commit','-m',message])
            pushed=run(root,['git','push',remote,f'HEAD:{branch}'],check=False)
            if pushed.returncode==0:
                print(
                    f'Published {len(files)} generated BPI file(s) on attempt {attempt}.'
                )
                return 0

            print(
                f'Push attempt {attempt} was rejected; replaying generated files '
                f'on newest {remote}/{branch}.',
                file=sys.stderr,
            )
            if attempt<attempts:
                time.sleep(max(0.0,sleep_seconds))

    print(
        f'Failed to publish generated BPI state after {attempts} replay attempt(s).',
        file=sys.stderr,
    )
    return 1


def main() -> int:
    p=argparse.ArgumentParser(description='Publish generated BPI files without rebasing stale commits.')
    p.add_argument('--root',default=str(Path(__file__).resolve().parents[2]))
    p.add_argument('--path',action='append',dest='paths',required=True,help='Generated file or directory scope; repeatable.')
    p.add_argument('--message',required=True)
    p.add_argument('--remote',default='origin')
    p.add_argument('--branch',default='main')
    p.add_argument('--attempts',type=int,default=5)
    p.add_argument('--sleep-seconds',type=float,default=5.0)
    args=p.parse_args()
    return publish(
        Path(args.root),
        scopes=args.paths,
        message=args.message,
        remote=args.remote,
        branch=args.branch,
        attempts=args.attempts,
        sleep_seconds=args.sleep_seconds,
    )

if __name__=='__main__':
    raise SystemExit(main())
