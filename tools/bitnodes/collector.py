#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import sqlite3
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
API_DIR = ROOT / "bitcoin" / "bitnodes" / "api"
DB_PATH = ROOT / "bitcoin" / "bitnodes" / "bitnodes.sqlite3"
SOURCES_PATH = API_DIR / "sources.json"
UA = "ZZX-Labs-Bitnodes/5 (+https://zzx-labs.io/bitcoin/bitnodes/)"

def finite(value: Any) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return math.nan
    return n if math.isfinite(n) else math.nan

def text(value: Any) -> str:
    return str(value or "").strip()

def now_ms() -> int:
    return int(time.time() * 1000)

def parse_time(value: Any) -> int | None:
    if value is None:
        return None
    n = finite(value)
    if math.isfinite(n):
        return int(n * 1000 if 0 < n < 1e11 else n)
    try:
        from datetime import datetime
        return int(datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp() * 1000)
    except Exception:
        return None

def fetch_json(url: str, timeout: int = 20) -> Any:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "application/json",
            "Cache-Control": "no-cache",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        if response.status != 200:
            raise RuntimeError(f"HTTP {response.status} {url}")
        return json.load(response)

def normalize_base(value: str) -> str:
    value = text(value).rstrip("/")
    if value.lower().endswith("/api/v1"):
        return value
    return f"{value}/api/v1"

def load_sources() -> dict[str, Any]:
    if SOURCES_PATH.exists():
        payload = json.loads(SOURCES_PATH.read_text(encoding="utf-8"))
    else:
        payload = {}
    rows = [{
        "id": "btcnodes.io",
        "base": "https://btcnodes.io/api/v1",
        "priority": 0,
        "enabled": True,
    }]
    for row in payload.get("mirrors", []):
        if row.get("enabled") is False:
            continue
        base = normalize_base(row.get("base") or row.get("url") or "")
        if not base:
            continue
        rows.append({
            "id": text(row.get("id")) or base,
            "base": base,
            "priority": int(row.get("priority", 100)),
            "enabled": True,
        })
    rows.sort(key=lambda r: (r["priority"], r["id"]))
    return {"config": payload, "upstreams": rows}

def unwrap(payload: Any) -> Any:
    cur = payload
    for _ in range(10):
        if isinstance(cur, list):
            return cur
        if not isinstance(cur, dict):
            return {}
        nxt = (
            cur.get("data")
            or cur.get("result")
            or cur.get("results")
            or cur.get("snapshot")
            or cur.get("latest")
        )
        if nxt is not None and nxt is not cur:
            cur = nxt
            continue
        return cur
    return cur

def network_from_address(address: str) -> str:
    s = text(address).lower()
    if ".onion" in s:
        return "tor"
    if ".i2p" in s or ".b32.i2p" in s:
        return "i2p"
    if ".cjdns" in s:
        return "cjdns"
    if s.startswith("[") and "]" in s:
        return "ipv6"
    host = s.rsplit(":", 1)[0] if s.count(":") == 1 else s
    parts = host.split(".")
    if len(parts) == 4 and all(p.isdigit() for p in parts):
        return "ipv4"
    if ":" in host:
        return "ipv6"
    return "other"

def list_value(value: Any, index: int) -> Any:
    return value[index] if isinstance(value, list) and len(value) > index else None

def normalize_node(address: str, value: Any) -> dict[str, Any]:
    obj = value if isinstance(value, dict) else {}
    ua = text(
        obj.get("user_agent")
        or obj.get("userAgent")
        or obj.get("subversion")
        or list_value(value, 1)
    )
    protocol = finite(
        obj.get("protocol_version")
        or obj.get("protocolVersion")
        or obj.get("version")
        or list_value(value, 0)
    )
    height = finite(
        obj.get("height")
        or obj.get("block_height")
        or obj.get("latest_height")
        or list_value(value, 4)
    )
    city = text(obj.get("city") or (obj.get("geo") or {}).get("city") or list_value(value, 6))
    country = text(
        obj.get("country")
        or obj.get("country_code")
        or (obj.get("geo") or {}).get("country")
        or (obj.get("geo") or {}).get("country_code")
        or list_value(value, 7)
    ).upper()
    county = text(
        obj.get("county")
        or obj.get("admin2")
        or (obj.get("geo") or {}).get("county")
        or (obj.get("geo") or {}).get("admin2")
    )
    region = text(
        obj.get("region")
        or obj.get("state")
        or obj.get("admin1")
        or (obj.get("geo") or {}).get("region")
        or (obj.get("geo") or {}).get("state")
        or (obj.get("geo") or {}).get("admin1")
    )
    lat = finite(
        obj.get("latitude")
        or obj.get("lat")
        or (obj.get("geo") or {}).get("latitude")
        or (obj.get("geo") or {}).get("lat")
        or list_value(value, 8)
    )
    lon = finite(
        obj.get("longitude")
        or obj.get("lon")
        or obj.get("lng")
        or (obj.get("geo") or {}).get("longitude")
        or (obj.get("geo") or {}).get("lon")
        or list_value(value, 9)
    )
    asn = text(obj.get("asn") or obj.get("as_number") or (obj.get("geo") or {}).get("asn") or list_value(value, 11))
    org = text(
        obj.get("organization")
        or obj.get("org")
        or obj.get("isp")
        or (obj.get("geo") or {}).get("organization")
        or list_value(value, 12)
    )
    return {
        "address": text(address),
        "network": text(obj.get("network")) or network_from_address(address),
        "protocol_version": int(protocol) if math.isfinite(protocol) else None,
        "user_agent": ua or None,
        "height": int(height) if math.isfinite(height) else None,
        "city": city or None,
        "county": county or None,
        "region": region or None,
        "country": country or None,
        "latitude": lat if math.isfinite(lat) else None,
        "longitude": lon if math.isfinite(lon) else None,
        "asn": asn or None,
        "organization": org or None,
    }

def normalize_nodes(raw: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if isinstance(raw, dict):
        for address, value in raw.items():
            out.append(normalize_node(address, value))
    elif isinstance(raw, list):
        for row in raw:
            if isinstance(row, list) and row:
                out.append(normalize_node(text(row[0]), row[1:]))
            elif isinstance(row, dict):
                address = text(
                    row.get("address")
                    or row.get("addr")
                    or row.get("endpoint")
                    or row.get("host")
                    or row.get("node")
                )
                if address:
                    out.append(normalize_node(address, row))
    return out

def inc(mapping: dict[str, int], key: str | None) -> None:
    k = text(key) or "Unknown"
    mapping[k] = mapping.get(k, 0) + 1

def normalize(payload: Any, source: str) -> dict[str, Any]:
    obj = unwrap(payload)
    root = {"nodes": obj} if isinstance(obj, list) else (obj if isinstance(obj, dict) else {})
    raw_nodes = (
        root.get("nodes")
        or root.get("node_map")
        or root.get("peers")
        or root.get("entries")
    )

    # Some compatible mirrors expose the legacy address -> tuple map directly
    # rather than wrapping it under a "nodes" key. Detect that shape without
    # treating normal metadata dictionaries as node maps.
    if raw_nodes is None and isinstance(root, dict):
        sample_keys = [str(key) for key in list(root.keys())[:32]]
        addressish = sum(
            1
            for key in sample_keys
            if ":" in key or ".onion" in key.lower() or ".i2p" in key.lower()
        )
        if sample_keys and addressish >= max(1, len(sample_keys) // 2):
            raw_nodes = root

    nodes = normalize_nodes(raw_nodes)

    by_network: dict[str, int] = {}
    by_version: dict[str, int] = {}
    by_nation: dict[str, int] = {}
    by_city: dict[str, int] = {}
    by_county: dict[str, int] = {}
    heights: list[int] = []

    for node in nodes:
        inc(by_network, node["network"])
        inc(by_version, node["user_agent"] or "Unknown")
        if node["country"]:
            inc(by_nation, node["country"])
        if node["city"]:
            inc(by_city, f'{node["city"]}, {node["country"]}' if node["country"] else node["city"])
        if node["county"]:
            inc(by_county, ", ".join(x for x in [node["county"], node["region"], node["country"]] if x))
        if isinstance(node["height"], int):
            heights.append(node["height"])

    def declared(*names: str) -> float:
        for name in names:
            n = finite(root.get(name))
            if math.isfinite(n) and n >= 0:
                return n
        return math.nan

    reachable = declared("reachable_nodes", "reachable", "total_nodes", "total", "count")
    if not math.isfinite(reachable) and nodes:
        reachable = float(len(nodes))
    total = declared("total_nodes", "total", "reachable_nodes", "reachable", "count")
    if not math.isfinite(total):
        total = reachable

    latest_height = declared("latest_height", "block_height", "height")
    if not math.isfinite(latest_height) and heights:
        latest_height = max(heights)

    updated_ms = parse_time(
        root.get("generated_at")
        or root.get("updated_at")
        or root.get("timestamp")
        or root.get("ts")
        or root.get("snapshot_timestamp")
        or root.get("created_at")
    ) or now_ms()

    return {
        "schema": "zzx-bitnodes-normalized-v5",
        "source": source,
        "reachable_nodes": int(reachable) if math.isfinite(reachable) else None,
        "total_nodes": int(total) if math.isfinite(total) else None,
        "latest_height": int(latest_height) if math.isfinite(latest_height) else None,
        "updated_ms": updated_ms,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(updated_ms / 1000)),
        "node_count": len(nodes),
        "nodes": nodes,
        "by_network": by_network,
        "by_version": by_version,
        "by_nation": by_nation,
        "by_city": by_city,
        "by_county": by_county,
    }

def connect_db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.executescript("""
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS snapshots(
      snapshot_ms INTEGER PRIMARY KEY,
      source TEXT NOT NULL,
      reachable_nodes INTEGER,
      total_nodes INTEGER,
      latest_height INTEGER,
      node_count INTEGER NOT NULL,
      raw_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS nodes(
      snapshot_ms INTEGER NOT NULL,
      address TEXT NOT NULL,
      network TEXT,
      protocol_version INTEGER,
      user_agent TEXT,
      height INTEGER,
      city TEXT,
      county TEXT,
      region TEXT,
      country TEXT,
      latitude REAL,
      longitude REAL,
      asn TEXT,
      organization TEXT,
      PRIMARY KEY(snapshot_ms,address),
      FOREIGN KEY(snapshot_ms) REFERENCES snapshots(snapshot_ms)
    );
    CREATE INDEX IF NOT EXISTS nodes_country_idx ON nodes(country);
    CREATE INDEX IF NOT EXISTS nodes_city_idx ON nodes(city);
    CREATE INDEX IF NOT EXISTS nodes_county_idx ON nodes(county);
    CREATE INDEX IF NOT EXISTS nodes_user_agent_idx ON nodes(user_agent);
    CREATE INDEX IF NOT EXISTS nodes_network_idx ON nodes(network);
    """)
    return db

def store_db(db: sqlite3.Connection, normalized: dict[str, Any], raw: Any) -> None:
    ts = int(normalized["updated_ms"])
    db.execute(
        """INSERT OR REPLACE INTO snapshots
           (snapshot_ms,source,reachable_nodes,total_nodes,latest_height,node_count,raw_json)
           VALUES(?,?,?,?,?,?,?)""",
        (
            ts,
            normalized["source"],
            normalized["reachable_nodes"],
            normalized["total_nodes"],
            normalized["latest_height"],
            normalized["node_count"],
            json.dumps(raw, separators=(",", ":")),
        ),
    )
    db.execute("DELETE FROM nodes WHERE snapshot_ms=?", (ts,))
    db.executemany(
        """INSERT INTO nodes(
           snapshot_ms,address,network,protocol_version,user_agent,height,
           city,county,region,country,latitude,longitude,asn,organization
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        [
            (
                ts,
                row["address"],
                row["network"],
                row["protocol_version"],
                row["user_agent"],
                row["height"],
                row["city"],
                row["county"],
                row["region"],
                row["country"],
                row["latitude"],
                row["longitude"],
                row["asn"],
                row["organization"],
            )
            for row in normalized["nodes"]
        ],
    )
    db.commit()

def write_api(normalized: dict[str, Any], raw: Any) -> None:
    """Publish the external btcnodes.io mirror without impersonating another crawler.

    Source ownership is deliberately explicit:
      * api/btcnodes/latest.json                raw upstream-compatible snapshot
      * api/btcnodes/normalized/latest.json     normalized ZZX view of that snapshot
      * api/aggregate/btcnodes/latest.json      compact summary without node rows
      * api/snapshots/btcnodes/latest.json      normalized source snapshot
      * api/snapshots/latest.json               fast canonical fallback used between full crawls

    The collector MUST NOT write api/originalbitnodes/latest.json. That path belongs
    exclusively to the optional Ayeowch/original compatibility crawler.
    The collector MUST NOT write api/zzxbitnodes/latest.json either. That path belongs
    exclusively to the ZZX active crawler.
    """
    API_DIR.mkdir(parents=True, exist_ok=True)

    raw_dir = API_DIR / "btcnodes"
    normalized_dir = raw_dir / "normalized"
    aggregate_dir = API_DIR / "aggregate" / "btcnodes"
    source_snapshot_dir = API_DIR / "snapshots" / "btcnodes"
    snapshots_dir = API_DIR / "snapshots"

    for directory in (
        raw_dir,
        normalized_dir,
        aggregate_dir,
        source_snapshot_dir,
        snapshots_dir,
    ):
        directory.mkdir(parents=True, exist_ok=True)

    raw_text = json.dumps(raw, indent=2, sort_keys=True) + "\n"
    normalized_text = json.dumps(normalized, indent=2, sort_keys=True) + "\n"

    (raw_dir / "latest.json").write_text(raw_text, encoding="utf-8")
    (normalized_dir / "latest.json").write_text(normalized_text, encoding="utf-8")
    (source_snapshot_dir / "latest.json").write_text(normalized_text, encoding="utf-8")

    aggregate = {k: v for k, v in normalized.items() if k != "nodes"}
    (aggregate_dir / "latest.json").write_text(
        json.dumps(aggregate, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    # Seed the browser canonical pointer only when no full merged canonical
    # snapshot exists yet. A lightweight btcnodes.io refresh must never
    # overwrite the richer hourly ZZX+btcnodes enriched canonical dataset.
    canonical_path = snapshots_dir / "latest.json"
    preserve_canonical = False
    if canonical_path.exists():
        try:
            current = json.loads(canonical_path.read_text(encoding="utf-8"))
            preserve_canonical = (
                isinstance(current, dict)
                and str(current.get("schema") or "").startswith("zzx-bitnodes-canonical-")
            )
        except Exception:
            preserve_canonical = False

    if not preserve_canonical:
        canonical_path.write_text(normalized_text, encoding="utf-8")

    history_path = API_DIR / "history.json"
    try:
        old = json.loads(history_path.read_text(encoding="utf-8"))
        rows = old if isinstance(old, list) else old.get("history", [])
    except Exception:
        rows = []

    point = {
        "t": normalized["updated_ms"],
        "updated_at": normalized["updated_at"],
        "reachable_nodes": normalized["reachable_nodes"],
        "total_nodes": normalized["total_nodes"],
        "latest_height": normalized["latest_height"],
        "source": normalized["source"],
    }
    by_time = {int(r.get("t", 0)): r for r in rows if isinstance(r, dict)}
    by_time[int(point["t"])] = point
    rows = [by_time[k] for k in sorted(by_time)][-2016:]
    history_path.write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")

def acquire() -> tuple[dict[str, Any], Any]:
    source_data = load_sources()
    last: Exception | None = None
    for row in source_data["upstreams"]:
        url = f'{row["base"].rstrip("/")}/snapshots/latest/'
        try:
            raw = fetch_json(url)
            normalized = normalize(raw, row["id"])
            if not (
                (normalized["reachable_nodes"] or 0) > 0
                or (normalized["total_nodes"] or 0) > 0
                or normalized["node_count"] > 0
            ):
                raise RuntimeError(f"{row['id']} returned no usable node snapshot")
            return normalized, raw
        except Exception as exc:
            last = exc
    raise last or RuntimeError("all configured Bitnodes sources failed")

def run_once(use_sqlite: bool = True) -> dict[str, Any]:
    normalized, raw = acquire()
    write_api(normalized, raw)
    if use_sqlite:
        db = connect_db()
        try:
            store_db(db, normalized, raw)
        finally:
            db.close()
    return normalized

def main() -> None:
    parser = argparse.ArgumentParser(description="ZZX shared Bitnodes collector")
    parser.add_argument("--once", action="store_true", help="fetch one snapshot and exit")
    parser.add_argument("--interval", type=float, default=60.0, help="continuous poll interval in seconds")
    parser.add_argument("--no-sqlite", action="store_true", help="skip local SQLite archive")
    args = parser.parse_args()

    if args.once:
        snapshot = run_once(not args.no_sqlite)
        print(json.dumps({
            "source": snapshot["source"],
            "reachable_nodes": snapshot["reachable_nodes"],
            "node_count": snapshot["node_count"],
            "updated_at": snapshot["updated_at"],
        }))
        return

    while True:
        started = time.monotonic()
        try:
            snapshot = run_once(not args.no_sqlite)
            print(json.dumps({
                "source": snapshot["source"],
                "reachable_nodes": snapshot["reachable_nodes"],
                "node_count": snapshot["node_count"],
                "updated_at": snapshot["updated_at"],
            }), flush=True)
        except Exception as exc:
            print(json.dumps({"error": str(exc)}), flush=True)
        elapsed = time.monotonic() - started
        time.sleep(max(1.0, args.interval - elapsed))

if __name__ == "__main__":
    main()
