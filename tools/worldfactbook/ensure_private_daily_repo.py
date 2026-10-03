#!/usr/bin/env python3
"""Find or create the private GitHub repository for daily archive checkpoints.

The token is read only from PRIVATE_TOKEN. No credential or private repository
URL is written into the public WorldFactbook API. This command refuses to use
an existing public repository, even when it has the requested name.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

API_ROOT = "https://api.github.com"
SLUG = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*$")


class RepositoryError(RuntimeError):
    pass


def api_request(method: str, endpoint: str, token: str, payload: dict | None = None) -> tuple[int, dict]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(API_ROOT + endpoint, data=body, method=method, headers={
        "Accept": "application/vnd.github+json",
        "Authorization": "Bearer " + token,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "ZZX-WorldFactbook-Daily-Recovery",
        **({"Content-Type": "application/json"} if body is not None else {}),
    })
    try:
        with urlopen(request, timeout=30) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        try:
            details = json.loads(exc.read().decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            details = {}
        return exc.code, details if isinstance(details, dict) else {}
    except (URLError, TimeoutError) as exc:
        raise RepositoryError(f"GitHub API is unavailable: {exc.reason if isinstance(exc, URLError) else exc}") from exc


def check_private(repository: str, status: int, data: dict) -> str:
    if status != 200:
        raise RepositoryError(f"Repository lookup returned HTTP {status}: {data.get('message', 'no detail')}")
    if str(data.get("full_name", "")).lower() != repository.lower():
        raise RepositoryError("Repository lookup returned a different owner/name")
    if data.get("private") is not True:
        raise RepositoryError("The configured data repository is public; refusing to send private archive evidence")
    permissions = data.get("permissions")
    if isinstance(permissions, dict) and permissions.get("push") is False:
        raise RepositoryError(
            "The token identity cannot push to the private repository. Grant repository Contents read/write "
            "and authorize the token for this organization (including SSO or approval when required)"
        )
    branch = str(data.get("default_branch") or "")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", branch):
        raise RepositoryError("The private repository needs an initialized default branch")
    return branch


def ensure(repository: str, token: str, request=api_request, pause=time.sleep) -> dict:
    if not SLUG.fullmatch(repository) or ".." in repository:
        raise RepositoryError("Repository must be a plain owner/name slug")
    if not token:
        raise RepositoryError("WORLDFACTBOOK_PRIVATE_DATA_TOKEN is missing")
    owner, name = repository.split("/", 1)
    path = f"/repos/{quote(owner)}/{quote(name)}"
    status, data = request("GET", path, token)
    if status == 200:
        return {"repository": repository, "default_branch": check_private(repository, status, data), "created": False}
    if status != 404:
        raise RepositoryError(f"Private repository check returned HTTP {status}: {data.get('message', 'no detail')}")

    owner_status, owner_data = request("GET", f"/users/{quote(owner)}", token)
    if owner_status != 200:
        raise RepositoryError(f"Cannot identify repository owner (HTTP {owner_status})")
    endpoint = f"/orgs/{quote(owner)}/repos" if owner_data.get("type") == "Organization" else "/user/repos"
    create_status, created = request("POST", endpoint, token, {
        "name": name, "description": "Private World Factbook daily recovery checkpoints and source evidence",
        "private": True, "auto_init": True, "has_issues": False,
        "has_projects": False, "has_wiki": False,
    })
    if create_status != 201:
        raise RepositoryError(
            f"Could not create private repository (HTTP {create_status}): {created.get('message', 'check token creation rights and repository ownership')}")
    if str(created.get("full_name", "")).lower() != repository.lower() or created.get("private") is not True:
        raise RepositoryError("Repository creation did not return the requested private owner/name")
    for attempt in range(5):
        status, data = request("GET", path, token)
        if status == 200 and data.get("default_branch"):
            return {"repository": repository, "default_branch": check_private(repository, status, data), "created": True}
        if attempt < 4:
            pause(2)
    raise RepositoryError("The new private repository did not initialize its default branch")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", required=True, help="GitHub owner/name; never a URL containing a token")
    parser.add_argument("--output", type=Path, help="GitHub Actions GITHUB_OUTPUT path")
    args = parser.parse_args(argv)
    try:
        result = ensure(args.repository, os.environ.get("PRIVATE_TOKEN", ""))
    except RepositoryError as exc:
        parser.exit(1, f"Private archive repository: {exc}\n")
    if args.output:
        with args.output.open("a", encoding="utf-8") as stream:
            stream.write(f"repository={result['repository']}\n")
            stream.write(f"branch={result['default_branch']}\n")
            stream.write(f"created={str(result['created']).lower()}\n")
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
