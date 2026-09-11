#!/usr/bin/env python3
"""ZZX World Factbook historical corpus crawler (1962-2025).

Sources are public/archive endpoints. Every stored chunk retains edition and source
provenance. Missing years remain explicit; the crawler never fabricates an edition.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import hashlib
import json
import os
import re
import shutil
import sys
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path

from formats import SUPPORTED_EXTENSIONS, extract
from shard_store import write_shards

UA = "ZZX-WorldFactbook-Crawler/1.0 (+https://zzx-labs.io/)"
CATEGORY_ALIASES = {
    "introduction": {"introduction", "background"},
    "geography": {"geography"},
    "people-and-society": {"people and society", "people & society", "people"},
    "environment": {"environment"},
    "government": {"government"},
    "economy": {"economy"},
    "energy": {"energy"},
    "communications": {"communications"},
    "transportation": {"transportation"},
    "military-and-security": {"military and security", "military & security", "military"},
    "terrorism": {"terrorism"},
    "transnational-issues": {"transnational issues", "transnational-issues"},
    "space": {"space"},
}

@dataclass(frozen=True)
class Candidate:
    year: int
    provider: str
    identifier: str
    url: str
    name: str
    format: str
    size: int = 0
    timestamp: str = ""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def request_json(url: str, timeout: int = 60):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", errors="replace"))


def download(url: str, path: Path, max_bytes: int, timeout: int = 120) -> Path:
    if path.is_file() and path.stat().st_size > 0:
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".part")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    total = 0
    with urllib.request.urlopen(req, timeout=timeout) as r, tmp.open("wb") as fh:
        while True:
            block = r.read(1024 * 1024)
            if not block:
                break
            total += len(block)
            if total > max_bytes:
                raise RuntimeError(f"download exceeds configured limit: {url}")
            fh.write(block)
    tmp.replace(path)
    return path


def score_name(name: str) -> tuple[int, int]:
    ext = Path(name).suffix.lower()
    pref = {
        ".zip": 100, ".pdf": 95, ".epub": 90, ".mobi": 88, ".azw3": 87,
        ".txt": 85, ".html": 80, ".htm": 80, ".djvu": 78, ".chm": 76,
        ".7z": 72, ".tar": 70,
    }.get(ext, 0)
    lower = name.lower()
    if "text pdf" in lower or "searchtext" in lower:
        pref -= 10
    return pref, -len(name)


def discover_ia(year: int, max_items: int, max_files: int) -> list[Candidate]:
    q = f'(title:("world factbook") OR title:("national basic intelligence factbook")) AND year:{year}'
    params = urllib.parse.urlencode({
        "q": q, "fl[]": ["identifier", "title", "year", "date"],
        "rows": max_items, "page": 1, "output": "json",
    }, doseq=True)
    data = request_json("https://archive.org/advancedsearch.php?" + params)
    docs = (data.get("response") or {}).get("docs") or []
    out: list[Candidate] = []
    for doc in docs[:max_items]:
        ident = str(doc.get("identifier") or "").strip()
        if not ident:
            continue
        try:
            meta = request_json("https://archive.org/metadata/" + urllib.parse.quote(ident))
        except Exception:
            continue
        files = []
        for f in meta.get("files") or []:
            name = str(f.get("name") or "")
            ext = Path(name).suffix.lower()
            if ext not in SUPPORTED_EXTENSIONS:
                continue
            try:
                size = int(f.get("size") or 0)
            except Exception:
                size = 0
            files.append((score_name(name), name, size))
        files.sort(reverse=True)
        for _, name, size in files[:max_files]:
            url = f"https://archive.org/download/{urllib.parse.quote(ident)}/{urllib.parse.quote(name)}"
            out.append(Candidate(year, "internet-archive", ident, url, name, Path(name).suffix.lower().lstrip("."), size))
    return out


def discover_wayback(year: int, limit: int) -> list[Candidate]:
    patterns = [
        "www.cia.gov/library/publications/the-world-factbook/geos/*.html",
        "www.cia.gov/the-world-factbook/countries/*/",
    ]
    out: list[Candidate] = []
    for pattern in patterns:
        params = urllib.parse.urlencode([
            ("url", pattern), ("from", str(year)), ("to", str(year)),
            ("output", "json"), ("filter", "statuscode:200"),
            ("collapse", "urlkey"), ("fl", "timestamp,original,digest"),
            ("limit", str(limit)),
        ])
        try:
            rows = request_json("https://web.archive.org/cdx/search/cdx?" + params, timeout=90)
        except Exception:
            continue
        if not isinstance(rows, list) or len(rows) < 2:
            continue
        headers = rows[0]
        for row in rows[1:]:
            rec = dict(zip(headers, row))
            ts = str(rec.get("timestamp") or "")
            original = str(rec.get("original") or "")
            if not ts or not original:
                continue
            snap = f"https://web.archive.org/web/{ts}id_/{original}"
            name = re.sub(r"[^A-Za-z0-9._-]+", "-", original)[-180:] + ".html"
            out.append(Candidate(year, "wayback", str(rec.get("digest") or original), snap, name, "html", 0, ts))
            if len(out) >= limit:
                return out
    return out


def extra_candidates(path: Path, start: int, end: int) -> list[Candidate]:
    if not path.is_file():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = payload.get("sources") if isinstance(payload, dict) else payload
    out = []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        year = int(row.get("edition_year") or row.get("year") or 0)
        if not (start <= year <= end):
            continue
        url = str(row.get("url") or "")
        if not url.startswith(("https://", "http://")):
            continue
        name = str(row.get("name") or Path(urllib.parse.urlparse(url).path).name or f"edition-{year}.bin")
        fmt = str(row.get("format") or Path(name).suffix.lower().lstrip("."))
        out.append(Candidate(year, "extra-public-mirror", str(row.get("id") or url), url, name, fmt))
    return out


def load_entities(path: Path) -> tuple[dict[str, tuple[str, str]], set[str]]:
    aliases: dict[str, tuple[str, str]] = {}
    names: set[str] = set()
    if not path.is_file():
        return aliases, names
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = data.get("countries") if isinstance(data, dict) else data
    if isinstance(rows, dict):
        rows = list(rows.values())
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        name = str(row.get("name") or row.get("countryName") or row.get("country_name") or "").strip()
        code = str(row.get("code") or row.get("iso") or row.get("country") or "").upper().strip()
        if not name:
            continue
        key = re.sub(r"\s+", " ", name.lower())
        aliases[key] = (code, name)
        names.add(key)
    return aliases, names


def category_for(line: str) -> str | None:
    key = re.sub(r"[^a-z0-9& -]+", "", line.lower()).strip(" :-")
    key = re.sub(r"\s+", " ", key)
    for category, aliases in CATEGORY_ALIASES.items():
        if key in aliases:
            return category
    return None


def parse_chunks(text: str, year: int, entity_aliases: dict[str, tuple[str, str]]) -> list[dict]:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [re.sub(r"\s+", " ", ln).strip() for ln in text.splitlines()]
    current_entity = ("", "")
    current_category = "raw"
    buffers: dict[tuple[str, str, str], list[str]] = {}
    for line in lines:
        if not line:
            continue
        lk = line.lower().strip()
        lk = re.sub(r"^(country|territory)\s*[:\-]\s*", "", lk)
        lk = re.sub(r"\s+", " ", lk)
        if lk in entity_aliases and len(line) <= 120:
            current_entity = entity_aliases[lk]
            continue
        cat = category_for(line)
        if cat:
            current_category = cat
            continue
        key = (current_entity[0], current_entity[1], current_category)
        buffers.setdefault(key, []).append(line)

    chunks = []
    ordinal = 0
    for (code, name, cat), body in buffers.items():
        joined = "\n".join(body).strip()
        if len(joined) < 80:
            continue
        # Keep browser/database rows reasonably bounded.
        for pos in range(0, len(joined), 24000):
            piece = joined[pos:pos+24000].strip()
            if len(piece) < 40:
                continue
            ordinal += 1
            chunks.append({
                "edition_year": year, "entity_code": code, "entity_name": name,
                "category": cat, "ordinal": ordinal, "content": piece,
            })
    return chunks


def safe_name(name: str) -> str:
    name = re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip("-.")
    return name[:180] or "source.bin"


def write_portal(rows: list[dict], source_rows: list[dict], root: Path, start: int, end: int) -> dict:
    root.mkdir(parents=True, exist_ok=True)
    by_year: dict[int, list[dict]] = {}
    for row in rows:
        by_year.setdefault(int(row["edition_year"]), []).append(row)
    editions = []
    for year in range(start, end + 1):
        year_rows = by_year.get(year, [])
        cats: dict[str, list[dict]] = {}
        for row in year_rows:
            public = {k: row[k] for k in (
                "chunk_id", "edition_year", "entity_code", "entity_name", "category", "ordinal",
                "content", "content_sha256", "source_provider", "source_identifier", "source_format",
                "source_sha256", "source_url", "extractor"
            )}
            cats.setdefault(row["category"], []).append(public)
        category_meta = []
        for cat, cat_rows in sorted(cats.items()):
            path = root / "editions" / str(year) / f"{cat}.json"
            path.parent.mkdir(parents=True, exist_ok=True)
            payload = {"schema": "zzx-worldfactbook-category-v1", "edition_year": year, "category": cat, "chunks": cat_rows}
            path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
            category_meta.append({"id": cat, "chunks": len(cat_rows), "path": path.relative_to(root).as_posix()})
        year_sources = [s for s in source_rows if int(s.get("edition_year") or 0) == year]
        manifest = {
            "schema": "zzx-worldfactbook-edition-v1", "edition_year": year,
            "status": "available" if year_rows else "missing",
            "chunks": len(year_rows), "categories": category_meta, "sources": year_sources,
        }
        mpath = root / "editions" / str(year) / "index.json"
        mpath.parent.mkdir(parents=True, exist_ok=True)
        mpath.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        editions.append({"year": year, "status": manifest["status"], "chunks": len(year_rows), "categories": len(category_meta), "path": mpath.relative_to(root).as_posix()})
    index = {
        "schema": "zzx-worldfactbook-portal-index-v1", "generated_at": now_iso(),
        "start_year": start, "end_year": end, "editions": editions,
        "categories": sorted(CATEGORY_ALIASES),
        "supported_formats": list(SUPPORTED_EXTENSIONS),
    }
    (root / "portal-index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (root / "source-index.json").write_text(json.dumps({"schema":"zzx-worldfactbook-source-index-v1","sources":source_rows}, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    return index


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo-root", default=".")
    ap.add_argument("--cache-dir", default=".cache/worldfactbook-v3")
    ap.add_argument("--portal-root", default="worldfactbook/api")
    ap.add_argument("--db-root", default="worldfactbook/db")
    ap.add_argument("--country-registry", default="__partials/widgets/global-power-grid/data/countries.json")
    ap.add_argument("--extra-source-manifest", default="tools/worldfactbook/extra-sources.json")
    ap.add_argument("--start-year", type=int, default=1962)
    ap.add_argument("--end-year", type=int, default=2025)
    ap.add_argument("--mode", choices=("incremental", "rebuild"), default="incremental")
    ap.add_argument("--providers", default="ia,wayback")
    ap.add_argument("--max-ia-items", type=int, default=12)
    ap.add_argument("--max-files-per-edition", type=int, default=3)
    ap.add_argument("--max-wayback-pages", type=int, default=320)
    ap.add_argument("--max-download-mb", type=int, default=1500)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--sleep", type=float, default=.1)
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()

    if args.self_test:
        sample = "United States\nGeography\nArea total 9,833,517 sq km\nEconomy\nGDP and other economic information " * 4
        aliases = {"united states": ("US", "United States")}
        chunks = parse_chunks(sample, 2025, aliases)
        if not chunks or not {r["category"] for r in chunks}.intersection({"geography", "economy"}):
            raise SystemExit("parser self-test failed")
        print("worldfactbook crawler self-test passed", len(chunks))
        return 0

    if args.start_year < 1962 or args.end_year > 2025 or args.start_year > args.end_year:
        raise SystemExit("edition range must stay within 1962..2025")

    repo = Path(args.repo_root).resolve()
    cache = repo / args.cache_dir
    portal = repo / args.portal_root
    dbroot = repo / args.db_root
    if args.mode == "rebuild":
        shutil.rmtree(portal / "editions", ignore_errors=True)
        shutil.rmtree(dbroot, ignore_errors=True)
    cache.mkdir(parents=True, exist_ok=True)
    aliases, _ = load_entities(repo / args.country_registry)
    extras = extra_candidates(repo / args.extra_source_manifest, args.start_year, args.end_year)
    extras_by_year: dict[int, list[Candidate]] = {}
    for c in extras:
        extras_by_year.setdefault(c.year, []).append(c)

    providers = {p.strip() for p in args.providers.split(",") if p.strip()}
    all_rows: list[dict] = []
    source_rows: list[dict] = []
    failures: list[dict] = []
    max_bytes = args.max_download_mb * 1024 * 1024

    for year in range(args.start_year, args.end_year + 1):
        # Incremental mode preserves an existing available edition.
        existing = portal / "editions" / str(year) / "index.json"
        if args.mode == "incremental" and existing.is_file():
            try:
                e = json.loads(existing.read_text(encoding="utf-8"))
                if e.get("status") == "available" and int(e.get("chunks") or 0) > 0:
                    print(f"{year}: already available; keeping existing edition")
                    continue
            except Exception:
                pass

        candidates: list[Candidate] = []
        if "ia" in providers:
            try:
                candidates += discover_ia(year, args.max_ia_items, args.max_files_per_edition)
            except Exception as exc:
                failures.append({"year":year,"provider":"internet-archive","error":str(exc)})
        if (not candidates or "wayback-always" in providers) and "wayback" in providers:
            try:
                candidates += discover_wayback(year, args.max_wayback_pages)
            except Exception as exc:
                failures.append({"year":year,"provider":"wayback","error":str(exc)})
        candidates += extras_by_year.get(year, [])
        # Deduplicate URLs and cap pathological candidate explosions.
        unique = []
        seen = set()
        for c in candidates:
            if c.url in seen:
                continue
            seen.add(c.url)
            unique.append(c)
        candidates = unique[: max(args.max_wayback_pages, args.max_ia_items * args.max_files_per_edition)]
        print(f"{year}: {len(candidates)} candidate source files/pages")

        for c in candidates:
            ext = Path(c.name).suffix.lower() or ("." + c.format if c.format else ".bin")
            cdir = cache / str(year) / c.provider
            local = cdir / (hashlib.sha256(c.url.encode()).hexdigest()[:16] + "-" + safe_name(c.name))
            try:
                if c.size and c.size > max_bytes:
                    raise RuntimeError(f"source too large ({c.size} bytes)")
                download(c.url, local, max_bytes)
                source_sha = hashlib.sha256(local.read_bytes()).hexdigest()
                docs = extract(local)
                if not docs:
                    raise RuntimeError("no extractable text")
                accepted = 0
                for doc in docs:
                    chunks = parse_chunks(doc.text, year, aliases)
                    if not chunks and len(doc.text.strip()) >= 80:
                        raw = doc.text.strip()
                        chunks = []
                        for pos in range(0, len(raw), 24000):
                            piece = raw[pos:pos+24000].strip()
                            if len(piece) >= 40:
                                chunks.append({"edition_year":year,"entity_code":"","entity_name":"","category":"raw","ordinal":len(chunks)+1,"content":piece})
                    for row in chunks:
                        content_sha = hashlib.sha256(row["content"].encode("utf-8")).hexdigest()
                        chunk_id = hashlib.sha256((f"{year}|{row['entity_code']}|{row['category']}|{row['ordinal']}|{source_sha}|{content_sha}").encode()).hexdigest()
                        row.update({
                            "chunk_id": chunk_id, "content_sha256": content_sha,
                            "source_provider": c.provider, "source_identifier": c.identifier,
                            "source_format": c.format or ext.lstrip("."), "source_sha256": source_sha,
                            "source_url": c.url, "extractor": doc.extractor,
                        })
                        all_rows.append(row)
                        accepted += 1
                source_rows.append({
                    "edition_year":year,"provider":c.provider,"identifier":c.identifier,
                    "url":c.url,"name":c.name,"format":c.format,"timestamp":c.timestamp,
                    "sha256":source_sha,"bytes":local.stat().st_size,"chunks":accepted,
                })
            except Exception as exc:
                failures.append({"year":year,"provider":c.provider,"url":c.url,"error":str(exc)})
            time.sleep(args.sleep)

    # Merge existing incremental portal rows so shard rebuild represents the full local corpus.
    if args.mode == "incremental":
        for year in range(args.start_year, args.end_year + 1):
            idx = portal / "editions" / str(year) / "index.json"
            if not idx.is_file():
                continue
            try:
                m = json.loads(idx.read_text(encoding="utf-8"))
                if any(int(r.get("edition_year") or 0) == year for r in all_rows):
                    continue
                for cat in m.get("categories") or []:
                    p = portal / cat["path"]
                    payload = json.loads(p.read_text(encoding="utf-8"))
                    all_rows.extend(payload.get("chunks") or [])
                source_rows.extend(m.get("sources") or [])
            except Exception as exc:
                failures.append({"year":year,"provider":"local-incremental","error":str(exc)})

    # Deduplicate exact chunk IDs and sources.
    all_rows = list({r["chunk_id"]: r for r in all_rows}.values())
    source_rows = list({(s.get("edition_year"),s.get("url"),s.get("sha256")):s for s in source_rows}.values())
    index = write_portal(all_rows, source_rows, portal, args.start_year, args.end_year)
    shard_manifest = write_shards(all_rows, dbroot)
    report = {
        "schema":"zzx-worldfactbook-crawl-report-v1","generated_at":now_iso(),
        "range":[args.start_year,args.end_year],"mode":args.mode,
        "chunks":len(all_rows),"sources":len(source_rows),"failures":failures,
        "available_editions":sum(1 for e in index["editions"] if e["status"]=="available"),
        "missing_editions":[e["year"] for e in index["editions"] if e["status"]!="available"],
        "sql_shards":len(shard_manifest.get("files") or []),
    }
    (portal / "crawl-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if not all_rows:
        raise SystemExit("crawler produced zero corpus chunks")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
