#!/usr/bin/env python3
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from flask import Flask, Response, jsonify, send_from_directory
from flask_cors import CORS


SERVER_DIR = Path(__file__).resolve().parent
APP_ROOT = SERVER_DIR.parent

STATIC_ROOT = APP_ROOT
BITNODES_API_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "api"
BPI_API_DIR = APP_ROOT / "bitcoin" / "bpi" / "api"
MEMPOOL_DIR = APP_ROOT / "bitcoin" / "mempoolspace"
RUN_DIR = APP_ROOT / "run"

BITNODES_STATUS = RUN_DIR / "bitnodesd.status.json"

APP_NAME = "zzx-labs-server"
APP_VERSION = "0.1.0"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    if not path.exists():
        return fallback

    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception as exc:
        return {
            "error": "json_read_failed",
            "path": str(path),
            "message": str(exc),
        }


def json_response(payload: Any, status: int = 200) -> Response:
    body = json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False)
    return Response(
        body + "\n",
        status=status,
        mimetype="application/json",
    )


def safe_json_file(base_dir: Path, relative_path: str) -> Path | None:
    requested = (base_dir / relative_path).resolve()

    try:
        requested.relative_to(base_dir.resolve())
    except ValueError:
        return None

    if requested.suffix.lower() != ".json":
        return None

    return requested


def create_app() -> Flask:
    app = Flask(
        __name__,
        static_folder=None,
    )

    CORS(app)

    @app.after_request
    def add_headers(response: Response) -> Response:
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Permissions-Policy",
            "geolocation=(), microphone=(), camera=()",
        )

        return response

    @app.get("/api/health")
    def health() -> Response:
        return json_response(
            {
                "schema": "zzx-labs-health-v1",
                "app": APP_NAME,
                "version": APP_VERSION,
                "status": "ok",
                "updated_at": utc_now(),
                "app_root": str(APP_ROOT),
                "server_dir": str(SERVER_DIR),
            }
        )

    @app.get("/api/status")
    def status() -> Response:
        return json_response(
            {
                "schema": "zzx-labs-status-v1",
                "app": APP_NAME,
                "version": APP_VERSION,
                "updated_at": utc_now(),
                "paths": {
                    "app_root": str(APP_ROOT),
                    "server_dir": str(SERVER_DIR),
                    "bitnodes_api_dir": str(BITNODES_API_DIR),
                    "bpi_api_dir": str(BPI_API_DIR),
                    "mempool_dir": str(MEMPOOL_DIR),
                    "run_dir": str(RUN_DIR),
                },
                "exists": {
                    "bitnodes_api_dir": BITNODES_API_DIR.exists(),
                    "bpi_api_dir": BPI_API_DIR.exists(),
                    "mempool_dir": MEMPOOL_DIR.exists(),
                    "bitnodes_status": BITNODES_STATUS.exists(),
                },
            }
        )

    @app.get("/api/bitnodes/status")
    def bitnodes_status() -> Response:
        payload = read_json(
            BITNODES_STATUS,
            {
                "schema": "zzx-bitnodes-daemon-status-v1",
                "daemon_running": False,
                "state": "unknown",
                "message": "No bitnodes daemon status file found.",
                "path": str(BITNODES_STATUS),
                "updated_at": utc_now(),
            },
        )

        return json_response(payload)

    @app.get("/api/bitnodes/latest")
    def bitnodes_latest() -> Response:
        candidates = [
            BITNODES_API_DIR / "enriched" / "latest.json",
            BITNODES_API_DIR / "zzxbitnodes" / "latest.json",
            BITNODES_API_DIR / "zzxbitnodes" / "nodes.json",
            BITNODES_API_DIR / "originalbitnodes" / "latest.json",
            BITNODES_API_DIR / "originalbitnodes" / "nodes.json",
        ]

        for path in candidates:
            if path.exists():
                return json_response(read_json(path))

        return json_response(
            {
                "error": "bitnodes_latest_not_found",
                "searched": [str(path) for path in candidates],
            },
            status=404,
        )

    @app.get("/api/bitnodes/file/<path:relative_path>")
    def bitnodes_file(relative_path: str) -> Response:
        path = safe_json_file(BITNODES_API_DIR, relative_path)

        if path is None:
            return json_response({"error": "invalid_path"}, status=400)

        if not path.exists():
            return json_response({"error": "not_found", "path": relative_path}, status=404)

        return json_response(read_json(path))

    @app.get("/api/bpi/latest")
    def bpi_latest() -> Response:
        path = BPI_API_DIR / "latest.json"

        if not path.exists():
            return json_response(
                {
                    "error": "bpi_latest_not_found",
                    "path": str(path),
                },
                status=404,
            )

        return json_response(read_json(path))

    @app.get("/api/bpi/file/<path:relative_path>")
    def bpi_file(relative_path: str) -> Response:
        path = safe_json_file(BPI_API_DIR, relative_path)

        if path is None:
            return json_response({"error": "invalid_path"}, status=400)

        if not path.exists():
            return json_response({"error": "not_found", "path": relative_path}, status=404)

        return json_response(read_json(path))

    @app.get("/")
    def root() -> Response:
        return send_from_directory(STATIC_ROOT, "index.html")

    @app.get("/<path:relative_path>")
    def static_site(relative_path: str):
        requested = (STATIC_ROOT / relative_path).resolve()

        try:
            requested.relative_to(STATIC_ROOT.resolve())
        except ValueError:
            return json_response({"error": "invalid_path"}, status=400)

        if requested.is_dir():
            index_file = requested / "index.html"

            if index_file.exists():
                return send_from_directory(requested, "index.html")

        if requested.exists() and requested.is_file():
            return send_from_directory(requested.parent, requested.name)

        html_path = STATIC_ROOT / f"{relative_path}.html"

        if html_path.exists():
            return send_from_directory(html_path.parent, html_path.name)

        fallback = STATIC_ROOT / "404.html"

        if fallback.exists():
            return send_from_directory(STATIC_ROOT, "404.html"), 404

        return json_response(
            {
                "error": "not_found",
                "path": relative_path,
            },
            status=404,
        )

    return app


app = create_app()


if __name__ == "__main__":
    host = os.environ.get("ZZX_LABS_HOST", "0.0.0.0")
    port = int(os.environ.get("ZZX_LABS_PORT", "5000"))
    debug = os.environ.get("ZZX_LABS_DEBUG", "0").lower() in {"1", "true", "yes", "on"}

    app.run(
        host=host,
        port=port,
        debug=debug,
    )
