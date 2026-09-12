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
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path

from formats import SUPPORTED_EXTENSIONS, extract
from shard_store import write_shards
from media import MediaExtractor, SourceContext, load_existing_media, write_media_indexes, write_media_shards

UA = "ZZX-WorldFactbook-Crawler/1.2.1 (+https://zzx-labs.io/)"
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


def request_json(url: str, timeout: int = 60, attempts: int = 4):
    """Fetch JSON with bounded retry/backoff for archive services.

    Internet Archive and the Wayback CDX API occasionally return 429/5xx or
    reset long-running connections.  Discovery should degrade to another
    provider instead of losing an entire edition because of one transient
    request.
    """
    last: Exception | None = None
    for attempt in range(1, max(1, attempts) + 1):
        req = urllib.request.Request(
            url,
            headers={"User-Agent": UA, "Accept": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8", errors="replace"))
        except urllib.error.HTTPError as exc:
            last = exc
            if exc.code not in {408, 425, 429, 500, 502, 503, 504} or attempt >= attempts:
                raise
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            last = exc
            if attempt >= attempts:
                raise
        time.sleep(min(8.0, 0.75 * (2 ** (attempt - 1))))
    if last:
        raise last
    raise RuntimeError(f"unable to fetch JSON: {url}")


def download(
    url: str,
    path: Path,
    max_bytes: int,
    timeout: int = 180,
    attempts: int = 4,
) -> Path:
    """Download one archival object with retries and atomic replacement."""
    if path.is_file() and path.stat().st_size > 0:
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".part")
    last: Exception | None = None
    for attempt in range(1, max(1, attempts) + 1):
        total = 0
        try:
            tmp.unlink(missing_ok=True)
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as r, tmp.open("wb") as fh:
                while True:
                    block = r.read(1024 * 1024)
                    if not block:
                        break
                    total += len(block)
                    if total > max_bytes:
                        raise RuntimeError(f"download exceeds configured limit: {url}")
                    fh.write(block)
            if total <= 0:
                raise RuntimeError(f"download returned zero bytes: {url}")
            tmp.replace(path)
            return path
        except urllib.error.HTTPError as exc:
            last = exc
            tmp.unlink(missing_ok=True)
            if exc.code not in {408, 425, 429, 500, 502, 503, 504} or attempt >= attempts:
                raise
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            last = exc
            tmp.unlink(missing_ok=True)
            if attempt >= attempts:
                raise
        time.sleep(min(10.0, 1.0 * (2 ** (attempt - 1))))
    if last:
        raise last
    raise RuntimeError(f"unable to download: {url}")


_ARCHIVE_EXTENSIONS = {".zip", ".7z", ".tar", ".tgz", ".tbz", ".tbz2", ".txz"}
_IA_META_CACHE: dict[str, dict] = {}
_IA_CATALOG_CACHE: dict[int, list[dict]] | None = None
_IA_TITLE_QUERY = (
    '(title:("world factbook") OR title:("the world factbook") '
    'OR title:("national basic intelligence factbook"))'
)


def score_name(name: str, source: str = "", year: int = 0) -> tuple[int, int, int]:
    """Prefer directly useful documents; archive bundles are fallback only.

    v1.2 scored ZIP above PDF.  On older IA items that made the crawler unpack
    derivative bundles and OCR the same edition many times, which is exactly the
    kind of source that can consume an entire GitHub-hosted runner timeout.
    """
    ext = Path(name).suffix.lower()
    pref = {
        ".pdf": 150,
        ".epub": 138,
        ".djvu": 132,
        ".djv": 132,
        ".txt": 126,
        ".html": 122,
        ".htm": 122,
        ".mobi": 118,
        ".azw3": 117,
        ".azw": 116,
        ".prc": 115,
        ".docx": 108,
        ".odt": 106,
        ".doc": 104,
        ".rtf": 102,
        ".chm": 90,
        ".zip": 28,
        ".7z": 26,
        ".tar": 24,
        ".tgz": 24,
        ".tbz": 24,
        ".tbz2": 24,
        ".txz": 24,
    }.get(ext, 0)
    lower = name.lower()
    if str(source).lower() == "original":
        pref += 18
    if year and re.search(rf"(?<!\d){year}(?!\d)", lower):
        pref += 8
    if "text pdf" in lower or "searchtext" in lower or lower.endswith("_text.pdf"):
        pref -= 14
    if any(token in lower for token in ("scandata", "files.xml", "meta.xml", "thumb")):
        pref -= 80
    # Stable sort: quality first, then shorter/cleaner filenames.
    return pref, -len(name), -sum(ch.isdigit() for ch in name)


def _candidate_years(value) -> set[int]:
    """Extract plausible Factbook edition years from IA metadata values."""
    years: set[int] = set()
    if value is None:
        return years
    if isinstance(value, (list, tuple, set)):
        for item in value:
            years.update(_candidate_years(item))
        return years
    if isinstance(value, (int, float)):
        n = int(value)
        if 1962 <= n <= 2025:
            years.add(n)
        return years
    text = str(value)
    for token in re.findall(r"(?<!\d)(19\d{2}|20\d{2})(?!\d)", text):
        n = int(token)
        if 1962 <= n <= 2025:
            years.add(n)
    return years


def _doc_years(doc: dict) -> set[int]:
    # Prefer identity fields over archive/upload metadata.  Historical scans are
    # often uploaded decades later, so mapping a 1975 title to its 2004 scan date
    # would silently contaminate the 2004 edition.
    identity: set[int] = set()
    for key in ("title", "identifier"):
        identity.update(_candidate_years(doc.get(key)))
    if identity:
        return identity
    metadata: set[int] = set()
    for key in ("year", "date"):
        metadata.update(_candidate_years(doc.get(key)))
    return metadata


def _ia_search(query: str, rows: int, page: int = 1) -> tuple[list[dict], int]:
    params = urllib.parse.urlencode({
        "q": query,
        "fl[]": ["identifier", "title", "year", "date", "description", "mediatype"],
        "rows": rows,
        "page": page,
        "output": "json",
    }, doseq=True)
    data = request_json("https://archive.org/advancedsearch.php?" + params, timeout=90)
    response = data.get("response") or {}
    return list(response.get("docs") or []), int(response.get("numFound") or 0)


def _ia_catalog() -> dict[int, list[dict]]:
    """Build one broad title catalog and locally map it to edition years.

    IA metadata is inconsistent for historical scans: many uploads carry the
    scanner/upload year instead of the publication year.  The edition year is
    commonly present in the title or identifier, so an exact ``year:YYYY`` query
    alone misses early editions.
    """
    global _IA_CATALOG_CACHE
    if _IA_CATALOG_CACHE is not None:
        return _IA_CATALOG_CACHE

    mapped: dict[int, list[dict]] = {year: [] for year in range(1962, 2026)}
    query = f"{_IA_TITLE_QUERY} AND mediatype:texts"
    rows = 200
    for page in range(1, 6):
        try:
            docs, total = _ia_search(query, rows, page)
        except Exception:
            break
        if not docs:
            break
        for doc in docs:
            for year in _doc_years(doc):
                mapped.setdefault(year, []).append(doc)
        if page * rows >= total:
            break
    _IA_CATALOG_CACHE = mapped
    return mapped


def _ia_metadata(identifier: str) -> dict:
    cached = _IA_META_CACHE.get(identifier)
    if cached is not None:
        return cached
    meta = request_json(
        "https://archive.org/metadata/" + urllib.parse.quote(identifier),
        timeout=90,
    )
    _IA_META_CACHE[identifier] = meta
    return meta


def _select_ia_files(meta: dict, year: int, max_files: int) -> list[tuple[str, int]]:
    ranked: list[tuple[tuple[int, int, int], str, int, bool]] = []
    for f in meta.get("files") or []:
        name = str(f.get("name") or "").strip()
        ext = Path(name).suffix.lower()
        if not name or ext not in SUPPORTED_EXTENSIONS:
            continue
        try:
            size = int(f.get("size") or 0)
        except Exception:
            size = 0
        source = str(f.get("source") or "")
        ranked.append((score_name(name, source, year), name, size, ext in _ARCHIVE_EXTENSIONS))

    ranked.sort(reverse=True)
    direct = [row for row in ranked if not row[3]]
    archives = [row for row in ranked if row[3]]
    # Never choose a derivative ZIP/TAR when IA already exposes a direct PDF,
    # EPUB, DjVu, text, or ebook representation of the same item.
    chosen = direct[:max_files] if direct else archives[:max_files]
    return [(name, size) for _, name, size, _ in chosen]


def discover_ia(year: int, max_items: int, max_files: int) -> list[Candidate]:
    # First use exact publication metadata, then explicit year tokens.  If both
    # miss, fall back to the broad cached title catalog and infer the edition
    # year from title/identifier/date metadata.
    queries = [
        f"{_IA_TITLE_QUERY} AND mediatype:texts AND "
        f"(year:{year} OR date:[{year}-01-01 TO {year}-12-31])",
        f"{_IA_TITLE_QUERY} AND mediatype:texts AND (title:{year} OR identifier:{year})",
    ]
    docs: list[dict] = []
    seen_identifiers: set[str] = set()
    for query in queries:
        try:
            found, _ = _ia_search(query, max(12, max_items), 1)
        except Exception:
            continue
        for doc in found:
            ident = str(doc.get("identifier") or "").strip()
            if ident and ident not in seen_identifiers:
                # For token queries, reject obvious mismatches locally.
                years = _doc_years(doc)
                if years and year not in years:
                    continue
                seen_identifiers.add(ident)
                docs.append(doc)
        if len(docs) >= max_items:
            break

    if len(docs) < max_items:
        try:
            fallback = _ia_catalog().get(year, [])
        except Exception:
            fallback = []
        for doc in fallback:
            ident = str(doc.get("identifier") or "").strip()
            if ident and ident not in seen_identifiers:
                seen_identifiers.add(ident)
                docs.append(doc)
                if len(docs) >= max_items:
                    break

    out: list[Candidate] = []
    for doc in docs[:max_items]:
        ident = str(doc.get("identifier") or "").strip()
        if not ident:
            continue
        try:
            meta = _ia_metadata(ident)
        except Exception:
            continue
        for name, size in _select_ia_files(meta, year, max_files):
            url = (
                f"https://archive.org/download/{urllib.parse.quote(ident)}/"
                f"{urllib.parse.quote(name)}"
            )
            out.append(Candidate(
                year,
                "internet-archive",
                ident,
                url,
                name,
                Path(name).suffix.lower().lstrip("."),
                size,
            ))
    out.sort(key=lambda c: score_name(c.name, "", year), reverse=True)
    return out


def discover_wayback(year: int, limit: int) -> list[Candidate]:
    # The public web did not exist for the early print-only Factbooks.  Avoid
    # hundreds of guaranteed-empty CDX calls for 1962-1995; IA is authoritative
    # for those scanned editions.
    if year < 1996 or limit <= 0:
        return []
    patterns = [
        "www.cia.gov/cia/publications/factbook/geos/*.html",
        "www.cia.gov/library/publications/the-world-factbook/geos/*.html",
        "www.cia.gov/the-world-factbook/countries/*/",
    ]
    out: list[Candidate] = []
    seen_originals: set[str] = set()
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
            if not ts or not original or original in seen_originals:
                continue
            seen_originals.add(original)
            snap = f"https://web.archive.org/web/{ts}id_/{original}"
            name = re.sub(r"[^A-Za-z0-9._-]+", "-", original)[-180:] + ".html"
            out.append(Candidate(
                year,
                "wayback",
                str(rec.get("digest") or original),
                snap,
                name,
                "html",
                0,
                ts,
            ))
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


def write_portal(
    rows: list[dict],
    source_rows: list[dict],
    media_rows: list[dict],
    root: Path,
    start: int,
    end: int,
) -> dict:
    root.mkdir(parents=True, exist_ok=True)
    by_year: dict[int, list[dict]] = {}
    media_by_year: dict[int, list[dict]] = {}
    for row in rows:
        by_year.setdefault(int(row["edition_year"]), []).append(row)
    for row in media_rows:
        media_by_year.setdefault(int(row.get("edition_year") or 0), []).append(row)
    editions = []
    for year in range(start, end + 1):
        year_rows = by_year.get(year, [])
        year_media = media_by_year.get(year, [])
        cats: dict[str, list[dict]] = {}
        for row in year_rows:
            keys = (
                "chunk_id", "edition_year", "entity_code", "entity_name", "category", "ordinal",
                "content", "content_sha256", "source_provider", "source_identifier", "source_format",
                "source_sha256", "source_url", "extractor", "media_citation_key",
            )
            public = {k: row[k] for k in keys if k in row}
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
            "status": "available" if year_rows or year_media else "missing",
            "chunks": len(year_rows), "categories": category_meta, "sources": year_sources,
            "images": len(year_media),
            "media_path": f"media/{year}/index.json",
            "attribution_path": f"attributions/{year}/images.json",
        }
        mpath = root / "editions" / str(year) / "index.json"
        mpath.parent.mkdir(parents=True, exist_ok=True)
        mpath.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        editions.append({
            "year": year, "status": manifest["status"], "chunks": len(year_rows),
            "categories": len(category_meta), "images": len(year_media),
            "path": mpath.relative_to(root).as_posix(),
        })
    index = {
        "schema": "zzx-worldfactbook-portal-index-v1", "generated_at": now_iso(),
        "start_year": start, "end_year": end, "editions": editions,
        "categories": sorted(CATEGORY_ALIASES),
        "supported_formats": list(SUPPORTED_EXTENSIONS),
        "media_index": "media-index.json",
        "attribution_index": "attribution-index.json",
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
    ap.add_argument("--media-root", default="worldfactbook/media")
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
    ap.add_argument("--ocr-language", default="eng")
    ap.add_argument("--ocr-timeout-seconds", type=int, default=30)
    ap.add_argument("--max-images-per-source", type=int, default=2500)
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
    media_root = repo / args.media_root
    if args.mode == "rebuild":
        shutil.rmtree(portal / "editions", ignore_errors=True)
        shutil.rmtree(portal / "media", ignore_errors=True)
        shutil.rmtree(portal / "attributions", ignore_errors=True)
        for generated in (portal / "media-index.json", portal / "attribution-index.json"):
            generated.unlink(missing_ok=True)
        shutil.rmtree(media_root, ignore_errors=True)
        shutil.rmtree(dbroot, ignore_errors=True)
    cache.mkdir(parents=True, exist_ok=True)
    aliases, _ = load_entities(repo / args.country_registry)
    media_extractor = MediaExtractor(
        repo, media_root, portal, aliases,
        ocr_language=args.ocr_language,
        ocr_timeout_seconds=args.ocr_timeout_seconds,
        max_images_per_source=args.max_images_per_source,
    )
    extras = extra_candidates(repo / args.extra_source_manifest, args.start_year, args.end_year)
    extras_by_year: dict[int, list[Candidate]] = {}
    for c in extras:
        extras_by_year.setdefault(c.year, []).append(c)

    providers = {p.strip() for p in args.providers.split(",") if p.strip()}
    all_rows: list[dict] = []
    source_rows: list[dict] = []
    media_rows: list[dict] = []
    failures: list[dict] = []
    discovery_counts: dict[str, int] = {}
    # One rich media representation per IA item is enough; text/ebook
    # derivatives are still parsed for corpus content but are not OCRed twice.
    ia_media_complete: set[str] = set()
    max_bytes = args.max_download_mb * 1024 * 1024

    for year in range(args.start_year, args.end_year + 1):
        # Incremental mode preserves a fully indexed edition. Editions created
        # before v1.2 are revisited once so OCR/image indexes can be backfilled.
        existing = portal / "editions" / str(year) / "index.json"
        media_existing = portal / "media" / str(year) / "index.json"
        if args.mode == "incremental" and existing.is_file() and media_existing.is_file():
            try:
                e = json.loads(existing.read_text(encoding="utf-8"))
                m = json.loads(media_existing.read_text(encoding="utf-8"))
                if (
                    e.get("status") == "available"
                    and (int(e.get("chunks") or 0) > 0 or int(e.get("images") or 0) >= 0)
                    and m.get("schema") == "zzx-worldfactbook-media-year-v1"
                ):
                    print(f"{year}: corpus + media indexes already available; keeping existing edition")
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
        # Direct IA documents are ranked ahead of archive bundles.  Wayback
        # pages retain discovery order because each page is an independent
        # country/territory snapshot.
        ia_rows = [c for c in unique if c.provider == "internet-archive"]
        other_rows = [c for c in unique if c.provider != "internet-archive"]
        ia_rows.sort(key=lambda c: score_name(c.name, "", year), reverse=True)
        candidates = (ia_rows + other_rows)[: max(
            args.max_wayback_pages,
            args.max_ia_items * args.max_files_per_edition,
        )]
        discovery_counts[str(year)] = len(candidates)
        print(f"{year}: {len(candidates)} candidate source files/pages", flush=True)
        for preview in candidates[:8]:
            print(
                f"  {preview.provider}: {preview.name} "
                f"({preview.format or 'unknown'}, {preview.size or 0} bytes)",
                flush=True,
            )
        if len(candidates) > 8:
            print(f"  ... {len(candidates) - 8} more candidates", flush=True)

        for c in candidates:
            ext = Path(c.name).suffix.lower() or ("." + c.format if c.format else ".bin")
            cdir = cache / str(year) / c.provider
            local = cdir / (hashlib.sha256(c.url.encode()).hexdigest()[:16] + "-" + safe_name(c.name))
            try:
                if c.size and c.size > max_bytes:
                    raise RuntimeError(f"source too large ({c.size} bytes)")
                download(c.url, local, max_bytes)
                source_sha = hashlib.sha256(local.read_bytes()).hexdigest()
                source_context = SourceContext(
                    edition_year=year,
                    provider=c.provider,
                    identifier=c.identifier,
                    source_url=c.url,
                    source_name=c.name,
                    source_format=c.format or ext.lstrip("."),
                    source_sha256=source_sha,
                    timestamp=c.timestamp,
                )

                print(
                    f"{year}: extracting text from {c.provider}/{c.name}",
                    flush=True,
                )
                docs = extract(local)

                source_media: list[dict] = []
                ext_lower = local.suffix.lower()
                media_capable = ext_lower not in {
                    ".txt", ".text", ".md", ".csv", ".tsv", ".json",
                    ".xml", ".yaml", ".yml",
                }
                should_extract_media = media_capable
                if c.provider == "internet-archive" and c.identifier in ia_media_complete:
                    should_extract_media = False

                if should_extract_media:
                    print(
                        f"{year}: extracting/OCRing media from {c.provider}/{c.name}",
                        flush=True,
                    )
                    try:
                        source_media = media_extractor.extract(local, source_context)
                        media_rows.extend(source_media)
                        if c.provider == "internet-archive" and source_media:
                            ia_media_complete.add(c.identifier)
                    except Exception as media_exc:
                        failures.append({
                            "year": year, "provider": c.provider, "url": c.url,
                            "stage": "media", "error": str(media_exc),
                        })
                elif media_capable:
                    print(
                        f"{year}: skipping duplicate IA media representation {c.name}",
                        flush=True,
                    )

                if not docs and not source_media:
                    raise RuntimeError("no extractable text or images")

                accepted = 0
                for doc in docs:
                    chunks = parse_chunks(doc.text, year, aliases)
                    if not chunks and len(doc.text.strip()) >= 80:
                        raw = doc.text.strip()
                        chunks = []
                        for pos in range(0, len(raw), 24000):
                            piece = raw[pos:pos+24000].strip()
                            if len(piece) >= 40:
                                chunks.append({
                                    "edition_year": year, "entity_code": "", "entity_name": "",
                                    "category": "raw", "ordinal": len(chunks)+1, "content": piece,
                                })
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

                # OCR from every extracted image is searchable corpus content too.
                # It is linked to the deterministic citation key for auditability.
                for media in source_media:
                    ocr_text = str(media.get("ocr_text") or "").strip()
                    if len(ocr_text) < 40:
                        continue
                    ocr_chunks = parse_chunks(ocr_text, year, aliases)
                    if not ocr_chunks:
                        ocr_chunks = [{
                            "edition_year": year,
                            "entity_code": media.get("entity_code") or "",
                            "entity_name": media.get("entity_name") or "",
                            "category": media.get("category") or "raw",
                            "ordinal": 1,
                            "content": ocr_text[:24000],
                        }]
                    for row in ocr_chunks:
                        content_sha = hashlib.sha256(row["content"].encode("utf-8")).hexdigest()
                        chunk_id = hashlib.sha256((
                            f"{year}|ocr|{media['citation_key']}|{row['category']}|"
                            f"{row['ordinal']}|{source_sha}|{content_sha}"
                        ).encode()).hexdigest()
                        row.update({
                            "chunk_id": chunk_id,
                            "content_sha256": content_sha,
                            "source_provider": c.provider,
                            "source_identifier": c.identifier,
                            "source_format": c.format or ext.lstrip("."),
                            "source_sha256": source_sha,
                            "source_url": c.url,
                            "extractor": "tesseract-image-ocr",
                            "media_citation_key": media["citation_key"],
                        })
                        all_rows.append(row)
                        accepted += 1

                source_rows.append({
                    "edition_year": year, "provider": c.provider, "identifier": c.identifier,
                    "url": c.url, "name": c.name, "format": c.format, "timestamp": c.timestamp,
                    "sha256": source_sha, "bytes": local.stat().st_size, "chunks": accepted,
                    "images": len(source_media),
                    "ocr_images": sum(1 for m in source_media if str(m.get("ocr_text") or "").strip()),
                    "media_scanned": bool(should_extract_media),
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

    # Merge existing media indexes for untouched incremental editions.
    if args.mode == "incremental":
        existing_media = load_existing_media(portal, args.start_year, args.end_year)
        new_years = {int(r.get("edition_year") or 0) for r in media_rows}
        for row in existing_media:
            if int(row.get("edition_year") or 0) not in new_years:
                media_rows.append(row)

    # Deduplicate exact chunk IDs, sources, and deterministic image citations.
    all_rows = list({r["chunk_id"]: r for r in all_rows}.values())
    source_rows = list({(s.get("edition_year"),s.get("url"),s.get("sha256")):s for s in source_rows}.values())
    media_rows = list({r["citation_key"]: r for r in media_rows if r.get("citation_key")}.values())
    media_index = write_media_indexes(media_rows, portal, media_root, repo, args.start_year, args.end_year)
    media_shard_manifest = write_media_shards(media_rows, dbroot)
    index = write_portal(all_rows, source_rows, media_rows, portal, args.start_year, args.end_year)
    shard_manifest = write_shards(all_rows, dbroot)
    report = {
        "schema":"zzx-worldfactbook-crawl-report-v1","generated_at":now_iso(),
        "range":[args.start_year,args.end_year],"mode":args.mode,
        "chunks":len(all_rows),"sources":len(source_rows),"images":len(media_rows),
        "ocr_images":sum(1 for r in media_rows if str(r.get("ocr_text") or "").strip()),
        "credited_images":sum(1 for r in media_rows if r.get("credit_status") == "explicit"),
        "media_schema":media_index.get("schema"),"failures":failures,
        "discovery_counts":discovery_counts,
        "available_editions":sum(1 for e in index["editions"] if e["status"]=="available"),
        "missing_editions":[e["year"] for e in index["editions"] if e["status"]!="available"],
        "sql_shards":len(shard_manifest.get("files") or []),
        "media_sql_shards":len(media_shard_manifest.get("files") or []),
    }
    (portal / "crawl-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if not all_rows:
        raise SystemExit("crawler produced zero corpus chunks")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
