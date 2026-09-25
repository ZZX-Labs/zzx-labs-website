#!/usr/bin/env python3
"""Fail CI if Node/npm/npx/React build/runtime dependencies are introduced.

Bitcoin "node" terminology is intentionally not forbidden. The policy targets
JavaScript package-manager runtimes/toolchains, external JS Actions and npm-CDN
runtime imports. Browser-side local vanilla JavaScript remains allowed.
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path

PACKAGE_FILES = {
    "package.json", "package-lock.json", "npm-shrinkwrap.json", "yarn.lock",
    "pnpm-lock.yaml", "bun.lock", "bun.lockb",
}
RUNTIME_EXTENSIONS = {".js", ".mjs", ".cjs", ".html", ".htm", ".py", ".sh", ".yml", ".yaml"}
SKIP_DIRS = {".git", "__pycache__"}

WORKFLOW_FORBIDDEN = [
    re.compile(r"^[ \\t]*uses:[ \\t]*(?!\./\.github/workflows/)\\S+", re.M),
    re.compile(r"FORCE_JAVASCRIPT_ACTIONS_TO_NODE", re.I),
    re.compile(r"(^|[;&|]\s*|\n\s*)(node|npm|npx|yarn|pnpm|bun)\s+", re.I),
]
RUNTIME_FORBIDDEN = [
    re.compile(r"https?://cdn\.jsdelivr\.net/npm/", re.I),
    re.compile(r"https?://unpkg\.com/", re.I),
    re.compile(r"https?://esm\.sh/", re.I),
    re.compile(r"https?://cdn\.skypack\.dev/", re.I),
    re.compile(r"(?:from\s+|require\s*\()['\"]react(?:/[^'\"]*)?['\"]", re.I),
    re.compile(r"<script[^>]+src=['\"][^'\"]*react[^'\"]*['\"]", re.I),
]


def iter_files(root: Path):
    for p in root.rglob("*"):
        if not p.is_file() or any(part in SKIP_DIRS for part in p.parts):
            continue
        yield p


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    args = ap.parse_args()
    root = Path(args.root).resolve()
    violations: list[str] = []

    for p in iter_files(root):
        rel = p.relative_to(root)
        if p.name in PACKAGE_FILES:
            violations.append(f"package-manager manifest forbidden: {rel}")
            continue
        if rel.as_posix() == "tools/site/no_node_policy.py":
            continue
        if p.suffix.lower() not in RUNTIME_EXTENSIONS:
            continue
        try:
            text = p.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue

        patterns = RUNTIME_FORBIDDEN
        if rel.parts[:2] == (".github", "workflows"):
            patterns = WORKFLOW_FORBIDDEN + RUNTIME_FORBIDDEN
        for pattern in patterns:
            match = pattern.search(text)
            if match:
                line = text.count("\n", 0, match.start()) + 1
                violations.append(f"{rel}:{line}: forbidden runtime/toolchain pattern: {match.group(0)[:120]!r}")

    if violations:
        print("JavaScript toolchain policy: FAIL")
        for v in violations:
            print(v)
        return 1
    print("JavaScript toolchain policy: PASS (no Node/npm/npx/React build/runtime dependencies detected)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
