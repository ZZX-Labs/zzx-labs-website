#!/usr/bin/env python3
"""Copy completed resident BPI hours into a private Git repository.

Designed for the systemd finalizer. A missing credential is a clean no-op so
private-backup availability can never stop acquisition or local archival.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path


def run(argv: list[str], cwd: Path | None = None, *, check: bool = True, env=None):
    p = subprocess.run(argv, cwd=str(cwd) if cwd else None, text=True, capture_output=True, env=env)
    if check and p.returncode:
        raise RuntimeError(f"command failed ({p.returncode}): {' '.join(argv)}\n{p.stdout}\n{p.stderr}")
    return p


def hour_floor(ms: int) -> int:
    return (ms // 3_600_000) * 3_600_000


def completed_hours(root: Path, hours_back: int) -> list[tuple[Path, Path]]:
    end = hour_floor(int(time.time() * 1000))
    result = []
    for n in range(max(1, int(hours_back)), 0, -1):
        start = end - n * 3_600_000
        dt = datetime.fromtimestamp(start / 1000, timezone.utc)
        rel = Path("bpi/hourly") / dt.strftime("%Y/%m/%d/%H")
        src = root / "bitcoin/bpi/archive/hourly" / dt.strftime("%Y/%m/%d/%H")
        if (src / "manifest.json").is_file():
            result.append((src, rel))
    return result


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--root", default=str(Path(__file__).resolve().parents[2]))
    p.add_argument("--repo", default=os.environ.get("BPI_BACKUP_REPO"))
    p.add_argument("--token", default=os.environ.get("BPI_BACKUP_TOKEN"))
    p.add_argument("--hours-back", type=int, default=2)
    p.add_argument("--branch", default="main")
    p.add_argument("--self-test", action="store_true")
    a = p.parse_args()
    root = Path(a.root).resolve()

    if a.self_test:
        now = hour_floor(3_600_001)
        assert now == 3_600_000
        print(json.dumps({"schema": "zzx-bpi-private-backup-selftest-v1", "ok": True}))
        return 0

    if not a.repo or not a.token:
        print("BPI private backup credentials are not configured; local archive retained.")
        return 0

    hours = completed_hours(root, a.hours_back)
    if not hours:
        print("No completed BPI hour manifests are available for private backup.")
        return 0

    with tempfile.TemporaryDirectory(prefix="zzx-bpi-private-") as td:
        tmp = Path(td)
        askpass = tmp / "askpass.sh"
        askpass.write_text(
            "#!/usr/bin/env bash\n"
            "case \"${1:-}\" in\n"
            "  *Username*) printf '%s\\n' 'x-access-token' ;;\n"
            "  *Password*) printf '%s\\n' \"${BPI_BACKUP_TOKEN}\" ;;\n"
            "  *) printf '%s\\n' '' ;;\n"
            "esac\n",
            encoding="utf-8",
        )
        askpass.chmod(0o700)
        env = os.environ.copy()
        env["BPI_BACKUP_TOKEN"] = a.token
        env["GIT_ASKPASS"] = str(askpass)
        env["GIT_TERMINAL_PROMPT"] = "0"
        work = tmp / "repo"
        url = a.repo if "://" in a.repo else f"https://github.com/{a.repo}.git"

        run(["git", "clone", "--filter=blob:none", "--no-checkout", "--single-branch", "--branch", a.branch, url, str(work)], env=env)
        run(["git", "sparse-checkout", "init", "--cone"], cwd=work, env=env)
        sparse = {"bpi/latest"}
        for _, rel in hours:
            sparse.add(str(rel.parent))
        run(["git", "sparse-checkout", "set", *sorted(sparse)], cwd=work, env=env)
        run(["git", "checkout", a.branch], cwd=work, env=env)

        for src, rel in hours:
            dst = work / rel
            if dst.exists():
                shutil.rmtree(dst)
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(src, dst)

        latest = work / "bpi/latest"
        latest.mkdir(parents=True, exist_ok=True)
        for name in ("latest.json", "markets.json", "provider_health.json", "history-live.json", "hourly_status.json"):
            src = root / "bitcoin/bpi/api" / name
            if src.is_file():
                shutil.copy2(src, latest / name)

        manifest = {
            "schema": "zzx-bpi-private-backup-v1",
            "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "hours": [str(rel) for _, rel in hours],
        }
        (latest / "backup-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

        run(["git", "config", "user.name", "zzx-bpi-backup-bot"], cwd=work, env=env)
        run(["git", "config", "user.email", "actions@github.com"], cwd=work, env=env)
        add_paths = [str(rel) for _, rel in hours] + ["bpi/latest"]

        # Replay generated backup files onto fresh main on every attempt. Never
        # rebase a stale generated commit, because bpi/latest is intentionally
        # mutable and may also be updated by the GitHub fallback collector.
        for attempt in range(1, 6):
            if attempt > 1:
                fetched = run(["git", "fetch", "origin", a.branch], cwd=work, check=False, env=env)
                if fetched.returncode != 0:
                    time.sleep(attempt * 3)
                    continue
                run(["git", "reset", "--hard", f"origin/{a.branch}"], cwd=work, env=env)
                for src, rel in hours:
                    dst = work / rel
                    if dst.exists():
                        shutil.rmtree(dst)
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copytree(src, dst)
                latest.mkdir(parents=True, exist_ok=True)
                for name in ("latest.json", "markets.json", "provider_health.json", "history-live.json", "hourly_status.json"):
                    src = root / "bitcoin/bpi/api" / name
                    if src.is_file():
                        shutil.copy2(src, latest / name)
                (latest / "backup-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

            run(["git", "add", "--sparse", "--", *add_paths], cwd=work, env=env)
            if run(["git", "diff", "--cached", "--quiet"], cwd=work, check=False, env=env).returncode == 0:
                print("Private BPI backup already contains these completed hours.")
                return 0
            run(["git", "commit", "-m", f"BPI completed hours through {hours[-1][1]}"], cwd=work, env=env)
            pushed = run(["git", "push", "origin", f"HEAD:{a.branch}"], cwd=work, check=False, env=env)
            if pushed.returncode == 0:
                print(json.dumps(manifest))
                return 0
            time.sleep(attempt * 3)

    print("Failed to push completed BPI hours to private backup after retries.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
