#!/usr/bin/env python3
from __future__ import annotations

import gzip
import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any

from flask import Flask, Response, jsonify, request


APP_ROOT = Path(__file__).resolve().parents[3]
BITNODES_ROOT = Path(os.environ.get("BITNODES_ROOT", str(APP_ROOT / "bitcoin" / "bitnodes")))
API_ROOT = Path(os.environ.get("BITNODES_API", str(BITNODES_ROOT / "api")))
DB_ROOT = Path(os.environ.get("BITNODES_DB_ROOT", str(BITNODES_ROOT / "data" / "mariadb")))
SQLITE_PATH = Path(os.environ.get("BITNODES_SQLITE", str(DB_ROOT / "api" / "bitnodes.sqlite3")))

DEFAULT_SOURCE = os.environ.get("BITNODES_DEFAULT_SOURCE", "zzxbitnodes")
SCHEMA = "zzx-bitnodes-flask-api-v1"


def utc_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    try:
        if not path.exists():
            return fallback

        if path.name.endswith(".gz"):
            with gzip.open(path, "rt", encoding="utf-8") as handle:
                return json.load(handle)

        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def json_response(payload: Any, status: int = 200) -> Response:
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str)
    return Response(text + "\n", status=status, content_type="application/json; charset=utf-8")


def error(message: str, status: int = 400, **extra: Any) -> Response:
    return json_response(
        {
            "schema": SCHEMA,
            "ok": False,
            "error": message,
            "generated_at": utc_now(),
            **extra,
        },
        status=status,
    )


def sqlite_available() -> bool:
    return SQLITE_PATH.exists() and SQLITE_PATH.is_file()


def sqlite_rows(sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    if not sqlite_available():
        return []

    conn = sqlite3.connect(str(SQLITE_PATH))
    conn.row_factory = sqlite3.Row

    try:
        rows = conn.execute(sql, params).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def sqlite_one(sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    rows = sqlite_rows(sql, params)
    return rows[0] if rows else None


def source_latest_path(source: str) -> Path:
    candidates = [
        API_ROOT / "aggregate" / source / "latest.json",
        API_ROOT / "enriched" / source / "latest.json",
        API_ROOT / source / "latest.json",
    ]

    for path in candidates:
        if path.exists():
            return path

    return candidates[0]


def fallback_latest(source: str) -> dict[str, Any]:
    payload = read_json(source_latest_path(source), fallback={})

    if isinstance(payload, dict):
        return payload

    return {"schema": SCHEMA, "source": source, "nodes": payload if isinstance(payload, list) else []}


def normalize_limit(value: Any, default: int = 100, maximum: int = 5000) -> int:
    try:
        limit = int(value)
    except Exception:
        limit = default

    return max(1, min(maximum, limit))


def normalize_offset(value: Any) -> int:
    try:
        return max(0, int(value))
    except Exception:
        return 0


def build_where(args: Any) -> tuple[str, list[Any]]:
    clauses = []
    params: list[Any] = []

    mapping = {
        "source": "source_name",
        "network": "network",
        "country": "country_code",
        "country_code": "country_code",
        "city": "city",
        "asn": "asn",
        "reachable_now": "reachable_now",
        "reachable_24h": "reachable_24h",
        "is_tor": "is_tor",
        "is_i2p": "is_i2p",
        "is_vpn": "is_vpn",
        "is_proxy": "is_proxy",
        "is_sanctioned_node": "is_sanctioned_node",
        "is_threat_infrastructure": "is_threat_infrastructure",
    }

    for query_key, column in mapping.items():
        value = args.get(query_key)

        if value in (None, ""):
            continue

        if query_key.startswith("is_") or query_key.startswith("reachable_"):
            value = str(value).lower()
            params.append(1 if value in {"1", "true", "yes", "y"} else 0)
        else:
            params.append(value)

        clauses.append(f"{column} = ?")

    q = args.get("q", "").strip()

    if q:
        like = f"%{q}%"
        clauses.append("(address LIKE ? OR host LIKE ? OR agent LIKE ? OR organization LIKE ? OR provider LIKE ?)")
        params.extend([like, like, like, like, like])

    if not clauses:
        return "", params

    return "WHERE " + " AND ".join(clauses), params


def create_app() -> Flask:
    app = Flask(__name__)

    @app.get("/")
    def root() -> Response:
        return json_response(
            {
                "schema": SCHEMA,
                "ok": True,
                "name": "ZZX-Labs Bitnodes API",
                "generated_at": utc_now(),
                "sqlite_available": sqlite_available(),
                "sqlite_path": str(SQLITE_PATH),
                "api_root": str(API_ROOT),
                "routes": [
                    "/health",
                    "/sources",
                    "/latest",
                    "/latest/<source>",
                    "/nodes",
                    "/nodes/<address>",
                    "/countries",
                    "/cities",
                    "/asns",
                    "/networks",
                    "/agents",
                    "/versions",
                    "/ports",
                    "/tor",
                    "/i2p",
                    "/vpn",
                    "/proxy",
                    "/sanctioned",
                    "/threats",
                    "/legacy/nodes",
                    "/legacy/nodes/<address>",
                ],
            }
        )

    @app.get("/health")
    def health() -> Response:
        return json_response(
            {
                "schema": SCHEMA,
                "ok": True,
                "generated_at": utc_now(),
                "sqlite_available": sqlite_available(),
                "sqlite_path": str(SQLITE_PATH),
                "api_root_exists": API_ROOT.exists(),
                "db_root_exists": DB_ROOT.exists(),
            }
        )

    @app.get("/sources")
    def sources() -> Response:
        found = set()

        for root in [API_ROOT, API_ROOT / "aggregate", API_ROOT / "enriched"]:
            if not root.exists():
                continue

            for child in root.iterdir():
                if child.is_dir():
                    found.add(child.name)

        return json_response(
            {
                "schema": SCHEMA,
                "generated_at": utc_now(),
                "sources": sorted(found),
                "default": DEFAULT_SOURCE,
            }
        )

    @app.get("/latest")
    def latest_default() -> Response:
        return latest_source(DEFAULT_SOURCE)

    @app.get("/latest/<source>")
    def latest_source(source: str) -> Response:
        payload = fallback_latest(source)
        payload.setdefault("schema", "zzx-bitnodes-api-latest-v1")
        payload.setdefault("source", source)
        payload.setdefault("served_at", utc_now())
        return json_response(payload)

    @app.get("/nodes")
    def nodes() -> Response:
        limit = normalize_limit(request.args.get("limit"), default=250)
        offset = normalize_offset(request.args.get("offset"))
        where, params = build_where(request.args)

        if sqlite_available():
            total_row = sqlite_one(f"SELECT COUNT(*) AS count FROM bitnodes_api_nodes {where}", tuple(params))
            rows = sqlite_rows(
                f"""
                SELECT *
                FROM bitnodes_api_nodes
                {where}
                ORDER BY reachable_now DESC, height DESC, address ASC
                LIMIT ? OFFSET ?
                """,
                tuple(params + [limit, offset]),
            )

            return json_response(
                {
                    "schema": "zzx-bitnodes-api-nodes-v1",
                    "generated_at": utc_now(),
                    "count": len(rows),
                    "total": int(total_row["count"]) if total_row else len(rows),
                    "limit": limit,
                    "offset": offset,
                    "nodes": rows,
                }
            )

        source = request.args.get("source", DEFAULT_SOURCE)
        payload = fallback_latest(source)
        nodes_data = payload.get("nodes", {})

        if isinstance(nodes_data, dict):
            rows = [{"address": key, **value} if isinstance(value, dict) else {"address": key, "raw": value} for key, value in nodes_data.items()]
        elif isinstance(nodes_data, list):
            rows = nodes_data
        else:
            rows = []

        return json_response(
            {
                "schema": "zzx-bitnodes-api-nodes-v1",
                "generated_at": utc_now(),
                "source": source,
                "count": len(rows[offset:offset + limit]),
                "total": len(rows),
                "limit": limit,
                "offset": offset,
                "nodes": rows[offset:offset + limit],
            }
        )

    @app.get("/nodes/<path:address>")
    def node(address: str) -> Response:
        if sqlite_available():
            row = sqlite_one(
                """
                SELECT *
                FROM bitnodes_api_nodes
                WHERE address = ? OR host = ? OR node_id = ?
                LIMIT 1
                """,
                (address, address, address),
            )

            if row:
                return json_response(
                    {
                        "schema": "zzx-bitnodes-api-node-v1",
                        "generated_at": utc_now(),
                        "found": True,
                        "node": row,
                    }
                )

        source = request.args.get("source", DEFAULT_SOURCE)
        payload = fallback_latest(source)
        nodes_data = payload.get("nodes", {})

        if isinstance(nodes_data, dict) and address in nodes_data:
            value = nodes_data[address]
            row = {"address": address, **value} if isinstance(value, dict) else {"address": address, "raw": value}
            return json_response({"schema": "zzx-bitnodes-api-node-v1", "generated_at": utc_now(), "found": True, "node": row})

        return error("node not found", 404, address=address)

    def group_endpoint(column: str, route_schema: str) -> Response:
        limit = normalize_limit(request.args.get("limit"), default=250, maximum=10000)
        where, params = build_where(request.args)

        if not sqlite_available():
            source = request.args.get("source", DEFAULT_SOURCE)
            payload = fallback_latest(source)
            return json_response(
                {
                    "schema": route_schema,
                    "generated_at": utc_now(),
                    "source": source,
                    "warning": "sqlite cache unavailable; serving latest payload only",
                    "latest": payload,
                }
            )

        rows = sqlite_rows(
            f"""
            SELECT COALESCE(NULLIF({column}, ''), 'Unknown') AS name, COUNT(*) AS count
            FROM bitnodes_api_nodes
            {where}
            GROUP BY name
            ORDER BY count DESC, name ASC
            LIMIT ?
            """,
            tuple(params + [limit]),
        )

        return json_response({"schema": route_schema, "generated_at": utc_now(), "count": len(rows), "rows": rows})

    @app.get("/countries")
    def countries() -> Response:
        return group_endpoint("country_code", "zzx-bitnodes-api-countries-v1")

    @app.get("/cities")
    def cities() -> Response:
        return group_endpoint("city", "zzx-bitnodes-api-cities-v1")

    @app.get("/asns")
    def asns() -> Response:
        return group_endpoint("asn", "zzx-bitnodes-api-asns-v1")

    @app.get("/networks")
    def networks() -> Response:
        return group_endpoint("network", "zzx-bitnodes-api-networks-v1")

    @app.get("/agents")
    def agents() -> Response:
        return group_endpoint("agent", "zzx-bitnodes-api-agents-v1")

    @app.get("/versions")
    def versions() -> Response:
        return group_endpoint("protocol", "zzx-bitnodes-api-versions-v1")

    @app.get("/ports")
    def ports() -> Response:
        return group_endpoint("port", "zzx-bitnodes-api-ports-v1")

    def flag_endpoint(flag: str, schema: str) -> Response:
        args = request.args.to_dict()
        args[flag] = "1"

        with app.test_request_context(query_string=args):
            return nodes()

    @app.get("/tor")
    def tor() -> Response:
        return flag_endpoint("is_tor", "zzx-bitnodes-api-tor-v1")

    @app.get("/i2p")
    def i2p() -> Response:
        return flag_endpoint("is_i2p", "zzx-bitnodes-api-i2p-v1")

    @app.get("/vpn")
    def vpn() -> Response:
        return flag_endpoint("is_vpn", "zzx-bitnodes-api-vpn-v1")

    @app.get("/proxy")
    def proxy() -> Response:
        return flag_endpoint("is_proxy", "zzx-bitnodes-api-proxy-v1")

    @app.get("/sanctioned")
    def sanctioned() -> Response:
        return flag_endpoint("is_sanctioned_node", "zzx-bitnodes-api-sanctioned-v1")

    @app.get("/threats")
    def threats() -> Response:
        return flag_endpoint("is_threat_infrastructure", "zzx-bitnodes-api-threats-v1")

    @app.get("/legacy/nodes")
    def legacy_nodes() -> Response:
        source = request.args.get("source", DEFAULT_SOURCE)
        payload = fallback_latest(source)
        nodes_data = payload.get("nodes", {})

        return json_response(
            {
                "success": True,
                "source": source,
                "timestamp": int(time.time()),
                "nodes": nodes_data,
            }
        )

    @app.get("/legacy/nodes/<path:address>")
    def legacy_node(address: str) -> Response:
        source = request.args.get("source", DEFAULT_SOURCE)
        payload = fallback_latest(source)
        nodes_data = payload.get("nodes", {})

        if isinstance(nodes_data, dict) and address in nodes_data:
            return json_response(
                {
                    "success": True,
                    "address": address,
                    "node": nodes_data[address],
                    "timestamp": int(time.time()),
                }
            )

        return json_response({"success": False, "error": "not found", "address": address}, status=404)

    return app


app = create_app()


def main() -> int:
    host = os.environ.get("BITNODES_API_HOST", "127.0.0.1")
    port = int(os.environ.get("BITNODES_API_PORT", "8339"))
    debug = os.environ.get("BITNODES_API_DEBUG", "0").lower() in {"1", "true", "yes"}

    app.run(host=host, port=port, debug=debug)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
